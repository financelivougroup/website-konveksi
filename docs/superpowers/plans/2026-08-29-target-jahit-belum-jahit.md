# Target Jahit Belum Jahit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyembunyikan dua kolom hari kerja dari seluruh permukaan UI Target Jahit tanpa mengubah perhitungannya, menambahkan Sisa Uang yang Harus Dikejar per bulan untuk Owner/Finance, dan menambahkan daftar global Belum Jahit yang dikelompokkan per Product Note.

**Architecture:** Semua aritmetika backlog dan sisa uang ditempatkan pada helper murni `src/lib/sewingBacklog.ts` tanpa dependency Supabase sehingga dapat diuji TDD dengan Node test runner. Service `registerPo.ts` hanya menambah satu fungsi fetch tarif eksak per Production Order. `TargetJahitPage.tsx` hanya memanggil helper melalui `useMemo`, menyimpan state UI, dan merender — tidak mengandung algoritma grouping atau tarif.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Tailwind CSS 3, Node built-in test runner (`node --test`), Supabase JS melalui service layer existing.

**Spec:** `docs/superpowers/specs/2026-08-29-target-jahit-belum-jahit-design.md`

## Global Constraints

- Tidak ada migration, DDL, perubahan schema, view, RPC, atau penulisan data produksi.
- Tidak mengubah rumus Target, Benefit, Utang Staf, akumulasi, atau Target Ngebut.
- `totalHariKerja` dan `hariKerjaHariIni` tetap dihasilkan `enrichTargetRows()`; hanya definisi kolom UI yang dihapus.
- Tarif backlog wajib dari `work_orders.source_order_id → register_po.production_order_id → register_po_components(key IN ['jahit','obras'])`. Dilarang memakai `buildPriceMap()` (latest price by product) untuk backlog.
- Inventory boleh melihat seluruh data backlog termasuk tarif; Inventory tidak boleh melihat Sisa Uang yang Harus Dikejar.
- Fitur sepenuhnya baca-saja: tidak ada input simulasi, rekomendasi, penyimpanan, atau pemindahan alokasi.
- Ikuti TDD: test gagal dahulu, implementasi minimum, lalu test hijau.
- Repositori tidak memiliki script `npm test`; jalankan file test eksplisit dengan `node --test`.
- Update `project.md` Latest Progress setelah seluruh perubahan selesai dan terverifikasi.

## File Structure

- **Create** `src/lib/sewingBacklog.ts` — helper murni: agregasi Qty Jahit, Total Belum Jahit, grouping Product Note, ringkasan Product/tarif, sorting, dan Sisa Uang bulanan.
- **Create** `tests/sewingBacklog.test.ts` — regression test helper murni, tanpa alias `@/` agar berjalan langsung dengan Node.
- **Modify** `src/services/registerPo.ts` — tambah `fetchSewingRatesByProductionOrder()`.
- **Modify** `src/pages/TargetJahitPage.tsx` — hapus dua kolom hari kerja, hapus `WorkdaysWithTooltip`, tambah tab Belum Jahit, tambah kartu Sisa Uang dan ringkasan backlog pada overlay.
- **Modify** `src/data/mockData.ts` — hapus dua entri kolom hari kerja dari `viewConfig['target-jahit']`.
- **Modify** `project.md` — catat hasil dan evidence verifikasi.

---

### Task 1: Helper Murni Backlog dan Sisa Uang

**Files:**
- Create: `src/lib/sewingBacklog.ts`
- Create: `tests/sewingBacklog.test.ts`

**Interfaces:**
- Consumes: `WorkOrder` dan `SewingRecord` dari `@/types/pipeline`; peta tarif `ReadonlyMap<string, SewingRate>`.
- Produces (dipakai Task 2–4):
  - `SewingRate { jahit: number; obras: number; total: number }`
  - `WorkOrderBacklog`
  - `ProductNoteBacklog`
  - `SummaryRate`
  - `buildSewingBacklog(workOrders, sewingRecords, ratesByProductionOrder): ProductNoteBacklog[]`
  - `calculateMonthlyRemainingMoney(salary, realisasiCostPosisi): number`

- [ ] **Step 1: Tulis test yang gagal untuk agregasi dan filtering**

