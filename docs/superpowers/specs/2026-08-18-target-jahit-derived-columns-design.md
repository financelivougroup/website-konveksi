# Target Jahit: Menghidupkan 19 Kolom Turunan + Realisasi per Desain

**Date:** 2026-08-18
**Status:** Approved for implementation planning
**Approach:** A — pure lib + page wiring (live compute in app)

## Context

Tabel `target_jahit` punya 22 kolom, tapi saat ini hanya 4 yang terisi oleh Generate Target (`nama`, `posisi`, `bulanTahun`, `target_monthly`, `target_cost_posisi`). Sisanya — salary (baru bisa diedit manual), hari kerja, target harian, realisasi, cost realisasi, akumulasi, dan status final — semuanya 0/kosong dan tidak pernah dihitung. Spec asli 2026-08-06 sudah mendefinisikan seluruh rumusnya, tapi belum diimplementasikan.

Fitur ini menghidupkan seluruh kolom turunan dan menambahkan tampilan realisasi per desain (dari `target_jahit_detail`) sebagai baris expandable.

## Decisions (locked via brainstorming)

1. **Arsitektur: hitung live di app** — semua nilai turunan dihitung saat halaman dibuka dari data sumber (sewing_records, daftar_libur, target_jahit, target_jahit_detail, work_orders, price map). Tidak pernah basi, tanpa mekanisme sinkronisasi, pola sama dengan `deriveStatus` di Production Monitoring. Kolom DB tetap ada sebagai referensi/export; Generate Target tidak berubah (tetap menulis 3 nilai awal).
2. **Hari kerja: Senin–Sabtu** minus tanggal di `daftar_libur`. `target_daily` = `target_monthly ÷ total_hari_kerja`.
3. **`target_ngebut_hari` = `sisa_target_monthly ÷ sisa_hari`** (revisi rumus spec lama yang `target_daily + sisa÷sisa_hari`), dibulatkan ke atas. Guard sisa_hari = 0.
4. **Status final**: bulan berjalan → 'Berjalan'; bulan lewat dengan realisasi ≥ target → 'Tercapai'; selain itu → 'Tidak Tercapai'. Logika sama untuk status akumulasi (berbasis nilai akumulasi; akumulasi dianggap 'berjalan' selama bulan tertuanya adalah bulan berjalan).
5. **Realisasi per desain ditampilkan sebagai baris expandable** di tabel utama (klik ▸/▾ melebarkan baris menjadi sub-tabel detail), bukan modal/tab.
6. **Scope termasuk `target_jahit_detail`**: qty_realisasi per produk dihitung live.

## Design

### Rumus 19 kolom turunan (semua dihitung live per baris target)

Input: baris `target_jahit`, `sewing_records` (semua), `daftar_libur`, price map (`buildPriceMap`), `work_orders` (map WO id → product), tanggal hari ini.

| Kolom | Rumus |
|---|---|
| `total_hari_kerja` | jumlah hari Senin–Sabtu di bulan `bulanTahun`, dikurangi entri `daftar_libur` yang jatuh di bulan itu |
| `hari_kerja_hari_ini` | jumlah hari kerja (definisi sama) yang tanggalnya ≤ hari ini dalam bulan itu; bulan lewat = total_hari_kerja; bulan depan = 0 |
| `sisa_hari` | `total_hari_kerja − hari_kerja_hari_ini` |
| `target_daily` | `target_monthly ÷ total_hari_kerja` |
| `target_ngebut_hari` | `ceil(sisa_target_monthly ÷ sisa_hari)`; sisa_hari = 0 → 0 |
| `realisasi_monthly` | Σ `qty_selesai` sewing_records orang itu yang `tgl_laporan` berada di bulan `bulanTahun` |
| `sisa_target_monthly` | `max(0, target_monthly − realisasi_monthly)` |
| `progress_monthly` | `realisasi_monthly ÷ target_monthly` (0 bila target 0); ditampilkan sebagai persen |
| `realisasi_cost_posisi` | Σ(realisasi per desain × (harga_jahit + harga_obras) dari detail); fallback price map bila harga di detail 0 |
| `target_accum` | Σ target_monthly orang itu dari bulan pertama s/d bulan baris ini |
| `realisasi_accum` | Σ realisasi_monthly orang itu dari bulan pertama s/d bulan baris ini |
| `selisih_accum` | `realisasi_accum − target_accum` |
| `target_ngebut_hari_akumulasi` | `ceil(max(0, selisih negatif akumulasi yang harus dikejar) ÷ sisa_hari bulan ini)`; disederhanakan: `ceil(max(0, target_accum − realisasi_accum) ÷ sisa_hari)` bulan berjalan; 0 bila sisa_hari 0 |
| `progress_accum` | `realisasi_accum ÷ target_accum` (0 bila target_accum 0); persen |
| `status_final` | bulan berjalan → 'Berjalan'; bulan lewat: realisasi_monthly ≥ target_monthly → 'Tercapai'; selain itu 'Tidak Tercapai' |
| `status_final_akumulasi` | sama, berbasis akumulasi; dianggap berjalan bila baris ini bulan berjalan |

