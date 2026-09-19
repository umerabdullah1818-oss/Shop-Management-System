import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { SyncIngestRequest, SyncIngestResponse, SyncIngestResultItem } from "@shop/shared";

/**
 * Every entity type any Local Shop Server emits via recordOutbox()
 * (apps/local-server/src/sync/outbox.util.ts) maps here to its Prisma
 * model delegate, keyed by the EXACT model name — that convention (rather
 * than bespoke per-entity mapping code) is what keeps this handler generic
 * (docs/08-database-schema.md §4, SYNC-003).
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  private delegateFor(entityType: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map: Record<string, any> = {
      Sale: this.prisma.sale,
      SaleItem: this.prisma.saleItem,
      SaleItemBatchAllocation: this.prisma.saleItemBatchAllocation,
      Payment: this.prisma.payment,
      KhataTransaction: this.prisma.khataTransaction,
      KhataPayment: this.prisma.khataPayment,
      KhataPaymentAllocation: this.prisma.khataPaymentAllocation,
      Purchase: this.prisma.purchase,
      PurchaseItem: this.prisma.purchaseItem,
      InventoryBatch: this.prisma.inventoryBatch,
      InventoryMovement: this.prisma.inventoryMovement,
      Customer: this.prisma.customer,
      Supplier: this.prisma.supplier,
      SupplierPayment: this.prisma.supplierPayment,
      Return: this.prisma.return,
      ReturnItem: this.prisma.returnItem,
      ReturnItemBatchRestock: this.prisma.returnItemBatchRestock,
      Expense: this.prisma.expense,
      Shift: this.prisma.shift,
      AuditLog: this.prisma.auditLog,
      Category: this.prisma.category,
      Product: this.prisma.product,
      Counter: this.prisma.counter,
    };
    return map[entityType] ?? null;
  }

  /**
   * SYNC-003: idempotent upsert by the event's own id (a ULID, doubling as
   * the row's real primary key — see docs/08-database-schema.md §2). A
   * retried push of an already-applied event is a safe no-op.
   *
   * Processed SEQUENTIALLY, not in parallel: events arrive ordered by
   * creation (docs/08-database-schema.md's amendment on outbox ordering),
   * and a dependent row (e.g. a SaleItem) can reference a row earlier in
   * the same batch (its Sale) that only just got upserted — parallelizing
   * would race that ordering guarantee away.
   */
  async ingest(request: SyncIngestRequest): Promise<SyncIngestResponse> {
    const results: SyncIngestResultItem[] = [];

    for (const event of request.events) {
      const delegate = this.delegateFor(event.entityType);
      if (!delegate) {
        results.push({ id: event.id, status: "REJECTED", reason: `Unknown entity type: ${event.entityType}` });
        continue;
      }

      try {
        await delegate.upsert({
          where: { id: event.entityId },
          create: event.payload,
          update: event.payload,
        });
        results.push({ id: event.id, status: "SYNCED" });
      } catch (err) {
        // Always REJECTED (retryable via the local worker's backoff), never
        // silently dropped (SYNC-005). Under the confirmed single-writer
        // architecture, a failure here is almost always a transient
        // ordering issue (a dependency hasn't synced yet) that resolves
        // itself on retry — not a genuine business conflict. True CONFLICT
        // detection (semantic duplicates, divergent state) would need
        // bespoke per-entity logic this generic dispatcher deliberately
        // doesn't attempt; docs/10-offline-engine.md §6 treats that as a
        // rare safety-net case, reserved for when it's actually needed.
        const message = err instanceof Error ? err.message : "Unknown error";
        this.logger.warn(`Ingest failed for ${event.entityType}:${event.entityId} — ${message}`);
        results.push({ id: event.id, status: "REJECTED", reason: message });
      }
    }

    // Cheap ingest heartbeat, reusing the existing Setting key/value table
    // rather than adding schema just for this — read back by ReportsService
    // as "cloudLastSyncedAt" for the remote dashboard (REP-009). The cloud's
    // own OutboxEvent table is never populated (only the Local Shop Server
    // ever writes outbox events; the cloud is the receiver, not a sender),
    // so it can't be used as this signal.
    await this.prisma.setting.upsert({
      where: { key: "lastIngestAt" },
      update: { value: new Date().toISOString() },
      create: { key: "lastIngestAt", value: new Date().toISOString() },
    });

    return { results };
  }
}
