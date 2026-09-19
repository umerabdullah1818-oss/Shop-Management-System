import { Injectable } from "@nestjs/common";
import {
  KhataTransactionType,
  Prisma,
  SaleStatus,
  ShiftStatus,
} from "@shop/database";
import { DomainError, ErrorCode, newId } from "@shop/shared";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService, FifoAllocation } from "../inventory/inventory.service";
import { recordOutbox } from "../sync/outbox.util";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { CancelSaleDto } from "./dto/cancel-sale.dto";
import { AuthenticatedUser } from "../auth/auth.types";

interface ComputedItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
  effectiveUnitPrice: number;
  discountPercent: number;
  officialPriceAtSale: number;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  findAll(
    user: AuthenticatedUser,
    params: { cashierId?: string; customerId?: string; status?: SaleStatus; dateFrom?: string; dateTo?: string },
  ) {
    return this.prisma.sale.findMany({
      where: {
        // FR: Cashier sees own shift/day sales only; Admin sees everything (§9 role matrix).
        ...(user.role === "CASHIER" ? { cashierId: user.id } : {}),
        ...(params.cashierId ? { cashierId: params.cashierId } : {}),
        ...(params.customerId ? { customerId: params.customerId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.dateFrom || params.dateTo
          ? {
              occurredAt: {
                ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
                ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
              },
            }
          : {}),
      },
      include: { items: true },
      orderBy: { occurredAt: "desc" },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        items: { include: { allocations: true, product: true } },
        payments: true,
        cashier: true,
        customer: true,
      },
    });
    if (!sale) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Sale not found.", { id }, 404);
    }
    if (user.role === "CASHIER" && sale.cashierId !== user.id) {
      throw new DomainError(ErrorCode.FORBIDDEN, "You can only view your own sales.", undefined, 403);
    }
    return sale;
  }

  /**
   * The atomic sale-completion transaction. Sequence follows
   * docs/09-api-design.md §8 exactly: validate shift -> allocate FIFO per
   * item -> enforce below-cost/discount-cap (with admin override) -> create
   * invoice/items/allocations/payment/Khata/audit/outbox, all-or-nothing
   * (SRS NFR-011, FR-043).
   */
  async create(dto: CreateSaleDto, user: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({
        where: { id: dto.id },
        include: { items: { include: { allocations: true } } },
      });
      if (existing) {
        // Idempotent replay (docs/10-offline-engine.md §3) — same shape as
        // the freshly-created path below, so callers never see a union type.
        return existing;
      }

      const shift = await tx.shift.findUniqueOrThrow({ where: { id: dto.shiftId } });
      if (shift.status !== ShiftStatus.OPEN || shift.counterId !== dto.counterId) {
        throw new DomainError(ErrorCode.NO_OPEN_SHIFT, "There is no open shift on this counter.", {
          shiftId: dto.shiftId,
        });
      }

      const customer = await tx.customer.findUniqueOrThrow({ where: { id: dto.customerId } });

      const cashierCapPercent = await this.getCashierDiscountCapPercent(tx);

      let overrideAuthorization: { id: string; adminId: string } | null = null;
      if (dto.overrideToken) {
        overrideAuthorization = await this.consumeOverrideToken(tx, dto.overrideToken, dto.id);
      }
      const isAdmin = user.role === "ADMIN";

      const computedItems: ComputedItem[] = [];
      for (const item of dto.items) {
        const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
        const discountAmount = item.discountAmount ?? 0;
        const lineSubtotal = item.quantity * item.unitPrice;
        const lineTotal = lineSubtotal - discountAmount;
        const effectiveUnitPrice = lineTotal / item.quantity;
        const discountPercent = lineSubtotal > 0 ? (discountAmount / lineSubtotal) * 100 : 0;
        computedItems.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount,
          lineTotal,
          effectiveUnitPrice,
          discountPercent,
          officialPriceAtSale: Number(product.officialPrice),
        });
      }

      const subtotal = computedItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const discountTotal = computedItems.reduce((s, i) => s + i.discountAmount, 0);
      const grandTotal = subtotal - discountTotal;
      const remainingAmount = Math.max(0, grandTotal - dto.amountPaid);

      // BR-007: Khata (any remaining balance) requires a real, non-anonymous customer.
      if (remainingAmount > 0 && customer.isWalkIn) {
        throw new DomainError(
          ErrorCode.ANONYMOUS_KHATA_NOT_ALLOWED,
          "A real customer is required for credit sales. Please select or add a customer.",
        );
      }

      const invoiceNumber = await this.nextInvoiceNumber(tx, dto.counterId);

      const sale = await tx.sale.create({
        data: {
          id: dto.id,
          invoiceNumber,
          counterId: dto.counterId,
          shiftId: dto.shiftId,
          cashierId: user.id,
          customerId: dto.customerId,
          subtotal,
          discountTotal,
          grandTotal,
          amountPaid: dto.amountPaid,
          remainingAmount,
          paymentMethod: dto.paymentMethod,
          status: SaleStatus.COMPLETED,
        },
      });
      await recordOutbox(tx, "Sale", sale.id, sale);

      for (const item of computedItems) {
        const saleItem = await tx.saleItem.create({
          data: {
            id: newId(),
            saleId: sale.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            officialPriceAtSale: item.officialPriceAtSale,
            discountAmount: item.discountAmount,
            lineTotal: item.lineTotal,
          },
        });
        await recordOutbox(tx, "SaleItem", saleItem.id, saleItem);

        // FR-022/023: consumes stock oldest-batch-first; throws
        // INSUFFICIENT_STOCK if short (rolls back the whole sale).
        const allocations: FifoAllocation[] = await this.inventoryService.allocateFifo(tx, {
          productId: item.productId,
          quantity: item.quantity,
          userId: user.id,
          referenceType: "Sale",
          referenceId: sale.id,
        });

        for (const allocation of allocations) {
          const allocationRow = await tx.saleItemBatchAllocation.create({
            data: {
              id: newId(),
              saleItemId: saleItem.id,
              batchId: allocation.batchId,
              quantity: allocation.quantity,
              unitCostAtSale: allocation.unitCost,
            },
          });
          await recordOutbox(tx, "SaleItemBatchAllocation", allocationRow.id, allocationRow);
        }

        // BR-009: the floor applies to the EFFECTIVE (post-discount) price,
        // checked against the most expensive batch actually consumed — see
        // docs/08-database-schema.md §3 for why this is the conservative,
        // correct reading rather than only checking the first batch touched.
        const maxBatchCost = Math.max(...allocations.map((a) => a.unitCost));
        const isBelowCost = item.effectiveUnitPrice < maxBatchCost;
        const isOverCap = user.role === "CASHIER" && item.discountPercent > cashierCapPercent;

        if (isBelowCost || isOverCap) {
          if (!isAdmin && !overrideAuthorization) {
            throw new DomainError(
              isBelowCost ? ErrorCode.BELOW_COST_BLOCKED : ErrorCode.DISCOUNT_CAP_EXCEEDED,
              isBelowCost
                ? "This price is below the item's cost. Ask an admin to approve."
                : "This discount is beyond what you're allowed to give. Ask an admin to approve.",
              { productId: item.productId, batchCost: maxBatchCost, attemptedPrice: item.effectiveUnitPrice },
            );
          }

          // BR-011: mandatory audit trail for every override, admin- or
          // token-authorized alike.
          const overrideAudit = await tx.auditLog.create({
            data: {
              id: newId(),
              userId: overrideAuthorization?.adminId ?? user.id,
              action: isBelowCost ? "BELOW_COST_OVERRIDE" : "DISCOUNT_CAP_OVERRIDE",
              entityType: "Sale",
              entityId: sale.id,
              afterJson: {
                productId: item.productId,
                batchCost: maxBatchCost,
                sellingPrice: item.effectiveUnitPrice,
                discountPercent: item.discountPercent,
              },
            },
          });
          await recordOutbox(tx, "AuditLog", overrideAudit.id, overrideAudit);
        }
      }

      const payment = await tx.payment.create({
        data: { id: newId(), saleId: sale.id, amount: dto.amountPaid, method: dto.paymentMethod },
      });
      await recordOutbox(tx, "Payment", payment.id, payment);

      if (remainingAmount > 0) {
        const khataAccount = await tx.khataAccount.upsert({
          where: { customerId: dto.customerId },
          update: {},
          create: { id: newId(), customerId: dto.customerId },
        });
        const khataTx = await tx.khataTransaction.create({
          data: {
            id: newId(),
            khataAccountId: khataAccount.id,
            type: KhataTransactionType.CREDIT_SALE,
            amount: remainingAmount,
            saleId: sale.id,
          },
        });
        await recordOutbox(tx, "KhataTransaction", khataTx.id, khataTx);
      }

      const saleAudit = await tx.auditLog.create({
        data: {
          id: newId(),
          userId: user.id,
          action: "SALE_CREATED",
          entityType: "Sale",
          entityId: sale.id,
          afterJson: { invoiceNumber, grandTotal, remainingAmount },
        },
      });
      await recordOutbox(tx, "AuditLog", saleAudit.id, saleAudit);

      return tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: { items: { include: { allocations: true } } },
      });
    });
  }

  /** FR-070/BR-012/BR-019: void, not delete; fully reverses inventory,
   * revenue, COGS, payment, and Khata effects atomically. */
  async cancel(id: string, dto: CancelSaleDto, user: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({
        where: { id },
        include: { items: { include: { allocations: true } } },
      });

      if (sale.status === SaleStatus.CANCELLED) {
        return sale; // idempotent replay
      }

      if (user.role === "CASHIER") {
        const shift = await tx.shift.findUniqueOrThrow({ where: { id: sale.shiftId } });
        const alreadyAllocated = await tx.khataPaymentAllocation.findFirst({ where: { saleId: sale.id } });
        const inScope =
          sale.cashierId === user.id && shift.status === ShiftStatus.OPEN && !alreadyAllocated;
        if (!inScope) {
          throw new DomainError(
            ErrorCode.INVALID_CANCELLATION_SCOPE,
            "You can only cancel your own invoice, in the same shift, before any Khata payment has been applied to it. Ask an admin.",
          );
        }
      }

      // Reverse inventory: put every consumed unit back into its exact batch.
      for (const item of sale.items) {
        for (const allocation of item.allocations) {
          await this.inventoryService.restockBatch(tx, {
            batchId: allocation.batchId,
            productId: item.productId,
            quantity: Number(allocation.quantity),
            userId: user.id,
            referenceId: sale.id,
          });
        }
      }

      // Reverse Khata, if this sale had a remaining balance.
      if (Number(sale.remainingAmount) > 0) {
        const khataAccount = await tx.khataAccount.findUnique({ where: { customerId: sale.customerId } });
        if (khataAccount) {
          const khataTx = await tx.khataTransaction.create({
            data: {
              id: newId(),
              khataAccountId: khataAccount.id,
              type: KhataTransactionType.CANCELLATION,
              amount: -Number(sale.remainingAmount),
              saleId: sale.id,
            },
          });
          await recordOutbox(tx, "KhataTransaction", khataTx.id, khataTx);
        }
      }

      const cancelled = await tx.sale.update({
        where: { id },
        data: {
          status: SaleStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancelReason: dto.reason,
        },
      });
      await recordOutbox(tx, "Sale", cancelled.id, cancelled);

      const cancelAudit = await tx.auditLog.create({
        data: {
          id: newId(),
          userId: user.id,
          action: "INVOICE_CANCELLED",
          entityType: "Sale",
          entityId: sale.id,
          reason: dto.reason,
        },
      });
      await recordOutbox(tx, "AuditLog", cancelAudit.id, cancelAudit);

      // Same shape as the idempotent-replay path above and as create()'s
      // return — items/allocations included, not the bare update() result
      // (that stays bare deliberately for the outbox payload, which must
      // match flat Sale columns for the cloud's generic upsert dispatcher).
      return tx.sale.findUniqueOrThrow({
        where: { id: cancelled.id },
        include: { items: { include: { allocations: true } } },
      });
    });
  }

  // FR-111: logged, but a pure side-effect — no financial fields touched.
  async recordPrint(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user); // 404s / scope-checks the same way a normal view would
    return this.prisma.$transaction(async (tx) => {
      const audit = await tx.auditLog.create({
        data: { id: newId(), userId: user.id, action: "INVOICE_PRINTED", entityType: "Sale", entityId: id },
      });
      await recordOutbox(tx, "AuditLog", audit.id, audit);
      return { ok: true };
    });
  }

  private async getCashierDiscountCapPercent(tx: Prisma.TransactionClient): Promise<number> {
    const setting = await tx.setting.findUnique({ where: { key: "cashierDiscountCapPercent" } });
    return typeof setting?.value === "number" ? setting.value : 10;
  }

  private async consumeOverrideToken(tx: Prisma.TransactionClient, token: string, saleClientId: string) {
    const auth = await tx.overrideAuthorization.findUnique({ where: { id: token } });
    if (
      !auth ||
      auth.usedAt ||
      auth.expiresAt < new Date() ||
      auth.saleClientId !== saleClientId
    ) {
      throw new DomainError(
        ErrorCode.OVERRIDE_TOKEN_INVALID_OR_EXPIRED,
        "This admin approval has expired or was already used. Please request a new one.",
      );
    }
    await tx.overrideAuthorization.update({
      where: { id: token },
      data: { usedAt: new Date(), saleId: saleClientId },
    });
    return { id: auth.id, adminId: auth.adminId };
  }

  /** Decision #5: SHOP-C{counter}-{year}-{sequence}, offline-safe (no MAX()+1). */
  private async nextInvoiceNumber(tx: Prisma.TransactionClient, counterId: string): Promise<string> {
    const counter = await tx.counter.findUniqueOrThrow({ where: { id: counterId } });
    const year = new Date().getFullYear();

    const updated = await tx.invoiceSequence.updateMany({
      where: { counterId, year },
      data: { nextValue: { increment: 1 } },
    });

    let assigned: number;
    if (updated.count === 0) {
      await tx.invoiceSequence.create({ data: { counterId, year, nextValue: 2 } });
      assigned = 1;
    } else {
      const row = await tx.invoiceSequence.findUniqueOrThrow({
        where: { counterId_year: { counterId, year } },
      });
      assigned = row.nextValue - 1;
    }

    return `SHOP-${counter.name}-${year}-${String(assigned).padStart(6, "0")}`;
  }
}
