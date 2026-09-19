import { Injectable } from "@nestjs/common";
import { KhataTransactionType, PaymentMethod, ReturnStatus } from "@shop/database";
import { DomainError, ErrorCode, newId } from "@shop/shared";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { recordOutbox } from "../sync/outbox.util";
import { CreateReturnDto } from "./dto/create-return.dto";
import { AuthenticatedUser } from "../auth/auth.types";

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  findBySale(saleId: string) {
    return this.prisma.return.findMany({ where: { saleId }, include: { items: true } });
  }

  /**
   * FR-060/FR-061/FR-062 (Decision #3): restocks the exact original
   * batch(es) a sale item was consumed from. When a return covers fewer
   * units than the full line (so it doesn't need every original batch),
   * this restocks starting from the MOST RECENTLY consumed batch first —
   * i.e. undoing the original FIFO consumption in reverse order. This is a
   * deliberate, simple, auditable rule (not specified by the master
   * prompt's Decision #3, which only settled *that* returns go back to
   * original batches, not the order when a partial return doesn't need all
   * of them) that avoids fractional/proportional splitting across batches.
   */
  async create(dto: CreateReturnDto, user: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.return.findUnique({ where: { id: dto.id } });
      if (existing) return existing; // idempotent replay

      const sale = await tx.sale.findUniqueOrThrow({
        where: { id: dto.saleId },
        include: { items: { include: { allocations: true } } },
      });

      const ret = await tx.return.create({
        data: {
          id: dto.id,
          saleId: sale.id,
          processedById: user.id,
          shiftId: dto.shiftId,
          status: ReturnStatus.COMPLETED,
        },
      });
      await recordOutbox(tx, "Return", ret.id, ret);

      let totalRefund = 0;

      for (const input of dto.items) {
        const saleItem = sale.items.find((i) => i.id === input.saleItemId);
        if (!saleItem) {
          throw new DomainError(ErrorCode.NOT_FOUND, "Sale item not found on this invoice.", {
            saleItemId: input.saleItemId,
          });
        }

        const alreadyReturned = await tx.returnItem.aggregate({
          where: { saleItemId: saleItem.id, return: { status: ReturnStatus.COMPLETED } },
          _sum: { quantity: true },
        });
        const returnableQty = Number(saleItem.quantity) - Number(alreadyReturned._sum.quantity ?? 0);

        if (input.quantity > returnableQty) {
          throw new DomainError(
            ErrorCode.VALIDATION_ERROR,
            "Cannot return more than was sold (accounting for any prior returns).",
            { saleItemId: saleItem.id, returnableQty, requested: input.quantity },
          );
        }

        const effectiveUnitPrice = Number(saleItem.lineTotal) / Number(saleItem.quantity);
        const refundAmount = effectiveUnitPrice * input.quantity;
        totalRefund += refundAmount;

        const returnItem = await tx.returnItem.create({
          data: {
            id: newId(),
            returnId: ret.id,
            saleItemId: saleItem.id,
            quantity: input.quantity,
            refundAmount,
          },
        });
        await recordOutbox(tx, "ReturnItem", returnItem.id, returnItem);

        // Restock most-recently-consumed batch first (see method doc comment above).
        let remainingToRestock = input.quantity;
        const allocationsNewestFirst = [...saleItem.allocations].reverse();
        for (const allocation of allocationsNewestFirst) {
          if (remainingToRestock <= 0) break;
          const take = Math.min(Number(allocation.quantity), remainingToRestock);
          if (take <= 0) continue;

          await this.inventoryService.restockBatch(tx, {
            batchId: allocation.batchId,
            productId: saleItem.productId,
            quantity: take,
            userId: user.id,
            referenceId: ret.id,
          });

          const restock = await tx.returnItemBatchRestock.create({
            data: { id: newId(), returnItemId: returnItem.id, batchId: allocation.batchId, quantity: take },
          });
          await recordOutbox(tx, "ReturnItemBatchRestock", restock.id, restock);

          remainingToRestock -= take;
        }
      }

      // Reverse Khata proportionally if this sale had any credit balance —
      // a return reduces what's owed, via a compensating ledger entry
      // (never editing the original CREDIT_SALE row), per BR-018: we never
      // try to unwind a payment that was already allocated elsewhere.
      if (Number(sale.remainingAmount) > 0 || sale.paymentMethod === PaymentMethod.KHATA) {
        const khataAccount = await tx.khataAccount.findUnique({ where: { customerId: sale.customerId } });
        if (khataAccount) {
          const khataPortion = Math.min(totalRefund, Number(sale.remainingAmount));
          if (khataPortion > 0) {
            const khataTx = await tx.khataTransaction.create({
              data: {
                id: newId(),
                khataAccountId: khataAccount.id,
                type: KhataTransactionType.RETURN_ADJUSTMENT,
                amount: -khataPortion,
                returnId: ret.id,
              },
            });
            await recordOutbox(tx, "KhataTransaction", khataTx.id, khataTx);

            const updatedSale = await tx.sale.update({
              where: { id: sale.id },
              data: { remainingAmount: { decrement: khataPortion } },
            });
            await recordOutbox(tx, "Sale", updatedSale.id, updatedSale);
          }
        }
      }

      const returnAudit = await tx.auditLog.create({
        data: {
          id: newId(),
          userId: user.id,
          action: "RETURN_PROCESSED",
          entityType: "Return",
          entityId: ret.id,
          afterJson: { saleId: sale.id, totalRefund },
        },
      });
      await recordOutbox(tx, "AuditLog", returnAudit.id, returnAudit);

      return tx.return.findUniqueOrThrow({ where: { id: ret.id }, include: { items: true } });
    });
  }
}
