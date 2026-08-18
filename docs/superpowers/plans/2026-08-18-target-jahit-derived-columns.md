# Target Jahit Derived Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 22 columns of the Target Jahit table live-computed (workdays, daily targets, realization, accumulation, status) plus expandable per-design realization rows.

**Architecture:** Pure computation lib (`src/lib/targetCompute.ts`, no fetches) wired by `TargetJahitPage.tsx`, which fetches the source tables in parallel and enriches rows in a `useMemo`. No DB migration — all columns already exist; nothing is written back to the DB (live compute, same pattern as `deriveStatus`).

**Tech Stack:** React 19 + TypeScript, Tailwind, design tokens in `src/lib/tableStyles.ts`, Supabase-backed services (read-only here).

**Spec:** `docs/superpowers/specs/2026-08-18-target-jahit-derived-columns-design.md`

## Global Constraints

- **No database changes.** All values computed client-side at render; Generate Target unchanged.
- This repo has **no unit-test runner**. Verification idiom: `npm run build` green, `npm run lint` no NEW finding types, manual check in the running app.
- Workweek = **Mon–Sat** minus `daftar_libur` entries. `target_ngebut_hari = ceil(sisa_target_monthly ÷ sisa_hari)` (0 when sisa_hari = 0).
- Status values exactly: `'Berjalan'` (current month), `'Tercapai'` (past month, realisasi ≥ target), `'Tidak Tercapai'` (past month, short). Same for accumulation (row counts as current when its own month is current).
- Rounding: `target_daily` 1 decimal (integer if whole), `target_ngebut_hari` integer ceil, percent 1 decimal, cost integer rupiah.
- Access rules unchanged: inventory never sees salary/cost/accumulation columns nor price/value columns in the detail sub-table (reuse existing `visibleColumns` / `canSeeDebt`).
- Commit after each task with the given messages.

---

### Task 1: Pure computation lib `src/lib/targetCompute.ts`

**Files:**
- Create: `src/lib/targetCompute.ts`

**Interfaces:**
- Consumes: `TargetJahitRow` (`src/services/targetJahit.ts`), `SewingRecord` (`src/types/pipeline.ts`: `workOrderId`, `picPenjahit`, `qtySelesai`, `tglLaporan`), `TargetJahitDetailRow` (`src/services/targetJahitDetail.ts`), `PriceMap` (`src/services/staffDebt.ts`).
- Produces (used by Task 3):
  - `countWorkdays(ym, holidays): number`
  - `elapsedWorkdays(ym, holidays, today): number`
  - `monthIsCurrent(ym, today): boolean`, `monthIsPast(ym, today): boolean`
  - `finalStatus(realisasi, target, isCurrent, isPast): string`
  - `enrichTargetRows(rows, sewing, workOrderProduct, prices, details, holidays, today): EnrichedTargetRow[]`
  - `enrichDetails(details, sewing, person, ym, workOrderProduct): { qtyRealisasi: number; nilai: number }[]` (aligned by index with `details`)
  - `EnrichedTargetRow` = `TargetJahitRow & { totalHariKerja, hariKerjaHariIni, sisaHari, targetDaily, targetNgebutHari, realisasiMonthly, sisaTargetMonthly, progressMonthly, realisasiCostPosisi, targetAccum, realisasiAccum, selisihAccum, targetNgebutHariAkumulasi, progressAccum, statusFinal, statusFinalAkumulasi }` (all numbers except the two status strings)

- [ ] **Step 1: Write the lib**

