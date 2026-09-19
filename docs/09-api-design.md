# API Design — Phase 5

Status: draft for review. Defines the Local Shop Server's REST API (the one all shop devices call — thin-LAN-client model, Decision #16) and the Cloud API's sync/reporting surface. References SRS IDs (`06-srs.md`) and schema models (`packages/database/prisma/schema.prisma`). No controllers/services are implemented yet — that's Phase 8.

## 0. Conventions

- **Base path (Local API):** `http://local-shop-server/api/v1/...`
- **Base path (Cloud API):** `https://<cloud-host>/api/v1/...` (only called by the Local Shop Server's sync worker and the optional remote-reporting app — never by shop-floor browsers, `SEC-004`/`SEC-009`).
- **Auth:** `Authorization: Bearer <session token>` on every endpoint except `POST /auth/login`, `POST /auth/login-pin`. Enforced server-side regardless of what the frontend hides (`SEC-001`).
- **Idempotency for offline-created writes:** any endpoint that creates a financially significant record (`Sale`, `Purchase`, `Return`, `KhataPayment`, `SupplierPayment`, `Shift` open/close) accepts a client-supplied `id` (ULID) in the request body. The service uses this as the primary key; a retried request with the same `id` and same payload is a no-op that returns the original result (200, not a duplicate 201) rather than erroring or duplicating — this is what lets the frontend safely retry after a dropped connection without double-submitting a sale.
- **Standard error envelope:**
  ```json
  { "error": { "code": "INSUFFICIENT_STOCK", "message": "Unable to complete sale. No stock is available for this product.", "details": { "productId": "..." } } }
  ```
  `code` is a stable machine-readable string for the frontend to branch on; `message` is the plain-language text shown to staff (`NFR-005`); technical stack traces never reach the response body, only the server log.
- **Pagination:** list endpoints accept `?page=&pageSize=` (default `pageSize=25`, capped at 100) and return `{ data: [...], page, pageSize, total }`.
- **Standard domain error codes** used across multiple modules: `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN` (role-based), `DUPLICATE_SKU`, `DUPLICATE_BARCODE`, `INSUFFICIENT_STOCK`, `BELOW_COST_BLOCKED`, `DISCOUNT_CAP_EXCEEDED`, `OVERRIDE_REQUIRED`, `OVERRIDE_TOKEN_INVALID_OR_EXPIRED`, `SHIFT_ALREADY_OPEN`, `NO_OPEN_SHIFT`, `ANONYMOUS_KHATA_NOT_ALLOWED`, `SPLIT_PAYMENT_NOT_SUPPORTED`, `INVALID_CANCELLATION_SCOPE`.

---

## 1. Authentication (`/auth`)

| Endpoint | Method | Auth | Request | Response | Notes |
|---|---|---|---|---|---|
| `/auth/login` | POST | none | `{ username, password }` | `{ token, user }` | Admin full-credential login (`SEC-002`) |
| `/auth/login-pin` | POST | none | `{ terminalId?, pin }` — PIN alone is looked up against active Cashier accounts | `{ token, user }` | Cashier quick-login (Decision #17) |
| `/auth/logout` | POST | any | — | `204` | Invalidates the session token |
| `/auth/me` | GET | any | — | `{ user }` | For the frontend to know current role/session state |
| `/auth/step-up` | POST | Cashier session (the one hitting the restriction) | `{ adminCredential: {username?, password?, pin?}, context: { saleClientId, reason } }` | `{ overrideToken, expiresAt }` | Admin step-up for below-cost/over-cap (`BR-011`, `SEC-010`); `overrideToken` is single-use, ~2 min TTL, bound to `saleClientId` (see §6.2 in architecture doc) |

Validation: `login`/`login-pin` rate-limited per IP/terminal (`SEC-005`-equivalent locally) to blunt PIN brute-forcing. Wrong credentials return a generic `INVALID_CREDENTIALS` (never reveal whether the username exists).

## 2. Users (`/users`) — Admin only

| Endpoint | Method | Request | Notes |
|---|---|---|---|
| `/users` | GET | `?role=&status=` | |
| `/users` | POST | `{ name, role, username?, password?, pin? }` | Admin requires username+password; Cashier requires pin |
| `/users/:id` | PATCH | partial update | Cannot change `role` from ADMIN if it's the last active Admin (`VALIDATION_ERROR`) |
| `/users/:id/disable` | PATCH | — | Soft-delete only (`BR-001`) |
| `/users/:id/reset-credential` | POST | `{ password? , pin? }` | |

## 3. Categories (`/categories`)

| Endpoint | Method | Auth | Notes |
|---|---|---|---|
| `/categories` | GET | any | includes disabled if `?includeDisabled=true` (Admin only flag) |
| `/categories` | POST | Admin | `{ name }` |
| `/categories/:id` | PATCH | Admin | `{ name }` |
| `/categories/:id/disable` | PATCH | Admin | Never hard-deleted (`BR-001`) |
| `/categories/:id/products` | GET | any | (`FR-005`) |

## 4. Products (`/products`)

| Endpoint | Method | Auth | Request | Notes |
|---|---|---|---|---|
| `/products` | GET | any | `?search=&categoryId=&status=` | Search by name/SKU/barcode (`FR-004`); Cashier POS search implicitly excludes disabled |
| `/products/:id` | GET | any | | |
| `/products` | POST | Admin | `{ name, sku, barcode?, categoryId, unit, officialPrice, minStockLevel }` | Rejects duplicate `sku`/`barcode` with `DUPLICATE_SKU`/`DUPLICATE_BARCODE`, not a raw constraint error (`FR-003`) |
| `/products/:id` | PATCH | Admin | partial update | Editing `officialPrice` never touches historical `SaleItem.officialPriceAtSale` rows (`BR-015`) |
| `/products/:id/disable` | PATCH | Admin | | |
| `/products/:id/batches` | GET | Admin | | FIFO waterfall view: active + waiting batches with cost/date/remaining/supplier/status (`FR-026`) |
| `/products/low-stock` | GET | Admin | | `total current stock < minStockLevel` (`BR-006`) |

## 5. Suppliers & Purchases

| Endpoint | Method | Auth | Request | Notes |
|---|---|---|---|---|
| `/suppliers` | GET | Admin | `?search=&status=` | |
| `/suppliers` | POST | Admin | `{ name, phone?, email?, address? }` | |
| `/suppliers/:id` | GET | Admin | | includes totals: purchased/paid/payable (`FR-014`) |
| `/suppliers/:id` | PATCH | Admin | | |
| `/suppliers/:id/payments` | GET | Admin | | |
| `/suppliers/:id/payments` | POST | Admin | `{ id, amount, method, paymentDate, purchaseId?, notes? }` | Allocated oldest-purchase-first (Decision #8) if `purchaseId` omitted; `id` is client-supplied ULID for idempotency |
| `/purchases` | GET | Admin | `?supplierId=&productId=&dateFrom=&dateTo=` | |
| `/purchases` | POST | Admin | `{ id, supplierId, supplierInvoiceNumber?, purchaseDate, items: [{ productId, quantity, costPerUnit }], amountPaid }` | Atomic: creates Purchase + PurchaseItems + one InventoryBatch per item (`FR-011`/`FR-012`), inventory movement (type PURCHASE), audit entry, outbox event — single transaction (`NFR-011`) |
| `/purchases/:id` | GET | Admin | | includes resulting batch IDs |

## 6. Inventory (`/inventory`)

| Endpoint | Method | Auth | Request | Notes |
|---|---|---|---|---|
| `/inventory/batches` | GET | Admin | `?productId=&status=` | |
| `/inventory/movements` | GET | Admin | `?productId=&batchId=&type=&dateFrom=&dateTo=` | Read-only ledger view (`FR-020` append-only) |
| `/inventory/adjustments` | POST | Admin | `{ id, batchId, quantity, type: ADJUSTMENT|DAMAGED|EXPIRED|OTHER, reason }` | Admin-only manual adjustment (`FR-025`); rejects if it would drive `remainingQty` negative (`FR-024`) |

## 7. Customers & Khata

| Endpoint | Method | Auth | Request | Notes |
|---|---|---|---|---|
| `/customers` | GET | any | `?search=` | |
| `/customers` | POST | any | `{ id, name, phone?, email?, address? }` | Cashier can create (`FR-030`) |
| `/customers/:id` | GET | any | | |
| `/customers/:id/khata` | GET | any | | balance + transaction history (`FR-032`) |
| `/customers/:id/khata-payments` | POST | any | `{ id, amount, method }` | Auto-allocates oldest-invoice-first across the customer's outstanding sales (`FR-033`, `BR-008`); response includes the resulting per-invoice allocation breakdown |

Validation: creating a Khata (credit) sale against the seeded Walk-in customer is rejected with `ANONYMOUS_KHATA_NOT_ALLOWED` at the **sales** endpoint (`BR-007`), not here — Customer creation itself has no such restriction.

## 8. Sales / POS (`/sales`) — the core transaction

| Endpoint | Method | Auth | Request | Notes |
|---|---|---|---|---|
| `/sales` | POST | Cashier/Admin | see below | The atomic sale-completion transaction (`FR-043`) |
| `/sales` | GET | any | `?cashierId=&customerId=&status=&dateFrom=&dateTo=` | Cashier sees own shift/day only unless Admin (`REP` scoping) |
| `/sales/:id` | GET | any (scoped) | | |
| `/sales/:id/cancel` | POST | Cashier (own/scoped)/Admin | `{ reason }` | Scope-restricted for Cashier (`BR-012`); Admin unrestricted |
| `/sales/:id/print` | POST | any (scoped) | | Reprint — logged, no financial effect (`FR-111`) |

**`POST /sales` request:**
```json
{
  "id": "01J...ULID",              // client-generated, idempotency key
  "counterId": "...",
  "shiftId": "...",
  "customerId": "...",
  "items": [
    { "productId": "...", "quantity": 3, "unitPrice": 1200, "discountAmount": 0 }
  ],
  "paymentMethod": "CASH",
  "amountPaid": 3600,
  "overrideToken": "..."            // only present if a below-cost/over-cap override was authorized
}
```

**Server-side sequence (single DB transaction, `NFR-011`):**
1. Validate shift is `OPEN` and belongs to the requesting session (`FR-090`) → else `NO_OPEN_SHIFT`.
2. For each item: validate stock availability (`FR-024`), lock and allocate FIFO batches (`FR-022`/`FR-023`), compute COGS per allocation.
3. For each item: check `effective price (after discount) >= active batch cost` (`BR-009`). If violated:
   - Cashier with no valid `overrideToken` for this item/sale → reject with `BELOW_COST_BLOCKED` (response includes what's needed to request one).
   - Discount beyond the cashier cap with no `overrideToken` → `DISCOUNT_CAP_EXCEEDED`.
   - Admin, or a valid matching `overrideToken` present → proceed, and write the override audit record (`BR-011`).
4. Validate payment method is singular (`BR-013`) and customer is non-anonymous if `paymentMethod = KHATA` or `amountPaid < grandTotal` (`BR-007`).
5. Insert `Sale`, `SaleItem`, `SaleItemBatchAllocation` rows; decrement batch `remainingQty`; insert `InventoryMovement` (type SALE); insert `Payment`; insert `KhataTransaction` if there's a remaining balance; insert `AuditLog` entries; insert `OutboxEvent`.
6. Commit. Return `201` with the full invoice (or `200` if this `id` was already processed — idempotent replay).

**Response error example (below-cost, no override yet):**
```json
{ "error": { "code": "BELOW_COST_BLOCKED", "message": "This price is below the item's cost. Ask an admin to approve.", "details": { "productId": "...", "batchCost": 1000, "attemptedPrice": 900 } } }
```

## 9. Returns (`/returns`)

| Endpoint | Method | Auth | Request | Notes |
|---|---|---|---|---|
| `/returns` | POST | Cashier/Admin | `{ id, saleId, items: [{ saleItemId, quantity, reason? }] }` | Atomic: validates returned qty ≤ originally sold minus already-returned; restocks original batch(es) via `ReturnItemBatchRestock` proportional to the sale's original allocation split (`FR-061`, Decision #3); reverses COGS/profit/Khata as needed (`FR-062`) |
| `/returns` | GET | any (scoped) | `?saleId=` | |

## 10. Expenses (`/expenses`) — Admin only

| Endpoint | Method | Request |
|---|---|---|
| `/expenses` | GET | `?category=&dateFrom=&dateTo=` |
| `/expenses` | POST | `{ id, category, description, amount, date, receiptUrl? }` |

## 10a. Counters (`/counters`) — discovered during implementation

| Endpoint | Method | Auth | Notes |
|---|---|---|---|
| `/counters` | GET | any | Read-only list, needed by the POS shift-open screen (`FR-090`) — not called out in the original design pass since Counter only appeared as a foreign key elsewhere. Counters are treated as fixed physical setup (seeded/ops-configured), not a user-facing CRUD resource. |

## 11. Shifts (`/shifts`)

| Endpoint | Method | Auth | Request | Notes |
|---|---|---|---|---|
| `/shifts/open` | POST | Cashier/Admin | `{ id, counterId, openingCash }` | Rejects with `SHIFT_ALREADY_OPEN` if the counter already has one (enforced by the partial unique index, `BR-021`) |
| `/shifts/:id/close` | POST | owning Cashier/Admin | `{ closingCash }` | Computes `expectedCash`/`difference` server-side (`FR-092`) — client never submits the expected figure, only the counted actual |
| `/shifts` | GET | Admin (any); Cashier (own) | `?counterId=&status=` | |
| `/shifts/:id` | GET | Admin (any); Cashier (own) | | |

## 12. Reports (`/reports`) — Admin only

| Endpoint | Method | Request | Maps to |
|---|---|---|---|
| `/reports/sales` | GET | `?range=daily\|weekly\|monthly\|custom&from=&to=&cashierId=&productId=&paymentMethod=` | `REP-001` |
| `/reports/purchases` | GET | `?supplierId=&productId=&batchId=` | `REP-002` |
| `/reports/inventory` | GET | `?lowStockOnly=` | current stock, all batches, valuation — `REP-003` |
| `/reports/khata` | GET | `?customerId=` | `REP-004` |
| `/reports/suppliers` | GET | `?supplierId=` | `REP-005` |
| `/reports/profit` | GET | `?from=&to=` | revenue/COGS/gross/expenses/net — `REP-006` |
| `/reports/expenses` | GET | `?category=&from=&to=` | `REP-007` |
| `/reports/dashboard` | GET | — | Admin dashboard summary — `REP-008` |

## 13. Audit (`/audit`) — Admin only

| Endpoint | Method | Request |
|---|---|---|
| `/audit` | GET | `?entityType=&entityId=&userId=&action=&dateFrom=&dateTo=` |

No `POST`/`PATCH`/`DELETE` exists on this resource at all — matches `SEC-006`'s INSERT-only DB grant; there is simply no code path that could edit an audit row even if authorization were somehow bypassed.

## 14. Sync (`/sync`) — Local API (Admin-facing status) and Cloud API (ingest)

| Endpoint | Where | Auth | Request | Notes |
|---|---|---|---|---|
| `/sync/status` | Local | Admin | — | Queue depth, oldest pending event age, last successful sync time, recent `SYNC_FAILED`/`CONFLICT` items (`SYNC-006`) |
| `/sync/conflicts` | Local | Admin | | |
| `/sync/conflicts/:id/resolve` | Local | Admin | `{ resolution, notes }` | Manual resolution — never automatic (`SYNC-004`) |
| `/sync/ingest` | Cloud | Local-server device credential (API key/mTLS, not a user session) | `{ events: [{ id, entityType, entityId, payload }] }` | Upserts by `id` with a DB unique constraint — replay-safe (`SYNC-003`). Returns per-event ack/fail array |

## 15. Settings (`/settings`) — Admin only

| Endpoint | Method | Request | Notes |
|---|---|---|---|
| `/settings` | GET | | e.g. `cashierDiscountCapPercent`, `printerFormat` |
| `/settings/:key` | PATCH | `{ value }` | Keeps business rules configurable rather than hardcoded (§57 coding rules) |

---
*Next: Phase 6 — Offline engine detail (transactional outbox implementation, retry/backoff specifics, conflict handling code paths), building on `07-architecture-detailed.md` §5.*
