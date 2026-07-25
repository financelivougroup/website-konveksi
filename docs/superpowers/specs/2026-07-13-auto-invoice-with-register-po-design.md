# Auto-Invoice Generation with Register PO

> Date: 2026-07-13
> Status: Approved — awaiting implementation
> Replaces parts of `2026-07-10-invoicing-module-design.md` (manual invoice creation flow)

## Overview

Replace manual invoice creation with **automatic invoice generation** the moment a Work Order transitions to `FINISHING_COMPLETE`. The invoice's `unit_price`, `rate_manpower`, and related financial fields are sourced from a new **`register_po`** (Register PO) master data table that holds per-Production-Order cost components.

The system models cost components as flexible rows (`register_po_components`), so adding or removing cost line items does not require a database migration.

## Goals

- Eliminate manual "Create Invoice" action. Invoices are created automatically based on production status.
- Introduce a `register_po` table as the single source of truth for production cost components and manpower rate per Production Order.
- Force users to register production cost at the start of the pipeline (when pulling to Konveksi) so invoicing is never missing financial data.
- Simplify the invoice schema by removing manual-only fields (`pcs_manual`, `pcs_balance_status`, `pcs_difference`, `rate_manpower`).
- Auto-derive `billing_type` from Work Order quantity: `≤ 10` = Sample Production (SP), `> 10` = Mass Production (MP).
- Generate a formal client invoice PNG (already implemented in `2026-07-10-invoicing-module-design.md`).

## Non-Goals

- Editing `pcs_linked` from the invoice page.
- Multi-Work-Order invoices.
- More than one invoice per Work Order.
- Editing `unit_price` per invoice (locked to `register_po.total_per_pcs`).
- General ledger / bank reconciliation.
- Email / WhatsApp invoice delivery.
- PO `total_per_pcs` differing per Work Order under the same PO (assumed shared).
- Adding non-financial columns to invoice beyond what already exists.

## User Flow

### Step 1 — Create Production Order
1. Production staff creates a `ProductionOrder` in master data (`product_note`, `product`, `brand`, `warna`, `size`, `quantity`).
2. Status: `PLANNING`.

### Step 2 — Fill Register PO
1. Production staff opens **Master Data → Register PO**.
2. Picks the Production Order from a list.
3. Form shows:
   - `rate_manpower` (default `30000`, editable).
   - Components list, flexibly ordered: default keys `potong`, `jahit`, `obras`, `finishing`, `operational`, `material_basic`, `margin`. Each is `{ key, label, value }`.
   - `+ Tambah Komponen` button (adds an empty row for a new `key` + `label` + `value`).
   - `−` button on each row to remove.
   - `notes` (free text, optional).
   - Read-only preview: `total_per_pcs = sum(components.value) + rate_manpower`.
4. Save → row in `register_po` + child rows in `register_po_components`.

### Step 3 — Pull to Konveksi
1. User opens `Order Entry` and clicks **Pull to Konveksi** on a Production Order.
2. **Validation**: pull is blocked if `register_po` row does not exist for this Production Order. Toast: "Isi Register PO dulu sebelum pull ke Konveksi".
3. **On success**:
   - `WorkOrder` is created with status `CUTTING_PENDING`.
   - `work_orders.production_order_id` is set to link the WO back to the PO and its `register_po`.
   - Toast: "WO berhasil di-pull".

### Step 4 — Production Pipeline
- Normal flow: `CUTTING_PENDING` → `CUTTING_COMPLETE` → `SEWING_IN_PROGRESS` → (triggers) `FINISHING_IN_PROGRESS` when sewing total = cutting total but cutting > qty, then `FINISHING_COMPLETE` when sewing = cutting = order qty (per existing `deriveStatus` logic).

### Step 5 — Auto-Create Invoice
1. When the production status transitions to `FINISHING_COMPLETE`, the system calls `transitionToFinishingComplete(workOrderId)`.
2. This service performs in a single client transaction:
   - `update work_orders set prod_status = 'FINISHING_COMPLETE' where id = ?`
   - **Then**, if the update succeeded and previous status was not already `FINISHING_COMPLETE`:
     - `select * from register_po where production_order_id = ?` (must exist).
     - `select * from work_orders where id = ?` to read `brand`, `quantity`, `production_order_id`, `id`.
     - `select * from invoices where work_order_id = ?` — if exists, skip.
     - `select max(sequence)` from recent invoice rows (last 200, ordered by created_at desc) to get the next global sequence number.
     - Compute `billing_type`:
       - `quantity <= 10` → `'sample_production'` (SP)
       - `quantity > 10` → `'mass_production'` (MP)
     - Compute `billing_type_code` (`'SP'` or `'MP'`).
     - Compute `client_code` from brand via `clientCodeFromBrand(brand)`.
     - Compute `invoice_code` using `buildInvoiceCode`.
     - `insert into invoices (...)` with the auto-derived fields.
