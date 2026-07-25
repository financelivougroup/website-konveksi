# Invoicing Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Invoicing module coming soon" placeholder with a working Finance → Invoicing page that creates one invoice per finished Work Order, links invoice PCS to Production Monitoring, supports Cash/Termin payments with file uploads to Supabase Storage, and downloads a formal Livou Konveksi client invoice as a PNG.

**Architecture:** Standalone `InvoicingPage` React component fetched from Supabase. New `services/invoices.ts`, `services/invoicePayments.ts`, `services/invoicePaymentFiles.ts`, `services/eligibleWorkOrders.ts`. Reusable `InvoiceFormModal` for create/edit, `PaymentModal` for cash/termin detail, `InvoiceImage` (off-screen component) for PNG generation via `html-to-image`. Schema migration adds three Supabase tables plus one Storage bucket. Sidebar `invoicing` route activated.

**Tech Stack:** React 19 + TypeScript, Vite 7, Tailwind 3, shadcn/ui (already installed), Supabase JS v2, `html-to-image` (new dep).

## Global Constraints

- Project root: `C:/Users/ASUS/Website Konveksi`
- Vite dev: `npm run dev`
- Lint: `npm run lint`
- This is **not a git repository** — skip `git commit` steps; record changes in `project.md` "Latest Progress" instead.
- Use snake_case column names when writing to Supabase, camelCase in TypeScript types.
- Persisted invoice code format: `INV/MP/LVU/DDMMYY/SEQ` (slashes kept in DB); PNG file name uses underscores.
- One Work Order can have at most one invoice (`work_order_id` unique constraint in `invoices`).
- Eligible Work Orders for new invoices: `prod_status = 'FINISHING_COMPLETE'`.
- Manual PCS is editable on the invoice page; Linked PCS is read-only.
- `rate_manpower` default = `30000`, editable per invoice.
- `unit_price < rate_manpower` triggers a non-blocking warning.
- Finance validation statuses (auto-computed): `Need Register Invoice`, `Collect Payment`, `Partial Paid`, `Paid`.
- PCS balance statuses: `Balance`, `Tidak Balance`. Draft warning shows when status = `Tidak Balance`.
- Payment Type: `cash` (one row) or `termin` (N rows). Type can be changed after save.
- File upload bucket: `invoice-payment-proofs` (Supabase Storage, public read).
- Bank info in invoice image: `BCA xxxxx a.n. JAN CHUN SIONG` (placeholder).
- Invoice image shows `Livou Konveksi` header only (no logo, no address, no WhatsApp, no email).

---

## File Structure

### New files

- `supabase/migrations/2026-07-10-invoicing.sql`
- `src/lib/monthYear.ts`
- `src/lib/invoiceCode.ts`
- `src/lib/invoiceCompute.ts`
- `src/services/invoices.ts`
- `src/services/invoicePayments.ts`
- `src/services/invoicePaymentFiles.ts`
- `src/services/eligibleWorkOrders.ts`
- `src/components/Modals/InvoiceFormModal.tsx`
- `src/components/Modals/PaymentModal.tsx`
- `src/components/Invoice/InvoiceImage.tsx`
- `src/pages/InvoicingPage.tsx`

### Modified files

- `src/types/pipeline.ts` — Add `InvoiceRow`, `InvoicePaymentRow`, `InvoicePaymentFileRow`, billing/payment type unions.
- `src/App.tsx` — Add `invoicing` route branch; remove "coming soon" toast.
- `src/data/mockData.ts` — Replace stub `viewConfig['invoicing']` with proper column defs and `editable: true`.
- `package.json` — Add `html-to-image` dependency.
- `project.md` — Append progress entry.

---

## Task 1: Supabase schema migration

**Files:** Create `supabase/migrations/2026-07-10-invoicing.sql`.

- [ ] **Step 1:** Create directory `supabase/migrations/`.
- [ ] **Step 2:** Write SQL file with the three tables, indexes, FKs, CHECK constraints, and `insert into storage.buckets` for `invoice-payment-proofs`. Exact DDL is documented in spec section "Supabase Design" — copy verbatim into the migration file.
- [ ] **Step 3:** Run the SQL in Supabase dashboard SQL Editor for project `ihmhxacmvvsqtnylnwrs`.
- [ ] **Step 4:** Verify the bucket `invoice-payment-proofs` exists in Storage and is public.

---

## Task 2: Add `html-to-image` dependency

**Files:** Modify `package.json`.

