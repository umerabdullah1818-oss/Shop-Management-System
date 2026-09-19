# UI/UX Design — Phase 7

Status: draft for review. Screen-by-screen plan for the Next.js + Tailwind + shadcn/ui frontend, referencing the API contracts in `09-api-design.md` and requirement IDs in `06-srs.md`. No frontend code is written yet — that's Phase 8. Bilingual (English/Urdu toggle, Decision #18) applies to every screen listed here via a shared i18n layer, not called out per-screen below.

## Cross-cutting rules
- Responsive across desktop/laptop/iPad (`NFR-002`); POS-critical screens are touch-target-sized (min ~44px) throughout, not just on the POS screen itself.
- Persistent ONLINE/OFFLINE indicator in the app header, reflecting Local↔Cloud sync reachability (`NFR-003`) — never blocks interaction, purely informational.
- Every screen's write actions surface backend errors via the plain-language `message` field from the standard error envelope (`NFR-005`), never a raw status code.
- Role-gated navigation: Cashier never sees Admin-only nav items at all (not just disabled) — reduces confusion, though the backend is still the actual enforcement (`SEC-001`).

## 1. Cashier POS screen (the highest-priority screen — speed is the whole point)

```
┌─────────────────────────────────────────────────────────────────┐
│ [Shop Logo]   Shift: OPEN (C1)   Cashier: Ali        ● ONLINE     │
├───────────────────────────────┬───────────────────────────────────┤
│ 🔍 Search / scan product...    │  CART                              │
│ ┌───────────────────────────┐  │  Decorative Vase        Qty [2] ✕ │
│ │ [Product grid/list —       │  │    Rs. 1200 each   discount [ ]  │
│ │  touch-friendly cards,     │  │  Wall Lamp – Gold       Qty [1] ✕ │
│ │  category filter chips]    │  │    Rs. 2500 each   discount [ ]  │
│ │                            │  │                                    │
│ └───────────────────────────┘  │  Subtotal:            Rs. 4900    │
│                                 │  Discount:             Rs. 0      │
│                                 │  Grand Total:          Rs. 4900   │
│                                 ├───────────────────────────────────┤
│                                 │  Customer: [Walk-in ▾] [+ New]    │
│                                 │  Payment: [Cash][Card][Bank][Khata]│
│                                 │  Amount Paid: [ 4900 ]             │
│                                 │  Remaining: Rs. 0                  │
│                                 │  [   COMPLETE SALE   ]             │
└───────────────────────────────┴───────────────────────────────────┘
```

- Single screen, no step-by-step wizard — matches the flow in `FR-040`/`09-api-design.md §8` and the original spec's explicit "avoid unnecessary screens" instruction.
- Price field on each cart line is editable inline (current-invoice-only override, `BR-016`); a visible-but-unobtrusive indicator shows when a line is discounted or price-overridden.
- If `POST /sales` returns `BELOW_COST_BLOCKED` or `DISCOUNT_CAP_EXCEEDED`, a modal opens in place for the Admin step-up flow (`07-architecture-detailed.md` §6.2) — cart state is preserved, not lost, while waiting for approval.
- Customer field defaults to Walk-in; switching payment method to `Khata` requires picking/creating a real customer first (`BR-007`), enforced in the UI as a hint but always re-validated server-side.
- "Complete Sale" is disabled (not hidden) while a request is in flight, to prevent accidental double-submission — though the idempotent `id` (`10-offline-engine.md` §3) makes a genuine double-click harmless regardless.

