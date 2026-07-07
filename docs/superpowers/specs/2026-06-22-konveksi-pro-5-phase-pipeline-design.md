# Design: Konveksi Pro — 5-Phase Production Pipeline Revamp

**Date**: 2026-06-22
**Status**: Draft for review
**Scope**: Full rearchitecture of production flow from 10 disparate modules to a clean 5-phase pipeline with role-based access.

---

## 1. Goals

### Problem

Current system has 10 modules that evolved organically. Each module has its own grain (per-row, per-month, per-tailor, per-product) and unclear ownership. There is no end-to-end traceability of a work order from order intake to invoicing, and no role-based access control.

### Goal

Replace the existing flow with a **two-module architecture**:

1. **Production Module** (master, planning): inventory staff creates production orders with full product information. This is the source of truth for what to produce.
2. **Konveksi Module** (execution, pipeline): when production starts, an order is **pulled** from the production module into the konveksi pipeline. The pipeline has 4 phases — Cutting, Sewing, Finishing, Invoicing — that execute end-to-end.

Every work order carries **two independent status axes**:
- **Production status**: tracks physical progress through the 4 phases.
- **Invoice status**: tracks financial progress independently from production.

Each phase has a clear owner (role) and well-defined input semantics (single-shot vs. unlimited log).

### Non-goals (this revamp)

- Real Pancake POS API integration (mocked sync for demo).
- Real authentication backend (mock auth via localStorage + role switcher).
- PDF invoice generation (stub for now).
- Email delivery for invoices (stub).
- Advanced reporting/analytics dashboards (next phase).

---

## 2. Architecture

### 2.1 Two modules, four pipeline phases

**Production Module** (master/parent — planning & order intake):

| Entity | Owner / Role | Purpose |
|---|---|---|
| **Production Order Entry** | Inventory Staff | Creates production orders with product, variation, qty, due date. Holds order at planning stage until production is ready to start. |
| **Pull to Konveksi** action | Inventory Staff | When production is about to start, this action pulls a production order into the Konveksi Module, creating a `WorkOrder` with `sourceOrderId` linking back. |

**Konveksi Module** (child — execution pipeline):

| # | Phase | Owner / Role | Trigger | Input semantics |
|---|---|---|---|---|
| 1 | **Cutting Phase** | Inventory Staff | WorkOrder created via Pull | **Single-shot, locked**: one `CuttingRecord` per WorkOrder, locked after first submit. |
| 2 | **Sewing Phase** | Spv Konveksi | Cutting Complete | **Unlimited log**: many `SewingRecord` per WorkOrder, one entry per batch/day from one or more PIC. |
| 3 | **Finishing Sync** | Inventory Staff | Sewing Complete | **Unlimited log**: many `FinishingRecord` per WorkOrder, one per POS import (daily/every-2-days). |
| 4 | **Invoicing** | Auto + Admin review | Finishing Complete | Auto-generated invoice, tracked through 4 invoice statuses. |

### 2.2 Two independent status axes

Each `WorkOrder` carries two status fields that progress independently:

**Production Status** (physical progress through the pipeline):

```
WorkOrder created (via Pull from production module)
       ↓ automatic
[CUTTING_PENDING]              ← WorkOrder appears in Cutting queue
       ↓ inventory submits totalCutting (locked, single-shot)
[CUTTING_COMPLETE]
       ↓ automatic
[SEWING_IN_PROGRESS]           ← Sewing queue shows it
       ↓ spv adds unlimited SewingRecords
       ↓ IF SUM(qtySelesaiJahit) === WorkOrder.quantity → automatic
[SEWING_COMPLETE]
       ↓ automatic
[FINISHING_IN_PROGRESS]        ← POS imports start arriving
       ↓ inventory adds unlimited FinishingRecords
       ↓ IF (SUM(qtyFinishing) === CuttingRecord.totalCutting) AND (SUM !== 0)
[FINISHING_COMPLETE]            ← terminal production status
```

**Invoice Status** (financial progress, separate axis):