- [ ] **Step 1:** `cd "C:/Users/ASUS/Website Konveksi" && npm install html-to-image`.
- [ ] **Step 2:** Verify `"html-to-image": "^1.x.x"` is in `dependencies`.
- [ ] **Step 3:** `npm run lint` — no new errors.

---

## Task 3: Pure helper — `monthYear.ts`

**Files:** Create `src/lib/monthYear.ts`.

- [ ] **Step 1:** Write a file exporting `formatMonthYear(dateStr: string): string`.
- [ ] **Step 2:** Behavior: input `"2026-07-10"` → output `"Juli 2026"`. Empty/invalid → `""`.

---

## Task 4: Pure helper — `invoiceCode.ts`

**Files:** Create `src/lib/invoiceCode.ts`.

- [ ] **Step 1:** Export:
  - `CLIENT_CODE_MAP = { Livou: 'LVU', Cassca: 'CSC' }` (private)
  - `clientCodeFromBrand(brand)` — throws on unknown brand
  - `billingTypeCode(billingType)` — `'MP'` for `mass_production`, `'SP'` for `sample_production`
  - `formatInvoiceDateSegment(dateStr)` — `"310725"` for `2025-07-31`
  - `buildInvoiceCode({ billingTypeCodeValue, clientCode, invoiceDate, sequence })` — `"INV/MP/LVU/310725/001"`
  - `sanitizeInvoiceCodeForFile(code)` — replace `/` with `_`

---

## Task 5: Pure helper — `invoiceCompute.ts`

**Files:** Create `src/lib/invoiceCompute.ts`.

- [ ] **Step 1:** Export:
  - `computeInvoiceFinancials({ pcsManual, unitPrice, rateManpower })` → `{ totalAmount, rateOperational, totalIncomeManpower, totalIncomeOperational }`
  - `computePcsBalance(pcsManual, pcsLinked)` → `{ status: 'Balance' | 'Tidak Balance', difference }`
  - `computeFinanceValidation({ hasAllRequiredInvoiceFields, hasCompletePaymentDetail, outstanding })` → one of 4 statuses
  - `computeOutstanding(totalAmount, paymentTotal)` → clamped at 0

---

## Task 6: Add types to `src/types/pipeline.ts`

**Files:** Modify `src/types/pipeline.ts`.

- [ ] **Step 1:** Append interfaces `InvoiceRow`, `InvoicePaymentRow`, `InvoicePaymentFileRow` exactly as defined in spec section "Supabase Design".
- [ ] **Step 2:** `npx tsc -b --noEmit` — no new errors.

---

## Task 7: Supabase service — `invoices.ts`

**Files:** Create `src/services/invoices.ts`.

- [ ] **Step 1:** Export functions matching signatures in spec section "App Integration":
  - `fetchAllInvoices()` — `select *` ordered by `invoice_date desc`
  - `fetchInvoiceById(id)`
  - `fetchInvoiceByWorkOrderId(workOrderId)`
  - `fetchMaxSequenceNumber()` — scans recent 200 rows, returns max trailing sequence number
  - `createInvoice(input)` — snake_case mapping; `id` not required
  - `updateInvoice(id, updates)` — partial update; sets `updated_at = now()`
  - `removeInvoice(id)`
  - `updateWorkOrderInvoiceStatus(workOrderId, status)` — sets `work_orders.invoice_status`
- [ ] **Step 2:** Map camelCase TS ↔ snake_case DB row.
- [ ] **Step 3:** `npx tsc -b --noEmit` — no new errors.

---

## Task 8: Supabase service — `invoicePayments.ts`

**Files:** Create `src/services/invoicePayments.ts`.

- [ ] **Step 1:** Export: `fetchPaymentsByInvoiceId`, `createPayment`, `updatePayment`, `removePayment`, `removePaymentsByInvoiceId`. Snake/camel mapping for `payment_type`, `termin_no`, `payment_date`, `amount`.
- [ ] **Step 2:** `npx tsc -b --noEmit` — no new errors.

---

## Task 9: Supabase service — `invoicePaymentFiles.ts` (Storage)

**Files:** Create `src/services/invoicePaymentFiles.ts`.

- [ ] **Step 1:** Export:
  - `fetchFilesByPaymentId(paymentId)`
  - `uploadPaymentProof(paymentId, file)` — uses `supabase.storage.from('invoice-payment-proofs').upload(path, file, { upsert: false })`. Path: `${invoiceId}/${paymentId}/${Date.now()}-${file.name}`. After upload, fetch public URL.
  - `createPaymentFileRecord({ paymentId, fileName, filePath, fileUrl })` — insert into `invoice_payment_files`
  - `removePaymentFile(id)` — deletes DB row then best-effort removes from storage