Create `tests/sewingBacklog.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSewingBacklog,
  calculateMonthlyRemainingMoney,
} from '../src/lib/sewingBacklog.ts';

function wo(over: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    workCode: 'WC-1',
    sourceOrderId: 'po-1',
    productNote: 'Produksi 1',
    product: 'Dress',
    productId: '',
    variationId: '',
    informationVariation: '',
    warna: 'Hitam',
    size: 'M',
    brand: '',
    quantity: 100,
    productionStatus: 'PROGRESS' as const,
    invoiceStatus: 'NONE' as const,
    createdBy: '',
    createdAt: '',
    ...over,
  };
}

function sw(workOrderId: string, qtySelesai: number, pic = 'Ayu', tgl = '2026-08-05') {
  return {
    id: `${workOrderId}-${qtySelesai}-${pic}-${tgl}`,
    workOrderId,
    workCode: 'WC',
    picPenjahit: pic,
    qtySelesai,
    tanggalLaporan: tgl,
    inputBy: '',
    inputAt: '',
  };
}

const rates = new Map([
  ['po-1', { jahit: 1000, obras: 500, total: 1500 }],
  ['po-2', { jahit: 2000, obras: 0, total: 2000 }],
]);

test('Work Order aktif dihitung dari Qty Order dikurangi seluruh sewing lintas penjahit dan bulan', () => {
  const result = buildSewingBacklog([
    wo(),
  ], [
    sw('wo-1', 10, 'Ayu', '2026-08-05'),
    sw('wo-1', 20, 'Budi', '2026-09-05'),
  ], rates);

  assert.equal(result.length, 1);
  assert.equal(result[0].workOrders[0].qtyJahit, 30);
  assert.equal(result[0].workOrders[0].totalBelumJahit, 70);
});

test('Work Order yang sudah selesai tidak masuk backlog', () => {
  const result = buildSewingBacklog([wo()], [sw('wo-1', 100)], rates);
  assert.deepEqual(result, []);
});

test('sewing melebihi Qty Order dijepit ke nol dan tidak tampil', () => {
  const result = buildSewingBacklog([wo()], [sw('wo-1', 150)], rates);
  assert.deepEqual(result, []);
});

test('Sisa Uang bulanan adalah max(0, salary - realisasiCostPosisi)', () => {
  assert.equal(calculateMonthlyRemainingMoney(5_000_000, 3_500_000), 1_500_000);
  assert.equal(calculateMonthlyRemainingMoney(5_000_000, 6_000_000), 0);
});
```

- [ ] **Step 2: Jalankan test dan verifikasi RED**

Run:

```bash
node --test tests/sewingBacklog.test.ts
```

Expected: FAIL dengan `ERR_MODULE_NOT_FOUND` untuk `../src/lib/sewingBacklog.ts`. Ini RED yang benar karena helper belum ada.

- [ ] **Step 3: Tambah test grouping, ringkasan, dan sorting**

Lanjutkan pada file test yang sama:

```ts
test('Work Order dengan Product Note sama digabung menjadi satu grup', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1', quantity: 100 }),
    wo({ id: 'wo-2', workCode: 'WC-2', quantity: 50 }),
  ], [sw('wo-1', 10), sw('wo-2', 5)], rates);

  assert.equal(result.length, 1);
  assert.equal(result[0].productNote, 'Produksi 1');
  assert.equal(result[0].totalQtyOrder, 150);
  assert.equal(result[0].totalQtyJahit, 15);
  assert.equal(result[0].totalBelumJahit, 135);
});

test('Product Note kosong dengan source order berbeda tidak tercampur', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1', productNote: '', sourceOrderId: 'po-1' }),
    wo({ id: 'wo-2', productNote: '', sourceOrderId: 'po-2', workCode: 'WC-2' }),
  ], [sw('wo-1', 10), sw('wo-2', 20)], rates);

  assert.equal(result.length, 2);
  assert.equal(result[0].productNote, null);
  assert.equal(result[1].productNote, null);
});

test('Product seragam diringkas sebagai nama dan product berbeda menjadi Bervariasi', () => {
  const uniform = buildSewingBacklog([
    wo({ id: 'wo-1', product: 'Dress' }),
    wo({ id: 'wo-2', product: 'Dress', workCode: 'WC-2' }),
  ], [sw('wo-1', 10), sw('wo-2', 20)], rates);
  assert.equal(uniform[0].productLabel, 'Dress');

  const varied = buildSewingBacklog([
    wo({ id: 'wo-1', product: 'Dress' }),
    wo({ id: 'wo-2', product: 'Kemeja', workCode: 'WC-2' }),
  ], [sw('wo-1', 10), sw('wo-2', 20)], rates);
  assert.equal(varied[0].productLabel, 'Bervariasi');
});

test('tarif seragam diringkas sebagai nominal', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1' }),
    wo({ id: 'wo-2', workCode: 'WC-2' }),
  ], [sw('wo-1', 10), sw('wo-2', 20)], rates);

  assert.deepEqual(result[0].rate, { kind: 'single', value: 1500 });
});

test('tarif berbeda diringkas sebagai Bervariasi', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1', sourceOrderId: 'po-1' }),
    wo({ id: 'wo-2', sourceOrderId: 'po-2', workCode: 'WC-2' }),
  ], [sw('wo-1', 10), sw('wo-2', 20)], rates);

  assert.deepEqual(result[0].rate, { kind: 'varied' });
});

test('sebagian tarif hilang diringkas sebagai Bervariasi', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1', sourceOrderId: 'po-1' }),
    wo({ id: 'wo-2', sourceOrderId: 'po-unknown', workCode: 'WC-2' }),
  ], [sw('wo-1', 10), sw('wo-2', 20)], rates);

  assert.deepEqual(result[0].rate, { kind: 'varied' });
});

test('semua tarif hilang diringkas sebagai missing', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1', sourceOrderId: 'po-unknown' }),
  ], [sw('wo-1', 10)], rates);

  assert.deepEqual(result[0].rate, { kind: 'missing' });
  assert.equal(result[0].workOrders[0].rate, null);
});

test('grup diurutkan berdasarkan Total Belum Jahit turun lalu Product Note naik', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1', productNote: 'Zeta', quantity: 10 }),
    wo({ id: 'wo-2', productNote: 'Alpha', quantity: 100, workCode: 'WC-2' }),
    wo({ id: 'wo-3', productNote: 'Beta', quantity: 100, workCode: 'WC-3' }),
  ], [], rates);

  assert.deepEqual(
    result.map((g) => g.productNote),
    ['Alpha', 'Beta', 'Zeta'],
  );
});
```