3. Toast: "Invoice {invoice_code} auto-generated untuk WO {workCode}".

### Step 6 — Invoicing Page
1. User opens **Finance → Invoicing**.
2. The table shows one row per invoice (read-only columns, computed values, action buttons).
3. Buttons:
   - **Payment** — opens `PaymentModal`. Cash or Termin. Inputs: payment date(s), amount(s), file uploads (Supabase Storage bucket `invoice-payment-proofs`).
   - **Download Invoice** — renders off-screen `InvoiceImage` and triggers PNG download via `html-to-image`.
4. When `outstanding_amount = 0`, `work_orders.invoice_status` becomes `INVOICED` and the WO Kanban column reflects this (existing behavior).

### Legacy / Migration
- On first run of the app after migration, run a backfill service:
  - `select * from work_orders where prod_status in ('FINISHING_COMPLETE', 'INVOICED') and work_order_id not in (select work_order_id from invoices)`.
  - For each, run the same `transitionToFinishingComplete` logic but in a "create-only" mode (skip the `update work_orders` step).

## Data Model

### New tables

#### `register_po`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `production_order_id` | `UUID NOT NULL UNIQUE REFERENCES production_orders(id) ON DELETE CASCADE` | One register per PO. |
| `rate_manpower` | `INTEGER NOT NULL DEFAULT 30000 CHECK (rate_manpower >= 0)` | |
| `total_per_pcs` | `INTEGER NOT NULL CHECK (total_per_pcs >= 0)` | Computed by trigger. |
| `notes` | `TEXT` | |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Trigger updates this on component changes too. |

#### `register_po_components`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `register_po_id` | `UUID NOT NULL REFERENCES register_po(id) ON DELETE CASCADE` | |
| `key` | `TEXT NOT NULL` | Stable identifier (e.g. `potong`). Used by `findComponent`. |
| `label` | `TEXT NOT NULL` | Display name. |
| `value` | `INTEGER NOT NULL CHECK (value >= 0)` | Nominal per PCS for this component. |
| `sort_order` | `INTEGER NOT NULL DEFAULT 0` | |

Indexes:
- `idx_rpo_components_register_po_id` on `(register_po_id)`.
- Unique constraint on `(register_po_id, key)`.

Trigger `recompute_register_po_total`:
- On any INSERT/UPDATE/DELETE in `register_po_components`, set `register_po.total_per_pcs = COALESCE(SUM(value), 0) + register_po.rate_manpower` and `updated_at = now()`.

### Changes to existing tables

#### `invoices` — drop columns

```sql
ALTER TABLE invoices
  DROP COLUMN pcs_manual,
  DROP COLUMN pcs_balance_status,
  DROP COLUMN pcs_difference,
  DROP COLUMN rate_manpower;
```

#### `invoices` — add columns

```sql
ALTER TABLE invoices
  ADD COLUMN register_po_id UUID REFERENCES register_po(id),
  ADD COLUMN billing_type TEXT NOT NULL DEFAULT 'mass_production'
    CHECK (billing_type IN ('mass_production', 'sample_production')),
  ADD COLUMN auto_created BOOLEAN NOT NULL DEFAULT TRUE;
```

#### `work_orders` — add column

```sql
ALTER TABLE work_orders
  ADD COLUMN production_order_id UUID REFERENCES production_orders(id);
```

### Storage

- Bucket `invoice-payment-proofs` (created in previous spec — unchanged).
- Public read, path format `${invoiceId}/${paymentId}/${timestamp}-${filename}`.

### Database triggers

Only the `recompute_register_po_total` trigger on `register_po_components`. Invoice auto-creation is in the **client** service, not a DB trigger, because the logic depends on values already loaded into the app.

## Components

### New files

