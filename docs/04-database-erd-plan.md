# Database / ERD Plan — Phase 1

Status: entity-level plan for approval. Full column-level PostgreSQL + Prisma schema with indexes/constraints is a Phase 4 deliverable, produced after this direction is confirmed.

## Entities and Relationships (high level)

```
User (role: ADMIN | CASHIER) ──< Shift
Category ──< Product
Supplier ──< Purchase ──< PurchaseItem ──1:1── InventoryBatch
Product  ──< InventoryBatch
InventoryBatch ──< InventoryMovement
Customer ──1:1── KhataAccount ──< KhataTransaction
Sale (Invoice) ──< SaleItem ──< SaleItemBatchAllocation ──> InventoryBatch
Sale ──> Customer, User (cashier), Counter, Shift
Payment ──> Sale, Customer
SupplierPayment ──> Supplier
Return ──> Sale ──< ReturnItem ──> SaleItem, InventoryBatch
Expense ──> User (added_by)
AuditLog ──> User, (polymorphic entity reference)
OutboxEvent (sync queue) ──> (polymorphic entity reference)
SyncConflict ──> OutboxEvent
Device / Counter (registration + invoice numbering scope)
```

## Notes per entity (design intent, not final columns)

- **User** — role enum, hashed password (Admin) and/or PIN hash (Cashier, pending Decision #17), status (active/disabled — never hard-deleted, since Users are referenced by historical audit/sales rows).
- **Category / Product** — soft-delete only (`status: ACTIVE | DISABLED`), never hard-deleted once referenced by a purchase or sale, per §12/§26. Product carries **no cost field** — cost only ever exists at the batch level, which is intentional (this is what makes FIFO possible instead of averaging).
- **Purchase / PurchaseItem** — Purchase is the header (supplier, supplier invoice #, date, payment status/paid/payable); each PurchaseItem is one product line and creates exactly one InventoryBatch, 1:1, immediately on creation (§13: "every purchase creates a NEW inventory batch").
- **InventoryBatch** — `original_qty`, `remaining_qty`, `unit_cost` (immutable after creation), `purchase_item_id`, `created_at` (defines FIFO order — always ordered by creation/purchase time, never re-ordered). `remaining_qty` only changes via InventoryMovement rows, never edited directly, so there's always an audit trail explaining every change.
- **InventoryMovement** — typed (PURCHASE/SALE/RETURN/ADJUSTMENT/DAMAGED/EXPIRED/OTHER), always references a batch + product + signed quantity + reference (e.g., the sale or return ID that caused it) + user + reason. This table is the append-only ledger; current stock is *derived* by summing it (or maintained as a cached/materialized total for read speed, always reconcilable back to the ledger).
- **Sale (Invoice) / SaleItem** — Sale header carries invoice number (offline-safe scheme, Decision #5), cashier, customer, totals, payment method, status (`COMPLETED | CANCELLED`). SaleItem carries product, qty, actual selling price, discount, line total.
- **SaleItemBatchAllocation** — the most important table in the schema. For every SaleItem, one row per batch it drew from (`batch_id`, `qty_from_this_batch`, `unit_cost_at_sale_time`). This is what makes COGS, returns-to-original-batch (Decision #3), and audit all simultaneously correct — without it, none of the FIFO guarantees in §14/§15 are actually enforceable after the fact.
- **Customer / KhataAccount / KhataTransaction** — KhataAccount holds the running balance (derived from KhataTransaction, an append-only ledger of CREDIT_SALE / PAYMENT_RECEIVED / RETURN_ADJUSTMENT / CANCELLATION / APPROVED_ADJUSTMENT rows, per §21). A "Walk-in Customer" is a real seeded Customer row usable only for fully-paid sales (§20 — anonymous credit is never allowed).
- **Payment** — one row per Khata/cash/card/bank payment event against a Sale; a customer's lump payment against Khata produces potentially *multiple* Payment-to-invoice allocation records under the oldest-first rule (§22) — modeled as a Payment header plus PaymentAllocation lines if a single payment spans more than one invoice.
- **Supplier / SupplierPayment** — mirrors the Khata structure on the purchasing side; payments never edited/deleted, only added (with reversal rows if a correction is needed).
- **Return / ReturnItem** — always references the original Sale/SaleItem; ReturnItem drives an InventoryMovement (type RETURN) that increases the *original* batch's `remaining_qty` (per Decision #3), and a corresponding KhataTransaction / Payment reversal if the original sale affected Khata.
- **Shift** — one open Shift per Counter at a time (DB constraint), opening/closing cash, computed expected cash per §30's formula, variance.
- **AuditLog** — user, action, entity type + id, before/after JSON snapshots where relevant, reason, device id, timestamp; INSERT-only DB grants for the application role.
- **OutboxEvent (sync queue)** — globally unique id (ULID), entity type/id, payload snapshot, state enum (§37), attempt count, last error, created/synced timestamps. Written in the same transaction as the business change it represents (transactional outbox pattern).
- **SyncConflict** — reference to the offending OutboxEvent, conflict details, resolution status/notes, resolved_by — expected rare under the recommended architecture, but the mechanism exists per §37/§51.
- **Device / Counter** — Counter is the physical POS station used for invoice numbering scoping (`SHOP-C{counter}-{year}-{seq}`) and the one-open-shift-per-counter rule; Device is used for audit "device/client ID" attribution.

## Design principles carried into Phase 4

1. **Money** stored as `NUMERIC(12,2)`, never floating point.
2. **Soft-delete / status enums everywhere** a record could be referenced historically — no hard deletes on Category, Product, Customer, Supplier, User.
3. **Append-only ledgers** for anything financial (InventoryMovement, KhataTransaction, AuditLog, OutboxEvent) — current balances/stock are always *derived*, corrections are always *additional rows*, never edits.
4. **Historical immutability**: InventoryBatch.unit_cost and SaleItem.actual_selling_price are write-once fields, enforced not just by convention but ideally by simply never exposing an update path for them in the API at all.
5. **Server-authoritative timestamps** for anything that affects FIFO order or audit sequencing; client-submitted timestamps (if ever captured) are metadata only.
6. Every table that can be created offline gets a **globally unique ID (ULID)** as its primary key or a secondary unique column, not a bare auto-increment serial, so cloud upsert-by-id is safe (§38).

---
*Next: `05-implementation-roadmap.md`.*
