/**
 * Shared shapes for the sync outbox protocol between the Local Shop Server
 * and the Cloud API (docs/07-architecture-detailed.md §5, docs/10-offline-engine.md).
 */

export type SyncState =
  | "LOCAL_ONLY"
  | "PENDING_SYNC"
  | "SYNCING"
  | "SYNCED"
  | "SYNC_FAILED"
  | "CONFLICT";

export interface OutboxEventPayload {
  id: string; // ULID — doubles as the cloud idempotency key (SYNC-003)
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string; // ISO timestamp, server-authoritative at creation
}

export interface SyncIngestRequest {
  events: OutboxEventPayload[];
}

export interface SyncIngestResultItem {
  id: string;
  status: "SYNCED" | "CONFLICT" | "REJECTED";
  reason?: string;
}

export interface SyncIngestResponse {
  results: SyncIngestResultItem[];
}