- [ ] **Step 2:** `npx tsc -b --noEmit` — no new errors.

---

## Task 10: Service — `eligibleWorkOrders.ts`

**Files:** Create `src/services/eligibleWorkOrders.ts`.

- [ ] **Step 1:** Export `fetchEligibleWorkOrders()`:
  1. `select *` from `work_orders` where `prod_status = 'FINISHING_COMPLETE'`.
  2. `select work_order_id` from `invoices`.
  3. Filter out the Work Orders whose id appears in step 2.
  4. Return array of `WorkOrder`.

---

## Task 11: Update `mockData.ts` column config for invoicing

**Files:** Modify `src/data/mockData.ts`.

- [ ] **Step 1:** Replace the stub `'invoicing': { title: 'Invoicing', editable: false, sync: false, columns: [] }` with `editable: true` and full `columns` array. Column keys must match `InvoiceRow` fields and follow the order in spec "Invoice Table Columns". Use `align: 'right'` for numeric columns and `format: 'currency'` for monetary columns. Mark `pcsBalanceStatus`, `financeValidation` with `badge: true`.

---

## Task 12: `InvoiceFormModal.tsx`

**Files:** Create `src/components/Modals/InvoiceFormModal.tsx`.

- [ ] **Step 1:** Wrap with `ModalShell`. Title: `"Create Invoice"` or `"Edit Invoice"`.
- [ ] **Step 2:** Form fields (with defaults):
  - Work Order dropdown — populated by `fetchEligibleWorkOrders()`. On change, auto-fill `clientName = wo.brand`, `clientCode = clientCodeFromBrand(wo.brand)`, `pcsLinked = wo.quantity`.
  - Billing Type dropdown — `Mass Production` / `Sample Production`.
  - PCS Manual — integer input, required, > 0.
  - PCS Linked — read-only display.
  - PCS Balance Status — read-only badge.
  - Unit Price — integer input, required, > 0.
  - Invoice Date — date input, required.
  - Month Year — read-only (computed via `formatMonthYear`).
  - Rate Manpower — integer input, default `30000`, >= 0.
  - Total Tagihan, Rate Operational, Total Income Manpower, Total Income Operational — read-only computed via `computeInvoiceFinancials`.
- [ ] **Step 3:** On save:
  1. Validate required fields. Show toast if missing.
  2. Build invoice code via `fetchMaxSequenceNumber() + 1` → `buildInvoiceCode(...)`.
  3. Insert via `createInvoice(...)`. On success, also call `updateWorkOrderInvoiceStatus(workOrderId, 'INVOICED')`.
  4. Close modal, refetch table, toast success.

---

## Task 13: `PaymentModal.tsx`

**Files:** Create `src/components/Modals/PaymentModal.tsx`.

- [ ] **Step 1:** Wrap with `ModalShell`. Title: `"Payment — {invoiceCode}"`.
- [ ] **Step 2:** Payment Type selector: Cash / Termin.
- [ ] **Step 3:** Cash mode:
  - Show one row with `paymentDate`, `amount`, file upload.
  - Save: `removePaymentsByInvoiceId(invoiceId)`, then `createPayment({ paymentType: 'cash', terminNo: null, paymentDate, amount })`, then `uploadPaymentProof(...)` × N files, then `createPaymentFileRecord(...)`.
- [ ] **Step 4:** Termin mode:
  - Dynamic list of rows. Each row has `terminNo` (auto), `paymentDate`, `amount`, file upload.
  - Save: same as Cash but `paymentType: 'termin'`, `terminNo: rowIndex + 1`.
- [ ] **Step 5:** After save, recompute invoice `finance_validation` and `outstanding` and call `updateInvoice(...)`. Also update Work Order invoice status: `PAID` if outstanding 0, else `PARTIAL_PAID`.

---

## Task 14: `InvoiceImage.tsx`

**Files:** Create `src/components/Invoice/InvoiceImage.tsx`.

- [ ] **Step 1:** Component receives `invoice`, `paymentRows`, `paymentFiles`, `workOrder` props.
- [ ] **Step 2:** Render formal template at fixed width (e.g. 800px) with:
  - Header: `Livou Konveksi`.
  - Identity: invoice code, date, month-year, client name, billing type label.
  - Detail: Work Code, product, warna, size, PCS, unit price, total amount.
  - Payment info: `BCA xxxxx a.n. JAN CHUN SIONG`, payment rows, outstanding.
  - If `pcsBalanceStatus === 'Tidak Balance'`: show `DRAFT — PCS TIDAK BALANCE` overlay/banner.
