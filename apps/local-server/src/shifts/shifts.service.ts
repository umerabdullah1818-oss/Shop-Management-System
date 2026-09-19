import { Injectable } from "@nestjs/common";
import { PaymentMethod, ShiftStatus } from "@shop/database";
import { DomainError, ErrorCode } from "@shop/shared";
import { PrismaService } from "../prisma/prisma.service";
import { recordOutbox } from "../sync/outbox.util";
import { OpenShiftDto } from "./dto/open-shift.dto";
import { CloseShiftDto } from "./dto/close-shift.dto";
import { AuthenticatedUser } from "../auth/auth.types";

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: AuthenticatedUser, params: { counterId?: string; status?: ShiftStatus }) {
    return this.prisma.shift.findMany({
      where: {
        ...(user.role === "CASHIER" ? { userId: user.id } : {}), // Cashier sees own shifts only (§9 role matrix)
        ...(params.counterId ? { counterId: params.counterId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      orderBy: { openedAt: "desc" },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const shift = await this.prisma.shift.findUnique({ where: { id } });
    if (!shift) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Shift not found.", { id }, 404);
    }
    if (user.role === "CASHIER" && shift.userId !== user.id) {
      throw new DomainError(ErrorCode.FORBIDDEN, "You can only view your own shifts.", undefined, 403);
    }
    return shift;
  }

  /** FR-090/BR-021: one OPEN shift per counter, enforced by a partial unique
   * index at the DB level (docs/08-database-schema.md §5) — this check is
   * the fast-path UX error; the index is the real guarantee. */
  async open(dto: OpenShiftDto, userId: string) {
    const existing = await this.prisma.shift.findUnique({ where: { id: dto.id } });
    if (existing) return existing; // idempotent replay

    const openShift = await this.prisma.shift.findFirst({
      where: { counterId: dto.counterId, status: ShiftStatus.OPEN },
    });
    if (openShift) {
      throw new DomainError(
        ErrorCode.SHIFT_ALREADY_OPEN,
        "This counter already has an open shift.",
        { counterId: dto.counterId },
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.create({
        data: { id: dto.id, counterId: dto.counterId, userId, openingCash: dto.openingCash },
      });
      await recordOutbox(tx, "Shift", shift.id, shift);
      return shift;
    });
  }

  /** FR-092: client submits only the counted actual cash; expectedCash and
   * difference are always computed server-side. */
  async close(id: string, dto: CloseShiftDto, user: AuthenticatedUser) {
    const shift = await this.findOne(id, user);
    if (shift.status !== ShiftStatus.OPEN) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, "This shift is already closed.", { id });
    }

    const [cashSales, cashKhataCollections, cashRefunds, cashExpenses] = await Promise.all([
      this.sumCashSales(shift.id),
      this.sumCashKhataCollections(shift.id),
      this.sumCashRefunds(shift.id),
      this.sumCashExpenses(shift.id),
    ]);

    const expectedCash =
      Number(shift.openingCash) + cashSales + cashKhataCollections - cashRefunds - cashExpenses;
    const difference = dto.closingCash - expectedCash;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shift.update({
        where: { id },
        data: {
          closingCash: dto.closingCash,
          expectedCash,
          difference,
          status: ShiftStatus.CLOSED,
          closedAt: new Date(),
        },
      });
      await recordOutbox(tx, "Shift", updated.id, updated);
      return updated;
    });
  }

  private async sumCashSales(shiftId: string) {
    const result = await this.prisma.payment.aggregate({
      where: { method: PaymentMethod.CASH, sale: { shiftId } },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  }

  private async sumCashKhataCollections(shiftId: string) {
    const result = await this.prisma.khataPayment.aggregate({
      where: { shiftId, method: PaymentMethod.CASH },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  }

  private async sumCashRefunds(shiftId: string) {
    const returns = await this.prisma.return.findMany({
      where: { shiftId },
      include: { items: true },
    });
    // Refund amounts are cash only if the original sale was paid in cash —
    // approximated here via the linked sale's payment method; see
    // ReturnsService for the authoritative refund-amount computation.
    let total = 0;
    for (const ret of returns) {
      const sale = await this.prisma.sale.findUnique({ where: { id: ret.saleId } });
      if (sale?.paymentMethod === PaymentMethod.CASH) {
        total += ret.items.reduce((sum, i) => sum + Number(i.refundAmount), 0);
      }
    }
    return total;
  }

  private async sumCashExpenses(shiftId: string) {
    const result = await this.prisma.expense.aggregate({
      where: { shiftId, paymentMethod: PaymentMethod.CASH },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  }
}
