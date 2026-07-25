# Invoicing Module Design

## Overview

Build a dedicated **Invoicing** module under Finance for Livou Konveksi. The module creates and manages one invoice per finished Work Order, links invoice quantities to Production Monitoring, supports manual production quantity comparison, tracks cash or termin payments, uploads payment proof files to Supabase Storage, and downloads a formal client invoice as a PNG image.

This design follows the approved business rule: **one invoice = one Work Order**, and **one Work Order can have at most one invoice**.

## Goals

- Replace the current “Invoicing module coming soon” behavior with a working invoice table.
- Store invoice and payment data in Supabase.
- Link invoice rows to `work_orders.quantity` from Production Monitoring.
- Compare externally supplied manual PCS against linked Work Order Qty.
- Allow invoice draft generation even when PCS values are not balanced.
- Support Cash and Termin payment detail through a modal while keeping the invoice table at one row per invoice.
- Generate a formal invoice image for the client.

## Non-Goals

- Editing Work Order Qty from the invoice page.
- Multi-Work-Order invoices.
- More than one invoice per Work Order.
- Full accounting ledger or bank reconciliation.
- Email/WhatsApp invoice delivery.
- Displaying logo, address, WhatsApp, or email in the invoice image.

## User Flow

1. User opens **Finance → Invoicing**.
2. User clicks **Create Invoice**.
3. App opens an invoice form/modal.
4. User selects a Work Order from eligible Work Orders:
   - `productionStatus = FINISHING_COMPLETE`
   - no existing invoice for that Work Order
5. App auto-fills:
   - client name from Work Order brand
   - client code from brand mapping
   - linked PCS from `work_orders.quantity`
6. User fills:
   - billing type: Mass Production or Sample Production
   - manual PCS from the external Production module
   - nominal per PCS
   - invoice date
   - rate manpower, defaulting to Rp30.000/PCS but editable
7. App computes invoice fields.
8. User saves invoice.
9. User can open payment details from the invoice row.
10. User can download a PNG invoice image from the invoice row.

## Client and Billing Type Rules

### Client Mapping

Client is fixed from the selected Work Order brand:

| Work Order Brand | Client Name | Client Code |
|---|---|---|
| Livou | Livou | LVU |
| Cassca | Cassca | CSC |

If an unknown brand appears, the app should show a clear validation error until a client-code mapping is added.

### Billing Type

Billing type is selected with a dropdown:

| Label | Stored Value | Invoice Code Segment |
|---|---|---|
| Mass Production | `mass_production` | `MP` |
| Sample Production | `sample_production` | `SP` |

## Invoice Code Generation

Invoice code format:

```text
INV/{billingTypeCode}/{clientCode}/{DDMMYY}/{sequence}
```

Example:

```text
INV/MP/LVU/310725/001
```

Rules:

- `INV` is fixed.
- `MP`/`SP` comes from billing type.
- `LVU`/`CSC` comes from client mapping.
- Date segment uses invoice date in `DDMMYY` format.
- Sequence is global across all invoices.
- Sequence starts at `001`.
- Sequence does not reset per month, client, billing type, or year.

For downloaded files, slash characters are not filesystem-safe. The app should preserve slash formatting inside the app and invoice image, but download the PNG with a sanitized file name:

```text
INV_MP_LVU_310725_001.png
```

## Invoice Table Columns

The invoice table shows one row per invoice.

| Column | Source / Behavior |
|---|---|
| Bulan Tahun | Auto from invoice date, e.g. `Juli 2025` |
| Nama Client | Auto from selected Work Order brand |
| Jenis Tagihan | Dropdown: Mass Production / Sample Production |
| PCS Produksi Manual | Manual input from external Production module |
| PCS Produksi Linked | Auto from `work_orders.quantity` |
| PCS Balance Status | `Balance` or `Tidak Balance`, with difference |
| Nominal/PCS | Manual input |
| Kode Invoice | Auto-generated invoice code |
| Tgl Invoice | Manual date input |
| Total Tagihan | Computed |
| Nominal Pembayaran | Sum of payment detail amounts |
| Tgl Pembayaran | Cash date, or termin summary/latest date |
| Bukti Payment Client | Summary of uploaded proof files |
| Nominal Outstanding | Computed |
| Finance Validation | Auto-computed status |
| Rate Manpower | Default Rp30.000/PCS, editable |
| Rate Operational | Computed |
| Total Income Manpower | Computed |
| Total Income Operational | Computed |

