# Implementation Roadmap

This restates the Master Development Prompt's own phased process (§55) as the plan going forward, so it's tracked alongside the review docs rather than only living in the original PDF.

## Phase Sequence

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Requirements Review | **Done — see `01-requirements-review.md` + `02-unresolved-decisions.md`** (all blocking decisions confirmed) |
| 2 | Software Requirements Specification | **Done — see `06-srs.md`** |
| 3 | Architecture (system/local/cloud/network/sync/auth/backup) | **Done — see `07-architecture-detailed.md`** |
| 4 | Database: ERD, PostgreSQL + Prisma schema | **Done — see `08-database-schema.md` + `packages/database/prisma/schema.prisma`** |
| 5 | API design | **Done — see `09-api-design.md`** |
| 6 | Offline engine design | **Done — see `10-offline-engine.md`** |
| 7 | UI/UX | **Done — see `11-ui-ux.md`** |
| 8 | Implementation | **In progress — see below** |

## Confirmed Phase 1 decisions (for reference)
- Cashier discount: bounded cap (10% default, configurable via Settings)
- Return-batch policy: return to original batch, most-recently-consumed-first for partial returns
- Local-Server-down fallback: none — pause sales, mitigate via reliability/UPS
- Client device model: thin LAN clients (only the Local Shop Server has its own DB/sync engine)
- UI language: bilingual (English + Urdu toggle) — infrastructure built, Login + POS fully translated; remaining Admin screens are English-only strings for now (see below)

## Phase 8 status

### `apps/local-server` (port 3000) — functionally complete for V1 scope
Every module from the build order is implemented and wired into `app.module.ts`: Auth (Admin password + Cashier PIN + admin step-up override), Categories, Products, Inventory/FIFO engine, Suppliers, Purchases, Customers/Khata, Shifts, Sales (with below-cost/discount-cap override flow + print-audit endpoint), Returns, Expenses, Settings, Reports, Audit, Sync (outbox worker + status/conflict endpoints), Counters.

### `apps/cloud-api` (port 4000) — sync path + reports at full parity with local
Device-key-authenticated `/sync/ingest` (generic upsert-by-model-name dispatcher), Admin login, and the complete report set (sales/purchases/inventory/khata/suppliers/profit/expenses/dashboard) mirroring `local-server`'s `ReportsService`, with an `asOf`/`cloudLastSyncedAt` staleness indicator per Decision #11.

### `apps/web` (port 3002) — every screen from the UI/UX doc is built
Login (PIN + password, bilingual), the full POS screen (search, cart, per-line overrides, admin step-up modal, shift open/close, print), and the complete Admin section: Dashboard, Products (+ per-product FIFO batch view), Inventory (low stock + manual adjustments), Purchases, Suppliers, Customers/Khata, Sales & Returns (+ invoice cancellation), Expenses, Shifts, Reports (tabbed hub), Settings, Audit Log, Sync Status. Printing is a dedicated `/print/[id]` route rendering an 80mm-thermal receipt (format abstraction in place for 58mm/A4 later), wired from both the POS success screen and the admin reprint action.

Known simplifications, not gaps: the Reports hub renders each report's JSON directly rather than seven bespoke table layouts (functional, not polished); i18n covers Login + POS in full, other Admin screens are English-only strings using the same `useTranslation` infrastructure others can adopt incrementally.

### Automated tests — `apps/local-server/test/`
Integration tests (Jest + a real Postgres `shop_test` database, not mocks — FIFO row-locking and transaction rollback can't be faithfully tested any other way) covering the highest-risk logic: FIFO allocation matching the spec's exact worked example, exact-batch-exhaustion, insufficient-stock rejection, below-cost blocking (Cashier) vs. override (Admin, audited), idempotent sale replay, Khata oldest-invoice-first allocation matching the spec's worked example, and return-batch restocking (most-recently-consumed-first). All 9 tests pass. Run `pnpm --filter @shop/local-server run test:setup` once, then `pnpm --filter @shop/local-server test`. This covers the highest-risk subset of §53's original test matrix, not the full exhaustive list — `cloud-api` and `web` have no automated tests yet.

### Verified by real runtime testing, not just type-checking or `test`
Full stack booted against real Postgres (via Docker) multiple times across this build: migrated, seeded, ran real HTTP traffic through local-server, cloud-api, and the Next.js web app (including a production `next build`, which emitted all 19 routes cleanly). Confirmed, among other things:
- FIFO allocation exactly matches the spec's worked example (20×Rs.1000 + 10×Rs.1200 = Rs.32,000 COGS).
- Idempotent replay of an identical `POST /sales` body returns the original result without double-consuming stock.
- The full local→cloud sync pipeline replicated a complete Sale (with its exact FIFO batch allocation split) to the cloud database byte-for-byte.
- The sync engine's FK safety net correctly caught and surfaced real cross-environment data gaps (below) rather than silently corrupting anything.
- `GET /sales/:id`'s cashier/customer/product-name enrichment and the `POST /sales/:id/print` audit endpoint work end-to-end (built for the receipt template, verified via curl before wiring the frontend).
- All three apps' pages return HTTP 200 with real rendered content (checked via curl against a running dev server), not error boundaries.

### Bugs found and fixed only because of live testing (see `docs/08-database-schema.md`'s amendments for full detail)
1. **Cross-app `DATABASE_URL` collision** — `local-server` and `cloud-api` share one generated Prisma client, which auto-loads `packages/database/.env` at import time; each app's own `.env` was silently losing. Fixed with an explicit `datasources.db.url` override in each `PrismaService` plus `dotenv-cli` loading each app's own `.env` into the real process environment before Node starts. Invisible without querying the actual target database directly — every layer (health check, API response) reported success while writing to the wrong database.
2. **`Counter` needed a deterministic id and real sync support** — was treated as fixed/unsynced reference data, but `Shift`/`Sale` both FK-reference it. Fixed: deterministic seed id + a real `POST /counters` endpoint with outbox recording.
3. **`User` rows are deliberately not synced** — documented as a known, intentional gap; anything referencing a not-yet-provisioned user on the far side fails loudly with a clear FK error rather than silently dropping data.
4. **`SalesService.create`/`cancel` and `CustomersService.recordKhataPayment`'s idempotent-replay paths returned a different shape than the fresh-create path** — found by writing the integration tests (a TypeScript union-type error), not by manual testing. Fixed so replays and fresh creates are always structurally identical.
5. **Dev port collision** — Next.js defaults to port 3000, same as local-server. `apps/web` now runs on 3002 (`next dev -p 3002` / `next start -p 3002`).

## Remaining work
1. Full exhaustive test coverage per §53's original matrix (cancellation, offline-specific scenarios, multi-device — the current suite covers the highest-risk subset only); test suites for `cloud-api` and `web`.
2. Bilingual coverage for the remaining Admin screens (infrastructure in place, translations not yet written).
3. Reports hub polish (bespoke tables instead of raw JSON per report).
4. Backup/restore runbook execution and deployment configuration (Phase 8 steps 28-29) — designed in `03-architecture-plan.md`/`07-architecture-detailed.md`, not yet executed.
5. Users management UI/endpoints (Admin creating Cashier accounts) — currently Users only exist via the seed script.