```ts
import type { SewingRecord } from '@/types/pipeline';
import type { TargetJahitRow } from '@/services/targetJahit';
import type { TargetJahitDetailRow } from '@/services/targetJahitDetail';
import type { PriceMap } from '@/services/staffDebt';

// ===== Workdays: Mon–Sat minus daftar_libur =====

/** 'YYYY-MM' -> { year, month (1-12) } or null. */
export function parseYm(ym: string): { year: number; month: number } | null {
  const m = ym.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Total Mon–Sat days of the month, minus holidays ('YYYY-MM-DD' strings). */
export function countWorkdays(ym: string, holidays: string[]): number {
  const p = parseYm(ym);
  if (!p) return 0;
  const holidaySet = new Set(holidays);
  let n = 0;
  for (let d = 1; d <= daysInMonth(p.year, p.month); d++) {
    const dow = new Date(p.year, p.month - 1, d).getDay(); // 0 = Sunday
    if (dow === 0) continue;
    if (holidaySet.has(dateKey(p.year, p.month, d))) continue;
    n++;
  }
  return n;
}

export function monthIsCurrent(ym: string, today: Date): boolean {
  return ym === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

export function monthIsPast(ym: string, today: Date): boolean {
  const p = parseYm(ym);
  if (!p) return false;
  return p.year < today.getFullYear() || (p.year === today.getFullYear() && p.month < today.getMonth() + 1);
}

/** Workdays of the month up to and including today (0 for future months, full total for past). */
export function elapsedWorkdays(ym: string, holidays: string[], today: Date): number {
  const p = parseYm(ym);
  if (!p) return 0;
  if (monthIsPast(ym, today)) return countWorkdays(ym, holidays);
  if (!monthIsCurrent(ym, today)) return 0; // future month
  const holidaySet = new Set(holidays);
  let n = 0;
  for (let d = 1; d <= today.getDate(); d++) {
    const dow = new Date(p.year, p.month - 1, d).getDay();
    if (dow === 0) continue;
    if (holidaySet.has(dateKey(p.year, p.month, d))) continue;
    n++;
  }
  return n;
}

export function finalStatus(realisasi: number, target: number, isCurrent: boolean, isPast: boolean): string {
  if (isCurrent || (!isPast && !isCurrent)) {
    // current or future months are still 'Berjalan'
    return 'Berjalan';
  }
  return realisasi >= target && target > 0 ? 'Tercapai' : 'Tidak Tercapai';
}

// ===== Enrichment =====

export interface EnrichedTargetRow extends TargetJahitRow {
  totalHariKerja: number;
  hariKerjaHariIni: number;
  sisaHari: number;
  targetDaily: number;
  targetNgebutHari: number;
  realisasiMonthly: number;
  sisaTargetMonthly: number;
  progressMonthly: number; // 0..1
  realisasiCostPosisi: number;
  targetAccum: number;
  realisasiAccum: number;
  selisihAccum: number;
  targetNgebutHariAkumulasi: number;
  progressAccum: number; // 0..1
  statusFinal: string;
  statusFinalAkumulasi: string;
}

/** Map sewing records -> WO product via workOrderProduct (wo.id -> product). */
function sewingQtyByProduct(sewing: SewingRecord[], person: string, ym: string, workOrderProduct: Map<string, string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sewing) {
    if (s.picPenjahit !== person) continue;
    if (!String(s.tglLaporan ?? '').startsWith(ym)) continue;
    const product = workOrderProduct.get(s.workOrderId);
    if (!product) continue;
    out.set(product, (out.get(product) ?? 0) + (Number(s.qtySelesai) || 0));
  }
  return out;
}

function monthlyRealisasi(sewing: SewingRecord[], person: string, ym: string): number {
  let n = 0;
  for (const s of sewing) {
    if (s.picPenjahit !== person) continue;
    if (!String(s.tglLaporan ?? '').startsWith(ym)) continue;
    n += Number(s.qtySelesai) || 0;
  }
  return n;
}

/**
 * Per-design realization: detail rows sharing a product split that product's
 * sewing qty proportionally to qtyTarget (covers multi-colour per product).
 */
export function enrichDetails(details: TargetJahitDetailRow[], sewing: SewingRecord[], person: string, ym: string, workOrderProduct: Map<string, string>): { qtyRealisasi: number; nilai: number }[] {
  const byProduct = sewingQtyByProduct(sewing, person, ym, workOrderProduct);
  const targetByProduct = new Map<string, number>();
  for (const d of details) targetByProduct.set(d.product, (targetByProduct.get(d.product) ?? 0) + d.qtyTarget);
  return details.map((d) => {
    const totalQty = byProduct.get(d.product) ?? 0;
    const totalTarget = targetByProduct.get(d.product) ?? 0;
    const share = totalTarget > 0 ? d.qtyTarget / totalTarget : details.length > 0 ? 1 / details.length : 0;
    const qtyRealisasi = Math.round(totalQty * share);
    const nilai = qtyRealisasi * (d.hargaJahit + d.hargaObras);
    return { qtyRealisasi, nilai };
  });
}

/**
 * Enrich all rows of ONE person at a time is handled internally: this function
 * processes every row, computing accumulation across that person's months
 * (rows sorted by bulan_tahun ascending for accumulation ordering).
 */
export function enrichTargetRows(
  rows: TargetJahitRow[],
  sewing: SewingRecord[],
  workOrderProduct: Map<string, string>,
  prices: PriceMap,
  details: TargetJahitDetailRow[],
  holidays: string[],
  today: Date,
): EnrichedTargetRow[] {
  const sorted = [...rows].sort((a, b) => a.bulan_tahun.localeCompare(b.bulan_tahun));
  const accumByPerson = new Map<string, { target: number; realisasi: number }>();

  return sorted.map((row) => {
    const ym = row.bulan_tahun;
    const person = row.nama;
    const totalHariKerja = countWorkdays(ym, holidays);
    const hariKerjaHariIni = elapsedWorkdays(ym, holidays, today);
    const sisaHari = Math.max(0, totalHariKerja - hariKerjaHariIni);
    const targetMonthly = Number(row.target_monthly) || 0;
    const targetDaily = totalHariKerja > 0 ? targetMonthly / totalHariKerja : 0;

    const realisasiMonthly = monthlyRealisasi(sewing, person, ym);
    const sisaTargetMonthly = Math.max(0, targetMonthly - realisasiMonthly);
    const progressMonthly = targetMonthly > 0 ? realisasiMonthly / targetMonthly : 0;
    const targetNgebutHari = sisaHari > 0 ? Math.ceil(sisaTargetMonthly / sisaHari) : 0;

    // Realization cost: prefer detail prices, fall back to price map.
    const myDetails = details.filter((d) => d.targetJahitId === row.id);
    const enrichedDetails = enrichDetails(myDetails, sewing, person, ym, workOrderProduct);
    let realisasiCostPosisi = 0;
    enrichedDetails.forEach((e, i) => {
      const d = myDetails[i];
      const price = (d.hargaJahit || 0) + (d.hargaObras || 0) || ((prices[d.product] ? prices[d.product].jahit + prices[d.product].obras : 0));
      realisasiCostPosisi += e.qtyRealisasi * price;
    });

    const isCurrent = monthIsCurrent(ym, today);
    const isPast = monthIsPast(ym, today);
    const statusFinal = finalStatus(realisasiMonthly, targetMonthly, isCurrent, isPast);

    // Accumulation across this person's months up to this row.
    const acc = accumByPerson.get(person) ?? { target: 0, realisasi: 0 };
    acc.target += targetMonthly;
    acc.realisasi += realisasiMonthly;
    accumByPerson.set(person, acc);
    const targetAccum = acc.target;
    const realisasiAccum = acc.realisasi;
    const selisihAccum = realisasiAccum - targetAccum;
    const progressAccum = targetAccum > 0 ? realisasiAccum / targetAccum : 0;
    const statusFinalAkumulasi = finalStatus(realisasiAccum, targetAccum, isCurrent, isPast);
    // 'Ngebut' for the accumulation only makes sense in the current month.
    const targetNgebutHariAkumulasi = isCurrent && sisaHari > 0 ? Math.ceil(Math.max(0, targetAccum - realisasiAccum) / sisaHari) : 0;

    return {
      ...row,
      totalHariKerja,
      hariKerjaHariIni,
      sisaHari,
      targetDaily,
      targetNgebutHari,
      realisasiMonthly,
      sisaTargetMonthly,
      progressMonthly,
      realisasiCostPosisi,
      targetAccum,
      realisasiAccum,
      selisihAccum,
      targetNgebutHariAkumulasi,
      progressAccum,
      statusFinal,
      statusFinalAkumulasi,
    };
  });
}
```