```
WorkOrder created
   ↓ (any time after FINISHING_COMPLETE on production axis)
[WAITING_INVOICE]              ← at least 1 invoice component known (e.g. qty, unit price) but invoice not fully generated yet
       ↓ admin/finance generates invoice (all components complete)
[INVOICED]                     ← invoice fully generated, ready to send
       ↓ admin/finance marks invoice as sent
[SENT]                         ← (optional intermediate state; if not needed, INVOICED transitions directly to PARTIAL_PAID or PAID)
       ↓ partial payment received
[PARTIAL_PAID]                 ← client paid some amount, balance remains
       ↓ remaining payment received → automatic
[PAID]                         ← client paid in full
```

**Production Status values:**
- `CUTTING_PENDING`
- `CUTTING_COMPLETE`
- `SEWING_IN_PROGRESS`
- `SEWING_COMPLETE`
- `FINISHING_IN_PROGRESS`
- `FINISHING_COMPLETE`

**Invoice Status values:**
- `NONE` (initial — production hasn't finished yet, so invoicing isn't tracked)
- `WAITING_INVOICE`
- `INVOICED`
- `PARTIAL_PAID`
- `PAID`

**Why two axes?** A work order can be physically complete (FINISHING_COMPLETE) but the invoice not yet generated (WAITING_INVOICE). Conversely, partial payment can arrive while production is still ongoing (rare but possible if client pre-paid). Keeping the axes independent avoids forced ordering between physical and financial flows.

### 2.3 Modules: removed / kept / added

**Removed from pipeline (deprecated):**
- `register-jahit` — monthly production register; replaced by invoice aggregation.
- `daftar-libur` — orthogonal calendar; kept as supporting reference only.
- `register-penjahit` — merged into Sewing Phase dropdown source.
- `production-data` (combined view) — no longer needed; pipeline is its own structure.

**Kept as supporting modules (orthogonal to pipeline):**
- `master-product` — fabric/product catalog.
- `raw-monitoring` — fabric stock level.
- `master-import` — supplier import log.
- `target-jahit` — **kept** — penjahit performance / salary rollup. Used by Sewing Phase to load target for each PIC (the production data is referenced when spv inputs sewing entries). **DO NOT DELETE.**

**Added as new pipeline modules:**

In **Production Module** (master):
- `production-order` — where inventory staff creates and manages production orders before they're pulled.

In **Konveksi Module** (pipeline):
- `cutting-phase`
- `sewing-phase`
- `finishing-sync`
- `invoicing`

---

## 3. Data Schema

All rows are typed via TypeScript interfaces (currently `Record<string, unknown>` — strict typing introduced in this revamp).

### 3.0 `ProductionOrder` (Production Module — master)

```typescript
interface ProductionOrder {
  id: string;                  // primary key
  productId: string;           // FK → master-product
  product: string;
  informationVariation: string;
  warna: string;
  size: string;
  brand: string;
  quantity: number;            // target produksi

  status: 'PLANNING' | 'PULLED' | 'CANCELLED';
  // PLANNING: order is in production module, not yet started
  // PULLED: order has been pulled into konveksi module (WorkOrder created)
  // CANCELLED: order cancelled before pull

  createdBy: UserId;           // inventory staff
  createdAt: DateTime;
  pulledAt?: DateTime;
  pulledBy?: UserId;
}
```

**Pull action**: when status = `PLANNING` and user clicks "Pull to Konveksi", a new `WorkOrder` is created with `sourceOrderId = ProductionOrder.id` and `ProductionOrder.status` becomes `PULLED`.

### 3.1 `WorkOrder` (Konveksi Module — created via Pull)

```typescript
interface WorkOrder {
  id: string;                  // primary key; format = work code
  // Work code formula: IF productNote CONTAINS "B-00" → "Produksi - Awal | <product> | <warna> | <size>"
  //                    ELSE → "Restock-<XX> | <product> | <warna> | <size>"
  // Same formula as current `generateWorkCode()` in mockData.ts.

  sourceOrderId: string;       // FK → ProductionOrder.id (the source order)
  productId: string;           // FK → master-product
  product: string;
  informationVariation: string;
  warna: string;
  size: string;
  brand: string;

  quantity: number;            // target produksi (copied from ProductionOrder)

  // Two independent status axes:
  productionStatus: ProductionStatus;
  invoiceStatus: InvoiceStatus;

  createdBy: UserId;
  createdAt: DateTime;
  sourceModule: 'production-order' | 'manual-entry';  // traceability
}
```

### 3.2 `CuttingRecord` (Cutting Phase — single-shot, locked)