- [ ] **Step 4: Implementasi helper murni**

Create `src/lib/sewingBacklog.ts`:

```ts
import type { SewingRecord, WorkOrder } from '@/types/pipeline';

export interface SewingRate {
  jahit: number;
  obras: number;
  total: number;
}

export interface WorkOrderBacklog {
  workOrderId: string;
  sourceOrderId: string | null;
  workCode: string;
  productNote: string | null;
  product: string;
  warna: string | null;
  size: string | null;
  qtyOrder: number;
  qtyJahit: number;
  totalBelumJahit: number;
  rate: number | null;
}

export type SummaryRate =
  | { kind: 'single'; value: number }
  | { kind: 'varied' }
  | { kind: 'missing' };

export interface ProductNoteBacklog {
  key: string;
  productNote: string | null;
  productLabel: string;
  totalQtyOrder: number;
  totalQtyJahit: number;
  totalBelumJahit: number;
  rate: SummaryRate;
  workOrders: WorkOrderBacklog[];
  searchText: string;
}
```

Implementasikan dengan algoritma ini:

1. Jumlahkan `qtySelesai` per `workOrderId` dari seluruh `sewingRecords` (lintas penjahit dan tanggal).
2. Untuk setiap Work Order hitung `qtyOrder = Number(w.quantity) || 0`, `qtyJahit`, lalu `totalBelumJahit = Math.max(0, qtyOrder - qtyJahit)`.
3. Buang Work Order dengan `totalBelumJahit === 0`.
4. Ambil tarif dari `ratesByProductionOrder.get(w.sourceOrderId)`; `null` bila tidak ada.
5. Tentukan group key:
   - Product Note non-kosong → `note:${productNote.trim().toLowerCase()}`
   - Product Note kosong → `src:${sourceOrderId}` bila ada, else `wo:${workOrder.id}`
   - `productNote` pada output adalah `null` bila kosong.
6. Agregasi per grup: jumlah Qty Order, Qty Jahit, Total Belum Jahit; kumpulkan Work Order.
7. `productLabel`: nama Product bila seragam, `'Bervariasi'` bila berbeda.
8. `rate`:
   - kumpulkan seluruh tarif Work Order yang bukan `null`;
   - tidak ada tarif sama sekali → `{ kind: 'missing' }`;
   - seluruh Work Order bertarif dan nilainya sama → `{ kind: 'single', value }`;
   - selain itu (beda nilai atau sebagian hilang) → `{ kind: 'varied' }`.
9. `searchText` berisi lowercase gabungan Product Note, seluruh Product, Work Code, Warna, Size.
10. Urutkan grup: `totalBelumJahit` descending, lalu `productNote` ascending dengan `localeCompare` dan null diperlakukan sebagai string kosong.
11. Urutkan `workOrders` di dalam grup berdasarkan `totalBelumJahit` descending lalu `workCode` ascending.

Tambahkan fungsi murni terpisah:

```ts
export function calculateMonthlyRemainingMoney(
  salary: number,
  realisasiCostPosisi: number,
): number {
  const s = Number(salary) || 0;
  const c = Number(realisasiCostPosisi) || 0;
  return Math.max(0, s - c);
}
```

Helper tidak boleh melakukan fetch, tidak boleh mengimpor `@/lib/supabase`, dan tidak boleh menulis data.

- [ ] **Step 5: Jalankan test dan verifikasi GREEN**

Run:

```bash
node --test tests/sewingBacklog.test.ts
```

Expected: 12 tests PASS, 0 FAIL.

- [ ] **Step 6: Commit helper murni**

```bash
git add src/lib/sewingBacklog.ts tests/sewingBacklog.test.ts
git commit -m "feat(target-jahit): hitung backlog jahit per product note" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Service Tarif Eksak per Production Order

**Files:**
- Create: `src/services/productionOrderPrices.ts`

**Interfaces:**
- Consumes: `supabase` client existing.
- Produces:
  - `SewingRateValue { jahit: number; obras: number; total: number }`
  - `SewingRateByProductionOrder = Map<string, SewingRateValue>`
  - `fetchSewingRatesByProductionOrder(): Promise<{ data: SewingRateByProductionOrder; error: Error | null }>`

**Koreksi terhadap spec (terverifikasi lewat Supabase MCP pada 2026-09-02):** tabel `register_po` dan `register_po_components` **sudah tidak ada** pada schema live. Tarif eksak yang masih hidup berada pada jalur:

```text
work_orders.source_order_id
  -> production_order_prices.production_order_id (unique)
  -> production_order_price_components(component_key IN ['jahit','obras'])
