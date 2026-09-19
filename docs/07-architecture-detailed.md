# Detailed Architecture — Phase 3

Status: draft for review. Expands `03-architecture-plan.md` into concrete topology, protocols, and sequence flows, per §55 Phase 3. References SRS requirement IDs (`06-srs.md`) throughout so implementation later traces back to a specific requirement.

---

## 1. System Architecture

```
                         ┌─────────────────────────────────────────┐
                         │              CLOUD (VPC)                  │
                         │                                            │
                         │  ┌──────────────┐   ┌───────────────────┐ │
                         │  │ Cloud API    │   │ Cloud PostgreSQL   │ │
                         │  │ (NestJS)     │──▶│ (managed, private   │ │
                         │  │ /sync/ingest │   │  subnet, no public  │ │
                         │  │ /reports/*   │   │  internet access)   │ │
                         │  │ /auth/*      │   └───────────────────┘ │
                         │  └──────▲───────┘                          │
                         │         │ HTTPS (TLS 1.2+), API-key/JWT     │
                         └─────────┼──────────────────────────────────┘
                                   │  outbound only, initiated by
                                   │  the Local Shop Server
                         ┌─────────┴──────────────────────────────────┐
                         │           LOCAL SHOP SERVER (shop LAN)       │
                         │                                              │
                         │  ┌──────────────┐   ┌────────────────────┐  │
                         │  │ Local API    │──▶│ Local PostgreSQL   │  │
                         │  │ (NestJS)     │   │ (source of truth)  │  │
                         │  │ all business │   └────────────────────┘  │
                         │  │ logic        │            ▲              │
                         │  └──────▲───────┘            │ WAL/backup   │
                         │         │                     │              │
                         │  ┌──────┴───────┐   ┌────────┴──────────┐  │
                         │  │ Sync worker  │   │ Local backup job   │  │
                         │  │ (outbox → cloud)│ (nightly snapshot)  │  │
                         │  └──────────────┘   └────────────────────┘  │
                         └──────────────────────┬───────────────────────┘
                                                  │ HTTP over LAN (SEC-004: no
                                                  │ inbound internet exposure)
                    ┌─────────────────────────────┼─────────────────────────────┐
                    ▼                              ▼                              ▼
              Admin PC (browser)            Cashier PC (browser)            iPad (browser)
              Next.js served by             Next.js served by               Next.js served by
              the Local API                 the Local API                   the Local API
```

Thin-LAN-client model (confirmed, `OFF-001`): the Next.js app is served *by* the Local Shop Server and calls *only* the Local API. No shop device ever calls the cloud directly, and none holds its own database. This is what makes `SYNC-002` (one-way sync) and `AC-001` (no concurrent-sale races) hold structurally rather than by discipline.

## 2. Local Architecture (Local Shop Server internals)

```
Local Shop Server (single host, single Docker Compose stack)
├── nginx (reverse proxy, :80/:443 on the LAN)
│     ├── /            → Next.js app (SSR)
│     └── /api/*        → NestJS API (:3000, internal only)
├── NestJS API
│     ├── AuthModule            (Admin password + Cashier PIN, sessions)
│     ├── ProductsModule
│     ├── InventoryModule       (batches, FIFO engine, movements)
│     ├── PurchasesModule
│     ├── SalesModule           (sale transaction orchestrator)
│     ├── KhataModule
│     ├── SuppliersModule
│     ├── ReturnsModule
│     ├── ExpensesModule
│     ├── ShiftsModule
│     ├── ReportsModule
│     ├── AuditModule           (INSERT-only DB role, SEC-006)
│     └── SyncModule            (outbox writer + background push worker)
├── PostgreSQL (local, data volume on host disk, WAL archiving on)
└── Scheduled jobs (node-cron inside the API process, or a lightweight
      sidecar): nightly pg_dump snapshot, sync-queue health check,
      old-backup rotation
```

