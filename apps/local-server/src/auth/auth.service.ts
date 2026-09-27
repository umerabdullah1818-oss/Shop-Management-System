import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { DomainError, ErrorCode, newId } from "@shop/shared";
import { EntityStatus } from "@shop/database";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { LoginPinDto } from "./dto/login-pin.dto";
import { StepUpDto } from "./dto/step-up.dto";
import { AuthenticatedUser, JwtPayload } from "./auth.types";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private issueToken(user: { id: string; role: AuthenticatedUser["role"]; name: string }) {
    const payload: JwtPayload = { sub: user.id, role: user.role, name: user.name };
    return this.jwt.sign(payload);
  }

  private invalidCredentials(): never {
    // Deliberately generic — never reveal whether the username/pin exists.
    throw new DomainError(ErrorCode.INVALID_CREDENTIALS, "Invalid credentials.", undefined, 401);
  }

  private accountLocked(lockedUntil: Date): never {
    throw new DomainError(
      ErrorCode.INVALID_CREDENTIALS,
      `Account temporarily locked after repeated failed attempts. Try again after ${lockedUntil.toLocaleTimeString()}.`,
      undefined,
      401,
    );
  }

  /**
   * Admin username+password login identifies the account up front, so a
   * normal per-account lockout applies cleanly (audit §3: "rate
   * limiting/lockout protection where appropriate").
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });

    if (!user || user.status !== EntityStatus.ACTIVE || !user.passwordHash) {
      this.invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.accountLocked(user.lockedUntil);
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash as string);
    if (!ok) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts);
      this.invalidCredentials();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const token = this.issueToken(user);
    return { token, user: { id: user.id, name: user.name, role: user.role } };
  }

  private async registerFailedAttempt(userId: string, currentAttempts: number) {
    const attempts = currentAttempts + 1;
    const lockedUntil =
      attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null;
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: attempts, lockedUntil },
    });
  }

  async loginPin(dto: LoginPinDto) {
    // PIN lookup scans active cashiers rather than taking a username, per
    // the fast quick-login UX (Decision #17) — bounded candidate set (shop
    // staff count is small). Deliberately NOT applying per-account lockout
    // here: incrementing every active cashier's failedLoginAttempts on each
    // wrong guess would let one attacker lock out the entire shop floor.
    // Brute-force protection for this endpoint is IP-based (ThrottlerGuard,
    // see auth.controller.ts), which does not have that shared-fate problem.
    // Per-account lockedUntil is still honored here (set via the Admin
    // password path or a future targeted-lockout mechanism) so a locked
    // cashier account can't be used even if guessed correctly.
    const candidates = await this.prisma.user.findMany({
      where: { status: EntityStatus.ACTIVE, pinHash: { not: null } },
    });

    for (const candidate of candidates) {
      if (candidate.lockedUntil && candidate.lockedUntil > new Date()) continue;
      if (candidate.pinHash && (await bcrypt.compare(dto.pin, candidate.pinHash))) {
        await this.prisma.user.update({
          where: { id: candidate.id },
          data: { lastLoginAt: new Date() },
        });
        const token = this.issueToken(candidate);
        return { token, user: { id: candidate.id, name: candidate.name, role: candidate.role } };
      }
    }

    this.invalidCredentials();
  }

  async me(user: AuthenticatedUser) {
    return { user };
  }

  /**
   * Admin step-up authorization for a below-cost sale or an over-cap
   * discount (BR-011 / SEC-010). Verifies the ADMIN's own credential (not
   * the cashier's), then issues a single-use, short-TTL authorization bound
   * to this specific sale attempt — never reusable for a different invoice.
   */
  async stepUp(dto: StepUpDto) {
    const admin = await this.prisma.user.findUnique({ where: { username: dto.adminUsername } });

    if (!admin || admin.role !== "ADMIN" || admin.status !== EntityStatus.ACTIVE) {
      this.invalidCredentials();
    }

    const credentialOk = dto.password
      ? admin.passwordHash && (await bcrypt.compare(dto.password, admin.passwordHash))
      : dto.pin
        ? admin.pinHash && (await bcrypt.compare(dto.pin, admin.pinHash))
        : false;

    if (!credentialOk) {
      this.invalidCredentials();
    }

    const ttlSeconds = Number(this.config.get<string>("OVERRIDE_TOKEN_TTL_SECONDS") ?? 120);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // saleId stays null until the sale actually commits — see the
    // saleClientId field comment in schema.prisma. SalesService looks this
    // token up by saleClientId + adminId, checks expiresAt/usedAt, then
    // (within the same transaction as the sale insert) sets usedAt and
    // saleId together.
    const authorization = await this.prisma.overrideAuthorization.create({
      data: {
        id: newId(),
        adminId: admin.id,
        saleClientId: dto.saleClientId,
        reason: dto.reason,
        expiresAt,
      },
    });

    return {
      overrideToken: authorization.id,
      expiresAt: authorization.expiresAt,
      saleClientId: dto.saleClientId,
    };
  }
}
