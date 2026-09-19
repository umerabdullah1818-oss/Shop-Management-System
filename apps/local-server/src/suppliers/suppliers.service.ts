import { Injectable } from "@nestjs/common";
import { EntityStatus, Prisma, PurchasePaymentStatus } from "@shop/database";
import { DomainError, ErrorCode, newId } from "@shop/shared";
import { PrismaService } from "../prisma/prisma.service";
import { recordOutbox } from "../sync/outbox.util";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { UpdateSupplierDto } from "./dto/update-supplier.dto";
import { CreateSupplierPaymentDto } from "./dto/create-supplier-payment.dto";

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(search?: string) {
    return this.prisma.supplier.findMany({
      where: search
        ? { OR: [{ name: { contains: search, mode: "insensitive" } }] }
        : { status: EntityStatus.ACTIVE },
      orderBy: { name: "asc" },
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Supplier not found.", { id }, 404);
    }
    // FR-014: running totals, always derived from purchases/payments, never
    // stored as an independently-editable field.
    const purchases = await this.prisma.purchase.findMany({ where: { supplierId: id } });
    const totalPurchased = purchases.reduce((sum, p) => sum + Number(p.amountPaid) + Number(p.amountPayable), 0);
    const totalPaid = purchases.reduce((sum, p) => sum + Number(p.amountPaid), 0);
    const totalPayable = purchases.reduce((sum, p) => sum + Number(p.amountPayable), 0);

    return { ...supplier, totals: { totalPurchased, totalPaid, totalPayable } };
  }

  create(dto: CreateSupplierDto) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({ data: { id: newId(), ...dto } });
      await recordOutbox(tx, "Supplier", supplier.id, supplier);
      return supplier;
    });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.update({ where: { id }, data: dto });
      await recordOutbox(tx, "Supplier", supplier.id, supplier);
      return supplier;
    });
  }

  payments(supplierId: string) {
    return this.prisma.supplierPayment.findMany({
      where: { supplierId },
      orderBy: { paymentDate: "desc" },
    });
  }

  /**
   * FR-015 / Decision #8: if `purchaseId` is given, applies directly to that
   * purchase. Otherwise allocates oldest-purchase-first across the
   * supplier's outstanding purchases — mirroring the Khata pattern, but
   * (deliberately, unlike Khata's KhataPaymentAllocation) without a
   * separate allocation-audit table, since §24 of the master prompt treats
   * supplier payable as a simple aggregate with no worked multi-invoice
   * example the way §22 gives for Khata.
   */
  async recordPayment(supplierId: string, dto: CreateSupplierPaymentDto, userId: string) {
    await this.findOne(supplierId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.supplierPayment.findUnique({ where: { id: dto.id } });
      if (existing) {
        return existing; // idempotent replay (docs/10-offline-engine.md §3)
      }

      let remaining = dto.amount;

      if (dto.purchaseId) {
        const purchase = await tx.purchase.findUniqueOrThrow({ where: { id: dto.purchaseId } });
        remaining = await this.applyToPurchase(tx, purchase, remaining);
      } else {
        const outstanding = await tx.purchase.findMany({
          where: { supplierId, amountPayable: { gt: 0 } },
          orderBy: { purchaseDate: "asc" },
        });
        for (const purchase of outstanding) {
          if (remaining <= 0) break;
          remaining = await this.applyToPurchase(tx, purchase, remaining);
        }
      }

      const payment = await tx.supplierPayment.create({
        data: {
          id: dto.id,
          supplierId,
          purchaseId: dto.purchaseId,
          amount: dto.amount,
          method: dto.method,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          userId,
          notes: dto.notes,
        },
      });
      await recordOutbox(tx, "SupplierPayment", payment.id, payment);
      return payment;
    });
  }

  private async applyToPurchase(
    tx: Prisma.TransactionClient,
    purchase: { id: string; amountPaid: unknown; amountPayable: unknown },
    available: number,
  ): Promise<number> {
    const payable = Number(purchase.amountPayable);
    const applied = Math.min(available, payable);
    const newPaid = Number(purchase.amountPaid) + applied;
    const newPayable = payable - applied;

    const updatedPurchase = await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        amountPaid: newPaid,
        amountPayable: newPayable,
        paymentStatus:
          newPayable <= 0
            ? PurchasePaymentStatus.PAID
            : newPaid > 0
              ? PurchasePaymentStatus.PARTIAL
              : PurchasePaymentStatus.UNPAID,
      },
    });
    await recordOutbox(tx, "Purchase", updatedPurchase.id, updatedPurchase);

    return available - applied;
  }
}