```

Karena itu task ini membuat service baru `src/services/productionOrderPrices.ts` alih-alih menambah fungsi pada `src/services/registerPo.ts`. Service `registerPo.ts` existing **tidak disentuh** agar modul Register PO yang sedang berjalan di branch lain tidak terganggu. Tidak ada DDL pada task ini.

- [ ] **Step 1: Verifikasi relasi live lewat Supabase MCP sebelum menulis kode**

Jalankan query berikut lewat Supabase MCP:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE '%register%' ORDER BY table_name;
```

Konfirmasi `register_po` dan `register_po_components` tidak ada. Lalu konfirmasi jalur pengganti mengembalikan baris tarif:

```sql
SELECT wo.id, wo.source_order_id, popc.component_key, popc.amount_per_piece
FROM work_orders wo
JOIN production_order_prices pop ON pop.production_order_id = wo.source_order_id
JOIN production_order_price_components popc ON popc.order_price_id = pop.id
WHERE popc.component_key IN ('jahit','obras');
```

Jika tidak ada baris yang kembali, hentikan dan laporkan sebelum lanjut.

- [ ] **Step 2: Buat service fetch tarif batch**

Create `src/services/productionOrderPrices.ts` dengan isi:

```ts
import { supabase } from '@/lib/supabase';

const PRICE_TABLE = 'production_order_prices';
const COMPONENT_TABLE = 'production_order_price_components';

export interface SewingRateValue {
  jahit: number;
  obras: number;
  total: number;
}

export type SewingRateByProductionOrder = Map<string, SewingRateValue>;

export async function fetchSewingRatesByProductionOrder(): Promise<{
  data: SewingRateByProductionOrder;
  error: Error | null;
}> {
  const data: SewingRateByProductionOrder = new Map();

  const { data: priceRows, error: priceErr } = await supabase
    .from(PRICE_TABLE)
    .select('id, production_order_id');
  if (priceErr) return { data, error: priceErr };
  if (!priceRows || priceRows.length === 0) return { data, error: null };

  const priceIds = priceRows.map((r) => r.id as string);
  const { data: componentRows, error: compErr } = await supabase
    .from(COMPONENT_TABLE)
    .select('order_price_id, component_key, amount_per_piece')
    .in('order_price_id', priceIds)
    .in('component_key', ['jahit', 'obras']);
  if (compErr) return { data, error: compErr };

  // Kelompokkan komponen per price row; null berarti komponen tidak ada.
  // Kedua komponen null => tarif tidak tersedia (bukan Rp0).
  // ...
  return { data, error: null };
}
```

Isi lengkap fungsi mengikuti file yang sudah ditulis pada implementasi: dua query batch, agregasi `component_key`, dan pemetaan `production_order_id -> { jahit, obras, total }`.

Fungsi ini hanya fetch dan mapping: tidak menghitung backlog, tidak memakai latest-price-by-product, dan tidak menulis.

- [ ] **Step 3: Jalankan build dan lint**

Run:

```bash
npm run build
npx eslint src/services/productionOrderPrices.ts
```

Expected: build exit 0; tidak ada temuan baru pada file ini.

- [ ] **Step 4: Commit service tarif**

