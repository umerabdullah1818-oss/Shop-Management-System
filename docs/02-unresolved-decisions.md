# Unresolved Decisions — Phase 1

## ✅ Confirmed answers (2026-09-18)

| # | Decision | Confirmed answer |
|---|---|---|
| 1 | Max cashier discount | Bounded cap (default 10%, configurable in Settings) |
| 2 | Admin discount rules | Unlimited, always audited (default accepted, not separately asked) |
| 3 | Return-batch policy | Return to original consumed batch(es) |
| 4 | Local-Server-down fallback | No fallback — pause sales until server is back; mitigate via UPS/auto-restart/reliability |
| 16 | Client device offline model | Thin LAN clients — only the Local Shop Server has its own DB/offline/sync engine |
| 18 | UI language | Bilingual — English + Urdu toggle |

All other items below keep their recommended defaults unless noted otherwise; revisit anytime before the relevant phase locks it in.


Per §54/§61 of the Master Development Prompt: *"Do not silently make business decisions... ask for approval before implementing business-critical assumptions."*

Each item below follows: **Decision / Options / Recommended option / Reason / Impact**. Items marked **⚠ BLOCKING** genuinely need your explicit answer before Phase 2 (SRS) can be written correctly — a wrong guess here changes financial behavior. Items without that mark have a low-risk recommended default that will be applied unless you say otherwise; they're listed for transparency, not to hold up progress.

---

### 1. Maximum cashier discount — ✅ CONFIRMED: bounded cap (10% default, configurable)
**Options:**
- (a) Cashier cannot apply any discount at all (Admin-only).
- (b) Cashier can apply a small bounded discount (e.g., up to 10% or a fixed Rs. cap per invoice), Admin unlimited.
- (c) Cashier can discount freely down to the FIFO batch cost floor (no separate cap beyond the existing below-cost rule).

**Recommended:** (b), with a configurable percentage cap (default 10%) stored in Settings, not hardcoded.
**Reason:** Some discount authority at the counter is normal retail practice and keeps checkout fast (§45/§46 speed goal), but an uncapped cashier discount defeats the purpose of the below-cost/admin-override control entirely.
**Impact:** Determines POS UI (is there a discount input at all for Cashier), backend validation rule, and audit trigger conditions.

### 2. Admin discount rules — ✅ ACCEPTED (default, not separately asked)
**Options:** (a) Admin discount is unlimited but always audited. (b) Admin discount is capped too, just at a higher limit.
**Recommended:** (a) — unlimited but every admin discount below a threshold (e.g., below official price − X%) is logged with the same audit shape as a below-cost override.
**Reason:** Admin already carries override authority (§9); the safeguard is the audit trail, not a numeric ceiling.
**Impact:** Audit log schema, discount validation service.

