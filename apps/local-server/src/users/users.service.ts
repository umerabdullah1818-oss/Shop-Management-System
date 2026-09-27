import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import {
  DEFAULT_CASHIER_ACTION_PERMISSIONS,
  DEFAULT_DASHBOARD_MODULES,
  DEFAULT_DASHBOARD_WIDGETS,
  DomainError,
  ErrorCode,
  newId,
} from "@shop/shared";
import { EntityStatus, Prisma } from "@shop/database";
import { PrismaService } from "../prisma/prisma.service";
import { recordOutbox } from "../sync/outbox.util";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdatePermissionsDto } from "./dto/update-permissions.dto";
import { ResetCredentialDto } from "./dto/reset-credential.dto";

const PIN_ROUNDS = 10;
const PASSWORD_ROUNDS = 10;

// Never return password/PIN hashes to any client, ever.
function toSafeUser<T extends { passwordHash?: unknown; pinHash?: unknown }>(user: T) {
  const { passwordHash: _passwordHash, pinHash: _pinHash, ...safe } = user;
  return safe;
}

/**
 * §3 of the audit: Admin must have real create/edit/disable/reset-credential
 * control over every account, persisted in the database — this is that
 * control surface. See PermissionsService for how the resulting
 * CashierProfile is actually enforced.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: { cashierProfile: { include: { counter: true } } },
      orderBy: { createdAt: "asc" },
    });
    return users.map(toSafeUser);
  }

  async findOne(id: string) {
    return this.findOneWith(this.prisma, id);
  }

  // Queries via the given client (the outer PrismaService, or a still-open
  // $transaction's tx) — calling this.findOne() from inside a $transaction
  // callback would read through the outer, uncommitted-invisible connection
  // and 404 on a row that only exists in the not-yet-committed transaction.
  private async findOneWith(client: PrismaService | Prisma.TransactionClient, id: string) {
    const user = await client.user.findUnique({
      where: { id },
      include: { cashierProfile: { include: { counter: true } } },
    });
    if (!user) {
      throw new DomainError(ErrorCode.NOT_FOUND, "User not found.", { id }, 404);
    }
    return toSafeUser(user);
  }

  async create(dto: CreateUserDto, adminId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: dto.id } });
    if (existing) return toSafeUser(existing); // idempotent replay

    if (dto.role === "ADMIN") {
      if (!dto.username || !dto.password) {
        throw new DomainError(
          ErrorCode.VALIDATION_ERROR,
          "An Admin account needs a username and a password (min. 8 characters).",
        );
      }
      const usernameTaken = await this.prisma.user.findUnique({ where: { username: dto.username } });
      if (usernameTaken) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, "That username is already taken.", {
          username: dto.username,
        });
      }
    } else if (!dto.pin) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, "A Cashier account needs a PIN (4-8 digits).");
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: dto.id,
          name: dto.name,
          role: dto.role,
          createdById: adminId,
          username: dto.role === "ADMIN" ? dto.username : undefined,
          passwordHash: dto.role === "ADMIN" ? await bcrypt.hash(dto.password!, PASSWORD_ROUNDS) : undefined,
          pinHash: dto.role === "CASHIER" ? await bcrypt.hash(dto.pin!, PIN_ROUNDS) : undefined,
        },
      });
      await recordOutbox(tx, "User", user.id, user);

      if (dto.role === "CASHIER") {
        const profile = await tx.cashierProfile.create({
          data: {
            id: newId(),
            userId: user.id,
            counterId: dto.counterId,
            dashboardModules: DEFAULT_DASHBOARD_MODULES as unknown as Prisma.InputJsonValue,
            dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS as unknown as Prisma.InputJsonValue,
            ...DEFAULT_CASHIER_ACTION_PERMISSIONS,
          },
        });
        await recordOutbox(tx, "CashierProfile", profile.id, profile);
      }

      const audit = await tx.auditLog.create({
        data: { id: newId(), userId: adminId, action: "USER_CREATED", entityType: "User", entityId: user.id },
      });
      await recordOutbox(tx, "AuditLog", audit.id, audit);

      return this.findOneWith(tx, user.id);
    });
  }

  async update(id: string, dto: UpdateUserDto, adminId: string) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { name: dto.name } });
      await recordOutbox(tx, "User", user.id, user);

      if (dto.counterId !== undefined) {
        const profile = await tx.cashierProfile.update({
          where: { userId: id },
          data: { counterId: dto.counterId },
        });
        await recordOutbox(tx, "CashierProfile", profile.id, profile);
      }

      const audit = await tx.auditLog.create({
        data: { id: newId(), userId: adminId, action: "USER_UPDATED", entityType: "User", entityId: id },
      });
      await recordOutbox(tx, "AuditLog", audit.id, audit);

      return this.findOneWith(tx, id);
    });
  }

  async setStatus(id: string, status: EntityStatus, adminId: string) {
    const target = await this.findOne(id);
    if (target.role === "ADMIN" && status === EntityStatus.DISABLED) {
      const activeAdmins = await this.prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
      if (activeAdmins <= 1) {
        throw new DomainError(
          ErrorCode.VALIDATION_ERROR,
          "Cannot disable the last active Admin account — the shop would be locked out entirely.",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { status } });
      await recordOutbox(tx, "User", user.id, user);

      const audit = await tx.auditLog.create({
        data: {
          id: newId(),
          userId: adminId,
          action: status === EntityStatus.DISABLED ? "USER_DISABLED" : "USER_ENABLED",
          entityType: "User",
          entityId: id,
        },
      });
      await recordOutbox(tx, "AuditLog", audit.id, audit);

      return this.findOneWith(tx, id);
    });
  }

  /** SEC-002: PIN/password are always hashed; disabled accounts stay disabled through a reset. */
  async resetCredential(id: string, dto: ResetCredentialDto, adminId: string) {
    const target = await this.findOne(id);

    if (target.role === "ADMIN") {
      if (!dto.password) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, "Provide a new password (min. 8 characters) for an Admin account.");
      }
    } else if (!dto.pin) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, "Provide a new PIN (4-8 digits) for a Cashier account.");
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          passwordHash: dto.password ? await bcrypt.hash(dto.password, PASSWORD_ROUNDS) : undefined,
          pinHash: dto.pin ? await bcrypt.hash(dto.pin, PIN_ROUNDS) : undefined,
          // A reset always clears any lockout — the admin re-establishing
          // the credential in person is itself the "I verified this is the
          // real cashier" step, per SEC-002's "allow admin to reset PIN".
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await recordOutbox(tx, "User", user.id, user);

      const audit = await tx.auditLog.create({
        data: {
          id: newId(),
          userId: adminId,
          action: "CREDENTIAL_RESET",
          entityType: "User",
          entityId: id,
        },
      });
      await recordOutbox(tx, "AuditLog", audit.id, audit);

      return { ok: true };
    });
  }

  async updatePermissions(id: string, dto: UpdatePermissionsDto, adminId: string) {
    const target = await this.findOne(id);
    if (target.role !== "CASHIER") {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, "Only Cashier accounts have configurable permissions.");
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.cashierProfile.findUniqueOrThrow({ where: { userId: id } });
      const { dashboardModules, dashboardWidgets, ...actionFlags } = dto;

      const profile = await tx.cashierProfile.update({
        where: { userId: id },
        data: {
          ...actionFlags,
          dashboardModules: dashboardModules
            ? ({ ...(existing.dashboardModules as object), ...dashboardModules } as unknown as Prisma.InputJsonValue)
            : undefined,
          dashboardWidgets: dashboardWidgets
            ? ({ ...(existing.dashboardWidgets as object), ...dashboardWidgets } as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      });
      await recordOutbox(tx, "CashierProfile", profile.id, profile);

      const audit = await tx.auditLog.create({
        data: {
          id: newId(),
          userId: adminId,
          action: "PERMISSIONS_UPDATED",
          entityType: "User",
          entityId: id,
          afterJson: dto as unknown as Prisma.InputJsonValue,
        },
      });
      await recordOutbox(tx, "AuditLog", audit.id, audit);

      return profile;
    });
  }

  /** "View cashier activity" / "view cashier audit history" — audit trail plus recent shifts. */
  async activity(id: string) {
    await this.findOne(id);
    const [auditLogs, shifts, salesCount] = await Promise.all([
      this.prisma.auditLog.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
      this.prisma.shift.findMany({ where: { userId: id }, orderBy: { openedAt: "desc" }, take: 20 }),
      this.prisma.sale.count({ where: { cashierId: id } }),
    ]);
    return { auditLogs, shifts, totalSales: salesCount };
  }

}
