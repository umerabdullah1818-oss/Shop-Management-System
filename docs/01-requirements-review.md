# Requirements Review — Phase 1

Status: **DRAFT — awaiting approval**. No application code has been written. This document analyzes the Master Development Prompt before any implementation begins, per its own Phase 1 / "First Task" instructions.

## 1. Confirmed Requirements (summary)

These are unambiguous and will be carried into the SRS as-is:

- **Architecture**: Hybrid, offline-first. Local Shop Server (Node/NestJS + local PostgreSQL) is the shop's source of truth. Cloud (NestJS + PostgreSQL) provides centralized storage, backup, sync, optional remote access, and disaster recovery. Neither cloud-only nor local-only.
- **Access model**: All in-shop devices (Admin PC, Cashier PC, iPad) hit one Local Shop Server over LAN/Wi-Fi. No per-device independent inventory database.
- **Stack**: Next.js + TypeScript + Tailwind + shadcn/ui (frontend); Node.js + NestJS + Prisma + PostgreSQL (backend).
- **Currency**: PKR / Rs. No tax/GST in V1.
- **Roles**: Admin (full control) and Cashier (POS-scoped, explicit deny-list) — enforced **server-side**, never trusted from the frontend.
- **FIFO costing**: Strict, per-product, batch-level. Never weighted-average. Never merge batches. Never overwrite historical purchase cost. Batch allocation for every sale must be retained even though the invoice shows one line.
- **Pricing rule**: Selling price must normally be ≥ the active FIFO batch's cost; Admin can override with mandatory audit (admin, invoice, product, batch, batch cost, selling price, timestamp, reason).
- **Historical immutability**: Invoice prices and batch costs never change retroactively when official prices change later.
- **Payments**: Cash / Card / Bank / Khata. No split payments (multiple methods on one invoice) in V1. Partial/unpaid amounts automatically become Khata — and Khata requires a real (non-anonymous) customer.
- **Khata payment allocation**: Always oldest-outstanding-invoice-first, automatic, no manual invoice picking.
- **Inventory**: Batch-level tracking, typed movements (purchase/sale/return/adjustment/damaged/expired/other), admin-only manual adjustment, stock must never go negative.
- **Financial records**: Never hard-deleted. Cancellations/returns are reversals, not deletions, and are fully audited.
- **Sync**: Transactional outbox from local → cloud with idempotent, retryable delivery; explicit sync-state machine; conflicts surfaced to an admin, never silently resolved or blindly overwritten.
- **Offline invoice numbering & transaction IDs**: Must not rely on `MAX()+1` or cloud auto-increment; must be collision-safe across offline periods.
- **Security baseline**: hashed passwords, RBAC, HTTPS to cloud, secure sessions, input validation via ORM, rate limiting, audit logging, no secrets in Git, no direct DB exposure to the internet.
- **Acceptance criteria** (§60) is treated as the eventual Definition of Done for the whole system.
- **Final principle**: normal sales must never depend on internet connectivity.

## 2. Ambiguities Requiring Clarification (not hard "conflicts", but the spec is genuinely underspecified or readable two ways)

1. **What "offline" means for client devices.** §34 lists offline capabilities (login, product search, sales, FIFO, Khata, printing...) in a way that could be read as "each device (iPad, Cashier PC) needs its own local data layer and can work with zero connectivity of any kind." But §40 explicitly mandates that *all counters must talk to the Local Shop Server even when the internet is down*, specifically to prevent the double-oversell scenario (60 + 50 sold against 100 in stock). These two sections are only consistent if "offline" means **the Local Shop Server has no internet/cloud connectivity**, while the shop's internal LAN between devices and that one server is assumed to stay up. Under that reading, only the **Local Shop Server** needs a genuine offline-capable database + sync engine; the Admin PC / Cashier PC / iPad are ordinary LAN clients (browser tabs) talking to it over HTTP, with no independent local storage or conflict resolution of their own.
   - This materially changes frontend scope (thin LAN client vs. full offline-capable PWA per device), so I'm flagging it as **Decision #16** below rather than assuming silently.