- Single deployable unit per shop — no microservices. One shop, one server, one process group; this keeps operations simple and matches the single-writer model.
- `nginx` (or an equivalent reverse proxy) is what actually answers `http://local-shop-server` on the LAN — see §4 Network Architecture for how that hostname resolves.
- The sync worker runs *inside* the same NestJS process on a scheduled interval (e.g., every 30s) rather than as a separate service, to avoid an extra moving part for a single-shop deployment; it can be split out later if ever needed.

## 3. Cloud Architecture

```
Cloud
├── Cloud API (NestJS), publicly reachable over HTTPS only
│     ├── /sync/ingest        (idempotent upsert by ULID, SYNC-003)
│     ├── /reports/*          (read-mostly, for optional remote access — SEC-009)
│     └── /auth/*             (remote-access login, separate from shop-floor auth)
└── Cloud PostgreSQL (managed, private subnet/VPC — never publicly reachable,
      only the Cloud API can reach it — SEC-005)
```

- The Cloud API is the *only* public-facing surface in the whole system. The Local Shop Server and the optional remote-reporting app both talk to it; nothing else does.
- Cloud PostgreSQL schema mirrors the local schema closely enough that ingested rows map 1:1, but it is not assumed to be byte-identical — the ingest endpoint validates and normalizes rather than blind-copying.
- No cloud-initiated write ever reaches the Local Shop Server (`SYNC-002`) — this is enforced by simply not building that code path, not by a permission check that could be bypassed.

## 4. Network Architecture

- **LAN addressing**: Local Shop Server gets a static IP via DHCP reservation on the shop router (recommended over a fixed manual IP, so it survives router replacement without reconfiguration).
- **Hostname resolution for `http://local-shop-server`**: two viable approaches, either is acceptable —
  1. **Router-level local DNS entry** (most consumer/SMB routers support a static DNS/hosts mapping) pointing `local-shop-server` → the reserved IP. Zero per-device configuration once set up.
  2. **mDNS/Bonjour** (`local-shop-server.local`) — works natively on iPad/Mac, needs Avahi (Linux) or Bonjour Print Services (Windows) running on the server. Slightly more "zero-config" but adds a dependency.
  - *Recommendation*: router-level DNS entry as the primary mechanism (simpler, no extra service to keep running), with mDNS as a nice-to-have fallback if the router doesn't support it.
- **Firewall posture**: Local Shop Server's inbound rules allow only LAN-sourced traffic on the reverse-proxy port; there is no rule permitting inbound from the WAN interface at all (`SEC-004`) — nothing to misconfigure into an accidental exposure because the capability isn't there.
- **Outbound**: Local Shop Server initiates HTTPS to the Cloud API's sync endpoint only; no other outbound dependency is required for core operation (satisfies `OFF-002`/`OFF-004`).
- **TLS**: LAN traffic between shop devices and the Local Shop Server may run over plain HTTP given it never leaves a physically-controlled network and every request is still authenticated (`SEC-001`) — but self-signed HTTPS is also acceptable if preferred; Local→Cloud traffic is always HTTPS/TLS 1.2+, non-negotiable (`SEC-005`).

## 5. Synchronization Architecture

Sequence for one sale, from creation to cloud confirmation:

```
Cashier terminal          Local API                 Local DB          Sync worker      Cloud API
     │  POST /sales           │                          │                  │              │
     ├───────────────────────▶│                           │                  │              │
     │                        │ BEGIN TX                  │                  │              │
     │                        ├─────FIFO lock+allocate───▶│                  │              │
     │                        ├─────insert invoice────────▶│                  │              │
     │                        ├─────insert khata/payment──▶│                  │              │
     │                        ├─────insert audit row───────▶│                  │              │
     │                        ├─────insert outbox event────▶│                  │              │
     │                        │ COMMIT TX                  │                  │              │
     │◀───────201 Created─────┤                           │                  │              │
     │                        │                            │◀──poll PENDING──┤              │
     │                        │                            │                  ├──POST/sync──▶│
     │                        │                            │                  │  (ULID key)  │
     │                        │                            │                  │◀──200 ack────┤
     │                        │                            │◀──mark SYNCED────┤              │
```