- `supabase/migrations/2026-07-13-register-po-and-auto-invoice.sql`
- `src/services/registerPo.ts`
- `src/services/registerPoComponents.ts`
- `src/services/autoInvoice.ts`
- `src/components/Modals/RegisterPoModal.tsx`
- `src/pages/RegisterPoPage.tsx`

### Modified files

- `src/types/pipeline.ts` — add `RegisterPoRow`, `RegisterPoComponentRow`. Update `InvoiceRow` to remove `pcsManual`, `pcsBalanceStatus`, `pcsDifference`, `rateManpower`. Add `registerPoId`, `billingType`, `autoCreated`. Add `BillingType` union.
- `src/services/workOrders.ts` (or wherever the WO status update lives) — replace the transition logic to call `transitionToFinishingComplete`.
- `src/components/Modals/OrderEntry.tsx` or pull action location — block pull if no `register_po`.
- `src/components/Modals/InvoiceFormModal.tsx` — **delete** (no manual invoice form).
- `src/components/Modals/PaymentModal.tsx` — unchanged from previous spec.
- `src/components/Invoice/InvoiceImage.tsx` — drop `pcs_manual`, `DRAFT` watermark logic. Total = `pcs_linked * unit_price`.
- `src/pages/InvoicingPage.tsx` — remove the "Create Invoice" button and modal trigger. Refetch after auto-invoice transitions elsewhere.
- `src/services/invoices.ts` — remove `pcs_manual`-related writes. Add a `createInvoiceAuto` helper.
- `src/services/eligibleWorkOrders.ts` — drop or repurpose. No more eligible list needed.
- `src/data/mockData.ts` — update `viewConfig['invoicing']` columns to match new schema.
- `App.tsx` — register `register-po` route; remove `InvoiceFormModal` import.

## Services

### `registerPo.ts`

```ts
export async function fetchRegisterPoByProductionOrderId(poId: string): Promise<RegisterPoRow | null>
export async function fetchRegisterPoWithComponents(poId: string): Promise<{ po: RegisterPoRow; components: RegisterPoComponentRow[] } | null>
export async function fetchAllRegisterPo(): Promise<Array<{ po: RegisterPoRow; productionOrder: ProductionOrderRow; components: RegisterPoComponentRow[] }>>
export async function createRegisterPo(input: { productionOrderId: string; rateManpower: number; notes?: string; components: Array<{ key: string; label: string; value: number }> }): Promise<string>
export async function updateRegisterPo(id: string, input: { rateManpower: number; notes?: string; components: Array<{ key: string; label: string; value: number }> }): Promise<void>
export async function removeRegisterPo(id: string): Promise<void>
```

`createRegisterPo` / `updateRegisterPo` write both tables. `updateRegisterPo` should run as a single RPC call: `delete from register_po_components where register_po_id = ?` then bulk-insert the new components. The trigger recomputes the total.

### `autoInvoice.ts`

```ts
export async function transitionToFinishingComplete(workOrderId: string): Promise<{
  workOrder: WorkOrder;
  invoiceCreated: boolean;
  invoice?: InvoiceRow;
}>
```

Logic:
1. Fetch current WO; abort if status is already `FINISHING_COMPLETE` (idempotent).
2. Compute `nextStatus = deriveStatus(...)`.
3. Update WO status to `FINISHING_COMPLETE`.
4. If eligible WO has no invoice yet:
   - Fetch `register_po` by `workOrder.production_order_id`. Throw if missing — should never happen given pull-time validation.
   - Compute `billingType` and `billingTypeCode` from quantity.
   - Generate `invoice_code` via `fetchMaxSequenceNumber() + 1`.
   - Insert invoice with all derived fields.
5. Return `{ workOrder, invoiceCreated, invoice? }`.

### Backfill service

```ts
export async function backfillMissingInvoices(): Promise<number>
```

Run in a debounced mount effect in `App.tsx` after the first production-monitoring data load, **at most once per session**. Silent on error; logs to console. Returns count created.

## UI

### `RegisterPoModal`

- Shell: existing `ModalShell`.
- Form fields:
  - `rate_manpower` (number input, default 30000).
  - `notes` (textarea, optional).
  - Components list (one row per component):
    - `key` (text input — readonly if seeded, editable when adding new).
    - `label` (text input).
    - `value` (currency input, formatted).
    - `−` button (remove).
  - `+ Tambah Komponen` button (adds an empty row with `key = ''`, `label = ''`, `value = 0`).
  - Read-only preview: `Total / PCS: Rp {total_per_pcs}`.
