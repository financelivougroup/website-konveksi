# RAW DATA Master Table — Full Production Monitoring Columns

**Date:** 2026-08-17
**Status:** Approved for Implementation
**Approach:** A — Extend the RAW DATA table markup directly (no DB schema change)

## Overview

Promote the Production Monitoring **RAW DATA** tab into the single **master data
table** for production monitoring. Today the RAW tab shows only 10 columns
(checkbox, Product, Work Code, Brand, Qty, Cutting, Jahit, Finishing, Sisa,
Status). The database table `work_orders` already stores the full master
identity (`product_note`, `product_id`, `variation_id`,
`information_variation`, `warna`, `size`, `source_order_id`, `invoice_status`,
`created_by`, `created_at`) and the `kancing_records` table already tracks
button-attach quantities — but none of these reach the RAW tab. This change
expands the RAW table to surface **all** of that information in one place.

This is a **frontend-only** change. No database migration is required: every
column already exists in `work_orders` (verified via Supabase MCP) and is
already mapped in `workOrders.mapRow` and the `WorkOrder` type.

## Context Verified (Supabase MCP, 2026-08-17)

`public.work_orders` columns (all present and mapped):
`id`, `work_code`, `source_order_id`, `product_note`, `product`, `product_id`,
`variation_id`, `information_variation`, `warna`, `size`, `brand`, `quantity`,
`prod_status`, `invoice_status`, `created_by`, `created_at`, `pulled_at`.

`public.kancing_records` columns:
`work_order_id`, `work_code`, `pic_kancing`, `qty_kancing`, `tgl_laporan`,
`input_by`, `input_at`, `image_url`, `image_name`.

Live sample confirms master fields are populated, e.g.
`product_note = PDFF_LVU-TOP-02_B-00_PRDN`, `variation_id = LVU-TOP-02-BLK-M`,
`information_variation = "Colour: Black Size: M"`. One legacy row
(`WO-002`) has a `NULL` `product_note` and no `source_order_id`, which the
rendering rules below must tolerate.

## Requirements

### Functional Requirements

1. **One master table**: RAW DATA becomes the master data table. No new tab or
   page is created.
2. **21 columns** in the order defined below.
3. **Read-only columns**: The new master columns are display-only. Editing of
   work-order data is out of scope (RAW remains `editable: false` in the data
   module config; multi-select + bulk delete behavior is unchanged).
4. **No schema change**: No migration, no new Supabase object. All values come
   from data already fetched by the page (`workOrders`, `kancingRecords`,
   `productionOrders`).
5. **Search widened**: The shared `searchQuery` must additionally match
   `productNote`, `productId`, `variationId`, `informationVariation`, and
   `size` (in addition to the existing `workCode`, `product`, `brand`,
   `warna`).

### Column Definition (final order, 21 columns)

| # | Column | Source | Notes |
|---|--------|--------|-------|
| 1 | *(checkbox)* | — | unchanged multi-select |
| 2 | Product Note | `product_note` | mono, truncate + tooltip; `—` if null |
| 3 | Product | `product` | unchanged |
| 4 | Product ID | `product_id` | mono, truncate + tooltip; `—` if null |
| 5 | Variation ID | `variation_id` | mono, truncate + tooltip; `—` if null |
| 6 | Information Variation | `information_variation` | gray text, truncate + tooltip |
| 7 | Warna | `warna` | |
| 8 | Size | `size` | |
| 9 | Work Code | `work_code` | unchanged |
| 10 | Brand | `brand` | unchanged |
| 11 | Qty | `quantity` | unchanged |
| 12 | Cutting | Σ `cutting_records` | unchanged |
| 13 | Jahit | Σ `sewing_records.qty_selesai` | unchanged |
| 14 | Finishing | Σ `finishing_records.qty_finishing` | unchanged |
| 15 | Kancing | Σ `kancing_records.qty_kancing` | **new aggregate** |
| 16 | Sisa | `cutting − sewing` | unchanged |
| 17 | Status | `deriveStatus` | unchanged (StatusBadge) |
| 18 | Invoice Status | `invoice_status` | badge via `invoiceStatusLabel`/`invoiceStatusColor` |
| 19 | Source PO | `source_order_id` → PO `work_code` | `—` if none |
| 20 | Created At | `created_at` | `formatDate()` |
| 21 | Created By | `created_by` | `—` if null |

