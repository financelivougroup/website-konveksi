# Target Jahit Product Note Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membawa Product Note sebagai identitas produksi dari Planning Produksi sampai detail Target Jahit sehingga qty realisasi dan nominal tidak tercampur antar-produksi.

**Architecture:** Tambahkan kolom nullable `product_note` pada dua tabel live, tetapi wajibkan nilainya pada UI planning baru. Pusatkan pembentukan composite identity, grouping planning, dan perhitungan detail pada helper murni tanpa dependency Supabase agar dapat diuji TDD; service hanya memetakan data dan melakukan I/O, sedangkan halaman hanya membangun Work Order metadata dan merender hasil.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Tailwind CSS 3, existing shadcn/ui `Input`/`Dialog`/`Button`, Supabase Postgres melalui Supabase MCP, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-27-target-jahit-product-note-identity-design.md`

## Global Constraints

- Live Supabase schema adalah sumber kebenaran; schema sudah diinspeksi melalui Supabase MCP dan harus diverifikasi lagi setelah migration.
- Semua DDL dan verifikasi database dilakukan melalui Supabase MCP; jangan memakai SQL client ad-hoc.
- `product_note` nullable di database untuk kompatibilitas, tetapi UI Planning Produksi wajib menolaknya bila kosong.
- Detail baru diidentifikasi oleh tuple `productNote + product + warna`; jangan memakai concatenation delimiter yang dapat bertabrakan.
- Detail legacy tanpa Product Note tetap memakai fallback Product dan tidak boleh double-count sewing yang sudah cocok dengan detail baru.
- Harga per Product, rumus Target, Benefit, Utang Staf, dan akumulasi tidak berubah.
- Reuse komponen shadcn yang sudah ada; tidak perlu menambah primitive baru.
- Ikuti TDD: test gagal dahulu, lalu implementasi minimum, lalu test hijau.
- Update `project.md` Latest Progress setelah seluruh perubahan selesai.

## File Structure

- **Create** `src/lib/targetDetailIdentity.ts` — helper murni untuk composite key, grouping planning, dan distribusi realisasi detail dengan legacy fallback.
- **Create** `tests/targetDetailIdentity.test.ts` — regression tests helper identitas tanpa alias `@/` agar berjalan langsung dengan Node.
- **Create** `supabase/migrations/2026-08-27-target-jahit-product-note.sql` — catatan migration idempoten untuk dua kolom live.
- **Modify** `src/services/planningProduksi.ts` — mapping `product_note ↔ productNote`.
- **Modify** `src/services/targetJahitDetail.ts` — mapping `product_note ↔ productNote`.
- **Modify** `src/services/staffDebt.ts` — gunakan helper grouping dan insert Product Note saat Generate Target.
- **Modify** `src/lib/targetCompute.ts` — delegasikan realisasi detail ke helper murni dan terima metadata Work Order lengkap.
- **Modify** `src/pages/PlanningProduksiPage.tsx` — input, validasi, tabel, query tools, pencarian, dan export Product Note.
- **Modify** `src/pages/TargetJahitPage.tsx` — map Work Order identity dan kolom Product Note di overlay.
- **Modify** `project.md` — catat hasil, aturan legacy, migration, dan evidence verifikasi.

---

### Task 1: Pure Product Note Identity and Realization Helper

**Files:**
- Create: `src/lib/targetDetailIdentity.ts`
- Create: `tests/targetDetailIdentity.test.ts`

**Interfaces:**
- Consumes: data struktural yang memiliki Product Note, Product, Warna, qty; tidak mengimpor service atau Supabase.
- Produces:
  - `WorkOrderDesignIdentity`
  - `designIdentityKey(identity: WorkOrderDesignIdentity): string`
  - `groupPlannedTargetDetails(rows: PlannedTargetDetailInput[]): GroupedTargetDetail[]`
  - `calculateDetailRealizations(details, sewing, person, ym, workOrders): DetailRealization[]`

- [ ] **Step 1: Write failing grouping tests**

Create `tests/targetDetailIdentity.test.ts` with imports that intentionally fail before the helper exists:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateDetailRealizations,
  groupPlannedTargetDetails,
} from '../src/lib/targetDetailIdentity.ts';

test('memisahkan planning dengan Product Note berbeda', () => {
  const grouped = groupPlannedTargetDetails([
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qty: 20 },
    { productNote: 'Produksi 2', product: 'Dress', warna: 'Hitam', qty: 30 },
  ]);

  assert.deepEqual(grouped, [
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qty: 20 },
    { productNote: 'Produksi 2', product: 'Dress', warna: 'Hitam', qty: 30 },
  ]);
});

test('menggabungkan planning dengan tuple identitas yang sama', () => {
  const grouped = groupPlannedTargetDetails([
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qty: 20 },
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qty: 30 },
  ]);

  assert.deepEqual(grouped, [
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qty: 50 },
  ]);
});
```