Notes for the implementer:
- `TargetJahitRow.bulan_tahun` is stored as `'YYYY-MM'` (verified: the generated row stores the picker value directly).
- `tglLaporan` from the sewing service is `'YYYY-MM-DD'` (date column) — `startsWith(ym)` is safe.
- `finalStatus` for a future month returns 'Berjalan' too (defensive; generation is per future month from planning).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/targetCompute.ts
git commit -m "feat(target-jahit): pure computation lib for derived columns"
```

---

### Task 2: Add `fetchAll` to the target_jahit_detail service

**Files:**
- Modify: `src/services/targetJahitDetail.ts`

**Interfaces:**
- Produces: `fetchAll(): Promise<{ data: TargetJahitDetailRow[] | null; error: Error | null }>` — Task 3 fetches all details once instead of per-row.

- [ ] **Step 1: Add the function** (after `listByTargetId`):

```ts
export async function fetchAll(): Promise<{ data: TargetJahitDetailRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true })
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/targetJahitDetail.ts
git commit -m "feat(target-jahit): add fetchAll to detail service"
```

---

### Task 3: Wire enrichment + expandable rows into TargetJahitPage

**Files:**
- Modify: `src/pages/TargetJahitPage.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 1–2, plus existing services `daftarLibur.fetchAll`, `sewingRecords.fetchAll`, `workOrders.fetchAll`, `buildPriceMap` from `staffDebt`.
- Produces: rendered live values for all 22 columns + ▸/▾ expandable per-design sub-table.

