# Software Requirements Specification (SRS)

**Project:** Hybrid Offline-First Shop Billing & Management System (Decoration Pieces Shop)
**Status:** Draft for review — Phase 2. Builds on `01-requirements-review.md` and the confirmed decisions in `02-unresolved-decisions.md`.
**Currency:** PKR / Rs. No tax/GST in V1.

Requirement IDs: `FR-*` functional, `BR-*` business rule, `NFR-*` non-functional, `OFF-*` offline, `SYNC-*` synchronization, `SEC-*` security, `REP-*` reporting, `AC-*` acceptance criteria. IDs are stable — later phases (API design, DB schema, tests) reference them, so don't renumber, only append.

---

## 1. Scope

A POS + inventory + accounting system for a single physical decoration-pieces shop, running on a Local Shop Server that is the shop's source of truth, with optional cloud sync for backup, disaster recovery, and read-mostly remote reporting. Normal shop operations (sales, inventory, Khata, shifts) never depend on internet connectivity (Local ↔ Cloud only). In-shop devices (Admin PC, Cashier PC, iPad) are thin LAN clients of the one Local Shop Server — confirmed architecture, no independent per-device data store (Decision #16).

Out of scope for V1: tax/GST, split payments across multiple methods on one invoice, multi-branch/multi-shop support, unit-conversion math between product units, Khata due-date/overdue tracking, bidirectional cloud→local sync, standalone fallback POS mode during a Local-Server outage.

---

## 2. User Roles & Permission Matrix

Two roles: **ADMIN**, **CASHIER**. All permission checks are enforced server-side (`SEC-001`); the frontend may hide controls for UX but that is never the actual security boundary.