```typescript
interface CuttingRecord {
  id: string;
  workOrderId: string;         // FK → WorkOrder.id

  totalCutting: number;
  inputBy: UserId;             // inventory staff
  inputAt: DateTime;

  locked: true;                // hard constraint: once submitted, no edits from inventory
  // admin-only override via AuditLog
}
```

**Single-shot input.** Exactly one `CuttingRecord` per `WorkOrder`. After first submit, the record is locked — inventory staff cannot edit. Admin override possible with AuditLog entry. This is intentional because cutting stock is finalized at the moment fabric is released.

### 3.3 `SewingRecord` (Sewing Phase — unlimited log)

```typescript
interface SewingRecord {
  id: string;
  workOrderId: string;         // FK → WorkOrder.id

  picPenjahit: string;         // FK → register-penjahit (active tailors)
  qtySelesaiJahit: number;     // partial qty per entry
  tanggalLaporan: Date;

  inputBy: UserId;             // spv konveksi
  inputAt: DateTime;

  // No "locked" field. Entries can be edited by admin only; spv input
  // happens daily/every-2-days, so the latest entry is the most recent snapshot.
}
```

**Unlimited log.** Many `SewingRecord` per `WorkOrder`. Each entry represents one batch/day's sewing output from one PIC. Multiple PIC can contribute to the same work order (parallel production lines, e.g., PIC A sews 100 pcs on Monday, PIC B sews 100 pcs on Tuesday).

**Aggregations:**
- `sewingTotal(workOrderId)` = `SUM(qtySelesaiJahit) WHERE workOrderId = ?`
- `sewingProgress` = `sewingTotal / WorkOrder.quantity`
- `SEWING_COMPLETE` trigger: `sewingTotal === WorkOrder.quantity`

### 3.4 `FinishingRecord` (Finishing Phase — unlimited log, imported from Pancake POS)

```typescript
interface FinishingRecord {
  id: string;
  workOrderId: string;         // FK → WorkOrder.id

  qtyFinishing: number;        // qty imported in this batch
  tanggalImport: Date;         // when inventory staff imported to POS
  syncedAt: DateTime;          // when POS sync ran
  source: 'pancake-pos';
  syncStatus: 'OK' | 'FAILED';
  syncError?: string;
}
```

**Unlimited log.** Many `FinishingRecord` per `WorkOrder`. Each entry represents one POS import by inventory staff. Imports happen daily/every-2-days, so the timeline reflects actual production finish.

**Aggregations:**
- `finishingTotal(workOrderId)` = `SUM(qtyFinishing) WHERE workOrderId = ?`
- `FINISHING_COMPLETE` trigger (auto-evaluated after each new import):
  ```
  IF (finishingTotal === CuttingRecord.totalCutting) AND (finishingTotal !== 0)
    → WorkOrder.productionStatus = FINISHING_COMPLETE
  ```

### 3.5 `Invoice` (auto-generated, multi-status)

```typescript
interface Invoice {
  id: string;
  workOrderId: string;         // FK → WorkOrder.id

  // Snapshot at invoice generation:
  quantity: number;
  unitPrice: number;
  amount: number;              // quantity × unitPrice

  // Payment tracking:
  amountPaid: number;          // running total of payments received
  amountDue: number;           // amount - amountPaid (computed)

  dueDate: Date;

  // Invoice lifecycle status:
  status: InvoiceStatus;       // see Section 2.2
  //   'NONE'              — production not finished yet
  //   'WAITING_INVOICE'   — production finished, invoice components partial
  //   'INVOICED'          — invoice fully generated
  //   'PARTIAL_PAID'      — partial payment received
  //   'PAID'              — paid in full

  generatedAt?: DateTime;
  generatedBy?: 'system' | UserId;

  payments: Payment[];         // history of partial payments

  pdfUrl?: string;             // stub for now
  sentAt?: DateTime;
}

interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  receivedAt: DateTime;
  receivedBy: UserId;
  method?: 'bank-transfer' | 'cash' | 'other';
  note?: string;
}
```