- Footer: `Simpan` / `Batal`.

### `RegisterPoPage`

- `TopBar` with `+ Tambah Register PO` button.
- Lists existing register rows: `Production Order`, `Total / PCS`, `Komponen`, `Last Updated`.
- Per-row actions: `Edit`, `Delete`.
- Shows toast for create / update / delete outcomes.

### `InvoicingPage` (modified)

- Removes the `+ Create Invoice` button from `TopBar`'s `onAddNew`.
- Renders the off-screen `InvoiceImage` instances for PNG export.
- Each row has only `Payment` and `Download Invoice` action buttons.
- After any payment action, refetch invoice + payments.

### Decision: where does the "incomplete Register PO" warning show?

A toast appears when pull is blocked. The actual `register_po` table is reachable from **Master Data** sidebar, currently the user has to manually navigate there. We add a new sidebar entry **Master Data → Register PO** that opens `RegisterPoPage`.

### Threshold configuration

The threshold (default `10`) for `SP` vs `MP` is hardcoded in `src/lib/autoInvoice.ts` as a constant:

```ts
export const SAMPLE_PRODUCTION_QTY_THRESHOLD = 10;
```

A `Settings` page is out of scope for this spec. Future work can move this to a `settings` table.

## Validation and Error Handling

### Pull to Konveksi
- Block if `register_po` missing. Toast: "Isi Register PO dulu sebelum pull ke Konveksi".
- Block if any required `ProductionOrder` field is missing (existing behavior — unchanged).

### Register PO Save
- `rate_manpower` required, ≥ 0.
- All components must have non-empty `label`. Empty `value` defaults to `0`. Empty `key` is auto-generated from label.
- Duplicate `key` within the same register → block save. Toast: "Key komponen duplikat".

### Auto-Invoice Creation
- If `register_po` is missing for a WO that is somehow in `FINISHING_COMPLETE`, log to console and skip. Toast: "Invoice tidak dibuat: Register PO tidak ditemukan. Hubungi admin."
- Idempotent: re-running `transitionToFinishingComplete` for a WO that already has an invoice is a no-op for invoice creation.

### Payment Modal
- Cash → one payment row; Termin → N rows.
- Each row: `payment_date` required, `amount > 0`.
- File upload is allowed but optional.
- Overpayment (sum > total) → show confirmation dialog. Still allow save.
- After save, update invoice `outstanding_amount` and `finance_validation`. Update WO `invoice_status` to `INVOICED` when `outstanding = 0`.

### Invoice Download
- Allowed for any invoice regardless of finance validation status.
- PNG filename: `INV_{MP|SP}_{LVU|CSC}_{DDMMYY}_{SEQ}.png` (underscored, sanitized).

## Testing / Verification

1. **Register PO CRUD** — Create register for a PO, edit components, verify `total_per_pcs` updates. Delete register.
2. **Pull blocking** — Attempt to pull a PO without register → blocked. Create register → pull succeeds.
3. **Component flexibility** — Add a custom component key (e.g. `qc`); remove an existing component; save; verify `total_per_pcs` reflects the change.
4. **Auto-invoice on transition** — Drive a WO through the pipeline to `FINISHING_COMPLETE`. Verify invoice appears with correct `unit_price`, `billing_type` (SP for qty≤10, MP for qty>10), and `invoice_code` of next sequence.
5. **Idempotency** — Re-run the transition; no duplicate invoice.
6. **Backfill** — Manually insert a WO into `FINISHING_COMPLETE` without an invoice. Restart app. Verify the backfill creates the invoice.
7. **Payment modal** — Open payment for the auto-invoice. Add Cash payment → outstanding updates, finance validation moves.
8. **PNG download** — Download PNG, verify filename and content reflect new schema (no `DRAFT` watermark, `pcs_linked * unit_price = total`).
9. **Lint / typecheck** — `npm run lint`, `npx tsc -b --noEmit`.
10. **Database integrity** — Try to create two `register_po` rows for the same PO → constraint violation.

## Open Follow-Up (outside this spec)

- Settings page to move `SAMPLE_PRODUCTION_QTY_THRESHOLD` and `rate_manpower` defaults out of code.
- Bank account placeholder `BCA xxxxx` still needs a real account number.
- The off-screen `InvoiceImage` component needs to handle the `pcs_linked` rename (visual identity only).