- **FR-043/NFR-011**: the sale is considered successful to the Cashier the moment the *local* transaction commits — sync is entirely asynchronous and never blocks the sale (`OFF-002`).
- **SYNC-001**: outbox event insert happens inside the same transaction as the invoice — this is the transactional-outbox guarantee, not a best-effort second step.
- **SYNC-003**: the Cloud API's `/sync/ingest` upserts by the event's ULID with a DB unique constraint — a retried push after a dropped acknowledgment is a safe no-op.
- **SYNC-004**: on any failure (timeout, 5xx, network error) the event stays `PENDING_SYNC`/moves to `SYNC_FAILED` and is retried with exponential backoff (e.g., 30s, 1m, 5m, 30m, capped, indefinitely) — never dropped.
- **SYNC-006**: the sync worker also emits a lightweight health metric (queue depth, oldest pending event age) the Admin dashboard polls.

## 6. Authentication Architecture

### 6.1 Normal login
- **Admin**: username + password (bcrypt/argon2 hash), full session.
- **Cashier**: PIN-based quick login (`SEC-002`) — a short numeric PIN hashed the same way as a password, chosen for checkout speed on a shared terminal per `NFR-001`.
- Both produce a session token (JWT or server-side session, TTL + sliding expiry) scoped to `{user, device}`; auto-lock after a configurable inactivity period (`SEC-003`).

### 6.2 Admin step-up override (below-cost sale, over-cap discount — `BR-011`, `SEC-010`)

```
Cashier's cart hits a below-cost / over-cap condition
        │
        ▼
POS shows "Admin approval required" modal on the SAME terminal
        │
        ▼
Admin enters their own credential/PIN into that modal
        │
        ▼
POST /auth/step-up { adminCredential, context: { draftSaleId, reason } }
        │
        ▼
Backend verifies Admin role + credential, issues a single-use,
short-TTL (~2 min) signed authorization bound to that draftSaleId
        │
        ▼
Cashier's session resumes; the completion request includes the
authorization; backend re-verifies signature+TTL+single-use before
allowing the sale to proceed, and logs the Admin's identity, batch,
cost, and price into the audit record (FR-100)
```

This keeps the override cryptographically bound to *that specific sale attempt* — it can't be reused for a different invoice or replayed later.

### 6.3 Remote-access app (optional, Decision #11)
- Entirely separate login against the **Cloud API**, independent of shop-floor sessions.
- Read-mostly scope only — no endpoint in this app can create/modify a sale, payment, or inventory row (`SEC-009`); it queries the cloud replica, clearly timestamped with its own "as of" sync lag indicator (`REP-009`).

## 7. Backup / Recovery Architecture

- **Local**: PostgreSQL WAL archiving continuous; `pg_dump` (or `pg_basebackup`) full snapshot nightly, written to a *separate* disk/volume from the live DB, retained on a 14-day rotation.
- **Cloud**: managed Postgres automated nightly snapshot, retained 30+ days — this doubles as the shop's disaster-recovery copy if the physical Local Shop Server is destroyed (`OFF-003` mitigation).
- **Recovery after unexpected shutdown**: PostgreSQL's own WAL replay handles a crash-consistent restart automatically; the sync worker resumes from whatever outbox events are still `PENDING_SYNC`/`LOCAL_ONLY` with no special recovery code needed, since durability lives in Postgres, not in memory.
- **Full local-server rebuild** (hardware replacement): restore the most recent cloud snapshot into a fresh local Postgres instance, then reconcile against the last known local backup/outbox state if the local disk is at all recoverable, to avoid losing any transaction that happened after the last cloud sync but before the failure. This procedure gets a written runbook in Phase 8.
- **Health monitoring**: a scheduled check (disk space, Postgres connectivity, sync worker last-run timestamp) feeds the Admin dashboard's sync/health panel (`SYNC-006`).

---
*Next: Phase 4 — full ERD + PostgreSQL/Prisma schema, building on `04-database-erd-plan.md`.*
