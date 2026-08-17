# RAW DATA Master Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the Production Monitoring RAW DATA tab into the master data table showing all 21 columns (master identity + production progress + finance/audit).

**Architecture:** Frontend-only change in `src/pages/ProductionMonitoring.tsx`. All columns already exist in `work_orders` (verified via Supabase MCP) and are mapped in `workOrders.mapRow`; `kancingRecords` is already loaded by the page. We add a kancing aggregate to `decoratedWO`, a Source-PO lookup map, widen search, and extend the table markup. No migration, no new Supabase object.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS, shadcn design tokens via `src/lib/tableStyles.ts`, Supabase-backed service layer (read-only here).

**Spec:** `docs/superpowers/specs/2026-08-17-raw-data-master-table-design.md`

## Global Constraints

- **No database changes.** No migration, no new table/view/column, no RLS edits. Everything reads data already fetched by the page.
- **Only `src/pages/ProductionMonitoring.tsx` may be modified** (plus `project.md` progress log at the end).
- Follow the existing design system tokens (`T_WRAP`, `T_TABLE`, `T_HEAD_ROW`, `T_TH`, `T_TD`, `rowClass` from `src/lib/tableStyles.ts`) — do not restyle the table.
- This repo has **no unit-test runner** (no vitest/jest). Verification idiom is `npm run build` (must be green), `npm run lint` (no NEW findings beyond pre-existing), and visual check in the running dev app.
- Nullable master fields (`product_note`, `product_id`, `variation_id`, `information_variation`, `source_order_id`, `created_by`) must render `—`, never blank or the text "null".
- Commit after each task with the exact messages given.

---

### Task 1: Data layer — kancing total, full production-order state, Source PO map, widened search

**Files:**
- Modify: `src/pages/ProductionMonitoring.tsx`
  - imports (lines 40–41)
  - state block (lines 276–283)
  - fetch effect (lines 292–304)
  - `filteredWO` memo (lines 306–310)
  - helpers + `decoratedWO` memo (lines 312–334)

**Interfaces:**
- Consumes: `kancingRecordSvc.fetchAll()` results in existing `kancingRecords` state (`KancingRecord[]`, fields `workOrderId`, `qtyKancing`); `productionOrderSvc.fetchAll()` result (`ProductionOrder[]`, fields `id`, `workCode`, `status`).
- Produces: `decoratedWO` rows gain `kancingTotal: number`; new memo `poWorkCodeById: Map<string, string>`; widened `filteredWO` predicate. Task 2 renders these.

- [ ] **Step 1: Extend imports**

Line 40 — add `ProductionOrder` to the type import:

```ts
import type { WorkOrder, SewingRecord, CuttingRecord, FinishingRecord, KancingRecord, ProductionStatus, ProductionOrder } from '@/types/pipeline';
```

Line 41 — add the invoice status label/color maps:

```ts
import { productionStatusLabel, productionStatusColor, invoiceStatusLabel, invoiceStatusColor } from '@/types/pipeline';
```

- [ ] **Step 2: Add full production-order state**

In the state block (after line 281, the `planningOrders` state), add:

```ts
const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([]);
```

(`planningOrders` stays — it feeds the Pull-Order UI.)

- [ ] **Step 3: Store unfiltered production orders in the fetch effect**

Replace line 301:

```ts
      if (po.data) setPlanningOrders(po.data.filter(p => p.status === 'PLANNING'));
```

with:

```ts
      if (po.data) {
        setProductionOrders(po.data);
        setPlanningOrders(po.data.filter(p => p.status === 'PLANNING'));
      }
```

- [ ] **Step 4: Widen the search predicate**

Replace the `filteredWO` memo body (lines 306–310):

```ts
  const filteredWO = useMemo(() => {
    if (!searchQuery) return workOrders;
    const q = searchQuery.toLowerCase();
    return workOrders.filter(w => w.workCode.toLowerCase().includes(q) || w.product.toLowerCase().includes(q) || w.brand.toLowerCase().includes(q) || w.warna.toLowerCase().includes(q));
  }, [workOrders, searchQuery]);
```

with:

```ts
  const filteredWO = useMemo(() => {
    if (!searchQuery) return workOrders;
    const q = searchQuery.toLowerCase();
    return workOrders.filter(w =>
      w.workCode.toLowerCase().includes(q) ||
      w.product.toLowerCase().includes(q) ||
      w.brand.toLowerCase().includes(q) ||
      (w.warna || '').toLowerCase().includes(q) ||
      (w.productNote || '').toLowerCase().includes(q) ||
      (w.productId || '').toLowerCase().includes(q) ||
      (w.variationId || '').toLowerCase().includes(q) ||
      (w.informationVariation || '').toLowerCase().includes(q) ||
      (w.size || '').toLowerCase().includes(q),
    );
  }, [workOrders, searchQuery]);
```