- [ ] **Step 1: Imports**

Add to the existing imports:

```ts
import * as daftarLiburSvc from '@/services/daftarLibur';
import * as sewingRecordSvc from '@/services/sewingRecords';
import * as workOrderSvc from '@/services/workOrders';
import * as targetJahitDetailSvc from '@/services/targetJahitDetail';
import { buildPriceMap } from '@/services/staffDebt';
import { enrichTargetRows, enrichDetails, type EnrichedTargetRow } from '@/lib/targetCompute';
import type { SewingRecord } from '@/types/pipeline';
import type { DaftarLiburRow } from '@/services/daftarLibur';
import type { TargetJahitDetailRow } from '@/services/targetJahitDetail';
import { ChevronDown, ChevronRight } from 'lucide-react';
```

- [ ] **Step 2: State + fetch**

Add state:

```ts
const [libur, setLibur] = useState<DaftarLiburRow[]>([]);
const [sewing, setSewing] = useState<SewingRecord[]>([]);
const [details, setDetails] = useState<TargetJahitDetailRow[]>([]);
const [woProduct, setWoProduct] = useState<Map<string, string>>(new Map());
const [prices, setPrices] = useState<Record<string, { jahit: number; obras: number }>>({});
const [expandedId, setExpandedId] = useState<number | null>(null);
```

Replace the existing `refresh`:

```ts
const refresh = useCallback(async () => {
  setLoading(true);
  const [t, l, s, d, wo, pm] = await Promise.all([
    fetchAllTarget(), daftarLiburSvc.fetchAll(), sewingRecordSvc.fetchAll(),
    targetJahitDetailSvc.fetchAll(), workOrderSvc.fetchAll(), buildPriceMap(),
  ]);
  setItems(t.data ?? []);
  setLibur(l.data ?? []);
  setSewing(s.data ?? []);
  setDetails(d.data ?? []);
  setWoProduct(new Map((wo.data ?? []).map((w) => [w.id, w.product] as const)));
  setPrices(pm);
  setLoading(false);
}, []);
```

- [ ] **Step 3: Enriched rows**

Replace the existing `filtered` memo with an enriched chain (search moves here, operating on enriched rows):

```ts
const enriched = useMemo(() => {
  const holidays = libur.map((r) => r.tanggal);
  const all = enrichTargetRows(items, sewing, woProduct, prices, details, holidays, new Date());
  if (!search) return all;
  const q = search.toLowerCase();
  return all.filter((d) =>
    [d.bulan_tahun, d.nama, d.posisi ?? '', String(d.salary), d.status_final ?? '', d.status_final_akumulasi ?? '']
      .some((v) => String(v).toLowerCase().includes(q)),
  );
}, [items, libur, sewing, woProduct, prices, details, search]);
```

Then change `normalized` to enrich-first — `normalizeTargetRow` copies every own property (aliasing snake_case ones), so the extra camelCase enriched fields flow through untouched:

```ts
const normalized = useMemo(
  () => applySorts(applyFilters(enriched.map(normalizeTargetRow), filters), sorts),
  [enriched, filters, sorts],
);
```

(Remove the old `filtered` memo and keep any consumer of `filtered.length` for the counter/empty-state pointed at `normalized.length` / `enriched.length` as appropriate: counter shows `normalized.length`, empty-state distinguishes `enriched.length === 0` vs filter-no-match.)

- [ ] **Step 4: Column rendering — live values + status badges**

Update `renderCell` to handle:
- `targetDaily`: 1 decimal unless whole (`v % 1 === 0 ? v : v.toFixed(1)`)
- `targetNgebutHari` / `targetNgebutHariAkumulasi` / day counts / `sisaTargetMonthly` / `selisihAccum`: integers
- `realisasiMonthly` / `realisasiAccum` / `targetAccum` / `targetMonthly`: integers (tabular)
- `progressMonthly` / `progressAccum`: `${(v*100).toFixed(1)}%`
- `realisasiCostPosisi`: `formatCurrency`
- `statusFinal` / `statusFinalAkumulasi`: badge — 'Berjalan' → `bg-blue-100 text-blue-700`, 'Tercapai' → `bg-emerald-100 text-emerald-700`, 'Tidak Tercapai' → `bg-rose-100 text-rose-700`