- [ ] **Step 2: Run grouping tests and verify RED**

Run:

```bash
node --test tests/targetDetailIdentity.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/targetDetailIdentity.ts`. This is the expected RED because the production helper does not exist.

- [ ] **Step 3: Add failing realization tests before realization implementation**

Keep the same test file and add fixtures/tests:

```ts
const workOrders = new Map([
  ['wo-1', { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam' }],
  ['wo-2', { productNote: 'Produksi 2', product: 'Dress', warna: 'Hitam' }],
  ['wo-3', { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam' }],
]);

const sewing = [
  { workOrderId: 'wo-1', picPenjahit: 'Ayu', qtySelesai: 10, tanggalLaporan: '2026-08-05' },
  { workOrderId: 'wo-2', picPenjahit: 'Ayu', qtySelesai: 7, tanggalLaporan: '2026-08-06' },
  { workOrderId: 'wo-3', picPenjahit: 'Ayu', qtySelesai: 4, tanggalLaporan: '2026-08-07' },
];

test('memisahkan realisasi Product Note berbeda dan mengagregasi tuple yang sama', () => {
  const result = calculateDetailRealizations([
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qtyTarget: 20, hargaJahit: 1000, hargaObras: 500 },
    { productNote: 'Produksi 2', product: 'Dress', warna: 'Hitam', qtyTarget: 20, hargaJahit: 1000, hargaObras: 500 },
  ], sewing, 'Ayu', '2026-08', workOrders);

  assert.deepEqual(result, [
    { qtyRealisasi: 14, nilai: 21_000 },
    { qtyRealisasi: 7, nilai: 10_500 },
  ]);
});

test('detail legacy memakai fallback Product', () => {
  const result = calculateDetailRealizations([
    { productNote: null, product: 'Dress', warna: null, qtyTarget: 40, hargaJahit: 1000, hargaObras: 500 },
  ], sewing, 'Ayu', '2026-08', workOrders);

  assert.deepEqual(result, [{ qtyRealisasi: 21, nilai: 31_500 }]);
});

test('fallback legacy tidak menghitung ulang sewing yang sudah cocok dengan detail ber-Product Note', () => {
  const result = calculateDetailRealizations([
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qtyTarget: 20, hargaJahit: 1000, hargaObras: 500 },
    { productNote: null, product: 'Dress', warna: null, qtyTarget: 20, hargaJahit: 1000, hargaObras: 500 },
  ], sewing, 'Ayu', '2026-08', workOrders);

  assert.deepEqual(result, [
    { qtyRealisasi: 14, nilai: 21_000 },
    { qtyRealisasi: 7, nilai: 10_500 },
  ]);
});
```

The last test establishes the no-double-count rule: WO Produksi 1 is consumed by the precise detail; only unmatched Produksi 2 falls back to the legacy Product row.

- [ ] **Step 4: Implement the pure helper minimally**

Create `src/lib/targetDetailIdentity.ts`:

```ts
export interface WorkOrderDesignIdentity {
  productNote: string | null;
  product: string;
  warna: string | null;
}

export interface PlannedTargetDetailInput extends WorkOrderDesignIdentity {
  qty: number;
}

export interface GroupedTargetDetail extends PlannedTargetDetailInput {}

export interface TargetDetailIdentityInput extends WorkOrderDesignIdentity {
  qtyTarget: number;
  hargaJahit: number;
  hargaObras: number;
}

export interface SewingIdentityInput {
  workOrderId: string;
  picPenjahit: string;
  qtySelesai: number;
  tanggalLaporan: string;
}

export interface DetailRealization {
  qtyRealisasi: number;
  nilai: number;
}

export function designIdentityKey(identity: WorkOrderDesignIdentity): string {
  return JSON.stringify([
    identity.productNote ?? '',
    identity.product,
    identity.warna ?? '',
  ]);
}

export function groupPlannedTargetDetails(
  rows: PlannedTargetDetailInput[],
): GroupedTargetDetail[] {
  const grouped = new Map<string, GroupedTargetDetail>();
  for (const row of rows) {
    const key = designIdentityKey(row);
    const existing = grouped.get(key);
    if (existing) existing.qty += row.qty;
    else grouped.set(key, { ...row });
  }
  return Array.from(grouped.values());
}
```

Implement `calculateDetailRealizations` with this exact algorithm:

1. Build `preciseDetailKeys` from details whose `productNote` is non-empty.
2. Build `legacyProducts` from details whose `productNote` is null/empty.
3. Iterate sewing for matching `person` and `ym`, resolve Work Order metadata, then:
   - if its full identity key exists in `preciseDetailKeys`, aggregate into `qtyByPreciseKey`;
   - else if its Product exists in `legacyProducts`, aggregate into `qtyByLegacyProduct`;
   - else ignore it.
4. Build total Qty Target maps for precise keys and legacy Products.
5. Map details in input order and distribute each matching aggregate proportionally by `qtyTarget` among duplicate detail rows.
6. Return `{ qtyRealisasi: Math.round(totalQty * share), nilai: qtyRealisasi * (hargaJahit + hargaObras) }`.

Use `detail.productNote != null && detail.productNote !== ''` consistently; do not infer or backfill a missing note.

- [ ] **Step 5: Run helper tests and verify GREEN**

Run:

```bash
node --test tests/targetDetailIdentity.test.ts
```

Expected: 5 tests PASS, 0 FAIL.

- [ ] **Step 6: Commit the pure identity unit**

```bash
git add src/lib/targetDetailIdentity.ts tests/targetDetailIdentity.test.ts
git commit -m "feat(target-jahit): pisahkan detail berdasarkan product note" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Database Columns and Service Mapping

**Files:**
- Create: `supabase/migrations/2026-08-27-target-jahit-product-note.sql`
- Modify: `src/services/planningProduksi.ts:5-38,64-76`
- Modify: `src/services/targetJahitDetail.ts:5-38`
- Modify: `src/services/staffDebt.ts:198-224,250-260`
- Test: `tests/targetDetailIdentity.test.ts`

**Interfaces:**
- Consumes: `groupPlannedTargetDetails(rows)` from Task 1.
- Produces:
  - `PlanningProduksiRow.productNote: string | null`
  - `TargetJahitDetailRow.productNote: string | null`
  - generated `target_jahit_detail.product_note` values.

- [ ] **Step 1: Re-inspect migration target immediately before DDL**

Use Supabase MCP `list_tables` for schema `public`, verbose, and confirm both facts still hold:

- `planning_produksi` has no `product_note`.
- `target_jahit_detail` has no `product_note`.

If either differs, stop and reconcile the migration with the live schema before applying it.

- [ ] **Step 2: Write the idempotent migration file**

Create `supabase/migrations/2026-08-27-target-jahit-product-note.sql`:

```sql
-- Product Note identifies which production/restock a planning and target detail belongs to.
-- Nullable preserves legacy rows that cannot be backfilled reliably.

