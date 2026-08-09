# Kanban & ProductionStatus 5-Status Revision — Design

**Date:** 2026-08-08
**Status:** Approved (user: "langsung implementasi"; keputusan tambahan: Finished = jahit ≥ qty; sewing pertama → langsung PROGRESS)

## Context

Kanban Production Monitoring saat ini menampilkan 6 kolom dari `ProductionStatus` lama (`CUTTING_PENDING, CUTTING_COMPLETE, SEWING_IN_PROGRESS, FINISHING_IN_PROGRESS, FINISHING_COMPLETE, INVOICED`). User ingin Kanban disederhanakan ke 5 status berbasis progres aktual, dan `ProductionStatus` dirombak total (bukan sekadar tampilan).

## Goals

1. Kanban menampilkan 5 kolom: **New, Cutting, Progress, Finished, Invoiced**.
2. `ProductionStatus` dirombak menjadi `'NEW' | 'CUTTING' | 'PROGRESS' | 'FINISHED' | 'INVOICED'`, semua konsumen diubah.
3. Kolom derivate dari angka cutting/sewing/qty (bukan insting dari DB), dengan `invoiceStatus != 'NONE'` sebagai penentu **Invoiced**.
4. Data existing di DB dinormalisasi (migration), dan seed (`SeedPage`) disesuaikan.

## ProductionStatus baru

```ts
export type ProductionStatus =
  | 'NEW'
  | 'CUTTING'
  | 'PROGRESS'
  | 'FINISHED'
  | 'INVOICED';
```

- **NEW**: cutting belum diisi (cuttingTotal = 0).
- **CUTTING**: cutting ≥ 1, jahit = 0.
- **PROGRESS**: cutting ≥ 1, jahit ≥ 1, jahit < qty.
- **FINISHED**: cutting = jahit = qty, qty > 0, belum invoice.
- **INVOICED**: `invoiceStatus != 'NONE'` (penentu utama; `prod_status` disinkron jadi `'INVOICED'`).

### deriveStatus (logika baru)

```ts
export function deriveStatus(cuttingTotal: number, sewingTotal: number, orderQty: number): ProductionStatus {
  if (cuttingTotal <= 0) return 'NEW';
  if (sewingTotal <= 0) return 'CUTTING';
  if (sewingTotal >= orderQty) return 'FINISHED';   // = cutting (lihat catatan)
  return 'PROGRESS';
}
```

**Catatan penting — Finished vs "kecuali angka 0":** Aturan user: *"cutting, jahit dan Qty udah sama semua angkanya, kecuali angka 0."* Artinya Finished berarti `cutting == jahit == qty`, **dan** `qty > 0` (karena qty=0 berarti tidak ada order yang dihitung). **Keputusan user:** Finished = `jahit ≥ qty` (sederhana, sesuai "udah sama" dan layak selesai); tidak wajib persis `==`. Plus `sewingTotal > 0` supaya qty=0 tidak dianggap Finished. Jadi `deriveStatus` memakai `sewingTotal >= orderQty && sewingTotal > 0`.

**Catatan 2 — Progres vs "jahit masih 0":** deskripsi user kolom Cut "jahit masih 0", kolom Progress "jahit ≥ 1". Batas bersih, tidak tumpang tindih.

### productionStatusLabel / Color

```ts
export const productionStatusLabel: Record<ProductionStatus, string> = {
  NEW: 'New',
  CUTTING: 'Cutting',
  PROGRESS: 'Progress',
  FINISHED: 'Finished',
  INVOICED: 'Invoiced',
};
```
Warna tetap memakai palet slate/theme existing (contoh: NEW gray, CUTTING blue, PROGRESS amber, FINISHED green, INVOICED purple) — rinci diimplementasi nanti sesuai `productionStatusColor` sekarang.

## Konsumen yang dirombak