`salary` tetap kolom yang bisa diedit manual (fitur 2026-08-18 sebelumnya) — bukan turunan.

### Pembulatan

- Nilai harian (target_daily, ngebut): **dibulatkan ke atas** (ceil) — konservatif: tidak understated. `target_ngebut_hari` selalu integer via ceil.
- `target_daily` ditampilkan 1 desimal bila tidak bulat.
- Persen (progress): 1 desimal, mis. `66.7%`.
- Cost: integer rupiah (tanpa desimal).

### Realisasi per desain (baris expandable)

- Tombol **▸/▾** di ujung kiri setiap baris (sebelum kolom checkbox). Klik → baris melebar: sub-tabel di bawahnya dengan design-system tokens yang sama (`T_TABLE`/`T_TH`/`T_TD`, tanpa border luar tambahan) berisi baris `target_jahit_detail` milik orang+bulan itu:

| Product | Warna | Qty Target | Qty Realisasi | Harga Jahit+Obras | Nilai Realisasi |
|---|---|---|---|---|---|

- `qty_realisasi` per detail = Σ `qty_selesai` sewing_records orang itu di bulan itu yang work order-nya ber-`product` sama dengan `detail.product` (via `sewing_records.work_order_id` → `work_orders.product`).
- Edge case: satu product muncul di >1 detail row (warna berbeda) → realisasi didistribusi proporsional ke `qty_target` masing-masing (dicatat di implementasi; data saat ini 1 produk 1 row).
- Kolom Harga/Nilai di sub-tabel **disembunyikan untuk inventory** (konsisten aturan akses).
- Kolom tombol expand (▸) tidak masuk daftar pengaturan Kolom (kolom kontrol).

### Struktur file

- **Baru** `src/lib/targetCompute.ts` — semua fungsi murni di atas (`countWorkdays`, `countElapsedWorkdays`, `enrichTargetRow`, `enrichDetail`, `monthStatus`). Tanpa fetch — input/output murni, mudah diuji & dipakai ulang.
- **Ubah** `src/pages/TargetJahitPage.tsx`:
  - Fetch tambahan paralel via `Promise.all`: `daftarLibur` (service ada), `sewingRecords` (service ada), `targetJahitDetail` (service ada), `workOrders` (service ada), `buildPriceMap()` (ada di staffDebt.ts).
  - `useMemo` enrichment: 22 kolom final dirender dari hasil `enrichTargetRow`, bukan nilai DB mentah.
  - Tombol expand + sub-tabel detail; state `expandedId: number | null`.
  - Badge status: Berjalan (biru), Tercapai (hijau), Tidak Tercapai (merah) — pola badge solid `tableStyles`.
  - Filter/Sort/Kolom/Export otomatis bekerja dengan nilai live (field list `TARGET_COLUMNS` tetap, nilai berubah).

### Tidak berubah

- Skema DB — semua kolom sudah ada; tidak ada migration.
- Generate Target di Planning Produksi (tetap menulis nama/posisi/target_monthly/target_cost_posisi + approved-gate).
- Sub-tab Utang Staf (computeDebt sudah berjalan sendiri).
- Edit salary inline, akses role (owner/finance vs inventory).

### Aturan akses

Sama persis dengan sekarang: `visibleColumns` memfilter kolom non-`inv` untuk inventory; enrichment menghitung semua kolom tapi hanya yang terlihat dirender. Kolom harga/nilai di sub-tabel detail ikut disembunyikan untuk inventory.

## Verification Strategy

1. `npm run build` hijau; lint tanpa temuan jenis baru (laporkan pre-existing terpisah).
2. Manual:
   - Generate target untuk bulan berjalan (atau pakai baris existing 2026-09) → semua 22 kolom terisi: hari kerja benar (Senin–Sabtu minus libur), target_daily & ngebut terisi, status 'Berjalan'.
   - Tambah laporan jahitan di Sewing Entry Form untuk penjahit yang punya target → kembali ke Target Jahit → realisasi_monthly, progress, sisa, akumulasi, realisasi_cost ikut naik.
   - Klik ▸ → sub-tabel detail tampil; qty_realisasi per desain cocok dengan laporan jahitan.
   - Login sebagai inventory → kolom salary/cost/akumulasi & kolom harga di detail tidak terlihat.
   - Bulan lewat (ubah bulanTarget via DB MCP untuk uji, atau tunggu) → status 'Tercapai'/'Tidak Tercapai' benar.

## Acceptance Criteria

- Semua 22 kolom tabel Target Jahit menampilkan nilai live yang benar sesuai rumus (tanpa mekanisme sinkronisasi DB).
- Hari kerja dihitung Senin–Sabtu minus daftar_libur; ngebut = ceil(sisa_target ÷ sisa_hari).
- Baris expandable menampilkan realisasi per desain dengan qty_realisasi yang cocok dengan sewing_records.
- Status final Berjalan/Tercapai/Tidak Tercapai benar untuk bulan berjalan dan bulan lewat.
- Aturan akses inventory tetap berlaku (termasuk kolom harga di sub-tabel detail).
- Tidak ada migration; Filter/Sort/Kolom/Export tetap berfungsi dengan nilai live.