| Capability | Admin | Cashier |
|---|---|---|
| Create/edit/disable products, categories | ✅ | ❌ |
| Create purchases, suppliers, supplier payments | ✅ | ❌ |
| Manual inventory adjustment | ✅ | ❌ |
| Create invoices / sales | ✅ | ✅ |
| Search/scan products, change qty, change current-invoice price | ✅ | ✅ |
| Apply discount up to cashier cap (default 10%, configurable) | ✅ (no cap) | ✅ (capped, `BR-010`) |
| Approve below-cost sale / cashier discount override | ✅ | ❌ (must escalate to admin step-up, `BR-011`) |
| Add customers, view customer info & Khata | ✅ | ✅ |
| Receive customer Khata payments | ✅ | ✅ |
| Print / reprint invoices | ✅ | ✅ (own shift's invoices) |
| Open/close own shift | ✅ | ✅ |
| Review any shift, any cashier's sales | ✅ | ❌ (own shift/day only) |
| Cancel/void a completed invoice | ✅ (any) | ✅ (own invoice, same shift, restricted — `BR-012`) |
| Process returns/refunds | ✅ | ✅ (subject to same below-cost/authorization rules as sales) |
| Record expenses | ✅ | ❌ |
| View reports | ✅ (all) | ❌ (no admin reports) |
| Manage users, roles, settings | ✅ | ❌ |
| View audit logs | ✅ | ❌ |
| View sync status / resolve conflicts | ✅ | ❌ |

---

## 3. Functional Requirements

### 3.1 Products & Categories
- **FR-001** Admin can create, edit, and disable (soft-delete) products and categories. Neither is ever hard-deleted once referenced by a purchase, sale, or batch (`BR-001`).
- **FR-002** Product fields: name, SKU (unique), barcode (unique, optional), category, unit (Piece/Box/Set/Other — descriptive only, no conversion math per Decision #9), official/default selling price, minimum stock level, status, created/updated timestamps.
- **FR-003** Duplicate SKU or barcode on create/edit is rejected with a clear validation error (not a raw DB constraint error).
- **FR-004** Product search supports name, SKU, and barcode lookup; disabled products are excluded from POS search but remain visible in reports, returns, and inventory history.
- **FR-005** Admin can view all products within a category, including disabled ones, from the category management screen.

### 3.2 Suppliers & Purchases
- **FR-010** Admin can create/edit/disable suppliers (name, phone, email, address, status). Suppliers are never hard-deleted once they have a purchase.
- **FR-011** Admin can create a purchase: supplier, supplier invoice number, purchase date, one or more line items (product, quantity, cost per unit), payment status, amount paid, amount payable (computed).
- **FR-012** Every purchase line item creates exactly one new `InventoryBatch` — batches are never merged, even for the same product from the same supplier on the same day (`BR-002`).
- **FR-013** Purchase cost and batch cost are immutable after creation — no edit path exists once a batch has any inventory movement against it (`BR-003`).
- **FR-014** Supplier record tracks running totals: total purchased, total paid, total payable, derived from purchase and supplier-payment history (never a manually-edited field).
- **FR-015** Admin can record a supplier payment (amount, method, date, notes, optional related purchase), allocated oldest-purchase-first (Decision #8), reducing payable. Supplier payments are never deleted — only reversed via a compensating entry.

### 3.3 Inventory & FIFO
- **FR-020** Stock is tracked at the batch level. Each batch: product, purchase reference, supplier, purchase date, original quantity, remaining quantity, unit cost, status, created timestamp.
- **FR-021** FIFO consumption order is strictly the batch creation order, independent per product (`BR-004`). Selling Product A never affects Product B's batch order.
- **FR-022** A sale of quantity *N* for a product consumes from the oldest batch with `remaining_qty > 0` first, splitting across as many subsequent batches as needed until *N* is fulfilled; every batch used is recorded in a per-sale-item batch allocation record with its exact quantity and unit cost at time of sale (`BR-005`).
- **FR-023** Batch consumption during sale creation is protected against concurrent-sale race conditions via row-level locking within the sale's database transaction (`NFR-010`).
- **FR-024** Stock can never go negative. If requested quantity exceeds total remaining stock across all batches, the sale is rejected with a clear "insufficient stock" message (not a generic error).
- **FR-025** Admin-only manual inventory adjustment (type: adjustment/damaged/expired/other), always with a reason, always producing an `InventoryMovement` row — never a silent edit of a batch's remaining quantity.
- **FR-026** Product inventory view (Admin) shows total stock plus each batch (active/waiting) with cost, purchase date, remaining quantity, supplier, and status, per the waterfall layout in the original spec.
- **FR-027** Low-stock indicator: a product shows "LOW STOCK" whenever `total current stock < minimum stock level` (`BR-006`).

### 3.4 Customers & Khata
- **FR-030** Admin/Cashier can create customers (name, phone, optional email/address, status). A seeded "Walk-in Customer" exists for anonymous, fully-paid sales only.
- **FR-031** Khata (credit) sales require a real, identifiable customer — never the Walk-in Customer (`BR-007`).
- **FR-032** Khata account tracks total purchases, total paid, total outstanding, and a full transaction history (credit sale, payment received, return adjustment, invoice cancellation, approved adjustment) as an append-only ledger — the balance is always derived, never directly edited.
- **FR-033** When a customer makes a Khata payment, it is automatically allocated to their oldest outstanding invoice first, continuing to the next-oldest until the payment is exhausted, with no manual invoice selection required for the standard flow (`BR-008`, per §22's worked example).

### 3.5 Sales / POS
- **FR-040** Sale flow: search/scan product → add to cart → set quantity → load official price → cashier may override current-invoice price only → validate price against active FIFO batch cost → apply discount → select customer → select payment method → enter payment → compute total/due → complete sale.
- **FR-041** Invoice record contains: unique ID, human-readable invoice number, date/time, cashier, customer, line items (product, qty, actual selling price, discount), subtotal, grand total, amount paid, remaining amount, payment method, status.
- **FR-042** Payment methods: Cash, Card, Bank, Khata. Exactly one payment method per invoice — no multi-method split payments in V1 (`BR-013`). A partially-paid single-method payment is still allowed; the unpaid remainder becomes Khata.
- **FR-043** Sale completion is one atomic database transaction covering: invoice + items creation, FIFO batch allocation, COGS calculation, Khata update (if applicable), payment recording, inventory movement creation, audit log entry, and sync outbox event (`BR-014`, `NFR-011`). Partial completion (e.g., invoice saved but inventory not reduced) must never be possible.
- **FR-044** Invoice numbering is offline-safe: never `MAX(invoice_number)+1`; scheme is `SHOP-C{counter}-{year}-{sequence}`, sequence generated per-counter by the Local Shop Server (Decision #5), guaranteed unique even across a long offline period, because the Local Shop Server is the sole writer (Decision #16).

### 3.6 Pricing & Discounts
- **BR-009** Selling price must be ≥ the active FIFO batch's unit cost, checked against the **effective price after discount** (resolves Ambiguity #2 from the requirements review). If the effective price is below cost, the sale is blocked for a Cashier and requires an Admin step-up approval (`BR-011`) to proceed.
- **BR-010** Cashier discount cap: configurable in Settings, default 10% per invoice or per line item (percentage or fixed amount, admin-configurable in Phase 2 Settings design). Admin discount is unlimited but always audited when it results in an effective price below the official price by more than the cashier cap, using the same audit shape as a below-cost override (Decision #1/#2).
- **BR-011** An Admin override (below-cost sale, or a discount beyond the cashier cap) requires the Admin to authenticate at the point of sale (step-up PIN/credential re-entry on the Cashier's terminal — `FR-050`), and produces an audit record: admin, invoice, product, batch, batch cost, selling price, timestamp, reason.
- **FR-050** The POS UI supports an in-session "Admin approval" step: Cashier's cart is held, an Admin enters their credential/PIN on the same terminal, the override is applied and attributed to that Admin, and the Cashier's session resumes.
- **BR-016** Changing a cashier's current-invoice price or applying a discount never changes the product's official/default selling price (`FR-002`'s field). Historical invoice line prices and batch costs are immutable — never recalculated when official prices change later (`BR-015`).

### 3.7 Returns & Refunds
- **FR-060** A return always references the original invoice and original sale item(s); partial-quantity returns are supported.
- **FR-061** Returned units are restocked into the **original consumed batch(es)** they came from, using the sale's batch-allocation record to determine exactly which batch(es) and how much of each (Decision #3, `BR-017`) — this preserves true FIFO order and exact historical costing for future sales.
- **FR-062** A return updates, atomically: inventory (via a RETURN-type movement against the original batch), sales/COGS/profit figures, Khata (if the original sale affected Khata — a compensating `RETURN_ADJUSTMENT` ledger entry, not an edit of the original transaction), refund/financial records, and audit log.
- **BR-018** If a customer's Khata payment was already allocated (oldest-first) partly onto a *different, later* invoice by the time a return happens on an earlier invoice, the return produces a compensating Khata ledger entry reflecting the new correct outstanding balance — it never attempts to "unwind" the earlier payment allocation itself, since that allocation already correctly reduced what was owed at the time it happened.

### 3.8 Invoice Cancellation
- **FR-070** Completed invoices are never hard-deleted. Cancellation is a status change (`COMPLETED → CANCELLED`) plus a full reversal of inventory, revenue, COGS, profit, payment, and Khata effects, all in one atomic transaction, and always audited (`BR-019`).
- **BR-012** Cashier-initiated cancellation is restricted to: the Cashier's own invoice, created within their current open shift, not yet involved in any subsequent Khata payment allocation from another invoice. Any cancellation outside that scope requires Admin action.

### 3.9 Expenses
- **FR-080** Admin records expenses: category (Rent/Electricity/Transport/Salaries/Maintenance/Other), description, amount, date, added-by user, optional receipt attachment. Expenses feed directly into Net Profit (`BR-020`).

### 3.10 Shifts / Cash Drawer
- **FR-090** Opening a shift requires: counter, cashier, opening cash, start time. Exactly one open shift per counter at a time is enforced (`BR-021`, a DB-level constraint, not just app logic).
- **FR-091** A shift tracks cash sales, card sales, bank sales, Khata collections, refunds, and cash expenses that occurred during it.
- **FR-092** Expected cash = Opening Cash + Cash Sales + Cash Khata Collections − Cash Refunds − Cash Expenses. Cashier enters actual counted cash at close; Difference = Actual − Expected, both stored and visible to Admin on review.

### 3.11 Audit Log
- **FR-100** Every sensitive action produces an audit record: user, action, entity, entity ID, before/after values where relevant, reason where relevant, device/client ID, timestamp. Minimum covered actions: cashier invoice price change, admin official price change, purchase created, inventory adjustment, below-cost override, invoice cancellation, customer payment, supplier payment, return, shift closed.
- **SEC-006** The application's database role has INSERT-only privileges on the audit table — no UPDATE/DELETE grant exists, so audit records cannot be edited or removed through the application layer under any role, including Admin.

### 3.12 Reports (Admin only)
- **REP-001** Sales reports: daily/weekly/monthly/custom range, by cashier, by product, by payment method.
- **REP-002** Purchase reports: purchase history by supplier, product, batch.
- **REP-003** Inventory reports: current stock, all batches (active/waiting), low stock, inventory valuation (sum of `remaining_qty × unit_cost` across all active batches).
- **REP-004** Khata reports: total outstanding, per-customer balances, collections, outstanding invoices.
- **REP-005** Supplier reports: purchases, payments, outstanding payable.
- **REP-006** Profit report: revenue, COGS (strict FIFO — sum of actual batch costs consumed, never an average, `BR-022`), gross profit, expenses, net profit.
- **REP-007** Expense report: by category, by date, total.
- **REP-008** Admin dashboard: today's sales, low stock alerts, outstanding Khata, supplier payable, expenses, gross/net profit, recent transactions.
- **REP-009** Reports are computed against the Local Shop Server's database (always current); the optional cloud remote-access app (Decision #11) may serve the same report shapes against the cloud replica for off-site viewing, clearly labeled with its own "as of" sync timestamp since it can lag behind the shop's live data.

### 3.13 Printing
- **FR-110** Invoice printing targets 80mm thermal by default (Decision #6), built behind a template abstraction so 58mm or A4 can be added later without redesigning the invoice data model.
- **FR-111** Completed invoices can be reprinted (recommended default, requirements review §3); reprints are logged in the audit trail but do not affect financial totals.

### 3.14 Localization
- **FR-120** UI supports English and Urdu with a runtime toggle (Decision #18); all user-facing strings are routed through an i18n layer from the start of frontend development — no hardcoded UI text.

---

## 4. Non-Functional Requirements

- **NFR-001** POS checkout flow (search → cart → payment → complete) must feel immediate on shop hardware over LAN — no unnecessary confirmation screens (per original spec's speed emphasis); target perceived latency under ~300ms for common actions against the Local Shop Server.
- **NFR-002** UI is responsive and touch-friendly across desktop, laptop, and iPad/tablet, with the POS screen specifically optimized for fast touch operation.
- **NFR-003** The system clearly displays ONLINE/OFFLINE status at all times, reflecting Local Shop Server ↔ Cloud reachability (not LAN health, per the confirmed thin-client architecture).
- **NFR-004** The Local Shop Server must remain fully operational for all core POS functions with zero internet connectivity, indefinitely (bounded only by local disk space for the growing sync outbox, which is monitored per `SYNC-006`).
- **NFR-005** Error messages shown to staff are plain-language and actionable (e.g., "Unable to complete sale. No stock is available for this product." rather than a raw 500); full technical detail is retained in server logs for admins/developers only (`SEC-007`).
- **NFR-006** Code is TypeScript throughout, modular (service layer, repository/data-access layer, DTO validation, centralized error handling), with unit and integration tests — no business logic embedded in UI components.
- **NFR-010** All FIFO batch consumption and Khata payment allocation operations use row-level locking (or equivalent serializable transaction isolation) to prevent concurrent-sale race conditions.
- **NFR-011** All multi-table financial/inventory operations (sale completion, return, cancellation, supplier payment) execute inside a single database transaction — no operation may partially commit.
- **NFR-012** Money is stored as `NUMERIC(12,2)` in PostgreSQL; no floating-point arithmetic is used anywhere in business-rule calculations.
- **NFR-013** Historical records (invoice prices, batch costs, audit entries) are immutable by construction — no API endpoint exists that can edit them after creation.

---

## 5. Offline Requirements

- **OFF-001** Under the confirmed thin-LAN-client architecture, "offline" refers exclusively to the Local Shop Server's connectivity to the Cloud — the shop's LAN between devices and the Local Shop Server is assumed available during business hours.
- **OFF-002** With zero internet connectivity, the Local Shop Server continues to fully support: login/session, product search/selection, invoice creation, quantity/price changes, allowed discounts, sales, FIFO consumption, cash/Khata payments, customer creation, invoice printing, shift open/close, and inventory movement creation — because these operations only ever depend on the local Postgres database, never on the cloud.
- **OFF-003** If the Local Shop Server itself becomes unreachable (hardware/power failure), POS terminals cannot create sales until it recovers — confirmed as the accepted tradeoff (Decision #4) in exchange for architectural simplicity and guaranteed correctness; mitigated operationally via UPS power and automatic service restart (`NFR` covered in the ops/backup plan, `03-architecture-plan.md` §9).
- **OFF-004** Every offline-created (i.e., not-yet-synced) transaction is assigned a globally unique ID (ULID) at creation time on the Local Shop Server — never a bare auto-increment value — so it can later be pushed to the cloud without collision (`SYNC-001`).

---

## 6. Synchronization Requirements

- **SYNC-001** Every business-mutating operation writes its normal rows and a `sync_queue` outbox event in the same database transaction (transactional outbox pattern) — an event exists if and only if the underlying change actually committed.
- **SYNC-002** Sync direction is one-way, Local → Cloud, in V1. The cloud never initiates a write back to the Local Shop Server (Decision #11's read-mostly remote access recommendation depends on this).
- **SYNC-003** The cloud ingest endpoint upserts by the event's globally unique ID, enforced by a database-level unique constraint — replayed/retried events are guaranteed no-ops (idempotency, not just app-level deduplication).
- **SYNC-004** Each outbox event progresses through states: `LOCAL_ONLY → PENDING_SYNC → SYNCING → SYNCED`, or `SYNC_FAILED` (automatic retry with backoff) or `CONFLICT` (routed to Admin review, never auto-resolved silently).
- **SYNC-005** No sync failure or retry may ever produce a duplicate sale, payment, or inventory movement on the cloud side, nor may it silently drop a transaction — every event either eventually reaches `SYNCED` or remains visibly `SYNC_FAILED`/`CONFLICT` for an Admin to see.
- **SYNC-006** The Admin dashboard surfaces sync health: pending queue depth, oldest unsynced event age, and any `SYNC_FAILED`/`CONFLICT` items, so a broken sync process is noticed quickly rather than silently accumulating.
- **SYNC-007** Data-consistency priority order when any tradeoff arises (per original spec §52): financial correctness > inventory correctness > FIFO correctness > no duplicates > no lost transactions > Khata correctness > supplier payable correctness > auditability > eventual cloud consistency.

---

## 7. Security Requirements

- **SEC-001** All authorization rules (role checks, discount caps, below-cost restriction, cancellation scope) are enforced in the backend service layer; the frontend may only reflect these rules for UX, never as the actual guard.
- **SEC-002** Passwords (Admin) are securely hashed (e.g., bcrypt/argon2); Cashier PIN-based quick-login (Decision #17) uses an equivalently secure hash, not plaintext or reversible encoding.
- **SEC-003** Sessions are scoped to user + device, with automatic lock/expiry after inactivity, appropriate for a shared, physically-accessible shop terminal.
- **SEC-004** The Local Shop Server accepts no inbound connections from the public internet — only outbound HTTPS calls to the cloud sync endpoint. Nothing about this architecture requires port-forwarding or exposing the local Postgres instance.
- **SEC-005** The Cloud API enforces authentication, RBAC, HTTPS, rate limiting on auth/sync endpoints, and never exposes PostgreSQL directly to any client.
- **SEC-006** *(see §3.11)* Audit log is INSERT-only at the database grant level.
- **SEC-007** Logs retain technical detail for diagnostics but never log raw passwords/PINs, full card numbers, or other sensitive secrets.
- **SEC-008** No secrets (DB credentials, JWT signing keys, cloud API keys) are ever committed to Git; only `.env.example` placeholders are versioned. Secrets are supplied via environment variables / a secrets manager at deploy time.
- **SEC-009** If/when remote access is enabled (Decision #11), it is a separate, narrower-scoped read-mostly app against the cloud replica — it never gains a write path to sales/inventory, keeping the security surface of "remote" access deliberately small.
- **SEC-010** Below-cost or over-cap-discount admin overrides require a step-up authentication action at the point of sale, not just a backend permission flag, since the acting session at that moment belongs to a Cashier (`BR-011`).

---

## 8. Acceptance Criteria

The system is considered complete for V1 when:

**Online**
- **AC-001** Multiple LAN devices can concurrently use the POS against the Local Shop Server with no data races (verified under simulated concurrent-sale load on the same product/batch).
- **AC-002** Cloud synchronization completes without duplicating or losing any sale, payment, or inventory movement across repeated online/offline cycles.
- **AC-003** All reports (§3.12) return figures reconcilable back to the underlying ledgers (inventory movements, Khata transactions, payments) by manual spot-check.

**Offline**
- **AC-004** With the Local Shop Server's internet connection disabled, a full sale (search → cart → discount → customer → payment → print) completes successfully end-to-end, including FIFO consumption and Khata update where applicable.
- **AC-005** Shifts can be opened and closed, and Khata payments recorded, entirely offline.
- **AC-006** All offline-created transactions carry globally unique IDs and offline-safe invoice numbers with zero collisions after a simulated multi-hour offline period.

**Internet restoration**
- **AC-007** Previously offline transactions sync to the cloud with no duplicates and no losses, verified by comparing local and cloud row counts/checksums after a sync run.
- **AC-008** A forced sync failure (simulated network drop mid-push) results in automatic retry and eventual `SYNCED` state, never a duplicate.

**Security**
- **AC-009** A Cashier session cannot perform any Admin-only action (price change, user management, inventory adjustment, unrestricted cancellation) even via direct API calls that bypass the UI.
- **AC-010** Audit log entries exist for every action listed in `FR-100` during a scripted test run, and cannot be modified or deleted via any application code path.

**Financial correctness**
- **AC-011** A multi-batch sale's COGS exactly equals the sum of each consumed batch's actual unit cost × quantity — never an averaged cost — verified against the worked example in the original spec (20×1000 + 10×1200 = 32,000).
- **AC-012** A return restocks the exact original batch(es) at their original cost, and the product's next sale correctly resumes FIFO order from where it left off.
- **AC-013** An invoice cancellation fully reverses inventory, revenue, COGS, profit, payment, and Khata effects, leaving no residual discrepancy in any report.
- **AC-014** A Khata lump payment allocates oldest-invoice-first exactly per the worked example in the original spec (6,000 against invoices due 3,000/5,000/2,000 → invoice 1 closed, invoice 2 partially paid, invoice 3 untouched).

---
*Next: Phase 3 — detailed Architecture (network/auth/sync diagrams), building directly on `03-architecture-plan.md`.*