1. **`types/pipeline.ts`** — enum + `productionStatusLabel/Color` jadi 5 nilai.
2. **`lib/productionStatus.ts`** — `STATUS_ORDER` jadi 5; `deriveStatus` signature berubah (dari `(rawStatus, cutting, sewing, qty)` → `(cutting, sewing, qty)` — karena Invoiced kini dari `invoice_status`, bukan rawStatus); `validateStatusTransition` disesuaikan.
3. **`pages/ProductionMonitoring.tsx`** — Kanban mengiterasi `STATUS_ORDER` baru (5 kolom); `filteredWO`/decorate pakai `deriveStatus` baru; badge `StatusBadge` memakai label baru; filter `cuttingQueueWO`/`cuttingDoneWO` ikut (sesuaikan: "New" vs sisanya).
4. **`pages/SewingEntryForm.tsx`** — dropdown WO filter `['PROGRESS']` (dari `CUTTING_COMPLETE`/`SEWING_IN_PROGRESS`); auto-transition: sewing pertama → `PROGRESS`? Atau → `CUTTING`? Lihat catatan. Saat jahit = qty → `FINISHED` (panggil `transitionToFinishingComplete`).
5. **`services/autoInvoice.ts`** — idempotency `prod_status IN (FINISHED, INVOICED)`; write `prod_status='FINISHED'` saat transition; backfill `.in`.
6. **`services/eligibleWorkOrders.ts`** — `.in('prod_status', [...5 nil])`; `deriveStatus` mengembalikan `FINISHED`.
7. **`services/workOrders.ts`** — `updateProdStatus`; fetch memetakan nilai baru.
8. **`pages/InvoicingPage.tsx`** — backfill `.in` pakai `FINISHED`, `INVOICED`.
9. **`pages/OrderEntry.tsx`** — create WO pakai `productionStatus: 'NEW'`.
10. **`pages/SeedPage.tsx`** — nilai seed diganti ke 5 baru (mis. `FINISHED`, `PROGRESS`, dst).

## Migration (data normalization)

Live `work_orders.prod_status` saat ini: 2× `FINISHED`, 2× `FINISHING_COMPLETE`. Migration:
```sql
UPDATE public.work_orders
SET prod_status = 'FINISHED'
WHERE prod_status = 'FINISHING_COMPLETE';
UPDATE public.work_orders
SET prod_status = 'CUTTING'
WHERE prod_status = 'CUTTING_COMPLETE';
UPDATE public.work_orders
SET prod_status = 'PROGRESS'
WHERE prod_status = 'SEWING_IN_PROGRESS';
UPDATE public.work_orders
SET prod_status = 'NEW'
WHERE prod_status = 'CUTTING_PENDING';
-- FINISHING_IN_PROGRESS -> PROGRESS (gabungan progres)
UPDATE public.work_orders
SET prod_status = 'PROGRESS'
WHERE prod_status = 'FINISHING_IN_PROGRESS';
```

Catatan: data live saat ini hanya `FINISHING_COMPLETE` yang perlu dipetakan (2 baris); sisanya aman. Migration ditulis sesuci dengan konteks live & hasil MCP.

## Transition / auto-status (SewingEntryForm)

- Sebelum: first sewing → `SEWING_IN_PROGRESS`; jahit==cutting && cutting>qty → `FINISHING_IN_PROGRESS`; jahit==cutting==qty → `FINISHING_COMPLETE`.
- Setelah: koleksi Next? Lihat detail:
  - Sewing pertama → `PROGRESS` (karena cutting sudah diisi, jahit>0 → bukan CUTTING lagi).
  - Ketika `sewingTotal + qty == qty` (≤) dan menyamai qty → `FINISHED` (via `transitionToFinishingComplete` / auto-invoice).
  - Tidak ada lagi `FINISHING_IN_PROGRESS`.

## Verify & acceptance

- `npm run build` hijau.
- Kanban tampil 5 kolom: New / Cutting / Progress / Finished / Invoiced.
- WO dengan cutting=0 → New; cutting>0,jahit=0 → Cutting; jahit<qty → Progress; =qty → Finished; invoice_status != NONE → Invoiced.
- Data lama dinormalisasi (migration); seed disesuai.
- Auto-invoice & eligible tetap bekerja (FINISHED masih memicu invoice).
- Manual: run app, masuk Production Monitoring → Kanban.

## Out of scope

- Ubah alur/cut flow produksi selain yang dimap ke 5 status.
- Perubahan label/hal lain di module lain (top bar, dsb) yang tak terkait.
- Normalkan historis `awal_records` (kecuali migration di atas).