(`warna` gets the `|| ''` guard too because the column is nullable in the DB.)

- [ ] **Step 5: Add the kancing aggregate helper**

After `getFinishingTotalLocal` (line 314), add:

```ts
  function getKancingTotalLocal(woId: string) { return kancingRecords.filter(k => k.workOrderId === woId).reduce((sum, r) => sum + (Number(r.qtyKancing) || 0), 0); }
```

- [ ] **Step 6: Decorate with kancingTotal and build the Source PO map**

In the `decoratedWO` memo, replace:

```ts
        const finishingTotal = getFinishingTotalLocal(wo.id);
```

with:

```ts
        const finishingTotal = getFinishingTotalLocal(wo.id);
        const kancingTotal = getKancingTotalLocal(wo.id);
```

and replace the spread line:

```ts
        return { ...wo, cuttingTotal, sewingTotal, finishingTotal, derivedStatus: status };
```

with:

```ts
        return { ...wo, cuttingTotal, sewingTotal, finishingTotal, kancingTotal, derivedStatus: status };
```

and replace the dependency array:

```ts
  }, [filteredWO, cuttingRecords, sewingRecords, finishingRecords]);
```

with:

```ts
  }, [filteredWO, cuttingRecords, sewingRecords, finishingRecords, kancingRecords]);
```

After the `decoratedWO` memo, add the Source PO lookup:

```ts
  // Source PO column: work_orders.source_order_id → production_orders.work_code
  const poWorkCodeById = useMemo(
    () => new Map(productionOrders.map(p => [p.id, p.workCode] as const)),
    [productionOrders],
  );
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: PASS (no TypeScript errors — `kancingTotal` is inferred onto the decorated rows).

- [ ] **Step 8: Commit**

```bash
git add src/pages/ProductionMonitoring.tsx
git commit -m "feat(raw-master): data layer for master table (kancing total, PO map, wider search)"
```

---

### Task 2: Table markup — 21 columns in the RAW DATA tab

**Files:**
- Modify: `src/pages/ProductionMonitoring.tsx` — the RAW DATA `<table>` block (header lines ~542–553, empty-state line ~555, body lines ~556–571)

**Interfaces:**
- Consumes: `wo.kancingTotal` (number) and `poWorkCodeById` (Map) from Task 1; `invoiceStatusLabel`/`invoiceStatusColor` maps imported in Task 1; `formatDate` already imported (line 33).
- Produces: rendered 21-column master table (checkbox + 20 data columns).

- [ ] **Step 1: Replace the header row**

Replace the current header block:

```tsx
                <thead><tr className={T_HEAD_ROW}>
                  <th className={cn(T_TH, 'w-12 text-center')}><input type="checkbox" checked={selectedRows.size === decoratedWO.length && decoratedWO.length > 0} onChange={handleToggleAll} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></th>
                  <th className={cn(T_TH, 'text-left')}>Product</th>
                  <th className={cn(T_TH, 'text-left')}>Work Code</th>
                  <th className={cn(T_TH, 'text-left')}>Brand</th>
                  <th className={cn(T_TH, 'text-right')}>Qty</th>
                  <th className={cn(T_TH, 'text-right')}>Cutting</th>
                  <th className={cn(T_TH, 'text-right')}>Jahit</th>
                  <th className={cn(T_TH, 'text-right')}>Finishing</th>
                  <th className={cn(T_TH, 'text-right')}>Sisa</th>
                  <th className={cn(T_TH, 'text-center')}>Status</th>
                </tr></thead>
```

with:

```tsx
                <thead><tr className={T_HEAD_ROW}>
                  <th className={cn(T_TH, 'w-12 text-center')}><input type="checkbox" checked={selectedRows.size === decoratedWO.length && decoratedWO.length > 0} onChange={handleToggleAll} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></th>
                  <th className={cn(T_TH, 'text-left')}>Product Note</th>
                  <th className={cn(T_TH, 'text-left')}>Product</th>
                  <th className={cn(T_TH, 'text-left')}>Product ID</th>
                  <th className={cn(T_TH, 'text-left')}>Variation ID</th>
                  <th className={cn(T_TH, 'text-left')}>Information Variation</th>
                  <th className={cn(T_TH, 'text-left')}>Warna</th>
                  <th className={cn(T_TH, 'text-left')}>Size</th>
                  <th className={cn(T_TH, 'text-left')}>Work Code</th>
                  <th className={cn(T_TH, 'text-left')}>Brand</th>
                  <th className={cn(T_TH, 'text-right')}>Qty</th>
                  <th className={cn(T_TH, 'text-right')}>Cutting</th>
                  <th className={cn(T_TH, 'text-right')}>Jahit</th>
                  <th className={cn(T_TH, 'text-right')}>Finishing</th>
                  <th className={cn(T_TH, 'text-right')}>Kancing</th>
                  <th className={cn(T_TH, 'text-right')}>Sisa</th>
                  <th className={cn(T_TH, 'text-center')}>Status</th>
                  <th className={cn(T_TH, 'text-center')}>Invoice Status</th>
                  <th className={cn(T_TH, 'text-left')}>Source PO</th>
                  <th className={cn(T_TH, 'text-left')}>Created At</th>
                  <th className={cn(T_TH, 'text-left')}>Created By</th>
                </tr></thead>