ALTER TABLE public.planning_produksi
  ADD COLUMN IF NOT EXISTS product_note TEXT;

ALTER TABLE public.target_jahit_detail
  ADD COLUMN IF NOT EXISTS product_note TEXT;
```

- [ ] **Step 3: Apply migration through Supabase MCP**

Call Supabase MCP `apply_migration` with:

- name: `target_jahit_product_note_identity`
- query: the exact SQL from the migration file.

Do not use `psql`, Supabase CLI SQL execution, or another SQL client.

- [ ] **Step 4: Verify live columns through Supabase MCP**

Call Supabase MCP `list_tables` for schema `public`, verbose. Confirm:

- `planning_produksi.product_note` is `text`, nullable, updatable.
- `target_jahit_detail.product_note` is `text`, nullable, updatable.

Do not insert permanent probe data.

- [ ] **Step 5: Map Product Note in planning service**

In `src/services/planningProduksi.ts`:

```ts
export interface PlanningProduksiRow {
  id: number
  namaPenjahit: string
  productNote: string | null
  product: string
  // existing fields
}
```

Add mappings:

```ts
productNote: (row.product_note as string | null) ?? null,
```

```ts
product_note: input.productNote,
```

```ts
if (updates.productNote !== undefined) fields.product_note = updates.productNote
```

Do not change other column mappings.

- [ ] **Step 6: Map Product Note in detail service**

In `src/services/targetJahitDetail.ts`, add `productNote: string | null` after `targetJahitId` and map both directions:

```ts
productNote: (row.product_note as string | null) ?? null,
```

```ts
product_note: input.productNote,
```

- [ ] **Step 7: Replace generator's delimiter grouping with pure tuple grouping**

In `src/services/staffDebt.ts`:

1. Import:

```ts
import { groupPlannedTargetDetails } from '@/lib/targetDetailIdentity'
```

2. Change per-staff temporary storage from a Product map to an array of identity rows:

```ts
plans: Array<{
  productNote: string | null;
  product: string;
  warna: string | null;
  qty: number;
}>;
```

3. For every planning row, push:

```ts
staff.plans.push({
  productNote: (r.product_note as string | null) ?? null,
  product,
  warna,
  qty,
});
```

4. Before detail insert:

```ts
const groupedDetails = groupPlannedTargetDetails(staff.plans);
const details = groupedDetails.map((p) => {
  const price = priceMap[p.product];
  return {
    target_jahit_id: parent.id as number,
    product_note: p.productNote,
    product: p.product,
    warna: p.warna,
    qty_target: p.qty,
    qty_realisasi: 0,
    harga_jahit: price ? price.jahit : 0,
    harga_obras: price ? price.obras : 0,
  };
});
```

Keep `totalQty`, `targetCost`, approved-only filtering, and idempotency unchanged.

- [ ] **Step 8: Run tests and TypeScript build**

Run:

```bash
node --test tests/targetDetailIdentity.test.ts tests/staffDebtEligibility.test.ts
npm run build
```

Expected: all Node tests PASS; build exits 0. Fix type errors only within this task's interfaces/call sites.

- [ ] **Step 9: Commit migration and services**

```bash
git add supabase/migrations/2026-08-27-target-jahit-product-note.sql src/services/planningProduksi.ts src/services/targetJahitDetail.ts src/services/staffDebt.ts
git commit -m "feat(target-jahit): persist product note pada planning dan detail" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Planning Produksi Product Note Input and Table

**Files:**
- Modify: `src/pages/PlanningProduksiPage.tsx:35-51,105-159,192-225,297-395`

**Interfaces:**
- Consumes: `PlanningProduksiRow.productNote` and existing shadcn `Input`, `Label`, `Dialog`, `Button`.
- Produces: validated Product Note in create/update payload plus visible/queryable/exportable Product Note table field.

