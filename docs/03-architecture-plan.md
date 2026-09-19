# Recommended Architecture Plan — Phase 1

Status: high-level direction for approval. Full diagrams, network/auth architecture detail, and formal specs are Phase 3 deliverables (post-approval). This assumes Decision #16 = (a) thin-LAN-client and Decision #4 = (a) no-fallback, as recommended in `02-unresolved-decisions.md`; if you choose otherwise, this document gets revised before Phase 3.

## 1. System Architecture (recommended)

```
                         INTERNET (optional, for sync/backup/reports only)
                                          |
                                          v
                          ┌───────────────────────────────┐
                          │        CLOUD SYSTEM            │
                          │  NestJS API (sync + reports)   │
                          │  PostgreSQL (cloud, replica of │
                          │    synced shop data)           │
                          │  Automated backups             │
                          └───────────────┬────────────────┘
                                          ↕  HTTPS, one-way outbox push
                                          |  (local → cloud only, V1)
                          ┌───────────────┴────────────────┐
                          │       LOCAL SHOP SERVER         │
                          │  NestJS API (all business logic)│
                          │  Local PostgreSQL (source of    │
                          │    truth for the shop)          │
                          │  Sync outbox worker             │
                          │  Local backup job               │
                          └───────────────┬────────────────┘
                                          |
                                   SHOP LAN / Wi-Fi
                                          |
                    ┌─────────────────────┼─────────────────────┐
                    v                     v                     v
               Admin PC              Cashier PC                iPad
           (browser → Next.js    (browser → Next.js       (browser → Next.js
            → Local API)          → Local API)             → Local API)
```

Key point: **only the Local Shop Server ever talks to the cloud.** Browsers on shop devices never call the cloud directly and never hold their own copy of business data — they're thin clients of the one local API. This is what keeps FIFO/inventory correct without a distributed multi-writer problem (§40).

## 2. Local Shop Server Architecture

- **NestJS** monolith (modular: Auth, Products, Inventory/FIFO, Sales, Khata, Suppliers, Purchases, Expenses, Shifts, Reports, Audit, Sync) — one deployable app, not microservices; this is a single-shop system and microservices would add operational cost with no benefit here.
- **Prisma + local PostgreSQL** as the only datastore for shop-floor operations. All financially-critical multi-step operations (sale completion, return, cancellation, khata payment allocation) run inside a single Postgres transaction with row-level locking on the inventory batch / customer khata rows they touch, to eliminate the FIFO and Khata race conditions identified in the requirements review.
- **Sync outbox table** (`sync_queue` / `outbox_events`) written inside the *same* transaction as every business mutation (transactional outbox pattern) — guarantees an event is queued if and only if the business change actually committed, with no separate "dual write" step that could fail independently.
- **Background sync worker** (a scheduled job inside the same NestJS app, or a lightweight separate process) polls the outbox and pushes to the cloud when internet is reachable; does nothing and fails safe when it isn't.
- Runs as a background service on a dedicated shop PC, auto-starting on boot, ideally on a UPS.

## 3. Cloud Architecture

