# Offline Engine Design — Phase 6

Status: draft for review. Expands `07-architecture-detailed.md` §5 into concrete implementation detail for the sync/outbox engine, per §55 Phase 6 ("design the offline engine before the POS checkout is implemented"). No code is written yet — this is the design that Phase 8's `SyncModule` will follow.

## 1. Local database

PostgreSQL on the Local Shop Server, per `packages/database/prisma/schema.prisma`. This *is* the offline store — there is no separate "local cache" layer to design, because under the confirmed thin-LAN-client architecture (Decision #16), the Local Shop Server's own database is the only place offline durability needs to exist (`OFF-001`). Postgres's own WAL gives crash-consistency for free (§7 below).

## 2. Local API

Already specified in `09-api-design.md`. Every mutating endpoint runs its business logic and its `OutboxEvent` insert inside one transaction (`SYNC-001`) — this is the entire mechanism that makes offline operation safe; there's no separate "offline mode" code path the API switches into. It behaves identically whether the internet is up or down, because it never touches the internet directly.

## 3. Transaction / entity IDs

- **Generation:** a shared `IdService.newId()` utility (ULID, 26 chars, lexicographically time-sortable) called by every service method *before* constructing the row to insert — never left to a database default. This is what lets a `Sale.id` be assigned the instant a sale is created locally, with no dependency on ever reaching the cloud.
- **Client-supplied IDs:** for POST endpoints that need retry-safety (`09-api-design.md` §0), the frontend generates the ULID (using the same ULID library, client-side) and sends it in the request body; the service uses that value as the primary key instead of generating its own. A retried POST with the same `id` is detected and treated as a no-op (see idempotent write pattern below).
- **Idempotent write pattern** (used by `Sale`, `Purchase`, `Return`, `KhataPayment`, `SupplierPayment`, shift open/close):

  ```
  BEGIN
    existing = SELECT ... WHERE id = :clientSuppliedId
    IF existing found:
      COMMIT (no-op)
      RETURN existing   // 200, not 201 — same result as the original request
    ELSE:
      perform the full business transaction using :clientSuppliedId as the PK
      COMMIT
      RETURN new row    // 201
  ```

## 4. Device identity

- The Local Shop Server holds a **device credential** (a long-lived API key or client certificate) issued once during setup, used only for its outbound calls to `POST /sync/ingest` on the Cloud API — this is a machine credential, entirely separate from any User's session token.
- `Device` table records `id`, `name`, `type` (`LOCAL_SERVER` | `POS_TERMINAL`), `lastSeenAt` — used for audit attribution (`FR-100`'s "device/client ID") and, optionally, for the Admin dashboard to show which terminal is active. POS terminals (browsers) don't need their own credential under the thin-client model — they're authenticated as *users*, not as devices, since they never talk to the cloud.

## 5. Sync queue (outbox) worker

- Runs as a scheduled task inside the same NestJS process (no separate service — one shop, one deployable unit).
- **Loop** (every 30s, configurable):
  1. `SELECT * FROM "OutboxEvent" WHERE state IN ('LOCAL_ONLY','PENDING_SYNC','SYNC_FAILED') AND (nextAttemptAt IS NULL OR nextAttemptAt <= now()) ORDER BY createdAt ASC LIMIT 100`.
  2. Mark selected rows `SYNCING`.
  3. POST them as one batch to the Cloud API's `/sync/ingest`.
  4. On a per-event ack: mark `SYNCED`, set `syncedAt`.
  5. On a per-event rejection the cloud flags as a genuine conflict (see §6): mark `CONFLICT`, create a `SyncConflict` row.
  6. On a transport-level failure (timeout, 5xx, no network): mark all sent-but-unacknowledged events back to `SYNC_FAILED`, increment `attempts`, compute `nextAttemptAt` via backoff.
- **Backoff schedule:** `nextAttemptAt = now() + min(maxDelay, baseDelay * 2^attempts) + jitter`, with `baseDelay = 30s`, `maxDelay = 30min`, capped — retried indefinitely (never gives up on its own; `SYNC-005` forbids silently dropping a transaction). `attempts` beyond a threshold (e.g., 20, ≈ several hours of retrying) surfaces a warning on the Admin dashboard sync panel (`SYNC-006`) so a genuinely broken sync process (not just "internet is down for the weekend") gets noticed.
- **Ordering:** events are sent in `createdAt` order per the outbox query above; the cloud ingest endpoint processes a batch in the order received, which matters for entities with dependencies (e.g., a `Sale`'s `OutboxEvent` should land before its `Return`'s, though in practice this is naturally satisfied by `createdAt` ordering since a return can't be created before its sale).

## 6. Conflict detection & resolution

Under the confirmed architecture (single local writer, no fallback multi-writer mode — Decision #4/#16), a **true data conflict should essentially never occur** by construction: there's only ever one source generating these IDs and this data. `CONFLICT` exists as a safety net for the residual scenarios where it still could:

- The Local Shop Server's database was restored from an older backup after some data loss, and it re-generates/reuses activity that the cloud already has a *different* record for under an ID that happens to collide (extremely unlikely with ULIDs, but the referential/business-logic mismatch this could cause — e.g., a batch reference the cloud no longer recognizes — is the real risk, not the ID collision itself).
- A payload fails a referential-integrity check on the cloud side (e.g., references a `customerId` the cloud doesn't have yet because of an ordering issue) — cloud responds with a structured rejection rather than silently dropping it.

**Resolution flow:** any such rejection creates a `SyncConflict` row (never silently retried forever as if it were transient, and never auto-resolved). It appears on the Admin's `/sync/conflicts` screen (`09-api-design.md` §14) with the full event payload and the cloud's rejection reason. An Admin reviews and either (a) requeues a corrected event, or (b) marks it resolved with a note explaining why no action was needed (e.g., a genuine duplicate from a double-retry that turned out to be harmless). This is a manual, audited action — never an automatic merge of financial data (`SYNC-004`).

## 7. Server failure handling & recovery

- **Crash consistency:** PostgreSQL's WAL guarantees that a hard crash (power loss, OOM kill) loses at most the most recent uncommitted transaction — nothing that was ever reported "sale successful" to a Cashier can be lost, because that response only happens after commit (`FR-043`).
- **Process supervision:** the NestJS API and Postgres both run under a restart policy (`systemd` service or Docker Compose `restart: unless-stopped`) so an unexpected process exit self-heals without manual intervention.
- **On restart:** the sync worker simply resumes its normal polling loop — any event still `SYNCING` from before the crash (never acknowledged) is treated as `SYNC_FAILED` and retried; this is safe because the cloud ingest is idempotent by ID (`SYNC-003`), so a retried event that *did* actually make it through before the crash is just a no-op on the cloud side.
- **Health check:** a lightweight endpoint (`GET /health`) checks Postgres connectivity and reports the sync worker's last successful run timestamp; an external watchdog (or simply the Admin dashboard polling it) can alert if the server is unreachable at all.
- **Full local-server rebuild** (hardware destroyed): documented runbook —
  1. Provision a fresh machine, restore the most recent **cloud** snapshot into a new local Postgres instance (this is the disaster-recovery path — `OFF-003`).
  2. If any part of the old local disk is salvageable, compare its outbox table against what the cloud actually has `SYNCED`, and manually replay anything that never made it out (this is why outbox events are retained rather than deleted after success — they're the replay log for exactly this scenario).
  3. Re-issue a device credential for the new machine.
  4. Resume normal operation; the sync worker naturally catches up if anything was queued but unsent since the last cloud snapshot.

---
*Next: Phase 7 — UI/UX (all screens), building on the API contracts in `09-api-design.md`.*