- [ ] **Step 1: Add Product Note to form state and payload**

Extend `PlanningForm` and `EMPTY_FORM`:

```ts
interface PlanningForm {
  namaPenjahit: string;
  productNote: string;
  product: string;
  // existing fields
}

const EMPTY_FORM: PlanningForm = {
  namaPenjahit: '',
  productNote: '',
  product: '',
  // existing fields
};
```

Populate edit state:

```ts
productNote: item.productNote ?? '',
```

Require a trimmed value:

```ts
const isValid = form.namaPenjahit && form.productNote.trim() && form.product && form.qty && form.bulanTarget;
```

Update validation copy:

```ts
'❌ Lengkapi Nama Penjahit, Product Note, Produk, Qty, dan Bulan Target.'
```

Add to payload:

```ts
productNote: form.productNote.trim(),
```

- [ ] **Step 2: Add Product Note input using existing shadcn Input**

Place this field immediately before Product in the modal:

```tsx
<div>
  <Label htmlFor="productNote">Product Note *</Label>
  <Input
    id="productNote"
    type="text"
    value={form.productNote}
    onChange={(e) => setField('productNote', e.target.value)}
    placeholder="e.g. Produksi 2"
    className="mt-1"
  />
</div>
```

Retain existing Product/Warna/Size inputs and layout; do not create a new component.

- [ ] **Step 3: Add Product Note to table tools and search**

Insert before Product in `PLAN_FIELDS`:

```ts
{ key: 'productNote', label: 'Product Note' },
```

Extend search:

```ts
r.productNote?.toLowerCase().includes(q)
```

Keep null-safe optional chaining for legacy rows.

- [ ] **Step 4: Add Product Note to CSV export**

Use this exact order:

```ts
const header = ['Nama Penjahit', 'Product Note', 'Product', 'Warna', 'Size', 'Qty', 'Bulan Target', 'Status'];
```

Add `r.productNote ?? ''` before `r.product` in every exported data row.

- [ ] **Step 5: Render Product Note before Product**

Update `HiddenColgroup`:

```tsx
<HiddenColgroup hidden={hiddenCols} cols={['namaPenjahit', 'productNote', 'product', 'warna', 'size', 'qty', 'bulanTarget', 'status']} />
```

Add header and cell before Product:

```tsx
<th className={cn(T_TH, 'text-left')}>Product Note</th>
```

```tsx
<td className={cn(T_TD, 'text-gray-700')}>
  {r.productNote || <span className="text-gray-300">—</span>}
</td>
```

Change empty-state `colSpan` from 8 to 9.

- [ ] **Step 6: Run focused lint and build**

Run:

```bash
npx eslint src/pages/PlanningProduksiPage.tsx src/services/planningProduksi.ts
npm run build
```

Expected: no new lint category from Product Note changes and build exits 0. If the file has a known baseline finding, compare against `git show HEAD^:src/pages/PlanningProduksiPage.tsx` or report it explicitly rather than suppressing it.

- [ ] **Step 7: Commit Planning UI**