- [ ] **Step 5: Expandable rows**

Add an expand column BEFORE the checkbox column in the header and body:

Header:
```tsx
<th className={cn(T_TH, 'w-8')} />
```

Body row start:
```tsx
<td className={cn(T_TD, 'text-center')}>
  <button onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === Number(row.id) ? null : Number(row.id)); }} className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Lihat realisasi per desain">
    {expandedId === Number(row.id) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
  </button>
</td>
```

After the main `</tr>` of each row, render the expanded sub-table (as a sibling `<tr>` with a single full-colspan `<td>`):

```tsx
{expandedId === Number(row.id) && (
  <tr>
    <td colSpan={visibleColumns.length + 2} className="bg-slate-50 px-6 py-3 border-b border-[#E5E7EB]">
      {(() => {
        const src = enriched.find((r) => r.id === Number(row.id));
        if (!src) return null;
        const myDetails = details.filter((d) => d.targetJahitId === Number(row.id));
        const enrichedD = enrichDetails(myDetails, sewing, src.nama, src.bulan_tahun, woProduct);
        if (myDetails.length === 0) return <p className="text-[12px] text-slate-400">Tidak ada rincian desain untuk bulan ini.</p>;
        return (
          <table className={cn(T_TABLE, 'w-auto')}>
            <thead><tr className={T_HEAD_ROW}>
              <th className={cn(T_TH, 'text-left')}>Product</th>
              <th className={cn(T_TH, 'text-left')}>Warna</th>
              <th className={cn(T_TH, 'text-right')}>Qty Target</th>
              <th className={cn(T_TH, 'text-right')}>Qty Realisasi</th>
              {canSeeDebt && <th className={cn(T_TH, 'text-right')}>Harga Jahit+Obras</th>}
              {canSeeDebt && <th className={cn(T_TH, 'text-right')}>Nilai Realisasi</th>}
            </tr></thead>
            <tbody>
              {myDetails.map((d, di) => (
                <tr key={d.id} className={rowClass(di)}>
                  <td className={cn(T_TD, 'text-gray-700')}>{d.product}</td>
                  <td className={cn(T_TD, 'text-gray-700')}>{d.warna || <span className="text-gray-300">—</span>}</td>
                  <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{d.qtyTarget}</td>
                  <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{enrichedD[di].qtyRealisasi}</td>
                  {canSeeDebt && <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatCurrency(d.hargaJahit + d.hargaObras)}</td>}
                  {canSeeDebt && <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatCurrency(enrichedD[di].nilai)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })()}
    </td>
  </tr>
)}
```

Since rows now render two `<tr>`s, wrap each row's output in a `<Fragment key={String(row.id)}>` instead of keying only the main `<tr>`.

Update empty-state colspan from `visibleColumns.length + 1` to `visibleColumns.length + 2`.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/TargetJahitPage.tsx
git commit -m "feat(target-jahit): live derived columns + expandable per-design realization"
```

---

### Task 4: Manual verification + project.md

**Files:**
- Modify: `project.md`

- [ ] **Step 1: Visual checklist** (dev server at `http://localhost:3000`, login as `owner`)

1. Target Jahit tab: the existing 2026-09 row now shows filled values — Bulan Tahun 'September 2026', Hari Kerja Efektif (Mon–Sat count of September minus daftar_libur), Target Daily, Realisasi (0 until sewing entries exist), Status Final 'Berjalan'.
2. Add a sewing entry via Sewing Entry Form for 'Sidik Faisal' (Mira Dress WO) → back to Target Jahit → Refresh: Realisasi Monthly, Progress, Sisa, Realisasi Cost, and accumulation values update.
3. Click ▸ on the row → sub-table shows Mira Dress with Qty Target 30 and the realized qty matching the sewing entry.
4. Switch to `inventory` login → salary/cost/accumulation columns hidden, and the Harga/Nilai columns in the expanded detail are hidden.
5. Filter/Sort/Kolom/Export still work on the live values (e.g. sort by Progress Monthly desc).

- [ ] **Step 2: Update project.md** — prepend a new Latest Progress entry describing the live columns, formulas (Mon–Sat minus libur; ngebut = ceil(sisa÷sisa hari); Berjalan/Tercapai/Tidak), the expandable detail, and the no-migration approach, with the commit hash.

- [ ] **Step 3: Final build + commit**

```bash
npm run build
git add project.md
git commit -m "docs: log target jahit derived columns go-live"
```
