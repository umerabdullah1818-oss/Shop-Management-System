import { Injectable } from "@nestjs/common";
import { SyncState, SyncConflictStatus } from "@shop/database";
import { PrismaService } from "../prisma/prisma.service";

// docs/09-api-design.md §14 (Local side): Admin-facing status + manual
// conflict resolution. The actual push loop lives in SyncWorkerService.
@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async status() {
    const [pending, failed, oldestPending, lastSynced, openConflicts] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { state: { in: [SyncState.LOCAL_ONLY, SyncState.PENDING_SYNC] } } }),
      this.prisma.outboxEvent.count({ where: { state: SyncState.SYNC_FAILED } }),
      this.prisma.outboxEvent.findFirst({
        where: { state: { in: [SyncState.LOCAL_ONLY, SyncState.PENDING_SYNC, SyncState.SYNC_FAILED] } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.outboxEvent.findFirst({ where: { state: SyncState.SYNCED }, orderBy: { syncedAt: "desc" } }),
      this.prisma.syncConflict.count({ where: { status: SyncConflictStatus.OPEN } }),
    ]);

    return {
      pendingCount: pending,
      failedCount: failed,
      oldestPendingEventCreatedAt: oldestPending?.createdAt ?? null,
      lastSyncedAt: lastSynced?.syncedAt ?? null,
      openConflictCount: openConflicts,
    };
  }

  conflicts() {
    return this.prisma.syncConflict.findMany({
      where: { status: SyncConflictStatus.OPEN },
      include: { outboxEvent: true },
      orderBy: { createdAt: "asc" },
    });
  }

  // SYNC-004: manual, audited resolution only — never automatic. `notes` is
  // merged into the existing `details` JSON (never overwritten) so the
  // original event payload/rejection reason stays intact for the record.
  async resolveConflict(id: string, resolvedBy: string, notes?: string) {
    const existing = await this.prisma.syncConflict.findUniqueOrThrow({ where: { id } });
    const details =
      notes && typeof existing.details === "object" && existing.details !== null
        ? { ...(existing.details as Record<string, unknown>), resolutionNote: notes }
        : (existing.details ?? undefined);

    return this.prisma.syncConflict.update({
      where: { id },
      data: { status: SyncConflictStatus.RESOLVED, resolvedBy, resolvedAt: new Date(), details },
    });
  }
}