## Architecture & Implementation

### Single file touched

`src/pages/ProductionMonitoring.tsx`.

### 1. Kancing aggregate (`decoratedWO`)

Add `kancingTotal` to the per-WO decoration, mirroring the existing
`finishingTotal`:

```ts
function getKancingTotalLocal(woId: string) {
  return kancingRecords
    .filter(k => k.workOrderId === woId)
    .reduce((sum, r) => sum + (Number(r.qtyKancing) || 0), 0);
}
```

Include `kancingTotal` in the spread returned by the `decoratedWO` memo, and
add `kancingRecords` to its dependency array.

### 2. Source PO lookup

`productionOrderSvc.fetchAll()` is already awaited on mount (currently stored
as `planningOrders` after a `.filter(status === 'PLANNING')`). Store the
**unfiltered** list in a new `productionOrders` state and keep the existing
`planningOrders` derived value for the Pull-Order UI. Build a lookup:

```ts
const poWorkCodeById = useMemo(
  () => new Map(productionOrders.map(p => [p.id, p.workCode])),
  [productionOrders],
);
```

Source PO cell = `wo.sourceOrderId ? (poWorkCodeById.get(wo.sourceOrderId) ?? '—') : '—'`.

### 3. Cell rendering rules

- **Mono columns** (Product Note, Product ID, Variation ID):
  `font-mono text-[11px] text-gray-600 max-w-[200px] truncate` with a `title`
  attribute for the full value.
- **Information Variation**: `text-gray-500 truncate` with `title`.
- **Kancing**: same color treatment as Finishing —
  `>= quantity` → `text-emerald-600`, `> 0` → `text-amber-600`, `0` → `—`.
- **Invoice Status**: pill badge built from `invoiceStatusColor`/`invoiceStatusLabel`
  (both already exported from `src/types/pipeline.ts`). `NONE` renders as a
  neutral `—` (`text-gray-400`).
- **Created At**: `formatDate(wo.createdAt)` (existing helper in
  `src/data/pipelineData.ts`).
- **Created By / any null master field**: render `—` (`text-gray-300`) rather
  than blank or "null".

### 4. Search widening

In `filteredWO`, extend the predicate to include:
`productNote`, `productId`, `variationId`, `informationVariation`, `size`.
Guard each with `(field || '')` since these are nullable in the DB.

### 5. Layout

`T_WRAP` already applies `overflow-auto`, so a wider table scrolls
horizontally without extra work. The header is `whitespace-nowrap` via
`T_TH`. No change to the design-system tokens in `src/lib/tableStyles.ts`.

## Error Handling

Purely read-only, so failure modes are limited to rendering:
- Missing/null master fields → `—`.
- Kancing total absent → `0` → `—`.
- `source_order_id` with no matching PO (orphan/legacy) → `—`.
- No new DB writes; no migration; no RLS impact (reads already permitted).

## Testing & Verification

1. `npm run build` passes (TypeScript + Vite).
2. `npm run lint` — no **new** findings beyond pre-existing ones.
3. Manual check in the running app (dev server already live):
   - RAW DATA renders all 21 columns with real data.
   - Horizontal scroll works; header stays sticky.
   - Searching a `product_note` / `variation_id` fragment matches rows.
   - Kancing, Invoice Status, and Source PO columns populate correctly.
   - The legacy `NULL` `product_note` row (`WO-002`) renders `—` without
     breaking layout or search.
   - Multi-select + bulk delete still function.

## Out of Scope (explicit)

- Editing work-order master fields from the RAW tab.
- Any database migration or new DB object.
- Column show/hide, reorder, or CSV export (that would require migrating RAW
  to the generic DataTable — rejected approach C).
- Changes to the Cutting / Sewing / Finishing / Kancing Log tabs or Kanban.