```bash
git add src/pages/PlanningProduksiPage.tsx
git commit -m "feat(planning): wajibkan identitas product note" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Target Jahit Realization Wiring and Overlay Column

**Files:**
- Modify: `src/lib/targetCompute.ts:1-4,118-159,166-174,221-229`
- Modify: `src/pages/TargetJahitPage.tsx:240-265,304-309,693-787`
- Test: `tests/targetDetailIdentity.test.ts`

**Interfaces:**
- Consumes:
  - `calculateDetailRealizations` and `WorkOrderDesignIdentity` from Task 1.
  - `TargetJahitDetailRow.productNote` from Task 2.
  - existing Work Order `productNote`, `product`, `warna` from `workOrderSvc.fetchAll()`.
- Produces: Product Note-separated realization cost and Product Note column in the overlay.

- [ ] **Step 1: Delegate enrichDetails to the pure helper**

In `src/lib/targetCompute.ts`, import:

```ts
import {
  calculateDetailRealizations,
  type WorkOrderDesignIdentity,
} from '@/lib/targetDetailIdentity';
```

Delete the private `sewingQtyByProduct` function. Change `enrichDetails` to:

```ts
export function enrichDetails(
  details: TargetJahitDetailRow[],
  sewing: SewingRecord[],
  person: string,
  ym: string,
  workOrderDesign: Map<string, WorkOrderDesignIdentity>,
): { qtyRealisasi: number; nilai: number }[] {
  return calculateDetailRealizations(
    details,
    sewing,
    person,
    ym,
    workOrderDesign,
  );
}
```

Change `enrichTargetRows` parameter from `workOrderProduct: Map<string, string>` to:

```ts
workOrderDesign: Map<string, WorkOrderDesignIdentity>
```

Pass `workOrderDesign` to `enrichDetails`. Keep monthly parent realization logic unchanged.

- [ ] **Step 2: Build Work Order metadata in Target Jahit Page**

Import the type:

```ts
import type { WorkOrderDesignIdentity } from '@/lib/targetDetailIdentity';
```

Replace state:

```ts
const [workOrderDesign, setWorkOrderDesign] = useState<Map<string, WorkOrderDesignIdentity>>(new Map());
```

Replace refresh mapping:

```ts
setWorkOrderDesign(new Map(
  (wo.data ?? []).map((w) => [
    w.id,
    {
      productNote: w.productNote || null,
      product: w.product,
      warna: w.warna || null,
    },
  ] as const),
));
```

Use `workOrderDesign` and dependency `[items, sewing, workOrderDesign, prices, details, libur]` in `allEnriched`.

- [ ] **Step 3: Pass metadata to overlay detail enrichment**

Replace:

```ts
const enrichedD = enrichDetails(myDetails, sewing, src.nama, src.bulan_tahun, woProduct);
```

with:

```ts
const enrichedD = enrichDetails(
  myDetails,
  sewing,
  src.nama,
  src.bulan_tahun,
  workOrderDesign,
);
```

- [ ] **Step 4: Render Product Note before Product in the overlay**

Add before Product header:

```tsx
<th className={cn(T_TH, 'text-left')}>Product Note</th>
```

Add before Product cell:

```tsx
<td className={cn(T_TD, 'text-gray-700')}>
  {d.productNote || <span className="text-gray-300">—</span>}
</td>
```

Do not gate Product Note behind `canSeeDebt`; only Harga and Nilai remain monetary-role gated.

- [ ] **Step 5: Run identity tests and build**

Run:

```bash
node --test tests/targetDetailIdentity.test.ts tests/staffDebtEligibility.test.ts
npm run build
```

Expected: all tests PASS and build exits 0. Confirm the prior `Map<string, string>` call sites no longer exist:

```bash
# Use the Grep tool, not shell grep:
# pattern: woProduct|workOrderProduct
# paths: src/lib/targetCompute.ts and src/pages/TargetJahitPage.tsx
```

Expected: no stale matches.

- [ ] **Step 6: Run focused lint and compare baseline**

Run:

```bash
npx eslint src/lib/targetDetailIdentity.ts src/lib/targetCompute.ts src/pages/TargetJahitPage.tsx src/services/targetJahitDetail.ts
```

Expected: new helper/service clean. If `TargetJahitPage.tsx` still reports its known conditional-hook and `no-explicit-any` baseline findings, verify they predate this branch and report them without broad refactoring.

- [ ] **Step 7: Commit Target Jahit compute and overlay**

```bash
git add src/lib/targetCompute.ts src/pages/TargetJahitPage.tsx
git commit -m "feat(target-jahit): tampilkan realisasi per product note" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Final Verification and Project Progress

**Files:**
- Modify: `project.md:200+` (Latest Progress; preserve all concurrent entries)

**Interfaces:**
- Consumes: completed migration, tests, service/UI changes from Tasks 1–4.
- Produces: fresh verification evidence and durable project context for future sessions.

