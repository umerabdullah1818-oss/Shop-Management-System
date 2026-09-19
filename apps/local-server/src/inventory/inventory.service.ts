import { Injectable } from "@nestjs/common";
import { BatchStatus, MovementType, Prisma } from "@shop/database";
import { DomainError, ErrorCode, newId } from "@shop/shared";
import { PrismaService } from "../prisma/prisma.service";
import { recordOutbox } from "../sync/outbox.util";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto";

interface LockedBatchRow {
  id: string;
  remainingQty: string; // Decimal comes back as string from $queryRaw
  unitCost: string;
}

export interface FifoAllocation {
  batchId: string;
  quantity: number;
  unitCost: number;
}

/**
 * The FIFO engine (FR-020-024, BR-004/BR-005). Every method that mutates a
 * batch's remainingQty takes the active transaction (`tx`) so it always
 * participates in the caller's atomic operation (sale, return, adjustment)
 * rather than committing independently — see docs/06-srs.md NFR-011.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** FR-012: one purchase line item -> exactly one new batch. Never merged. */
  async createBatchFromPurchaseItem(
    tx: Prisma.TransactionClient,
    params: {
      productId: string;
      purchaseItemId: string;
      supplierId: string;
      purchaseDate: Date;
      quantity: number;
      unitCost: number;
      userId: string;
      referenceId: string; // the Purchase id, for the movement's reference
    },
  ) {
    const batch = await tx.inventoryBatch.create({
      data: {
        id: newId(),
        productId: params.productId,
        purchaseItemId: params.purchaseItemId,
        supplierId: params.supplierId,
        purchaseDate: params.purchaseDate,
        originalQty: params.quantity,
        remainingQty: params.quantity,
        unitCost: params.unitCost,
        status: BatchStatus.ACTIVE,
      },
    });
    await recordOutbox(tx, "InventoryBatch", batch.id, batch);

    await this.recordMovement(tx, {
      batchId: batch.id,
      productId: params.productId,
      type: MovementType.PURCHASE,
      quantity: params.quantity,
      referenceType: "Purchase",
      referenceId: params.referenceId,
      userId: params.userId,
    });

    return batch;
  }

  /**
   * FR-022/FR-023: consumes `quantity` units of `productId` strictly
   * oldest-batch-first, locking candidate batches with FOR UPDATE so two
   * concurrent sales of the same product can never both claim the same
   * units (the race condition identified in docs/01-requirements-review.md §7).
   * Throws INSUFFICIENT_STOCK (FR-024) if total remaining stock is short.
   */
  async allocateFifo(
    tx: Prisma.TransactionClient,
    params: { productId: string; quantity: number; userId: string; referenceType: string; referenceId: string },
  ): Promise<FifoAllocation[]> {
    const rows = await tx.$queryRaw<LockedBatchRow[]>`
      SELECT id, "remainingQty", "unitCost"
      FROM "InventoryBatch"
      WHERE "productId" = ${params.productId} AND "remainingQty" > 0
      ORDER BY "createdAt" ASC
      FOR UPDATE
    `;

    let remaining = params.quantity;
    const allocations: FifoAllocation[] = [];

    for (const row of rows) {
      if (remaining <= 0) break;
      const available = Number(row.remainingQty);
      const take = Math.min(available, remaining);
      if (take <= 0) continue;

      allocations.push({ batchId: row.id, quantity: take, unitCost: Number(row.unitCost) });
      remaining -= take;

      const newRemaining = available - take;
      const updatedBatch = await tx.inventoryBatch.update({
        where: { id: row.id },
        data: {
          remainingQty: newRemaining,
          status: newRemaining <= 0 ? BatchStatus.EXHAUSTED : BatchStatus.ACTIVE,
        },
      });
      await recordOutbox(tx, "InventoryBatch", updatedBatch.id, updatedBatch);

      await this.recordMovement(tx, {
        batchId: row.id,
        productId: params.productId,
        type: MovementType.SALE,
        quantity: -take,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        userId: params.userId,
      });
    }

    if (remaining > 0) {
      throw new DomainError(
        ErrorCode.INSUFFICIENT_STOCK,
        "Unable to complete sale. No stock is available for this product.",
        { productId: params.productId, requested: params.quantity, shortBy: remaining },
      );
    }

    return allocations;
  }

  /**
   * FR-061 / Decision #3: restocks the exact original batch(es) a return
   * came from (the caller determines the split via SaleItemBatchAllocation
   * — see ReturnsService, built alongside the Returns module).
   */
  async restockBatch(
    tx: Prisma.TransactionClient,
    params: { batchId: string; productId: string; quantity: number; userId: string; referenceId: string },
  ) {
    const rows = await tx.$queryRaw<LockedBatchRow[]>`
      SELECT id, "remainingQty", "unitCost" FROM "InventoryBatch" WHERE id = ${params.batchId} FOR UPDATE
    `;
    const batch = rows[0];
    if (!batch) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Batch not found.", { batchId: params.batchId }, 404);
    }

    const newRemaining = Number(batch.remainingQty) + params.quantity;
    const updatedBatch = await tx.inventoryBatch.update({
      where: { id: params.batchId },
      data: { remainingQty: newRemaining, status: BatchStatus.ACTIVE },
    });
    await recordOutbox(tx, "InventoryBatch", updatedBatch.id, updatedBatch);

    await this.recordMovement(tx, {
      batchId: params.batchId,
      productId: params.productId,
      type: MovementType.RETURN,
      quantity: params.quantity,
      referenceType: "Return",
      referenceId: params.referenceId,
      userId: params.userId,
    });
  }

  /** FR-025: Admin-only manual adjustment. Rejects a resulting negative stock (FR-024). */
  async adjustStock(dto: AdjustInventoryDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedBatchRow[]>`
        SELECT id, "remainingQty", "unitCost" FROM "InventoryBatch" WHERE id = ${dto.batchId} FOR UPDATE
      `;
      const batch = rows[0];
      if (!batch) {
        throw new DomainError(ErrorCode.NOT_FOUND, "Batch not found.", { batchId: dto.batchId }, 404);
      }

      const full = await tx.inventoryBatch.findUniqueOrThrow({ where: { id: dto.batchId } });
      const newRemaining = Number(batch.remainingQty) + dto.quantity;
      if (newRemaining < 0) {
        throw new DomainError(
          ErrorCode.VALIDATION_ERROR,
          "This adjustment would make stock negative, which isn't allowed.",
          { batchId: dto.batchId, currentRemaining: batch.remainingQty, requestedChange: dto.quantity },
        );
      }

      const updatedBatch = await tx.inventoryBatch.update({
        where: { id: dto.batchId },
        data: { remainingQty: newRemaining, status: newRemaining <= 0 ? BatchStatus.EXHAUSTED : BatchStatus.ACTIVE },
      });
      await recordOutbox(tx, "InventoryBatch", updatedBatch.id, updatedBatch);

      const movement = await this.recordMovement(tx, {
        batchId: dto.batchId,
        productId: full.productId,
        type: dto.type,
        quantity: dto.quantity,
        referenceType: "ManualAdjustment",
        referenceId: dto.id,
        userId,
        reason: dto.reason,
      });

      // FR-100: manual inventory adjustment is an explicitly-listed audited action.
      const audit = await tx.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: "INVENTORY_ADJUSTED",
          entityType: "InventoryBatch",
          entityId: dto.batchId,
          beforeJson: { remainingQty: batch.remainingQty },
          afterJson: { remainingQty: newRemaining },
          reason: dto.reason,
        },
      });
      await recordOutbox(tx, "AuditLog", audit.id, audit);

      return movement;
    });
  }

  batchesForProduct(productId: string) {
    return this.prisma.inventoryBatch.findMany({
      where: { productId },
      orderBy: { createdAt: "asc" },
      include: { supplier: true },
    });
  }

  movements(params: { productId?: string; batchId?: string; type?: MovementType }) {
    return this.prisma.inventoryMovement.findMany({
      where: {
        ...(params.productId ? { productId: params.productId } : {}),
        ...(params.batchId ? { batchId: params.batchId } : {}),
        ...(params.type ? { type: params.type } : {}),
      },
      orderBy: { occurredAt: "desc" },
    });
  }

  /** BR-006: total current stock < minStockLevel. */
  async lowStockProducts() {
    const products = await this.prisma.product.findMany({
      where: { status: "ACTIVE" },
      include: { inventoryBatches: { select: { remainingQty: true } } },
    });

    return products
      .map((p) => ({
        ...p,
        totalStock: p.inventoryBatches.reduce((sum, b) => sum + Number(b.remainingQty), 0),
      }))
      .filter((p) => p.totalStock < Number(p.minStockLevel));
  }

  private async recordMovement(
    tx: Prisma.TransactionClient,
    params: {
      batchId: string;
      productId: string;
      type: MovementType;
      quantity: number;
      referenceType: string;
      referenceId: string;
      userId: string;
      reason?: string;
    },
  ) {
    const movement = await tx.inventoryMovement.create({
      data: {
        id: newId(),
        batchId: params.batchId,
        productId: params.productId,
        type: params.type,
        quantity: params.quantity,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        userId: params.userId,
        reason: params.reason,
      },
    });
    await recordOutbox(tx, "InventoryMovement", movement.id, movement);
    return movement;
  }
}