- **NestJS** API exposing a `/sync/ingest` endpoint (idempotent, keyed by the local server's globally unique transaction IDs) and a set of read-mostly reporting endpoints for the optional remote-access app (Decision #11).
- **Cloud PostgreSQL**, structurally the same schema as local, populated exclusively via the sync ingest path — the cloud never originates a sale, purchase, or inventory movement itself in V1.
- No component of the cloud stack is ever reachable by shop-floor POS devices directly; they only ever talk to the Local Shop Server.
- Automated nightly cloud backups, since the cloud DB is itself the disaster-recovery target for the whole shop (§42).

## 4. Offline Architecture

- "Offline" = the Local Shop Server has no path to the internet/cloud. The shop LAN between devices and the server is assumed available (that's a home/shop router, not the public internet, and is a much more reliable link).
- Because of that, **offline capability lives entirely in the Local Shop Server**: it already has its own database and doesn't need connectivity to anyone to keep operating — sales, FIFO, Khata, shifts, printing all just work against the local Postgres, exactly as if online, because they always run against the local Postgres regardless of internet state.
- The system status indicator (§34's ONLINE/OFFLINE requirement) reflects **Local Shop Server ↔ Cloud** reachability, not LAN health — shown in the UI so staff know whether sync is currently happening, without it ever blocking a sale.
- Client devices (Admin PC/Cashier PC/iPad) need no offline logic of their own under this model (see Decision #16). If LAN to the Local Shop Server itself is lost, that's a local network problem to fix (same category as a lost printer connection), not a "go into offline mode" state.

## 5. Synchronization Strategy

1. Every business mutation on the Local Shop Server writes its normal rows **and** an outbox event, in one transaction, tagged with a client-generated globally-unique ID (ULID recommended: sortable by time, avoids the "leaks internal counter" downside of naive auto-increment sharing).
2. The sync worker batches pending outbox events and POSTs them to the cloud when reachable.
3. Cloud **upserts by that unique ID**, enforced with a real database unique constraint (not just an app-level check) — replays of the same event are guaranteed no-ops.
4. Cloud acknowledges per-event success/failure; local server transitions each event through the state machine below.
5. Sync direction is **one-way (local → cloud) in V1** — the cloud never pushes writes back down. This eliminates an entire category of bidirectional-conflict scenarios and matches Decision #11's read-mostly remote-access recommendation. (Reference/config data edited by an Admin always happens on the Local Shop Server, even if the Admin is doing it via the local network from home via VPN/remote desktop — not via a separate cloud write path.)
6. Financial correctness is prioritized over "the cloud is always instantly current" — a slow or backlogged sync is fine; a duplicated or lost sale is not (matches §52's priority ordering).

## 6. Sync States

`LOCAL_ONLY → PENDING_SYNC → SYNCING → SYNCED`, with `SYNC_FAILED` (auto-retry with backoff) and `CONFLICT` (manual admin review — expected to be rare to nonexistent under the one-writer model, reserved as a safety net for edge cases like a restored-from-backup local DB reusing an ID).

## 7. Multi-Device Conflict Strategy

Under the thin-LAN-client model, there is **no in-shop multi-writer conflict** during normal operation — every write, from every device, goes through the same Local Shop Server and the same Postgres transaction logic, so two counters can never oversell the same batch (the exact scenario §40 warns about is structurally prevented, not just detected-and-fixed-after-the-fact). The only remaining conflict surface is Local → Cloud sync, handled by idempotent upsert as above. If Decision #4 is later revisited to allow a standalone fallback terminal, that reintroduces a narrow, scoped version of multi-writer conflict that would need its own reconciliation design at that time — deliberately not built for V1.

## 8. Security Plan (high-level; full detail in Phase 3)

- Auth: hashed passwords (Admin), PIN-based quick-login (Cashier, pending Decision #17), session tokens scoped to device + user, auto-lock on inactivity.
- All authorization checks enforced in the NestJS service layer, never trusted from the Next.js frontend — the frontend can hide a button, but the backend is what actually rejects a disallowed action.
- LAN traffic between shop devices and the Local Shop Server: still authenticated (no implicit LAN trust); HTTPS is a nice-to-have inside the shop, mandatory Local→Cloud.
- Local Shop Server has no inbound internet exposure at all — outbound-only to the cloud sync endpoint. Nothing to port-forward, nothing to firewall-harden against inbound attack.
- Cloud API: rate limiting on auth and sync-ingest endpoints, RBAC, audit logging, no direct Postgres exposure — the only way in is the app's own API.
- Remote access (if Decision #11 = read-mostly reporting app) is a separate, narrower-scoped app with no write path to sales/inventory, reducing what needs to be secured for remote use.
- Secrets (DB URLs, JWT signing keys, sync API keys) via environment variables / a secrets manager; only `.env.example` (no real values) ever committed.
- Audit log table has application-role DB grants restricted to INSERT only — no UPDATE/DELETE — so "must not be casually editable" (§33) is enforced at the database layer, not just by convention.

## 9. Backup/Recovery Plan (high-level; exact cadence per Decision #10)

- **Local**: continuous WAL archiving + nightly full snapshot of the local Postgres, rotated on a retention window (recommended 14 days), stored on a separate disk/volume from the live DB.
- **Cloud**: nightly snapshot of the cloud Postgres (which is itself already a near-real-time copy of local via sync), retained 30+ days — this is the disaster-recovery target if the shop's physical server is destroyed (§41/§42).
- **Restore procedure**: documented runbook (Phase 8 deliverable) covering (a) restoring the local server from its own most recent local snapshot after a crash, and (b) rebuilding a destroyed local server from the cloud copy plus replaying any outbox events that hadn't synced yet (which is why outbox events are themselves durable and retained, not deleted immediately on success).
- **Health monitoring**: a simple heartbeat/status check on the Local Shop Server (disk space, Postgres up, sync worker alive) surfaced on the Admin dashboard, so a failing server is noticed quickly rather than discovered days later.

---
*Next: `04-database-erd-plan.md` for the entity-level data model, then `05-implementation-roadmap.md` for sequencing.*
