import { Prisma } from "@shop/database";
import { newId } from "@shop/shared";

/**
 * SYNC-001: every business-mutating row gets its own outbox event, in the
 * same transaction as the row itself, carrying the FULL row as its payload
 * (not a hand-picked summary) — this is what lets the cloud ingest endpoint
 * genuinely reconstruct the row with a generic upsert-by-model-name handler
 * (apps/cloud-api/src/sync/sync.service.ts) instead of needing bespoke
 * mapping code per entity type. `entityType` is always the exact Prisma
 * model name (e.g. "Sale", "SaleItem") so the cloud side can look up the
 * matching model delegate directly.
 *
 * Plain function, not an injectable service — every domain service already
 * has `tx` in scope and calling this shouldn't require importing SyncModule
 * (which owns the *worker* that reads this queue, a separate concern).
 */
export function recordOutbox(
  tx: Prisma.TransactionClient,
  entityType: string,
  entityId: string,
  row: unknown,
) {
  // Prisma rows contain Decimal/Date instances, which aren't themselves
  // valid Json-column input even though both implement toJSON(). Round-trip
  // through JSON.stringify/parse so what's stored is a genuinely plain,
  // JSON-safe snapshot (Decimal -> string, Date -> ISO string).
  const payload = JSON.parse(JSON.stringify(row)) as Prisma.InputJsonValue;

  return tx.outboxEvent.create({
    data: { id: newId(), entityType, entityId, payload },
  });
}
