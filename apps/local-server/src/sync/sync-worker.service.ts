import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { SyncState } from "@shop/database";
import { newId } from "@shop/shared";
import type { OutboxEventPayload, SyncIngestRequest, SyncIngestResponse } from "@shop/shared";
import { PrismaService } from "../prisma/prisma.service";

const BASE_DELAY_MS = 30_000; // 30s
const MAX_DELAY_MS = 30 * 60_000; // 30min
const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 30_000;

/**
 * The outbox push loop (docs/10-offline-engine.md §5). Runs inside the same
 * process as the API (no separate service, per docs/07-architecture-detailed.md
 * §2 — one shop, one deployable unit). Does nothing and fails safe when the
 * cloud is unreachable — never blocks or affects local sale creation
 * (OFF-002/OFF-004), which is entirely independent of this worker.
 */
@Injectable()
export class SyncWorkerService {
  private readonly logger = new Logger(SyncWorkerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Interval(POLL_INTERVAL_MS)
  async tick() {
    // Prevents overlapping runs if a push takes longer than the interval.
    if (this.running) return;
    this.running = true;
    try {
      await this.pushPending();
    } catch (err) {
      this.logger.error("Unexpected error in sync push loop", err instanceof Error ? err.stack : err);
    } finally {
      this.running = false;
    }
  }

  private async pushPending() {
    const cloudApiUrl = this.config.get<string>("CLOUD_API_URL");
    const deviceApiKey = this.config.get<string>("CLOUD_DEVICE_API_KEY");
    if (!cloudApiUrl || !deviceApiKey) {
      return; // not configured yet — local operation is unaffected (OFF-002)
    }

    const now = new Date();
    // Fetched WITHOUT an eligibility (nextAttemptAt) filter, then trimmed to
    // a leading prefix below. A plain `WHERE nextAttemptAt <= now` would let
    // a later-created row with a SHORTER backoff (e.g. a Sale that only
    // failed once) jump ahead of an earlier-created row it depends on that's
    // still backing off (e.g. its Shift, which failed more times and so has
    // a longer delay) — retrying the dependent alone, hitting the same FK
    // violation, extending its own backoff on a schedule decorrelated from
    // the dependency's, and repeating. Stopping at the first ineligible
    // event instead preserves the id-order (= dependency-order) guarantee
    // the cloud's sequential ingest relies on.
    const candidates = await this.prisma.outboxEvent.findMany({
      where: { state: { in: [SyncState.LOCAL_ONLY, SyncState.PENDING_SYNC, SyncState.SYNC_FAILED] } },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    });

    const events: typeof candidates = [];
    for (const candidate of candidates) {
      if (candidate.nextAttemptAt && candidate.nextAttemptAt > now) break;
      events.push(candidate);
    }

    if (events.length === 0) return;

    const ids = events.map((e) => e.id);
    await this.prisma.outboxEvent.updateMany({ where: { id: { in: ids } }, data: { state: SyncState.SYNCING } });

    const request: SyncIngestRequest = {
      events: events.map(
        (e): OutboxEventPayload => ({
          id: e.id,
          entityType: e.entityType,
          entityId: e.entityId,
          payload: e.payload as Record<string, unknown>,
          createdAt: e.createdAt.toISOString(),
        }),
      ),
    };

    try {
      const response = await fetch(`${cloudApiUrl}/sync/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-api-key": deviceApiKey },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        await this.markFailed(ids, events, `Cloud responded ${response.status}`);
        return;
      }

      const body = (await response.json()) as SyncIngestResponse;
      await this.applyResults(body, events);
    } catch (err) {
      // Network error / cloud unreachable — expected during normal offline
      // operation (OFF-001). Retried via backoff, never dropped (SYNC-005).
      await this.markFailed(ids, events, err instanceof Error ? err.message : "Unknown network error");
    }
  }

  private async applyResults(body: SyncIngestResponse, events: { id: string; attempts: number }[]) {
    for (const result of body.results) {
      if (result.status === "SYNCED") {
        await this.prisma.outboxEvent.update({
          where: { id: result.id },
          data: { state: SyncState.SYNCED, syncedAt: new Date(), lastError: null, nextAttemptAt: null },
        });
      } else if (result.status === "CONFLICT") {
        await this.prisma.$transaction([
          this.prisma.outboxEvent.update({ where: { id: result.id }, data: { state: SyncState.CONFLICT } }),
          this.prisma.syncConflict.create({
            data: {
              id: newId(),
              outboxEventId: result.id,
              details: { reason: result.reason ?? "Unspecified conflict" },
            },
          }),
        ]);
      } else {
        await this.markFailed([result.id], events, result.reason ?? "Rejected by cloud");
      }
    }
  }

  private async markFailed(ids: string[], events: { id: string; attempts: number }[], reason: string) {
    for (const id of ids) {
      const event = events.find((e) => e.id === id);
      const attempts = (event?.attempts ?? 0) + 1;
      const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempts) + Math.random() * 1000;
      await this.prisma.outboxEvent.update({
        where: { id },
        data: {
          state: SyncState.SYNC_FAILED,
          attempts,
          lastError: reason,
          nextAttemptAt: new Date(Date.now() + delay),
        },
      });
    }
  }
}