## 2. Admin Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│ Today's Sales: Rs. 84,200   |  Net Profit (today): Rs. 21,300     │
│ Low Stock Items: 4 ⚠         |  Outstanding Khata: Rs. 156,000     │
│ Supplier Payable: Rs. 62,000 |  Sync: ● Synced (2 min ago)         │
├─────────────────────────────────────────────────────────────────┤
│ Recent Transactions                     │  Low Stock Alerts        │
│  #SHOP-C1-2026-000231  Rs.4900  Cash     │  Wall Clock — 3 left     │
│  #SHOP-C2-2026-000230  Rs.1200  Khata    │  Gift Box Set — 1 left   │
└─────────────────────────────────────────────────────────────────┘
```
Maps directly to `REP-008`. Sync tile links through to the Sync Status screen (§14).

## 3. Product & Category pages
- Product list: searchable/filterable table (name, SKU, category, official price, stock, status), "Add Product" (Admin), row actions edit/disable.
- Product detail: fields (`FR-002`) + the FIFO batch waterfall view (`FR-026`) rendered as a stacked list — active batch highlighted, waiting batches below with cost/date/remaining/supplier.
- Category management: simple list + inline create/edit/disable (`FR-001`).

## 4. Purchase & Supplier pages
- Supplier list/detail with running totals (purchased/paid/payable) and payment history (`FR-014`).
- "New Purchase" form: supplier + invoice # + date header, then a repeatable line-item grid (product, qty, cost/unit, computed line total) — submitting creates one batch per line (`FR-011`/`FR-012`), shown in the confirmation as "created batches: ...".
- "Record Supplier Payment" form, with an optional link to a specific purchase (defaults to oldest-first allocation, Decision #8).

## 5. Inventory & Batch views
- Batch list (Admin): filterable by product/status, showing original/remaining qty, cost, purchase date, supplier (`FR-026`).
- Movement ledger (Admin, read-only): typed, filterable, append-only view (`FR-020`).
- Manual adjustment form (Admin-only): batch picker, quantity, type, mandatory reason (`FR-025`).

## 6. Customer & Khata pages
- Customer list/detail (name, phone, status), with a "Khata" tab showing balance + full transaction ledger (`FR-032`).
- "Record Khata Payment" form: amount + method; on submit, shows the resulting oldest-first allocation breakdown across invoices (`FR-033`) so staff see exactly what got paid off.

## 7. Return screen
- Started from an existing invoice (search by invoice number or from the customer/sales history) — never a blank "generic return" form, since a return must always reference the original sale (`FR-060`).
- Shows original line items with quantities already returned (if any) greyed out; staff pick quantity to return per line; system shows the resulting restock target batch(es) transparently before confirming (`FR-061`).

## 8. Expense pages (Admin)
- Simple list + create form: category dropdown (`FR-080`'s fixed categories), description, amount, date, optional receipt upload.

## 9. Shift pages
- "Open Shift" (counter + opening cash) gate before the POS screen becomes usable for a Cashier (`FR-090`).
- "Close Shift": shows computed expected cash, staff enters actual counted cash, difference shown immediately (`FR-092`).
- Admin shift review list: all shifts, any counter, with variance highlighted.

## 10. Reports (Admin)
- One reports hub with tabs matching `REP-001`–`REP-007`: Sales, Purchases, Inventory, Khata, Suppliers, Profit, Expenses — consistent date-range/filter controls reused across tabs, results as sortable tables with an export option.

## 11. Settings (Admin)
- Business-rule configuration surfaced here, not hardcoded (§57): cashier discount cap, printer format, i18n default language, backup-related display info.

## 12. Audit screen (Admin, read-only)
- Filterable table (entity type/ID, user, action, date range) with a detail drawer showing before/after JSON and reason where present (`FR-100`). No edit/delete controls exist on this screen at all — matches the backend having no such endpoint (`SEC-006`).

## 13. Sync Status screen (Admin)
- Queue depth, oldest pending event age, last successful sync, and a list of `SYNC_FAILED`/`CONFLICT` items with a "resolve" action opening the conflict detail (`SYNC-006`, `09-api-design.md` §14).

---
*Next: with Phases 1–7 complete, Phase 8 (Implementation) can begin once you confirm — this is the point the master prompt's own process calls for explicit go-ahead before writing production code.*