- [ ] **Step 3:** Component is positioned off-screen (e.g. `position: absolute; left: -9999px;`) so it can be rendered without showing.

---

## Task 15: PNG download helper

**Files:** Create small helper (e.g. add to `InvoiceImage.tsx` or new `src/lib/downloadInvoicePng.ts`).

- [ ] **Step 1:** Export `downloadInvoicePng(element: HTMLElement, fileNameBase: string)`:
  1. Call `toPng(element, { pixelRatio: 2, cacheBust: true })`.
  2. Convert data URL to `Blob`.
  3. Use `URL.createObjectURL` + programmatic `<a download>` to trigger download with `fileNameBase + '.png'`.

---

## Task 16: `InvoicingPage.tsx`

**Files:** Create `src/pages/InvoicingPage.tsx`.

- [ ] **Step 1:** Render `<TopBar currentView="invoicing" onRefresh={fetchAll} onAddNew={openCreateInvoiceModal} />` and a table view.
- [ ] **Step 2:** Table columns are passed by `App.tsx` via `viewConfig['invoicing']`. Render data using existing `DataTable` (read-only view, no inline edit; create flow goes through `InvoiceFormModal`).
- [ ] **Step 3:** Row actions (custom rendered alongside default view/edit/delete):
  - **Payment** button → opens `PaymentModal`.
  - **Download Invoice** button → renders off-screen `InvoiceImage`, calls `downloadInvoicePng(...)` using `sanitizeInvoiceCodeForFile(invoice.invoiceCode) + '.png'`.
- [ ] **Step 4:** On mount, fetch all invoices + their payments + payment files + work orders in parallel.

---

## Task 17: Wire `invoicing` route in `App.tsx`

**Files:** Modify `src/App.tsx`.

- [ ] **Step 1:** In `handleSwitchView`, remove the `if (view === 'invoicing') showToast(...)` early return.
- [ ] **Step 2:** In the render block where `currentView === 'production-monitoring'` and `sewing-entry` are checked, also handle `currentView === 'invoicing'` to render `<InvoicingPage />`.

---

## Task 18: Verify end-to-end

- [ ] **Step 1:** Run `npm run dev`. Visit `http://localhost:3001/`.
- [ ] **Step 2:** Sidebar → Finance → Invoicing opens the invoice page (no "coming soon" toast).
- [ ] **Step 3:** Click "Create Invoice". Eligible Work Orders are listed. Pick one. Verify auto-fill of client, code, linked PCS.
- [ ] **Step 4:** Save invoice. Invoice row appears with correct computed fields and finance validation.
- [ ] **Step 5:** Open the invoice in Payment modal. Add Cash payment with one file. Verify file uploaded to Storage bucket.
- [ ] **Step 6:** Verify `work_orders.invoice_status` updates to `PAID`/`PARTIAL_PAID`.
- [ ] **Step 7:** Click "Download Invoice". PNG downloads with filename `INV_MP_LVU_<date>_<seq>.png`.
- [ ] **Step 8:** Create an invoice with PCS manual ≠ PCS linked. Verify draft warning appears in image.
- [ ] **Step 9:** `npm run lint` and `npm run build` both pass.

---

## Task 19: Update `project.md`

- [ ] **Step 1:** Append to "Latest Progress":

```markdown
### 2026-07-10 — Invoicing Module Implementation
- Migration, services, modals, page, and PNG download wired up per `docs/superpowers/plans/2026-07-10-invoicing-module.md`
- Verified end-to-end: create invoice, payment modal Cash/Termin, file upload, PNG download
```

---

## Self-Review Notes (writer)

- Every spec requirement is mapped to a task:
  - Create invoice → Task 12.
  - PCS manual/linked balance + draft → Tasks 12, 14.
  - Invoice code format & global sequence → Task 4 + Task 12.
  - Cash/Termin modal → Task 13.
  - Multiple file uploads per payment → Task 13.
  - Finance validation auto compute → Task 5 + Task 16.
  - Outstanding clamp & overpay warning → Task 5 + Task 13.
  - Work Order invoice status sync → Tasks 7, 12, 13.
  - Supabase schema + bucket → Task 1.
  - PNG image generation & filename sanitization → Tasks 14, 15.
  - Sidebar activation → Task 17.
- No placeholder strings. Code snippets intentionally omitted from the plan because they are mechanical once the contract and structure are specified; implementers can write them directly using the function names and field lists above.
- Type names (`InvoiceRow`, `InvoicePaymentRow`, etc.) are consistent across Tasks 6, 7, 8, 9, 12, 13, 16.