## Quantity Balance Rules

There are two PCS fields:

- **PCS Produksi Manual**: typed by the user from the external Production module.
- **PCS Produksi Linked**: linked from Production Monitoring / selected Work Order Qty.

Rules:

- If manual PCS equals linked PCS, invoice is quantity-balanced.
- If manual PCS differs from linked PCS:
  - invoice can still be saved,
  - invoice can still be downloaded,
  - invoice is visually treated as draft,
  - invoice image shows `DRAFT — PCS TIDAK BALANCE`,
  - user must analyze which source is wrong.
- If manual PCS is wrong, the user edits manual PCS on the invoice until it balances.
- If linked PCS is wrong, the user must fix the Work Order/Production Monitoring data outside the invoice page.
- The invoice page must not edit linked Work Order Qty.

## Computed Field Rules

Use manual PCS for invoice financial calculations because it represents the invoice row’s entered production PCS. When it differs from linked PCS, the invoice is a draft/warning state until corrected or reviewed.

Formulas:

```text
total_tagihan = pcs_manual × nominal_per_pcs
nominal_pembayaran = sum(invoice payment detail amounts)
nominal_outstanding = total_tagihan - nominal_pembayaran
rate_operational = nominal_per_pcs - rate_manpower
total_income_manpower = pcs_manual × rate_manpower
total_income_operational = pcs_manual × rate_operational
```

Display outstanding as zero if overpaid, while showing an overpayment warning. Persisting a separate overpayment value is optional for the first implementation.

## Finance Validation Status

Finance validation is computed automatically.

Statuses:

1. **Need Register Invoice**
   - At least one required invoice field is empty or incomplete.
2. **Collect Payment**
   - Invoice registration fields are complete, but payment details are missing or incomplete.
3. **Partial Paid**
   - Payment details exist and are complete, but outstanding amount is greater than 0.
4. **Paid**
   - Payment details exist and are complete, and outstanding amount is 0.

PCS imbalance affects draft warning/state, but does not replace finance validation. The UI should show both the finance validation and the PCS balance status.

## Payment Modal

The invoice table remains one row per invoice. Payment details are edited in a modal opened from the row.

### Payment Type

The modal has a payment type selector:

- Cash
- Termin

Payment type can be changed after save.

### Cash

Cash mode has one payment detail row:

- payment date
- payment amount
- one or more payment proof files

### Termin

Termin mode supports multiple payment rows:

- termin number
- payment date
- payment amount
- one or more payment proof files per termin

### Table Summary After Save

After saving payment details, the invoice table shows:

- total nominal payment across all payment rows,
- payment date summary,
- count of uploaded proof files,
- recalculated outstanding,
- recalculated finance validation.

## Supabase Design

### `invoices`

One row per invoice.

Suggested fields:

- `id`
- `work_order_id`
- `month_year`
- `client_name`
- `client_code`
- `billing_type`
- `billing_type_code`
- `pcs_manual`
- `pcs_linked`
- `pcs_balance_status`
- `pcs_difference`
- `unit_price`
- `invoice_code`
- `invoice_date`
- `total_amount`
- `outstanding_amount`
- `finance_validation`
- `rate_manpower`
- `rate_operational`
- `total_income_manpower`
- `total_income_operational`
- `created_at`
- `updated_at`

Constraints:

- unique `work_order_id`
- unique `invoice_code`

### `invoice_payments`

Stores Cash or Termin detail rows.

Suggested fields:

- `id`
- `invoice_id`
- `payment_type`
- `termin_no`
- `payment_date`
- `amount`
- `created_at`
- `updated_at`

For Cash, use a single row with `termin_no = null` or `1`.

### `invoice_payment_files`

Stores uploaded proof metadata.

Suggested fields:

- `id`
- `payment_id`
- `file_name`
- `file_path`
- `file_url`
- `uploaded_at`

### Storage Bucket

Create a Supabase Storage bucket:

```text
invoice-payment-proofs
```

Use this for client payment proof files.

## App Integration

- Enable the `invoicing` sidebar item instead of showing “coming soon”.
- Add an Invoicing page/component.
- Fetch invoice rows from Supabase.
- Fetch eligible Work Orders from Supabase where:
  - `prod_status = FINISHING_COMPLETE`
  - no invoice exists for `work_order_id`
- Update Work Order invoice status based on invoice/payment state:
  - `INVOICED`
  - `PARTIAL_PAID`
  - `PAID`
- Upload payment proof files to Supabase Storage.
- Generate invoice PNG in the frontend from a formal template.

## Invoice Image Template

Each invoice row has a **Download Invoice** button.

The generated PNG should include:

### Header

- Business name: `Livou Konveksi`
- No logo
- No address
- No WhatsApp
- No email

### Invoice Identity

- invoice code
- invoice date
- month year
- client name
- billing type

### Billing Detail

- Work Code / Work Order detail
- product
- color
- size
- production PCS
- nominal per PCS
- total amount

### Payment Info

- bank account placeholder:

```text
BCA xxxxx a.n. JAN CHUN SIONG
```

- payment amount if available
- outstanding amount
- payment status

### Draft Warning

If manual PCS differs from linked PCS, show a prominent label/watermark:

```text
DRAFT — PCS TIDAK BALANCE
```

## Validation and Error Handling

### Invoice Form

- Work Order is required.
- Work Order must be `FINISHING_COMPLETE`.
- Work Order must not already have an invoice.
- Billing type is required.
- Invoice date is required.
- Manual PCS is required and must be greater than 0.
- Nominal/PCS is required and must be greater than 0.
- Rate manpower defaults to Rp30.000 and must be greater than or equal to 0.
- If nominal/PCS is lower than rate manpower, show a warning because rate operational is negative.

### Payment Modal

- Cash must have one payment row.
- Termin can have multiple payment rows.
- Each payment row requires:
  - payment date
  - amount greater than 0
- Payment proof files are allowed to be multiple.
- If total payment exceeds total amount, show a warning and require confirmation before save.
- Outstanding should not display as negative; display zero plus an overpayment warning.

### Download

- Download is allowed for drafts.
- Draft image must show the draft warning when PCS is not balanced.
- If image rendering fails, show a toast error and keep the invoice unchanged.

### Supabase

- All save/upload/delete operations must show success/error toasts.
- If RLS/policy blocks insert/update/upload, show the Supabase error clearly.
- If a file upload succeeds but payment save fails, show a retry/cleanup error so the user knows the payment was not fully saved.

## Testing / Verification

Verify end-to-end:

1. Invoicing menu opens the invoice table.
2. Create Invoice only lists eligible `FINISHING_COMPLETE` Work Orders without existing invoices.
3. Selecting a Work Order auto-fills client and linked PCS.
4. Invoice code generates as `INV/MP/LVU/DDMMYY/001` style with global sequence.
5. PCS mismatch saves as draft and shows `DRAFT — PCS TIDAK BALANCE` in downloaded image.
6. Cash payment updates nominal payment, date, outstanding, proof count, and finance validation.
7. Termin payment supports multiple rows and table summary stays one invoice row.
8. Payment proof upload writes files to Supabase Storage.
9. Paid and Partial Paid statuses calculate correctly.
10. Download button creates a PNG with the formal invoice template.

## Open Follow-Up Outside This Spec

- Replace `BCA xxxxx` with the final account number when known.
- Consider moving rate defaults and bank account details to Settings later.