### 3. Return-batch policy — ✅ CONFIRMED: return to original batch
**Options:**
- (a) Returned units go back into the **original batch(es)** they were sold from (tracked via the sale's batch-allocation records).
- (b) Returned units create a **new "return batch"** at the original cost.
- (c) Some other controlled mechanism.

**Recommended:** (a).
**Reason:** Because every sale already records exact batch allocation (§15), returning to the original batch is possible with full precision and preserves FIFO order correctly — a returned unit re-enters the queue at the position it actually belongs, rather than jumping to the front/back of the FIFO line as a new batch would. This keeps future COGS calculations exactly correct rather than approximate.
**Impact:** Returns service design, inventory movement types, COGS recomputation on return, batch model needs to support quantity increase post-creation (with an audit trail of the increase).

### 4. Offline / Local-Server-down fallback policy — ✅ CONFIRMED: no fallback
This is about the Local Shop Server itself being unreachable *inside the shop* (separate from internet/cloud connectivity — see Ambiguity #1 in the requirements review), e.g., the server PC crashes or is powered off during business hours.
**Options:**
- (a) **No fallback.** If the Local Shop Server is down, POS terminals cannot create sales until it's back up. Safest for correctness; matches §40's anti-oversell mandate exactly since there's never more than one writer.
- (b) A single **designated backup terminal** can run a minimal standalone cash-only POS during a Local-Server outage, with manual admin reconciliation afterward (re-introduces a bounded, controlled version of the multi-writer problem §40 warns about, scoped to a rare emergency case only).
- (c) Not decided yet — needs more discussion (e.g., how often does this shop actually lose the server vs. lose internet, since those are very different frequencies).

**Recommended:** (a) for V1, with strong local-server reliability investment (automatic restart on crash, UPS power, daily local backups) as the actual mitigation, rather than adding standalone-mode complexity.
**Reason:** A Local-Server outage should be rare (it's a PC on a UPS in the shop, not dependent on the internet). Adding a second offline-capable write path just to cover this rare case reintroduces the exact reconciliation complexity the architecture otherwise avoids. Better to invest in server uptime than in a second source of truth.
**Impact:** Determines whether the frontend ever needs any local write capability of its own. Large scope difference between (a) and (b).

### 5. Offline invoice numbering scheme
**Options:** (a) `SHOP-C{counter}-{year}-{sequence}` per §39 example. (b) Pure ULID/UUID as the human-facing number too (less readable).
**Recommended:** (a), with the sequence generated by the Local Shop Server per counter (server is the only writer, so no cross-device collision risk under Decision #4(a)).
**Impact:** Invoice numbering service design in Phase 6.

### 6. Printer type
**Options:** 58mm thermal / 80mm thermal / A4.
**Recommended:** 80mm thermal (standard for retail receipts, more room than 58mm for item names like "Decorative Wall Lamp — Gold"), with the print template built as an abstraction so 58mm/A4 can be added later without a rewrite.
**Impact:** Invoice template layout in Phase 7.

### 7. Khata due dates / overdue rules
**Options:** (a) No due dates in V1 — just running balance. (b) Optional due-date per invoice with an "overdue" flag/report.
**Recommended:** (a) for V1 (matches the spec's Khata field list, which has no due-date field), with (b) as a clearly-scoped V2 addition.
**Impact:** Khata schema and reports scope.

### 8. Supplier payment allocation
**Options:** (a) Oldest-purchase-first, same pattern as Khata. (b) Manual selection of which purchase a payment applies to.
**Recommended:** (a), for consistency with the Khata model and because §24's example (100,000 purchased / 60,000 paid / 40,000 payable) reads as a running balance rather than per-invoice allocation, but oldest-first is the safer default if/when multiple purchases exist.
**Impact:** Supplier payment service logic.

### 9. Product unit behavior
**Options:** (a) Units (Piece/Box/Set/etc.) are purely descriptive/display labels. (b) Units carry a conversion factor (e.g., 1 Box = 12 Piece) affecting stock math.
**Recommended:** (a) for V1 — a product's stock is tracked in whatever single unit it was purchased/sold in; no cross-unit conversion.
**Reason:** §11 lists Unit as a simple product field with no conversion-factor field anywhere in the schema requirements; adding conversion math is a scope increase not asked for.
**Impact:** Keeps the Product/Inventory schema simple; if wrong, revisit before Phase 4 (DB schema).

### 10. Backup frequency
**Recommended:** Local Postgres: continuous WAL archiving + nightly full snapshot, retained 14 days rotating. Cloud: nightly snapshot of the synced data, retained 30+ days (cloud storage is cheap; err generous).
**Impact:** Phase 6/8 ops setup, not code-structural — low risk to defer exact numbers.

### 11. Remote access requirements
**Options:** (a) None in V1 (Local Shop Server is LAN-only; cloud is sync/backup/reporting target only). (b) Read-only cloud reporting dashboard for the Admin, backed by the cloud DB replica. (c) Full remote control via VPN back into the shop LAN.
**Recommended:** (b) — a separate, read-mostly cloud web app for reports/Khata/inventory visibility when away from the shop, with no ability to create sales remotely (sales only ever happen against the Local Shop Server, preserving the single-writer model).
**Reason:** Satisfies §43's "authorized users may access remotely if enabled" without reopening the multi-writer conflict problem, and without needing a VPN appliance for V1.
**Impact:** Determines whether Phase 3 needs to design a second, thinner cloud-facing app.

### 12. Cloud provider
**Recommended:** Any managed Postgres + Node host is fine technically (Render / Fly.io / Railway / AWS / DigitalOcean). Not architecturally significant — will confirm your preference (cost, region — Pakistan-adjacent latency matters little for async sync) before Phase 8 deployment, not blocking Phase 2/3/4.

### 13. Local server operating system
**Recommended:** A small dedicated PC (Windows or Linux) running Node.js + PostgreSQL as a service, with auto-start on boot and a UPS. Not blocking earlier phases; revisit at Phase 8.

### 14. Deployment strategy
**Recommended:** Docker Compose for the Local Shop Server (local Postgres + NestJS API + reverse proxy) for reproducible setup; standard managed hosting for cloud. Detailed in Phase 3/8, not blocking now.

### 15. Sync conflict resolution
**Recommended:** Given Decision #4 = (a) (single local writer, no fallback multi-writer mode), true data conflicts should become rare-to-nonexistent by construction. The `CONFLICT` state exists as a safety net (e.g., a corrupted/restored-from-old-backup local DB reusing an ID) and always routes to **manual admin review** — the system will never auto-resolve a financial conflict silently. Detailed conflict-record schema comes in Phase 4.

---

## New items surfaced during this review (not in the original §54 list of 15, but same category)

### 16. Client device offline model — ✅ CONFIRMED: thin LAN clients
See Requirements Review, Ambiguity #1.
**Options:**
- (a) **Thin LAN client model**: Admin PC / Cashier PC / iPad are ordinary browser clients of the Local Shop Server's API over LAN. Only the Local Shop Server has its own database and offline/sync engine. If a device loses LAN connectivity to the server, that device simply can't transact (matches "communicate with the Local Shop Server even when internet is unavailable," §40).
- (b) **Fully offline-capable client model**: every device (including iPads) runs its own local data store (e.g., IndexedDB/PWA) and syncs peer-to-peer or through the server, so a device can keep selling even if it loses LAN to the server.

**Recommended:** (a).
**Reason:** (b) reintroduces exactly the multi-writer oversell problem §40 explicitly rules out, multiplied across every device instead of just a rare fallback terminal. (a) is simpler, matches the spec's own reasoning in §40, and is the standard architecture for single-location retail POS with a local server.
**Impact:** This is the single biggest scope fork in the whole project. (a) means Next.js frontend is a normal server-rendered/API-driven app; (b) means building a full offline-capable PWA sync engine per device on top of the one already needed for Local↔Cloud. Confirming this now avoids redoing Phase 3 and Phase 6/7 later.

### 17. Cashier login method
**Options:** (a) Full username + password every login. (b) Fast PIN-based quick-login for Cashier (Admin still full credentials), designed for shared shop terminals and checkout speed.
**Recommended:** (b).
**Impact:** Auth architecture (Phase 3), POS login screen (Phase 7).

### 18. UI language — ✅ CONFIRMED: bilingual (English + Urdu toggle)
**Impact:** i18n framework (e.g. `next-intl`) set up from the start of Phase 7, with all user-facing strings routed through it rather than hardcoded, since retrofitting i18n later is far more expensive than building it in from day one.

---
*These will be re-confirmed as a checklist at the top of the Phase 2 SRS once answered.*
