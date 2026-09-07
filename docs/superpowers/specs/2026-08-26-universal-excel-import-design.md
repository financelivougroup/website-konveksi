# Universal Excel Import — Design Specification

**Date:** 2026-08-26  
**Status:** Approved for implementation planning  
**Scope:** RAW DATA / Work Order, Planning Produksi, Register Karyawan, Register PO, Complain & Penalti, and Target Jahit

## 1. Purpose

Replace the current mock Import buttons with a real, consistent bulk-import workflow. A user can download a module-specific Excel template, fill many rows, upload the file, review validation results, and import valid rows without creating records one at a time.

The system must preserve existing business flows, prevent accidental overwrites, report invalid rows clearly, and avoid partially-created parent/child records.

## 2. Product Decisions

The following decisions are approved:

- Import is implemented for all six modules in scope.
- Valid rows are imported even when other rows in the same file fail.
- Duplicate rows are skipped; existing database records are never overwritten.
- Each module has a separate template file.
- Missing references reject the affected row; master/reference records are never created automatically.
- File selection is followed by validation and preview. No data is written until the user explicitly confirms.
- RAW DATA import creates a Production Order and automatically pulls it into a linked Work Order.
- Imported records use safe system defaults instead of accepting workflow status from Excel.
- RAW DATA identifiers—Work Code, Product ID, and Variation ID—come from Excel and are preserved exactly after trimming.
- Complain evidence photos are added later through the existing edit flow; the import does not upload photos.
- Target Jahit import goes through Planning Produksi as draft data, followed by the existing approve-and-generate flow.
- Register PO uses one Excel row per Production Order, with component-cost columns across that row.

## 3. Technical Approach

Use one shared import engine with a module adapter for each import target.

### 3.1 Shared engine responsibilities

The shared engine handles:

1. module-specific template download;
2. `.xlsx`, `.xls`, and `.csv` parsing in the browser;
3. sheet and header normalization;
4. generic required/type/range validation;
5. module adapter validation and reference lookup;
6. duplicate detection against both the file and live database data;
7. preview grouped into Valid, Duplicate, and Error states;
8. explicit import confirmation;
9. progress reporting;
10. final result reporting and downloadable error report.

The engine does not know the business schema of any module. That knowledge stays in module adapters.

### 3.2 Module adapter responsibilities

Each adapter declares:

- module identifier and display label;
- template filename and sheet metadata;
- accepted headers and aliases;
- required and optional fields;
- data normalization rules;
- row-level validation;
- live reference data needed for validation;
- duplicate key calculation;
- preview columns;
- persistence function;
- human-readable error messages.

This creates a stable boundary: the dialog can change without changing module rules, and a module rule can change without duplicating dialog logic.

## 4. UI and shadcn Requirements

The import UI must use existing shadcn primitives. No custom modal shell is introduced.

Expected primitives:

- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`;
- `Button`;
- `Input` for file selection where appropriate;
- `Tabs` for All / Valid / Duplicate / Error views;
- `Table` or the existing centralized table style tokens for preview;
- `Badge` for row state;
- `Progress` for import progress;
- `Alert` or existing message styling for file-level warnings.

The toolbar Import button becomes a normal clickable action independent of selected table rows. Table selection remains reserved for bulk actions on existing records, such as deletion.

## 5. File Format and Limits

### 5.1 Supported file types

- `.xlsx`
- `.xls`
- `.csv`

SheetJS (`xlsx`) is loaded dynamically when import or template generation is used, to avoid adding it to the initial application bundle.

### 5.2 Workbook structure

Every downloadable workbook contains:

- **Data** sheet — headers and one example row;
- **Petunjuk** sheet — column definitions, required/optional status, format, accepted values, and examples.

When reading a workbook:

- prefer a sheet named `Data`, case-insensitive;
- if it does not exist, parse the first sheet and show a warning;
- ignore completely blank rows;
- reject a workbook with no usable rows;
- accept at most 2,000 non-empty data rows per import attempt;
- reject larger files and instruct the user to split them.

CSV has one data table and therefore does not carry a Petunjuk sheet.

### 5.3 Header normalization

For matching only:

- trim outer whitespace;
- compare case-insensitively;
- collapse repeated internal whitespace;
- support explicitly declared adapter aliases.

Unknown columns are ignored but shown as a warning. Missing required columns are a file-level validation error that prevents import confirmation.

## 6. Shared Row States

Every parsed row has one of these states:

- **valid** — ready to persist;
- **duplicate** — already exists in the database or duplicates an earlier valid row in the same file;
- **error** — cannot be imported because one or more validation rules fail;
- **imported** — persisted successfully;
- **failed** — passed preview validation but persistence failed;
- **skipped** — became a duplicate during the pre-insert recheck.

Duplicate rows are not treated as failures and never overwrite existing records.

## 7. Import Dialog Flow

### 7.1 Choose file

Opening Import displays:

- title `Import Data — [Module]`;
- `Pilih File Excel` action;
- `Download Template` action;
- supported-format and 2,000-row guidance.

Only one file can be processed at a time.

### 7.2 Validate and preview

After parsing, display counts:

- total non-empty rows;
- valid;
- duplicate;
- error.

Preview tabs:

1. All;
2. Valid;
3. Duplicate;
4. Error.

Each preview row includes:

- source Excel row number;
- adapter-defined identifying columns;
- state badge;
- one or more reasons for duplicate/error states.

Preview uses pagination. The user can replace the file before importing.

### 7.3 Confirm and persist

The confirmation label is `Import N Baris Valid` and is disabled when no rows are valid.

During persistence:

- disable file replacement and repeated confirmation;
- display processed/total progress;
- require confirmation before closing an active import;
- recheck duplicate identity immediately before persistence;
- process each logical source row independently;
- do not stop remaining rows when one row fails.

### 7.4 Result

At completion show:

- imported count;
- skipped/duplicate count;
- failed count.

Actions:

- `Tutup & Refresh Tabel`;
- `Download Laporan Error`;
- `Import File Lain`.

The downloadable report includes the original row number, original uploaded values, final state, and reasons. Users can correct and upload it again; successful rows will then be skipped as duplicates.

## 8. Shared Normalization Rules

- Trim outer whitespace from all text.
- Preserve user-facing code casing and punctuation after trimming.
- Match references and duplicate keys case-insensitively.
- Normalize dates to `YYYY-MM-DD`.
- Accept Excel numeric cells and text numbers such as `10000` and Indonesian thousands formatting such as `10.000`.
- Reject negative monetary values.
- Reject fractional quantities where an integer quantity is required.
- Read formula cells from their cached calculated result; if no cached result exists, reject the affected cell with an explanation.
- Ignore workflow-status columns if supplied and warn that system defaults are used.

## 9. Module Contracts

### 9.1 RAW DATA / Work Order

#### Template columns

| Column | Required | Rule |
|---|---:|---|
| Work Code | Yes | Non-empty; preserved from Excel |
| Product Note | No | Text |
| Product | Yes | Non-empty |
| Product ID | Yes | Non-empty; preserved from Excel |
| Variation ID | Yes | Non-empty; preserved from Excel |
| Information Variation | No | Text |
| Warna | Yes | Non-empty |
| Size | Yes | Non-empty |
| Brand | Yes | Non-empty |
| Qty | Yes | Integer greater than zero |

#### Duplicate key

Normalized Work Code, case-insensitive, checked against:

- `production_orders.work_code`;
- `work_orders.work_code`;
- earlier valid rows in the same file.

#### Persistence

One valid source row atomically:

1. creates `production_orders` using the Excel identity and product fields;
2. records that order as `PULLED` with the current authenticated display name and current timestamp;
3. creates a linked `work_orders` row with `source_order_id` referencing the Production Order;
4. sets Work Order production status to `NEW` and invoice status to `NONE`.

The Product ID and Variation ID from Excel are written to Work Order. The current manual pull formula must not replace them.

If any step fails, no record from that source row remains.

### 9.2 Planning Produksi

#### Template columns

| Column | Required | Rule |
|---|---:|---|
| Nama Penjahit | Yes | Must match an active Register Karyawan record whose position is Penjahit |
| Product | Yes | Non-empty |
| Warna | No | Text |
| Size | No | Text |
| Qty | Yes | Integer greater than zero |
| Bulan Target | Yes | `YYYY-MM` |

Status is always `draft` and is not taken from Excel.

#### Duplicate key

Case-insensitive normalized combination of:

- Nama Penjahit;
- Product;
- Warna;
- Size;
- Bulan Target.

Check both live Planning data and earlier valid file rows.

### 9.3 Register Karyawan

#### Template columns

| Column | Required | Rule |
|---|---:|---|
| Nama Karyawan | Yes | Non-empty |
| Posisi | Yes | One of Leader, Penjahit, Finishing |

Status is always `Aktif` and is not taken from Excel.

#### Duplicate key

Normalized Nama Karyawan, case-insensitive, checked against live Register Karyawan data and earlier valid file rows.

### 9.4 Register PO

#### Template columns

| Column | Required | Rule |
|---|---:|---|
| Work Code | Yes | Must resolve to a linked PULLED Production Order without Register PO |
| Potong | No | Number >= 0 |
| Jahit | No | Number >= 0 |
| Obras | No | Number >= 0 |
| Finishing | No | Number >= 0 |
| Operational | No | Number >= 0 |
| Material Basic | No | Number >= 0 |
| Margin | No | Number >= 0 |
| Jasa Pasang Kancing | No | Number >= 0 |
| Notes | No | Text |

At least one of the eight component costs must be greater than zero. `total_per_pcs` is calculated from the component sum and never accepted from Excel.

#### Duplicate key

Resolved Production Order ID, checked against `register_po.production_order_id` and earlier valid file rows.

#### Persistence

One source row atomically:

1. creates `register_po` for the resolved Production Order;
2. creates one child in `register_po_components` for each component greater than zero;
3. stores `total_per_pcs` as the component sum;
4. stores optional Notes.

If parent or any child creation fails, no data from that source row remains.

### 9.5 Complain & Penalti

#### Template columns

| Column | Required | Rule |
|---|---:|---|
| Tanggal | Yes | Valid date |
| Work Code | Yes | Must match a live Work Order |
| PIC | Yes | Must match Register Karyawan |
| Posisi | Yes | Must be a supported complain position and agree with the matched PIC where current business rules require it |
| Tingkat | Yes | One of Ringan, Sedang, Berat, normalized to current service keys |
| Potongan/PCS | Yes | Number >= 0 |
| Detail Complain | Yes | Non-empty |

Product and Warna are derived from the matched Work Order. Poin is derived from Tingkat. Status is `NEED PROCEED`. `input_by` comes from the authenticated profile. Photos are not imported and can be added through the existing edit flow.

#### Duplicate key

Case-insensitive normalized combination of:

- Tanggal;
- Work Code;
- PIC;
- Tingkat;
- Detail Complain.

Check live Complain data and earlier valid file rows.

### 9.6 Target Jahit

Target Jahit Import uses the Planning Produksi template and adapter. Valid rows are persisted to Planning Produksi as `draft`.

The dialog result explicitly states:

> Data disimpan sebagai Planning draft. Approve Planning lalu gunakan Generate Target untuk membuat Target Jahit.

The import must not write directly to `target_jahit` or `target_jahit_detail`.

## 10. Database and Service Boundaries

### 10.1 Mandatory schema verification

Before implementation of database calls or migrations, inspect the relevant live schema through Supabase MCP. TypeScript types and historical migration files are not sufficient evidence.

### 10.2 Atomic operations

RAW DATA and Register PO require database functions/RPCs because they create parent/child or source/derived records that must commit or roll back together.

Expected RPC boundaries:

- import one Production Order + linked Work Order atomically;
- import one Register PO + component children atomically.

RPCs validate duplicates and references again inside the transaction. Application-side preview validation improves UX but is not the final integrity boundary.

Schema-qualified table access, constrained inputs, and explicit execution grants must follow existing local Supabase conventions. The implementation plan must include inspection of current RLS policies and function security posture before migration design.

### 10.3 Flat module services

Planning, Register Karyawan, and Complain use `src/services/` persistence functions. Bulk helpers may be added, but pages must not write directly to Supabase.

Target Jahit delegates to the Planning import service.

## 11. Failure and Recovery Behavior

- A failure in one logical source row does not prevent other valid rows from importing.
- A dropped network connection leaves already committed rows intact and marks uncommitted rows failed or unprocessed.
- An expired login stops processing and instructs the user to sign in again.
- Duplicate identity is checked during preview and immediately before persistence.
- Atomic RPCs prevent partial RAW DATA and Register PO rows.
- Import results remain visible until the user closes or starts another import.
- Closing during an active import requires confirmation; closing does not roll back already committed rows.

## 12. Implementation Sequence

1. Add SheetJS and shared parsing/normalization/template utilities.
2. Build the shared shadcn Import Dialog and adapter contract.
3. Implement Register Karyawan adapter and persistence.
4. Implement Planning Produksi adapter and persistence.
5. Implement RAW DATA atomic RPC, service wrapper, and adapter.
6. Implement Register PO atomic RPC, service wrapper, and adapter.
7. Implement Complain adapter without photo upload.
8. Wire Target Jahit Import to the Planning adapter with explicit draft/generate messaging.
9. Remove all mock selection-based Import handlers.
10. Run build, targeted lint, parser/validator tests, database verification, and manual browser walkthroughs with valid, duplicate, mixed-error, and over-limit files.

This sequence establishes the reusable engine on flat modules before integrating transactional flows.

## 13. Testing and Acceptance Criteria

### 13.1 Shared engine

- Downloads a valid module-specific `.xlsx` template with Data and Petunjuk sheets.
- Reads `.xlsx`, `.xls`, and `.csv`.
- Correctly handles header case and whitespace variations.
- Rejects missing required columns and files over 2,000 rows.
- Classifies valid, duplicate, and error rows before persistence.
- Does not write before explicit confirmation.
- Shows accurate progress and final counts.
- Produces an error report that can be corrected and re-uploaded.

### 13.2 Module behavior

- Register Karyawan rejects invalid positions and skips duplicate names.
- Planning rejects unknown/inactive/non-Penjahit staff and always creates draft rows.
- RAW DATA preserves Excel Work Code/Product ID/Variation ID, creates linked PO+WO records, and leaves nothing behind after a forced transactional failure.
- Register PO resolves PULLED PO by Work Code, sums exactly eight supported components, and rolls back parent/children together on failure.
- Complain derives product/warna/poin/status and creates no photo record.
- Target Jahit imports Planning drafts only and never inserts target tables directly.

### 13.3 Regression protection

- Existing create/edit/delete flows remain functional.
- Existing Export actions continue working.
- Table selection continues to support bulk actions but no longer controls Import.
- No persistent module data is mutated directly in page components.
- `npm run build` passes.
- Targeted lint introduces no new findings compared with baseline.

## 14. Out of Scope

- Updating existing records from Excel.
- Automatic creation of missing master/reference records.
- Importing Complain photo files or photo URLs.
- Direct import into Target Jahit parent/detail tables.
- Background server job queues.
- Files larger than 2,000 rows per attempt.
- Cross-module multi-sheet master import.
- Rollback of rows that were successfully committed before a later network/session failure.