- [ ] **Step 1: Verify live schema one final time**

Use Supabase MCP `list_tables`, schema `public`, verbose. Record that both Product Note columns exist and are nullable text fields. Do not mutate user data.

- [ ] **Step 2: Run the complete available Node test suite**

Because the repository has no `npm test` script, run all current Node test files explicitly:

```bash
node --test tests/*.test.ts
```

Expected: all tests PASS, 0 FAIL. Report the exact test count from output.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: TypeScript and Vite exit 0. Record module count and warnings separately; chunk-size warnings do not equal build failure.

- [ ] **Step 4: Run lint for all changed source/test files**

```bash
npx eslint src/lib/targetDetailIdentity.ts src/lib/targetCompute.ts src/services/planningProduksi.ts src/services/targetJahitDetail.ts src/services/staffDebt.ts src/pages/PlanningProduksiPage.tsx src/pages/TargetJahitPage.tsx tests/targetDetailIdentity.test.ts
```

Expected: no new finding caused by Product Note. Record pre-existing findings separately with file/rule/line and compare with the branch baseline when necessary.

- [ ] **Step 5: Inspect diff and scope**

Run:

```bash
git status --short
git diff --check
git diff --stat HEAD~4..HEAD
```

Then inspect the actual diff. Acceptance checklist:

- migration only adds nullable Product Note columns;
- service mappings are bidirectional;
- generator grouping includes Product Note;
- Planning Product Note is required and operationally visible;
- overlay order starts Product Note → Product → Warna;
- realization uses tuple identity with legacy fallback;
- no Target/Benefit/Utang formula changes;
- no unrelated files changed.

- [ ] **Step 6: Update Latest Progress without overwriting concurrent documentation**

Add a newest-first entry to `project.md`:

```markdown
### 2026-08-27 — Target Jahit: Product Note menjadi identitas produksi

- Planning Produksi menyimpan dan mewajibkan Product Note untuk data baru; tabel/search/filter/sort/kolom/export ikut menampilkannya.
- `planning_produksi` dan `target_jahit_detail` mendapat kolom nullable `product_note` melalui migration `2026-08-27-target-jahit-product-note.sql` yang diterapkan via Supabase MCP.
- Generate Target memisahkan detail berdasarkan tuple Product Note + Product + Warna; tuple identik tetap mengakumulasi Qty Target.
- Rincian Realisasi per Desain menampilkan Product Note sebelum Product dan menghitung Qty Realisasi/nominal per identitas Work Order yang sama.
- Data legacy tanpa Product Note tetap tampil `—` dengan fallback Product yang tidak double-count sewing yang sudah cocok ke detail beridentitas.
- Verifikasi: [isi exact test count], build [exit/module count], lint [hasil/baseline].
```

Read the current `project.md` immediately before editing and preserve every entry added by other sessions.

- [ ] **Step 7: Commit progress documentation**

```bash
git add project.md
git commit -m "docs: catat identitas product note Target Jahit" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 8: Fresh final status check**

Run:

```bash
git status --short
git log -6 --oneline
```

Expected: clean working tree and a clear sequence of Product Note implementation commits. Do not merge or push until the user chooses an integration option.

---

## Manual Smoke Checklist (when authenticated app data is available)

The automated tasks above are required. If an authenticated local session is available without altering unrelated data, additionally verify:

1. Open Planning Produksi create modal and confirm Product Note is before Product and required.
2. Confirm legacy planning rows render `—` without crashing.
3. For approved planning generated after migration, open Target Jahit and click the corresponding staff row.
4. Confirm overlay header order is Product Note, Product, Warna, Qty Target, Qty Realisasi, Progress, then monetary columns for owner/finance.
5. Confirm Product Note remains visible for inventory while monetary columns remain hidden.
6. Do not create permanent smoke-test records unless the user explicitly authorizes modifying their live local data.