2. **Discount vs. below-cost floor.** §16 defines the floor rule as `Selling Price >= Active FIFO Batch Cost`. §17 says discounts are required but leaves rules undefined. It's not specified whether the floor check applies to the *pre-discount* line price or the *effective* (post-discount) price. I recommend the floor apply to the **effective price after discount**, since that's the actual economic outcome — but this needs your confirmation (folded into Decision #1/#2).
3. **"Restricted" vs. "unrestricted" invoice cancellation.** §10 says Cashier "cannot perform *unrestricted* invoice cancellation," implying some restricted form is allowed, but no rule defines its scope (e.g., only their own invoice, only same-shift, only before printing). Needs a decision (folded into Decision #3 area).
4. **"No split payments" vs. partial payment.** These are different concepts and the spec doesn't explicitly distinguish them. Clarification adopted for the SRS: *one payment method per invoice* is required; the *unpaid remainder* of that single-method payment still legally becomes Khata. Multi-method payments (e.g., half cash + half card) are out of scope for V1.

## 3. Missing Requirements (gaps the spec doesn't address — recommended defaults proposed, low-risk enough not to block Phase 2, but flagged for your visibility)

- **Login/session UX for a shared shop terminal.** Not specified whether Cashier login is full username/password or a fast PIN-based quick-switch (common in retail POS to keep checkout fast, per §45/§46's speed emphasis). *Recommended*: PIN-based quick login for Cashier, full credentials for Admin, session auto-lock after inactivity. Raised as **Decision #17**.
- **UI language.** Not specified whether the interface should be English, Urdu, or bilingual. This has real UX impact for cashiers and I have no basis to assume either way. Raised as **Decision #18**.
- **Rounding / money representation.** Not specified how PKR amounts are stored (integer rupees, `NUMERIC(12,2)`, minor units). *Recommended*: `NUMERIC(12,2)` in Postgres, no floating-point math anywhere in business logic.
- **Reprinting.** Not specified whether a completed invoice can be reprinted. *Recommended*: allow, since it's non-financial and operationally necessary; log as an audit event.
- **Cashier's visibility scope for "permitted sales."** *Recommended*: Cashier sees invoices from their own shifts; Admin sees everything.
- **Device provisioning.** How a new iPad/PC is authorized to join the shop LAN system isn't defined. This is architecture-level and can be resolved in Phase 3 (not blocking).
- **Duplicate phone numbers for customers/suppliers.** Not specified whether phone must be unique. *Recommended*: not unique (families/shared numbers are common), but warn on create if a close match exists.
- **Single-shop assumption.** The entire spec reads as a single physical shop, single local server, single cloud tenant. I'm treating this as confirmed scope for V1 (no multi-branch support) unless corrected.

## 4. Edge Cases Identified

- Sale quantity exactly exhausts a batch's remaining units (boundary condition — must roll to next batch with zero leftover, not error).
- A single sale line spanning 3+ batches (COGS must sum every batch's actual cost, not just the first two).
- Partial return of a sale line that itself was fulfilled from multiple batches — which batch(es) receive the returned units is central to the return-batch-policy decision.
- Cancelling an invoice that already has a partial Khata payment recorded against it, where that payment may have already been *reallocated* by the oldest-invoice-first rule against a different invoice entirely. Reversing invoice A's Khata effect after money has flowed onto invoice B via FIFO allocation is a real design problem, not just bookkeeping — needs an explicit compensating-transaction rule (Phase 4/6).
- Two shifts open simultaneously on the same counter (must be prevented — one open shift per counter, enforced by a DB constraint).
- Product disabled while it still has remaining batch stock (must remain sellable for returns/reporting, just hidden from new-sale search).
- Duplicate SKU/barcode entry (explicitly required test case — needs a unique constraint + friendly error message, not a 500).
- Server clock vs. client clock: FIFO ordering and audit timestamps must always be **server-authoritative**, never trust a client-submitted timestamp for ordering, only for "this is when the cashier says it happened" metadata.
- Network flapping (rapid online/offline transitions) causing repeated sync retries — idempotency key must dedupe regardless of retry storm size.

## 5. Security Risks

- Treat the shop LAN as **not inherently trusted** — the Local Shop Server's API still requires authentication even for LAN-only clients; "it's internal" is not a security boundary.
- Router misconfiguration risk: nothing in this architecture should ever require port-forwarding the Local Shop Server or its Postgres instance to the public internet. Only outbound calls (local → cloud, over HTTPS) are needed.
- Shared physical terminals need session auto-lock/timeout given walk-up access in a retail environment.
- Below-cost admin overrides need a genuine step-up authorization at the POS (e.g., admin PIN re-entry at the terminal), not just a backend permission check, since the acting session at that moment is the Cashier's.
- Audit log must be genuinely append-only at the DB level (revoke UPDATE/DELETE grants for the application role, or enforce via trigger) — "must not be casually editable" (§33) is a design requirement, not just a UI omission.
- Backups (local and cloud) contain full financial/customer data and must be encrypted at rest and access-controlled like production data, not treated as inert files.

## 6. Offline Risks

- The Local Shop Server is a single point of failure *inside the shop* for shop-floor operations (separate from its internet connectivity). This needs an explicit, deliberate fallback policy — see Decision #4 — rather than an assumed "it just won't happen."
- Sync-queue backlog growth during a long offline period needs monitoring so a broken sync process is caught quickly rather than silently accumulating for weeks.
- If the client-device interpretation in Ambiguity #1 is confirmed (thin LAN clients, one real offline-capable server), then per-device offline durability is *not* a concern — only the Local Shop Server's own durability is. This significantly reduces frontend complexity if confirmed.

## 7. Data Consistency Risks

- FIFO batch consumption must use row-level locking (`SELECT ... FOR UPDATE`) or an equivalent serializable transaction boundary so two near-simultaneous sales of the same product can never both consume the same units from the same batch.
- Khata payment allocation has the same race condition risk per-customer and needs the same locking discipline.
- Sync idempotency must be enforced by a **database unique constraint** on the cloud side keyed by the transaction's globally unique ID — not merely an application-level "check then insert," which has its own race window.
- All corrections (returns, cancellations, adjustments) must be additive/compensating records, never in-place edits of historical rows — this applies to inventory movements, Khata transactions, and payments alike.

---
*Next: see `02-unresolved-decisions.md` for business-critical decisions requiring your approval, and `03-architecture-plan.md` / `04-database-erd-plan.md` for the proposed technical direction.*