```

- [ ] **Step 2: Fix the empty-state colspan**

Replace:

```tsx
                  {decoratedWO.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-[13px] text-gray-400">Tidak ada data work order</td></tr>}
```

with:

```tsx
                  {decoratedWO.length === 0 && <tr><td colSpan={21} className="py-10 text-center text-[13px] text-gray-400">Tidak ada data work order</td></tr>}
```

(21 = 1 checkbox + 20 data columns; matches the header cell count.)

- [ ] **Step 3: Replace the row cells**

Inside `decoratedWO.map`, keep the `sisa`/`selected` locals, and replace the cell sequence after the checkbox `<td>` with the full 21-column set:

```tsx
                    return <tr key={wo.id} className={rowClass(i, selected)}>
                      <td className={cn(T_TD, 'text-center')}><input type="checkbox" checked={selected} onChange={() => handleToggleRow(wo.id)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></td>
                      <td className={cn(T_TD, 'font-mono text-[11px] text-gray-600 max-w-[220px] truncate')} title={wo.productNote ?? undefined}>{wo.productNote || <span className="text-gray-300">—</span>}</td>
                      <td className={cn(T_TD, 'font-medium text-gray-900 max-w-[220px] truncate')} title={wo.product}>{wo.product}</td>
                      <td className={cn(T_TD, 'font-mono text-[11px] text-gray-600 max-w-[160px] truncate')} title={wo.productId ?? undefined}>{wo.productId || <span className="text-gray-300">—</span>}</td>
                      <td className={cn(T_TD, 'font-mono text-[11px] text-gray-600 max-w-[180px] truncate')} title={wo.variationId ?? undefined}>{wo.variationId || <span className="text-gray-300">—</span>}</td>
                      <td className={cn(T_TD, 'text-gray-500 max-w-[200px] truncate')} title={wo.informationVariation ?? undefined}>{wo.informationVariation || <span className="text-gray-300">—</span>}</td>
                      <td className={cn(T_TD, 'text-gray-700')}>{wo.warna || <span className="text-gray-300">—</span>}</td>
                      <td className={cn(T_TD, 'text-gray-700')}>{wo.size || <span className="text-gray-300">—</span>}</td>
                      <td className={cn(T_TD, 'text-gray-500 max-w-[200px] truncate')} title={wo.workCode}>{wo.workCode}</td>
                      <td className={cn(T_TD, 'text-gray-700')}>{wo.brand}</td>
                      <td className={cn(T_TD, 'text-right font-medium tabular-nums text-gray-900')}>{wo.quantity}</td>
                      <td className={cn(T_TD, 'text-right tabular-nums')}>{wo.cuttingTotal > 0 ? <span className="text-emerald-600 font-medium">{wo.cuttingTotal}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className={cn(T_TD, 'text-right tabular-nums')}>{wo.sewingTotal > 0 ? <span className={cn('font-medium', wo.sewingTotal >= wo.quantity ? 'text-emerald-600' : 'text-amber-600')}>{wo.sewingTotal}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className={cn(T_TD, 'text-right tabular-nums')}>{wo.finishingTotal > 0 ? <span className={cn('font-medium', wo.finishingTotal >= wo.quantity ? 'text-emerald-600' : 'text-amber-600')}>{wo.finishingTotal}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className={cn(T_TD, 'text-right tabular-nums')}>{wo.kancingTotal > 0 ? <span className={cn('font-medium', wo.kancingTotal >= wo.quantity ? 'text-emerald-600' : 'text-amber-600')}>{wo.kancingTotal}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className={cn(T_TD, 'text-right tabular-nums')}>{wo.cuttingTotal > 0 ? <span className={cn('font-medium', sisa === 0 ? 'text-emerald-600' : 'text-amber-600')}>{sisa}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className={cn(T_TD, 'text-center')}><StatusBadge status={wo.derivedStatus} /></td>
                      <td className={cn(T_TD, 'text-center')}>{wo.invoiceStatus === 'NONE' ? <span className="text-gray-300">—</span> : <span className={cn('inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap', invoiceStatusColor[wo.invoiceStatus])}>{invoiceStatusLabel[wo.invoiceStatus]}</span>}</td>
                      <td className={cn(T_TD, 'text-gray-500 max-w-[200px] truncate')} title={wo.sourceOrderId ? (poWorkCodeById.get(wo.sourceOrderId) ?? undefined) : undefined}>{wo.sourceOrderId ? (poWorkCodeById.get(wo.sourceOrderId) ?? <span className="text-gray-300">—</span>) : <span className="text-gray-300">—</span>}</td>
                      <td className={cn(T_TD, 'text-gray-500 whitespace-nowrap')}>{formatDate(wo.createdAt)}</td>
                      <td className={cn(T_TD, 'text-gray-700')}>{wo.createdBy || <span className="text-gray-300">—</span>}</td>
                    </tr>;
```

Notes for the implementer:
- `invoiceStatusColor` values already include background classes (e.g. `bg-blue-100 text-blue-700`) and `NONE` is `text-gray-400` — but `NONE` is short-circuited to `—` before the badge renders.
- `wo.invoiceStatus` is typed `InvoiceStatus`, so indexing both maps type-checks.
- `StatusBadge` is defined earlier in the same file (line ~50) — reuse it, do not create a second badge.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Verify lint (no new findings)**

Run: `npm run lint`
Expected: only pre-existing findings (the repo has known pre-existing lint problems; do not fix unrelated ones in this task). Confirm no NEW error/warning points at `ProductionMonitoring.tsx` beyond the pre-existing `react-hooks/set-state-in-effect` pattern.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ProductionMonitoring.tsx
git commit -m "feat(raw-master): expand RAW DATA tab to 21-column master table"
```

---

### Task 3: Visual verification in the running app + project.md progress log

**Files:**
- Modify: `project.md` — prepend a new entry to the "Latest Progress" section

**Interfaces:**
- Consumes: completed Tasks 1–2 and the dev server running at `http://localhost:3000/` (started earlier this session; restart with `npm run dev` if it died).
- Produces: verified behavior + updated progress log.

- [ ] **Step 1: Visual verification checklist**

Open `http://localhost:3000/` → log in as `owner` if required → Production Monitoring → RAW DATA tab. Confirm each item:

1. Header shows 21 cells: checkbox + Product Note, Product, Product ID, Variation ID, Information Variation, Warna, Size, Work Code, Brand, Qty, Cutting, Jahit, Finishing, Kancing, Sisa, Status, Invoice Status, Source PO, Created At, Created By.
2. Horizontal scroll works; header row stays sticky while scrolling vertically.
3. `WO-TEST-001` row: Product Note `PDFF_LVU-TOP-02_B-00_PRDN`, Product ID `LVU-TOP-02`, Variation ID `LVU-TOP-02-BLK-M`, Information Variation `Colour: Black Size: M`, Source PO shows the PO's work code (`Produksi - Awal | Rue Top | Black | M` — i.e. `PO-TEST-001`'s work_code).
4. `WO-002` row (legacy): Product Note and Source PO render `—` without breaking layout.
5. Kancing column shows `—` for all current rows (kancing_records is empty — verified via Supabase MCP).
6. Search `PDFF_LVU` filters down to matching rows; search `LVU-TOP-02-BLK` matches the Variation ID.
7. Multi-select checkboxes + Delete button still work (do NOT actually delete live rows — just confirm the UI state toggles; cancel/refresh afterwards).
8. Other tabs (Cutting/Sewing/Finishing/Kancing Log, Kanban) render unchanged.

If any item fails, fix before proceeding (and re-verify).

- [ ] **Step 2: Update project.md**

Prepend this entry at the top of the **Latest Progress** section in `project.md` (adjust commit hashes after committing):

```markdown
### 2026-08-17 — RAW DATA jadi tabel master production monitoring

- Tab RAW DATA kini menjadi tabel master: 21 kolom mencakup seluruh identitas master (Product Note, Product ID, Variation ID, Information Variation, Warna, Size) + progress produksi (Cutting, Jahit, Finishing, **Kancing** — agregat baru dari `kancing_records`) + finance/audit (Invoice Status badge, Source PO, Created At, Created By).
- Tidak ada perubahan skema database — semua kolom sudah ada di `work_orders` (diverifikasi via Supabase MCP); perubahan murni frontend di `ProductionMonitoring.tsx` (dekorasi `kancingTotal`, map Source PO `productionOrders`, pencarian diperluas mencakup product note/product id/variation id/size).
- Spec `docs/superpowers/specs/2026-08-17-raw-data-master-table-design.md`, plan `docs/superpowers/plans/2026-08-17-raw-data-master-table.md`.
```

- [ ] **Step 3: Final build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add project.md
git commit -m "docs: log RAW DATA master table expansion"
```