**Invoice Status transitions:**
- `NONE` (initial — production hasn't finished)
- → `WAITING_INVOICE` (auto, when production reaches `FINISHING_COMPLETE` and at least one invoice component is known, e.g., quantity confirmed)
- → `INVOICED` (admin/finance generates the invoice with all components)
- → `SENT` (optional intermediate; if user wants explicit "sent" status)
- → `PARTIAL_PAID` (when first `Payment` is logged with `amount < amountDue`)
- → `PAID` (when `amountPaid >= amountDue` — fully settled)

If a single payment covers the full amount, `INVOICED` → `PAID` directly (skip `PARTIAL_PAID`).

### 3.6 `AuditLog` (admin-only corrections)

```typescript
interface AuditLog {
  id: string;
  phase: 'order-entry' | 'cutting' | 'sewing' | 'finishing' | 'invoicing';
  recordId: string;            // id of the record changed
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: UserId;
  changedAt: DateTime;
  reason: string;              // free-text reason from admin
}
```

### 3.7 `User` (auth)

```typescript
type Role = 'admin' | 'inventory' | 'spv_konveksi' | 'finance';

interface User {
  id: string;
  username: string;
  passwordHash: string;        // for mock auth, just hash of the password string
  role: Role;
  displayName: string;
}
```

---

## 4. Role-Based Access Control

### 4.1 Roles and access matrix

| Role | Order Entry | Cutting | Sewing | Finishing | Invoicing | Audit Log | Master Data |
|---|---|---|---|---|---|---|---|
| **admin** | full | full | full | read | full | full | full |
| **inventory** | read | **input only** | hidden | hidden | hidden | hidden | read product |
| **spv_konveksi** | read | read | **input only** | hidden | hidden | hidden | read penjahit |
| **finance** | read | read | read | read | full | read | read |

**Rules:**
- Each non-admin role has exactly one phase they can input to. Other phases are read-only or hidden.
- Admin has full access including the ability to override locked records.
- Audit log entries are created automatically on every admin override.

### 4.2 Login flow

1. `/login` page — username + password input.
2. Credentials matched against `User` table (mock).
3. Session token stored in localStorage: `{ userId, role, expiresAt }`.
4. App routes are guarded: redirect to `/login` if no session.
5. Sidebar menu is filtered per role.
6. Role-switcher in dev mode (top-right) for testing without re-login.

### 4.3 Per-role dashboards

- **Admin**: "Production Pipeline" — table of all work orders with status indicator, filter by phase/status/brand.
- **Inventory**: "Cutting Queue" — work orders with status `CUTTING_PENDING` + quick-input form.
- **Spv Konveksi**: "Sewing Queue" — work orders with status `SEWING_IN_PROGRESS` + entry form with PIC picker.
- **Finance**: "Pending Invoices" — list of `DRAFT` invoices with review/send action. "Paid" tab for completed.

---

## 5. Per-Phase UI Details

### 5.1 Production Order Entry (inventory staff — Production Module)

- **View**: DataTable of all production orders with columns: id, product, variation, brand, qty, status (PLANNING/PULLED/CANCELLED), created at.
- **Action — Create New Order**: button opens form modal:
  - Product dropdown (filtered from `master-product`)
  - Auto-fills variation, warna, size, brand when product selected
  - Quantity input (numeric)
  - Due date picker (optional)
  - Submit → status `PLANNING`
- **Action — Pull to Konveksi**: button on rows with status `PLANNING`. Opens confirmation modal: "This will create a WorkOrder in Konveksi Module and start the Cutting phase. Continue?" → on confirm, creates `WorkOrder` with status `CUTTING_PENDING` and `ProductionOrder.status = PULLED`.
- **Action — Cancel Order**: only allowed while `PLANNING`. Once `PULLED`, cannot cancel (must admin-override the WorkOrder instead).
- **Filter tabs**: by status (Planning / Pulled / Cancelled).

### 5.2 Cutting Phase (inventory staff — Konveksi Module)

- **View**: Queue table of `WorkOrder` with `productionStatus = CUTTING_PENDING`.
- **Action — Input Cutting**: button opens modal:
  - Single field: `totalCutting` (numeric)
  - Confirm button — submits and locks
- **After submit**: row moves out of queue, becomes read-only for inventory staff. Admin override available via AuditLog.
- **Locked indicator**: each row shows 🔒 icon when `CuttingRecord.locked === true`.

### 5.3 Sewing Phase (spv konveksi — Konveksi Module)

- **View**: Two-level table:
  - Top: queue of work orders with `productionStatus = CUTTING_COMPLETE` (ready to start sewing) or `SEWING_IN_PROGRESS` (in progress).
  - Bottom (per work order expanded): list of `SewingRecord` entries with columns: date, PIC, qty, input by.
- **Action — Add Sewing Entry**: button opens form modal:
  - Work code (dropdown — only work orders with `productionStatus = CUTTING_COMPLETE` or `SEWING_IN_PROGRESS`)
  - PIC Penjahit (dropdown from `register-penjahit`, filter status = Aktif)
  - Quantity (partial, e.g., 50 pcs per batch)
  - Date (defaults to today, can backdate for missed entries)
  - Submit → entry added, `sewingTotal` recomputed
- **Visualization**: progress bar per work order = `sewingTotal / WorkOrder.quantity`. Auto-updates after each entry.
- **Auto status update**: when `sewingTotal === WorkOrder.quantity`, status → `SEWING_COMPLETE`.
- **Multiple PIC parallel**: same work order can have entries from different PIC, e.g., PIC A 100 pcs on day 1 + PIC B 100 pcs on day 2 = 200 pcs total.
- **Reference to target-jahit**: when PIC is selected in the form, spv can see the PIC's monthly target from `target-jahit` module (read-only) for context.

### 5.4 Finishing Sync (inventory staff — Konveksi Module)

- **View**: queue of work orders with `productionStatus = FINISHING_IN_PROGRESS`.
- **Action — Import to POS (Form-based, since Pancake POS integration is mocked)**: button opens form:
  - Work code (dropdown — only work orders with `productionStatus = FINISHING_IN_PROGRESS`)
  - Quantity imported in this batch (numeric)
  - Import date (defaults to today)
  - Submit → creates new `FinishingRecord`, `finishingTotal` recomputed
- **Auto status update**: after each import, formula `(SUM(qtyFinishing) === CuttingRecord.totalCutting) && (SUM !== 0)` is re-evaluated. If true, status → `FINISHING_COMPLETE`.
- **Multiple imports**: inventory staff can import many times per work order (unlimited log), reflecting real-world cadence (every day or every 2 days).
- **Sync log view**: admin can see last import timestamp, success/failure count, queue length.

### 5.5 Invoicing (admin + finance — Konveksi Module)

- **Trigger**: `WorkOrder.productionStatus = FINISHING_COMPLETE`. At that moment, `invoiceStatus` auto-transitions to `WAITING_INVOICE` (since qty is now confirmed; remaining invoice components like unit price and due date are still needed).
- **Admin view — Invoices table**: columns: invoice id, work code, qty, unit price, amount, due date, invoice status, paid amount, due amount.
- **Action — Generate Invoice** (for `WAITING_INVOICE`): opens modal:
  - Unit price input (admin sets per work order)
  - Due date picker
  - Submit → `Invoice` created, `invoiceStatus = INVOICED`
- **Action — Send to Client** (for `INVOICED`): marks `sentAt`, transitions to `SENT`.
- **Action — Record Payment** (for `INVOICED`/`SENT`/`PARTIAL_PAID`): opens form:
  - Amount received
  - Payment date, method, optional note
  - Submit → adds `Payment` to invoice, recomputes `amountPaid`. If `amountPaid < amountDue`, status → `PARTIAL_PAID`. If `amountPaid >= amountDue`, status → `PAID`.
- **Filters**: by invoice status (Waiting / Invoiced / Partial Paid / Paid), date range.

---

## 6. Corrections & Audit

### 6.1 Admin override flow

1. Admin opens any record (any phase) via detail view.
2. If record is locked or read-only for current role, admin sees "Admin Override" button.
3. Click → modal with editable fields + reason input (free text).
4. Submit → record updated, AuditLog entry created with field, oldValue, newValue, changedBy, changedAt, reason.
5. AuditLog accessible via "Admin" → "Audit Log" page (filterable by phase, user, date).

### 6.2 Side effects of admin override

- **Cutting override**: if `totalCutting` is changed after sewing entries exist, sewing total is NOT auto-recomputed (sewing entries stay). Admin must explicitly adjust sewing entries if needed. A warning banner shows the discrepancy.
- **Order Entry override (after Cutting Complete)**: warns admin that changing qty will desync cutting/sewing/finishing. Recommended to create a new work order instead.
- **Invoice override**: changes are tracked; original invoice values (pre-override) are kept in the AuditLog entry, but a separate `InvoiceArchive` table is **deferred** (out of scope for this revamp; the AuditLog entry is sufficient to reconstruct history for now).

### 6.3 Edge cases

- **POS sync error**: `FinishingRecord.syncStatus = 'FAILED'`. Admin sees notification, can manually retry.
- **Duplicate work code** (shouldn't happen, but guard): uniqueness check on WorkOrder.id at create time.
- **Sewing qty > order quantity**: warning, but allowed (admin can mark as oversupply). Not auto-blocked.
- **Finishing qty > cutting qty**: warning + investigation needed (POS mis-config). Admin can flag.

---

## 7. Migration Plan

Mapping existing data → new schema:

| Old module | New equivalent | Migration steps |
|---|---|---|
| `selesai-finishing` (9 rows) | `ProductionOrder` + `WorkOrder` | For each row: extract `productNote + product + warna + size` → generate `id` (work code). `quantity` → `quantity`. Create one `ProductionOrder` (status=PULLED) and one `WorkOrder` per row. |
| `selesai-finishing.totalCutting` | `CuttingRecord.totalCutting` | One CuttingRecord per WorkOrder. |
| `selesai-finishing.totalSelesaiJahit` | Multiple `SewingRecord` entries | Create one SewingRecord per row with the existing qty + a default PIC. |
| `selesai-jahit` (4 rows) | Additional `SewingRecord` entries | Map workCode → WorkOrder.id. |
| `target-jahit` | Kept as-is (orthogonal) | No change. **Used by Sewing Phase to load PIC target.** |
| `register-jahit`, `register-penjahit`, `daftar-libur` | Archived / merged | Move to `archived/` collection. `register-penjahit` becomes source for Sewing Phase dropdown. |
| `master-product`, `raw-monitoring`, `master-import` | Kept as-is | No change. |

After migration, run a **status reconciliation**:
- For each WorkOrder, recompute `productionStatus` from current `totalCutting`, `sewingTotal`, `finishingTotal` values.
- `invoiceStatus` defaults to `NONE` for migrated rows (no invoice yet).
- Generate audit log entries marking the migration as the source.

---

## 8. Implementation Phases (proposed)

This single spec covers both modules and 4 pipeline phases at the design level. Implementation should be decomposed:

1. **Phase A — Schema & Data Layer**
   - New TypeScript types (`ProductionOrder`, `WorkOrder`, `CuttingRecord`, `SewingRecord`, `FinishingRecord`, `Invoice`, `Payment`, `AuditLog`, `User`)
   - Status type definitions (`ProductionStatus`, `InvoiceStatus`)
   - Mock data migration from current modules
   - Status computation engine (consolidate current `computeCutVsUpload`, `computeStatusStock` etc. into a single function that handles both production and invoice axes)

2. **Phase B — Auth & Role Routing**
   - Login page, role-based sidebar, route guards, mock user store
   - 4 roles: admin, inventory (Production Order + Cutting + Finishing), spv_konveksi (Sewing), finance (Invoicing read + payment recording)

3. **Phase C — Production Order Module**
   - List view of `ProductionOrder` (planning/pulled/cancelled)
   - Create form (inventory staff)
   - Pull-to-Konveksi action (creates `WorkOrder` with status `CUTTING_PENDING`)
   - Cancel action (only while planning)

4. **Phase D — Cutting Module (Inventory, Konveksi Module)**
   - Cutting queue (work orders with `productionStatus = CUTTING_PENDING`)
   - Input form (single field `totalCutting`)
   - Locked submission (one-shot per work order)
   - Auto-transition to `SEWING_IN_PROGRESS` (but sewing queue only becomes accessible after sewing phase is set up)

5. **Phase E — Sewing Module (Spv Konveksi, Konveksi Module)**
   - Sewing queue + per-work-order entries view
   - Multi-entry form (work code + PIC + qty + date)
   - Progress bar visualization
   - Reference to `target-jahit` for PIC target lookup
   - Auto status update on `SEWING_COMPLETE`

6. **Phase F — Finishing Module (Inventory, Konveksi Module)**
   - Finishing queue (work orders with `productionStatus = FINISHING_IN_PROGRESS`)
   - Form-based import (work code + qty + date) — manual entry per POS import batch
   - Auto status formula evaluation
   - Multi-import log view (admin)

7. **Phase G — Invoicing Module (Admin + Finance)**
   - Invoice list with 4-status filter (Waiting / Invoiced / Partial Paid / Paid)
   - Generate invoice modal (unit price + due date)
   - Record payment form
   - Auto-transition rules: `INVOICED → PARTIAL_PAID → PAID`

8. **Phase H — Audit Log & Admin Override**
   - Audit log page (filterable by phase, user, date)
   - Admin override modal for locked records
   - Side-effect warnings (e.g., cutting change after sewing entries exist)

9. **Phase I — Migration of Existing Data + Admin Role Testing**
   - Migrate 9 finishing rows + 4 sewing rows to new schema
   - Status reconciliation for both axes
   - E2E test: pull order → cutting → sewing (multiple entries) → finishing (multiple imports) → invoice → payment
   - Verify all 4 roles can perform their workflow

---

## 9. Open Questions (resolved)

All open questions resolved during brainstorming:

1. **Cutting Phase standalone or merged?** → Standalone, separate `CuttingRecord` table.
2. **Cutting editable after submit?** → No, locked once submitted (single-shot).
3. **Finishing sync carries quantity?** → Yes, via per-batch `FinishingRecord` entries (unlimited log). Formula: `(SUM(qtyFinishing) === CuttingRecord.totalCutting) && (SUM !== 0) → Finishing Complete`.
4. **Invoice timing?** → Auto-transition to `WAITING_INVOICE` when production finishes, then admin/finance generates the invoice with unit price + due date.
5. **Sewing PIC?** → Multiple PIC parallel per work order. Each entry has its own PIC and partial qty.
6. **Order Entry ownership?** → Inventory staff, in **Production Module** (separate from Konveksi pipeline). Konveksi module pulls data when production starts.
7. **Status dimensions?** → Two independent axes: `productionStatus` (physical progress) and `invoiceStatus` (financial progress).
8. **Sewing input frequency?** → Unlimited entries, daily or every-2-days cadence.
9. **Finishing input frequency?** → Unlimited entries (POS imports), daily or every-2-days cadence.
10. **target-jahit module?** → **Kept** — used by Sewing Phase to load PIC target. Do NOT delete.

---

## 10. Success Criteria

This revamp succeeds when:

- [ ] Inventory staff can log in, create a production order, and pull it to Konveksi to create a `WorkOrder` with `productionStatus = CUTTING_PENDING`.
- [ ] Inventory staff sees the cutting queue, inputs `totalCutting` once, and the record locks. The work order transitions to `CUTTING_COMPLETE`.
- [ ] Spv Konveksi logs in, sees the sewing queue, and adds unlimited sewing entries with different PIC across multiple days. Status auto-transitions to `SEWING_COMPLETE` when `SUM(qty) === order.quantity`.
- [ ] Spv Konveksi can see the PIC's monthly target from `target-jahit` while selecting a PIC in the sewing entry form.
- [ ] Inventory staff imports finishing qty in multiple batches (unlimited log). After each import, status auto-re-evaluates and transitions to `FINISHING_COMPLETE` when formula matches.
- [ ] When `productionStatus = FINISHING_COMPLETE`, `invoiceStatus` auto-transitions to `WAITING_INVOICE`.
- [ ] Admin/finance can generate the invoice with unit price + due date, transitioning to `INVOICED`. Record payment in multiple installments, auto-transitioning through `PARTIAL_PAID` to `PAID`.
- [ ] Both status axes (production and invoice) are visible and filterable independently in the work order detail view.
- [ ] `target-jahit` module remains accessible (read-only from other roles) and is referenced by the Sewing Phase.
- [ ] Admin can override any locked record (Cutting), with every change tracked in `AuditLog`.
- [ ] A new work order can go from `ProductionOrder.PLANNING` → `WorkOrder.productionStatus = FINISHING_COMPLETE` → `invoiceStatus = PAID` end-to-end without manual status intervention.
- [ ] Existing data (9 finishing rows + 4 sewing rows) successfully migrates to the new schema with correct status inference on both axes.