```bash
git add src/services/productionOrderPrices.ts
git commit -m "feat(production-order): sediakan tarif jahit obras per po" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Hapus Dua Kolom Hari Kerja dari UI Target Jahit

**Files:**
- Modify: `src/pages/TargetJahitPage.tsx:58-61,141-169,601-604`
- Modify: `src/data/mockData.ts:70-71`
- Test: `tests/sewingBacklog.test.ts`

**Interfaces:**
- Consumes: tidak ada modul baru; perubahan bersifat penghapusan.
- Produces: definisi kolom UI Target Jahit tanpa `totalHariKerja` dan `hariKerjaHariIni`.

- [ ] **Step 1: Hapus komponen tooltip yang tidak lagi terpakai**

Di `src/pages/TargetJahitPage.tsx`, hapus seluruh fungsi `WorkdaysWithTooltip` (baris 58–139).

Hapus juga import yang hanya dipakai komponen tersebut:

```ts
import { generateHolidayTooltipInfo } from '@/lib/holidayHelpers';
import { getNationalHolidaysInMonth } from '@/data/nationalHolidays';
```

Pertahankan import `useMemo`: masih dipakai oleh `allEnriched`, `enriched`, `visibleDebtRows`, `normalized`, `roleColumns`, `visibleColumns`, dan `benefitRows`. Pertahankan juga state `libur` karena tetap menjadi input `enrichTargetRows()`.

- [ ] **Step 2: Hapus dua entri kolom dari definisi tabel**

Pada `TARGET_COLUMNS`, hapus:

```ts
{ key: 'totalHariKerja', label: 'Hari Kerja Efektif', align: 'right' },
{ key: 'hariKerjaHariIni', label: 'Hari Kerja Hari Ini', align: 'right', inv: true },
```

Biarkan `TARGET_COLUMN_ALIAS` tetap utuh karena dipakai `normalizeTargetRow()` dan nilai hari kerja tetap dihitung enrichment.

- [ ] **Step 3: Hapus cabang render khusus**

Ganti blok render bersyarat di cell tabel:

```tsx
) : c.key === 'totalHariKerja' ? (
  // Special rendering for Hari Kerja Efektif with holiday tooltip
  <WorkdaysWithTooltip ym={String((row as any).bulanTahun ?? '')} manualHolidays={libur} />
) : renderCell(c, row)}
```

menjadi:

```tsx
) : renderCell(c, row)}
```

- [ ] **Step 4: Hapus dua kolom dari konfigurasi tampilan statis**

Di `src/data/mockData.ts`, hapus dari `viewConfig['target-jahit'].columns`:

```ts
{ key: 'totalHariKerja', label: 'Hari Kerja Efektif', width: '110px', align: 'right', icon: 'CalendarCheck' },
{ key: 'hariKerjaHariIni', label: 'Hari Kerja Hari Ini', width: '110px', align: 'right', icon: 'CalendarCheck' },
```

Jangan menyentuh entri `hariKerjaEfektif` milik `register-jahit` atau `production-data`.

- [ ] **Step 5: Verifikasi statis bahwa label tidak lagi tersedia**

Gunakan Grep tool pada `src/` dengan pola `Hari Kerja Efektif|Hari Kerja Hari Ini`:

Expected: tidak ada lagi kecocokan pada `src/pages/TargetJahitPage.tsx` dan `src/data/mockData.ts`. Kecocokan yang tersisa hanya boleh berada pada modul lain seperti Register Jahit.

- [ ] **Step 6: Verifikasi perhitungan Target Ngebut tidak berubah**

Jalankan seluruh test Node:

```bash
node --test tests/*.test.ts
```

Expected: seluruh test PASS, 0 FAIL. Tidak ada test yang memodifikasi rumus hari kerja pada task ini.

- [ ] **Step 7: Commit penghapusan kolom**

```bash
git add src/pages/TargetJahitPage.tsx src/data/mockData.ts
git commit -m "feat(target-jahit): sembunyikan kolom hari kerja dari ui" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Tab Belum Jahit

**Files:**
- Modify: `src/pages/TargetJahitPage.tsx`

**Interfaces:**
- Consumes:
  - `buildSewingBacklog(workOrders, sewingRecords, rates)` dari Task 1.
  - `fetchSewingRatesByProductionOrder()` dari Task 2.
  - `useColumnSettings`-style pola toolbar existing (`T_TOOLBAR_BTN`, `T_WRAP`, `T_TABLE`, `T_TH`, `T_TD`, `rowClass`).
- Produces: tab `belum-jahit` yang tersedia untuk semua role.

- [ ] **Step 1: Perluas tipe tab dan state**

Ubah:

```ts
type TabKey = 'target' | 'utang-staf' | 'benefit';
```

menjadi:

```ts
type TabKey = 'target' | 'belum-jahit' | 'utang-staf' | 'benefit';
```

Tambahkan state:

```ts
const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
const [sewingRateMap, setSewingRateMap] = useState<SewingRateByProductionOrder>(new Map());
const [backlogError, setBacklogError] = useState<string | null>(null);
const [rateError, setRateError] = useState<string | null>(null);
const [backlogSearch, setBacklogSearch] = useState('');
const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
```

Import yang diperlukan:

```ts
import { fetchSewingRatesByProductionOrder, type SewingRateByProductionOrder } from '@/services/registerPo';
import { buildSewingBacklog } from '@/lib/sewingBacklog';
import type { WorkOrder } from '@/types/pipeline';
```

- [ ] **Step 2: Muat Work Order dan tarif tanpa menjatuhkan tab Target**

Ubah `refresh` menjadi:

```ts
const refresh = useCallback(async () => {
  setLoading(true);
  const [t, l, s, d, wo, pm, rates] = await Promise.all([
    fetchAllTarget(), daftarLiburSvc.fetchAll(), sewingRecordSvc.fetchAll(),
    targetJahitDetailSvc.fetchAll(), workOrderSvc.fetchAll(), buildPriceMap(),
    fetchSewingRatesByProductionOrder(),
  ]);
  setItems(t.data ?? []);
  setLibur((l.data ?? []).map((r) => r.tanggal));
  setSewing(s.data ?? []);
  setDetails(d.data ?? []);
  setWorkOrders(wo.data ?? []);
  setBacklogError(wo.error ? wo.error.message : null);
  setSewingRateMap(rates.data);
  setRateError(rates.error ? rates.error.message : null);
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
  setPrices(pm);
  setLoading(false);
}, []);
```

Jangan mengubah perilaku error untuk `t`, `l`, `s`, `d`, dan `pm`.

- [ ] **Step 3: Hitung backlog melalui helper murni**

Tambahkan setelah `allEnriched`:

```ts
const backlogGroups = useMemo(
  () => buildSewingBacklog(workOrders, sewing, sewingRateMap),
  [workOrders, sewing, sewingRateMap],
);

const visibleBacklogGroups = useMemo(() => {
  const q = backlogSearch.trim().toLowerCase();
  if (!q) return backlogGroups;
  return backlogGroups.filter((g) =>
    g.workOrders.some((w) => g.searchText.includes(q)) || g.searchText.includes(q),
  );
}, [backlogGroups, backlogSearch]);
```

Variabel `libur` tetap dipakai oleh enrichment; jangan menghapusnya.

- [ ] **Step 4: Tambahkan tombol tab Belum Jahit**

Sisipkan setelah tombol tab `Target`:

```tsx
<button
  onClick={() => setTab('belum-jahit')}
  className={cn(
    'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors',
    tab === 'belum-jahit' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white text-slate-600 border border-gray-200 hover:bg-blue-50 hover:text-blue-700',
  )}
>
  Belum Jahit
</button>
```

Tombol ini tidak digate role.

Ubah guard loading paling atas:

```ts
if (loading && tab === 'target') {
```

menjadi:

```ts
if (loading && tab !== 'belum-jahit') {
```

- [ ] **Step 5: Render tab Belum Jahit**

Sisipkan blok `{tab === 'belum-jahit' && ( … )}` sebelum blok `{tab === 'utang-staf' && (`:

```tsx
{tab === 'belum-jahit' && (
  <>
    <div className="flex items-center gap-2 mb-3">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          placeholder="Cari product note, work code, warna, size..."
          value={backlogSearch}
          onChange={(e) => setBacklogSearch(e.target.value)}
          className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        />
      </div>
      <button onClick={refresh} className={`${T_TOOLBAR_BTN} ${T_TOOLBAR_BTN_IDLE}`}>
        <RefreshCw className="w-3 h-3" /> Refresh
      </button>
      <span className="text-[11px] text-slate-400 ml-auto">{visibleBacklogGroups.length} product note belum jahit</span>
    </div>

    {rateError && (
      <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-700">
        Tarif Jahit + Obras belum dapat dimuat. Daftar backlog tetap ditampilkan dengan tarif “—”.
      </div>
    )}

    {backlogError ? (
      <div className="py-10 text-center">
        <p className="text-[13px] text-rose-600 mb-3">Gagal memuat data Work Order: {backlogError}</p>
        <button onClick={refresh} className={`${T_TOOLBAR_BTN} ${T_TOOLBAR_BTN_IDLE}`}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
    ) : backlogGroups.length === 0 ? (
      <p className="text-slate-400 text-sm">Semua Work Order sudah selesai dijahit.</p>
    ) : visibleBacklogGroups.length === 0 ? (
      <p className="text-slate-400 text-sm">Tidak ada hasil yang cocok dengan pencarian.</p>
    ) : (
      <div className={T_WRAP}>
        <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
          <thead><tr className={T_HEAD_ROW}>
            <th className={cn(T_TH, 'w-8')} />
            <th className={cn(T_TH, 'text-left')}>Product Note</th>
            <th className={cn(T_TH, 'text-left')}>Product</th>
            <th className={cn(T_TH, 'text-right')}>Total Qty Order</th>
            <th className={cn(T_TH, 'text-right')}>Qty Jahit</th>
            <th className={cn(T_TH, 'text-right')}>Total Belum Jahit</th>
            <th className={cn(T_TH, 'text-right')}>Tarif Jahit + Obras</th>
          </tr></thead>
          <tbody>
            {visibleBacklogGroups.map((g, gi) => {
              const expanded = expandedNotes.has(g.key);
              return (
                <Fragment key={g.key}>
                  <tr className={cn(rowClass(gi), 'cursor-pointer')} onClick={() => setExpandedNotes(prev => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}>
                    <td className={cn(T_TD, 'text-center text-slate-400')}>
                      {expanded ? <ChevronDown className="w-3.5 h-3.5 inline-block" /> : <ChevronRight className="w-3.5 h-3.5 inline-block" />}
                    </td>
                    <td className={cn(T_TD, 'text-gray-700')}>{g.productNote || <span className="text-gray-300">—</span>}</td>
                    <td className={cn(T_TD, 'font-medium text-gray-900')}>{g.productLabel}</td>
                    <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{g.totalQtyOrder}</td>
                    <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{g.totalQtyJahit}</td>
                    <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-rose-600')}>{g.totalBelumJahit}</td>
                    <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>
                      {g.rate.kind === 'single' ? formatCurrency(g.rate.value)
                        : g.rate.kind === 'varied' ? 'Bervariasi'
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-slate-50 border-b border-[#E5E7EB]">
                      <td colSpan={7} className="px-4 py-3">
                        <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
                          <thead><tr>
                            <th className={cn(T_TH, 'text-left')}>Work Code</th>
                            <th className={cn(T_TH, 'text-left')}>Product</th>
                            <th className={cn(T_TH, 'text-left')}>Warna</th>
                            <th className={cn(T_TH, 'text-left')}>Size</th>
                            <th className={cn(T_TH, 'text-right')}>Qty Order</th>
                            <th className={cn(T_TH, 'text-right')}>Qty Jahit</th>
                            <th className={cn(T_TH, 'text-right')}>Total Belum Jahit</th>
                            <th className={cn(T_TH, 'text-right')}>Tarif Jahit + Obras</th>
                          </tr></thead>
                          <tbody>
                            {g.workOrders.map((w, wi) => (
                              <tr key={w.workOrderId} className={rowClass(wi)}>
                                <td className={cn(T_TD, 'text-gray-700')}>{w.workCode}</td>
                                <td className={cn(T_TD, 'font-medium text-gray-900')}>{w.product}</td>
                                <td className={cn(T_TD, 'text-gray-700')}>{w.warna || <span className="text-gray-300">—</span>}</td>
                                <td className={cn(T_TD, 'text-gray-700')}>{w.size || <span className="text-gray-300">—</span>}</td>
                                <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{w.qtyOrder}</td>
                                <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{w.qtyJahit}</td>
                                <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-rose-600')}>{w.totalBelumJahit}</td>
                                <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>
                                  {w.rate == null ? <span className="text-gray-300">—</span> : formatCurrency(w.rate)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </>
)}
```

Tambahkan `Fragment` ke import React di bagian atas:

```ts
import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
```

Import ikon:

```ts
import { ChevronDown, ChevronRight, RefreshCw, Search, Trash2, X } from 'lucide-react';
```

Tambahkan `T_TOOLBAR_BTN` dan `T_TOOLBAR_BTN_IDLE` ke import `@/lib/tableStyles`.

- [ ] **Step 6: Jalankan build dan lint**

Run:

```bash
npm run build
npx eslint src/pages/TargetJahitPage.tsx
```

Expected: build exit 0. Jika muncul temuan `no-explicit-any`, conditional-hook, atau sejenisnya yang sudah ada sebelum branch ini, bandingkan dengan `git show main:src/pages/TargetJahitPage.tsx` dan laporkan sebagai baseline tanpa melakukan refactor luas.

- [ ] **Step 7: Commit tab Belum Jahit**

```bash
git add src/pages/TargetJahitPage.tsx
git commit -m "feat(target-jahit): tambah tab daftar belum jahit" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Overlay Sisa Uang dan Ringkasan Backlog

**Files:**
- Modify: `src/pages/TargetJahitPage.tsx`

**Interfaces:**
- Consumes:
  - `calculateMonthlyRemainingMoney(salary, realisasiCostPosisi)` dari Task 1.
  - `backlogGroups` dari Task 4.
  - `canSeeDebt` existing.
- Produces: kartu Sisa Uang hanya untuk Owner/Finance, ringkasan lima Product Note untuk semua role, dan aksi buka tab Belum Jahit.

- [ ] **Step 1: Tambahkan kartu Sisa Uang pada overlay**

Di dalam blok overlay setelah deklarasi `progressPct`, tambahkan:

```tsx
const remainingMoney = calculateMonthlyRemainingMoney(
  src.salary,
  src.realisasiCostPosisi,
);
```

Import:

```ts
import { buildSewingBacklog, calculateMonthlyRemainingMoney } from '@/lib/sewingBacklog';
```

Ubah grid stat cards:

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
```

menjadi:

```tsx
<div className={cn('grid gap-3 mb-5', canSeeDebt
  ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
  : 'grid-cols-2 md:grid-cols-4')}
```

Tambahkan kartu kelima sesudah kartu Status, hanya untuk Owner/Finance:

```tsx
{canSeeDebt && (
  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
    <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider">Sisa Uang yang Harus Dikejar</p>
    <p className="text-[15px] font-semibold text-amber-800 mt-0.5 tabular-nums">{formatCurrency(remainingMoney)}</p>
  </div>
)}
```

Jangan menyisipkan nilai ini ke dalam view model untuk role Inventory.

- [ ] **Step 2: Tambahkan ringkasan backlog pada overlay**

Setelah blok Rincian Realisasi per Desain, tambahkan:

```tsx
<h3 className="text-[12px] font-bold text-slate-700 mt-6 mb-2">Product Note Belum Jahit</h3>
{backlogGroups.length === 0 ? (
  <p className="text-[13px] text-slate-400 py-6 text-center border border-gray-200 rounded-lg">Semua Work Order sudah selesai dijahit.</p>
) : (
  <>
    <div className="bg-white border border-gray-200 rounded-lg overflow-auto">
      <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
        <thead><tr className={T_HEAD_ROW}>
          <th className={cn(T_TH, 'text-left')}>Product Note</th>
          <th className={cn(T_TH, 'text-left')}>Product</th>
          <th className={cn(T_TH, 'text-right')}>Total Belum Jahit</th>
          <th className={cn(T_TH, 'text-right')}>Tarif Jahit + Obras</th>
        </tr></thead>
        <tbody>
          {backlogGroups.slice(0, 5).map((g, gi) => (
            <tr key={g.key} className={rowClass(gi)}>
              <td className={cn(T_TD, 'text-gray-700')}>{g.productNote || <span className="text-gray-300">—</span>}</td>
              <td className={cn(T_TD, 'font-medium text-gray-900')}>{g.productLabel}</td>
              <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-rose-600')}>{g.totalBelumJahit}</td>
              <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>
                {g.rate.kind === 'single' ? formatCurrency(g.rate.value)
                  : g.rate.kind === 'varied' ? 'Bervariasi'
                  : <span className="text-gray-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <button
      onClick={() => { setOverlayId(null); setTab('belum-jahit'); }}
      className="mt-3 h-8 px-3 text-[12px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
    >
      Lihat Semua Belum Jahit
    </button>
  </>
)}
```

Ringkasan ini tidak boleh memuat input, pilihan jumlah PCS, rekomendasi, atau aksi pemindahan alokasi.

- [ ] **Step 3: Jalankan test dan build**

Run:

```bash
node --test tests/*.test.ts
npm run build
```

Expected: seluruh test PASS; build exit 0.

- [ ] **Step 4: Commit overlay**

```bash
git add src/pages/TargetJahitPage.tsx
git commit -m "feat(target-jahit): tampilkan sisa uang dan ringkasan backlog" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Verifikasi Akhir dan Pembaruan project.md

**Files:**
- Modify: `project.md`

**Interfaces:**
- Consumes: seluruh perubahan Task 1–5.
- Produces: evidence verifikasi segar dan konteks proyek yang tahan lama.

- [ ] **Step 1: Konfirmasi tidak ada perubahan schema**

Panggil Supabase MCP `list_migrations`. Catat bahwa tidak ada migration baru dari pekerjaan ini.

- [ ] **Step 2: Jalankan seluruh test Node**

```bash
node --test tests/*.test.ts
```

Expected: seluruh test PASS, 0 FAIL. Laporkan jumlah test persis dari output.

- [ ] **Step 3: Jalankan production build**

```bash
npm run build
```

Expected: exit 0. Laporkan peringatan chunk-size terpisah dari kegagalan build.

- [ ] **Step 4: Jalankan lint pada seluruh file yang berubah**

```bash
npx eslint src/lib/sewingBacklog.ts src/services/registerPo.ts src/pages/TargetJahitPage.tsx src/data/mockData.ts tests/sewingBacklog.test.ts
```

Expected: tidak ada temuan baru. Laporkan temuan pre-existing dengan file, rule, dan baris; bandingkan terhadap baseline bila perlu.

- [ ] **Step 5: Periksa diff dan cakupan**

```bash
git status --short
git diff --check
git diff --stat HEAD~5..HEAD
```

Checklist penerimaan:

- dua label hari kerja tidak muncul pada definisi UI Target Jahit;
- tidak ada migration atau DDL;
- tarif backlog berasal dari Register PO terkait langsung, bukan `buildPriceMap()`;
- Inventory tidak menerima nilai Sisa Uang;
- tab Belum Jahit tersedia untuk semua role;
- tidak ada file di luar cakupan yang berubah.

- [ ] **Step 6: Perbarui Latest Progress**

Baca `project.md` sesaat sebelum mengedit dan pertahankan seluruh entri lain. Tambahkan entri terbaru di posisi paling atas:

```markdown
### 2026-08-29 — Target Jahit: informasi Belum Jahit dan Sisa Uang bulanan

- Hari Kerja Efektif dan Hari Kerja Hari Ini dihapus dari tabel, filter, sort, pengaturan kolom, dan export Target Jahit; perhitungan internalnya tetap menghasilkan Sisa Hari, Target Daily, dan Target Ngebut.
- Overlay Target menambahkan kartu Sisa Uang yang Harus Dikejar (`max(0, salary - realisasiCostPosisi)` bulan tersebut) untuk Owner/Finance; Inventory tidak melihatnya.
- Tab Belum Jahit baru menampilkan seluruh Work Order global dengan Total Belum Jahit > 0, dikelompokkan per Product Note dan dapat dibuka sampai rincian Work Order; tersedia untuk semua role.
- Tarif setiap Work Order diambil eksak dari Register PO terkait `source_order_id`; ringkasan menampilkan nominal, `Bervariasi`, atau `—`.
- Helper murni `src/lib/sewingBacklog.ts` dilindungi oleh tes Node; fitur baca-saja tanpa migration.
- Verifikasi: [isi jumlah test], build [exit], lint [hasil/baseline].
```

- [ ] **Step 7: Commit dokumentasi progres**

```bash
git add project.md
git commit -m "docs: catat informasi belum jahit target jahit" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 8: Pemeriksaan status akhir**

```bash
git status --short
git log -7 --oneline
```

Expected: working tree bersih dan rangkaian commit implementasi yang jelas. Jangan merge atau push sampai pengguna memilih opsi integrasi.

---

## Manual Smoke Checklist

Dijalankan bila sesi lokal terautentikasi tersedia tanpa mengubah data lain:

1. Buka Target Jahit sebagai Owner/Finance.
2. Pastikan dua kolom hari kerja tidak muncul dan Target Ngebut tetap terisi.
3. Buka overlay Target dan cocokkan Sisa Uang dengan Salary − Realisasi Cost bulan itu.
4. Pastikan ringkasan Belum Jahit tampil dan tombol Lihat Semua membuka tab Belum Jahit.
5. Pada tab Belum Jahit, buka Product Note dan cocokkan agregat dengan rincian Work Order.
6. Cocokkan tarif Work Order dengan komponen Jahit + Obras pada Register PO terkait.
7. Login sebagai Inventory: daftar backlog dan tarif tetap terlihat, Sisa Uang tidak terlihat.
8. Pastikan Work Order selesai tidak tampil.
9. Uji search dengan Product Note, Work Code, warna, dan size.
