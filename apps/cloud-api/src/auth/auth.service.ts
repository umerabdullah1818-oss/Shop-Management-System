import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { DomainError, ErrorCode } from "@shop/shared";
import { EntityStatus } from "@shop/database";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { JwtPayload } from "./auth.types";

/**
 * Remote reporting login (Decision #11 / docs/07-architecture-detailed.md
 * §6.3): entirely separate from shop-floor sessions on the Local Shop
 * Server. Read-mostly — every controller here is deliberately GET-only
 * except /sync/ingest, which uses a device credential, not a user session
 * at all (see DeviceApiKeyGuard).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user || user.status !== EntityStatus.ACTIVE || !user.passwordHash) {
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS, "Invalid credentials.", undefined, 401);
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS, "Invalid credentials.", undefined, 401);
    }

    const payload: JwtPayload = { sub: user.id, role: user.role, name: user.name };
    return { token: this.jwt.sign(payload), user: { id: user.id, name: user.name, role: user.role } };
  }
}
