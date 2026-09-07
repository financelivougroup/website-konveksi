# Target Jahit: Basis Biaya (Cost) sebagai Patokan Utama

**Date:** 2026-09-06
**Status:** Draft — menunggu tinjauan user
**Scope:** Perhitungan Target Jahit, definisi kolom tabel Target, tab Utang Staf, tab Belum Jahit

## Context

Target Jahit selama ini mengukur pencapaian dalam **pcs**: `Progress`, `Status Final`, dan seluruh kolom akumulasi dihitung dari `realisasi_monthly / target_monthly`. Model operasional sebenarnya memakai **Rupiah** sebagai patokan.

Alasan bisnisnya: target adalah penghasilan penjahit bulanan (`target_cost_posisi`). Realisasi bertambah sebesar `harga jahit + obras per pcs × pcs yang dijahit`. Harga per pcs bervariasi mengikuti tingkat kesulitan — barang susah dihargai lebih tinggi, sehingga sedikit pcs bisa menghasilkan nilai besar. Mengukur pencapaian dengan pcs karena itu menyesatkan: penjahit yang sudah melampaui target uangnya bisa saja tetap berstatus "Tidak Tercapai" hanya karena angka pcs-nya di bawah rencana.

Kekurangan nilai (utang) tidak ditanggung sistem. Penjahit menutupnya sendiri dengan memilih pekerjaan tambahan dari daftar **Belum Jahit**: dia melihat tarif per pcs, menghitung sendiri apakah pekerjaan itu cukup menutup kekurangannya, lalu mengusulkannya ke Planning Jahit. Saat target digenerate ulang pada bulan yang sama, baris baru **tidak** dibuat (`if (existing) continue` pada `generateTargetsFromPlanning`) dan `target_cost_posisi` **tidak** berubah — selisih yang dihasilkan pekerjaan tambahan itulah yang menutup utang.

## Goals

1. Jadikan Rupiah satuan tunggal untuk seluruh ukuran pencapaian, baik bulanan maupun akumulasi.
2. Samakan sumber nilai antara Sisa Uang dan Utang Staf: keduanya `target_cost_posisi − realisasi cost`.
3. Tampilkan Sisa Uang bulanan dan kumulatif pada tabel Target (RAW) untuk **semua role**.
4. Pertahankan tab Utang Staf dengan nilai kumulatif yang berasal dari sumber harga yang sama.
5. Tambahkan kolom nilai Rupiah pada tab Belum Jahit agar penjahit/owner dapat menaksir kecukupan pekerjaan.
6. Lakukan seluruhnya tanpa migration.

## Non-Goals

- Perubahan `target_cost_posisi` saat penjahit mengusulkan pekerjaan tambahan.
- Alur propose ke Planning Jahit (belum ada modulnya).
- Pemotongan utang oleh potongan complain.
- Perhitungan potongan complain, penalti, atau benefit.
- Kalkulator simulasi, rekomendasi pekerjaan, atau pemindahan alokasi.
- Perubahan schema, migration, view, RPC, trigger, atau data produksi.
- Penghapusan kolom pcs bulanan (`target_monthly`, `realisasi_monthly`) — tetap dipertahankan sebagai informasi volume.

## Approved Decisions

1. **Satuan akumulasi adalah Rupiah.**
2. **Sumber harga tunggal** untuk Sisa Uang dan Utang Staf, tanpa dua jalur harga.
3. **Potongan complain tidak memengaruhi utang.**
4. **Utang Staf hanya kumulatif**, tanpa varian per bulan.
5. **Sisa Uang tampil untuk semua role.**
6. **Generate ke bulan yang sama tidak membuat baris baru** dan tidak mengubah `target_cost_posisi`.
7. **Nilai Rupiah pada Belum Jahit** = `Total Belum Jahit × (tarif jahit + tarif obras)`.
8. **Kolom pcs-akumulasi diganti**, bukan ditambahkan berdampingan (Opsi 1).
9. Realisasi biaya per desain memakai `harga_jahit + harga_obras` pada `target_jahit_detail`, dengan fallback price map bila kosong.
10. Fitur tetap baca-saja.
11. **Hanya dua kolom Sisa Uang yang diberi flag `inv`.** Semua role melihat Sisa Uang; kolom biaya lain (Target Cost / Posisi, seluruh akumulasi) tetap eksklusif owner/finance.
12. **Metrik "Pending Penalties" pada dashboard dilaporkan saja**, diperbaiki terpisah pada perubahan berikutnya.
13. **`Target Ngebut | Daily` tetap dipertahankan** dalam satuan pcs, karena target pcs dan realisasi pcs tetap ada. Hanya varian **akumulasi**-nya yang dihapus.

## Verified Live Data Relationships

Diverifikasi melalui Supabase MCP pada 2026-09-06:

- `target_jahit` memiliki `target_cost_posisi` dan `realisasi_cost_posisi` (keduanya `numeric`, default `0`).
- Kolom akumulasi (`target_accum`, `realisasi_accum`, `selisih_accum`, `progress_accum`, `status_final_akumulasi`, `target_ngebut_hari_akumulasi`) ada di DB tetapi **tidak pernah ditulis**. `generateTargetsFromPlanning` hanya mengisi `nama`, `bulanTahun`, `posisi`, `target_monthly`, `target_cost_posisi`. Nilai akumulasi murni hasil komputasi live di `enrichTargetRows()`.
- Data live saat ini: 2 baris (Sidik Faisal target Rp1.500.000; Suwati target Rp1.100.000), keduanya `realisasi_cost_posisi = 0` dan seluruh kolom akumulasi `0`.
- Tidak ada trigger pada `target_jahit` maupun `target_jahit_detail`.
- `target_jahit_detail` menyimpan `harga_jahit` dan `harga_obras` per desain.
- `work_orders.source_order_id → production_order_prices.production_order_id → production_order_price_components(component_key IN ['jahit','obras'])` adalah sumber tarif backlog.

Karena kolom akumulasi murni turunan, perubahan ini **tidak memerlukan migration**.

## Temuan yang Membatalkan Rancangan Awal

Dua temuan dari inspeksi kode membuat rancangan pertama tidak dapat dijalankan apa adanya. Keduanya harus diselesaikan sebelum implementasi.

### Temuan 1 — `realisasi_cost_posisi` di DB selalu 0

Rancangan awal menyuruh `computeDebt()` membaca `realisasi_cost_posisi` dari DB. Itu tidak bisa: kolom ini **tidak pernah ditulis oleh kode mana pun**. Ia hanya dideklarasikan pada `supabase/migrations/2026-07-23-target-jahit.sql:25` dan dibaca oleh `normalizeTargetRow()` pada `TargetJahitPage.tsx:39`.

Nilai `realisasi_cost_posisi` yang benar **hanya ada di memori**, hasil `enrichTargetRows()`, yang menjumlahkan `qtyRealisasi × (harga_jahit + harga_obras)` dari `target_jahit_detail`. Jadi DB tidak bisa dijadikan sumber.

Konsekuensi rancangan:

- **Utang Staf tidak boleh dihitung dari kolom DB.** Ia harus memakai fungsi realisasi-cost yang sama dengan `enrichTargetRows()`.
- Karena itu, satu-satunya cara sungguh-sungguh memenuhi keputusan 2 (sumber harga tunggal) adalah **menghitung utang di klien dari baris yang sudah di-enrich**, bukan lewat `computeDebt()` yang query sendiri ke DB.
- `computeDebt()` saat ini juga memakai price map dan **mengurangi potongan complain** — jalur harga kedua yang bertentangan dengan keputusan 2 dan 3.

### Temuan 2 — Role gating berlaku pada kolom, bukan hanya kartu

Rancangan awal mengira `canSeeDebt` hanya menyembunyikan kartu Sisa Uang pada overlay. Kenyataannya `TargetJahitPage.tsx:302-305` memakainya untuk memilih **kolom tabel**:

```ts
const roleColumns = useMemo(
  () => (canSeeDebt ? TARGET_COLUMNS : TARGET_COLUMNS.filter((c) => c.inv)),
  [canSeeDebt],
);
```

Inventory hanya melihat kolom ber-flag `inv`. Hampir seluruh kolom biaya (`targetCostPosisi`, `realisasiCostPosisi`, dan seluruh kolom akumulasi) **tidak** ber-flag `inv`, sehingga tidak pernah tampil untuk Inventory.

Keputusan 5 ("Sisa Uang tampil untuk semua role") karena itu **tidak dapat dipenuhi dengan sekadar menghapus gate pada kartu**.

**Diputuskan (opsi a):** beri flag `inv` **hanya pada dua kolom Sisa Uang baru**. Sisa Uang tampil untuk semua role, sementara kolom biaya lain (`Target Cost / Posisi`, `Realisasi Cost / Posisi`, seluruh kolom akumulasi) tetap eksklusif owner/finance. Ini yang paling konsisten dengan keputusan 5, yang menyebut Sisa Uang secara spesifik — bukan seluruh kolom biaya.

### Temuan 3 — Konsumen lain dari field yang diganti

- `staffDebtEligibility.ts:27` memakai `selisihAccum < 0`; `filterDebtRowsByLatestAccum()` dipanggil pada `TargetJahitPage.tsx:291` dengan `allEnriched` (hasil enrich), sehingga field pengganti harus tersedia di enriched row.
- `DetailPanel.tsx:232-235` menampilkan `targetAccum`, `realisasiAccum`, `selisihAccum`, `progressAccum` sebagai field readonly.
- `ProductionDashboard.tsx:47` menghitung `pendingPenalty` dari `t.selisih_accum` **langsung dari DB** — nilai yang selalu 0. Metrik "Pending Penalties" pada dashboard karena itu sudah tidak berfungsi sejak lama. Di luar cakupan, tetapi perlu dilaporkan.
- `mockData.ts:69-74` dan `233-235` memuat definisi kolom paralel beserta contoh baris berisi nilai akumulasi pcs.

## Computation Design

### 1. Sisa Uang bulanan

```
sisaUangMonthly = max(0, target_cost_posisi − realisasiCostPosisi)
```

Tidak kumulatif. Tidak memasukkan potongan, penalti, atau benefit. `realisasiCostPosisi` adalah hasil komputasi live, bukan kolom DB.

### 2. Akumulasi dalam Rupiah

`enrichTargetRows()` mengganti akumulasi berbasis pcs:

```
acc.targetCost     += target_cost_posisi
acc.realisasiCost  += realisasiCostPosisi

targetCostAccum     = acc.targetCost
realisasiCostAccum  = acc.realisasiCost
selisihCostAccum    = realisasiCostAccum − targetCostAccum
sisaUangAccum       = max(0, targetCostAccum − realisasiCostAccum)
progressCostAccum   = targetCostAccum > 0 ? realisasiCostAccum / targetCostAccum : 0
```

Tanda `selisihCostAccum` harus tetap berarti "negatif = masih kurang" agar `staffDebtEligibility.ts` tidak berubah semantik.

### 3. Progress dan Status Final

```
progressCostMonthly = target_cost_posisi > 0 ? realisasiCostPosisi / target_cost_posisi : 0
statusFinalCost     = finalStatus(realisasiCostPosisi, target_cost_posisi, ...)
```

`finalStatus()` tidak diubah; hanya argumennya yang kini Rupiah.

### 4. Utang Staf — dihitung dari enriched row

Menyusul Temuan 1, utang dihitung di klien:

```
untuk setiap staf:
  totalTargetCost    = Σ target_cost_posisi   (seluruh baris target staf itu)
  totalRealisasiCost = Σ realisasiCostPosisi  (baris yang sama, hasil enrich)
  utang              = max(0, totalTargetCost − totalRealisasiCost)
```

Tanpa potongan complain. Kumulatif; tidak ada varian bulanan.

`computeDebt()` pada `staffDebt.ts` tidak lagi dipakai tab ini. Diverifikasi lewat pencarian statis: satu-satunya pemanggil adalah `TargetJahitPage.tsx:234` (`staffDebt.ts:83` adalah deklarasi, `targetCompute.ts:4` hanya mengimpor `productionCodePriceKey`/`PriceMap`, dan `PlanningProduksiPage.tsx:18` hanya mengimpor `generateTargetsFromPlanning`). Jadi tidak ada konsumen lain yang terdampak. Fungsi dapat diganti dengan helper murni yang menerima enriched row, sehingga perhitungan utang menjadi teruji tanpa Supabase.

Ini sekaligus membuat Sisa Uang dan Utang Staf **benar-benar satu sumber harga**, sebagaimana keputusan 2.

### 5. Nilai Rupiah pada Belum Jahit

```
nilaiBacklog = totalBelumJahit × (tarif jahit + tarif obras)
```

Tarif per Work Order sudah ada pada `WorkOrderBacklog.rate`. Ringkasan grup memakai aturan yang sama dengan tarif: nilai tunggal bila seragam, `Bervariasi` bila berbeda atau sebagian hilang, `—` bila tidak ada tarif.

Karena tarif bisa `null`, `WorkOrderBacklog` perlu field `nilaiBacklog: number | null` — bukan `0`, agar `—` tidak berubah menjadi "Rp0" yang seolah-olah berarti "tidak bernilai".

## UI Design

### Tabel Target (RAW)

Kolom yang **diganti**:

| Kolom lama | Kolom baru | Catatan |
|---|---|---|
| Progress \| Monthly | Progress Biaya \| Monthly | basis Rupiah |
| Status Final \| Monthly | Status Biaya \| Monthly | basis Rupiah |
| Target Akumulasi | Target Cost Akumulasi | Rupiah |
| Realisasi Akumulasi | Realisasi Cost Akumulasi | Rupiah |
| Selisih Akumulasi | Selisih Cost Akumulasi | Rupiah, boleh negatif |
| Progress Akumulasi | Progress Biaya Akumulasi | basis Rupiah |
| Status Final \| Akumulasi | Status Biaya \| Akumulasi | basis Rupiah |
| Target Ngebut \| Akumulasi | — | **dihapus**; tidak bermakna dalam Rupiah |

`Target Ngebut | Daily` **tetap ada dan tidak berubah** — masih `ceil(sisa_target_pcs ÷ sisa_hari)` dalam pcs, karena target pcs dan realisasi pcs tetap dipertahankan (keputusan 13). Yang dihapus hanya varian akumulasinya, karena akumulasi kini berbasis Rupiah dan tidak bisa dibagi hari kerja.

Kolom yang **ditambahkan**:

| Kolom | Keterangan |
|---|---|
| Sisa Uang \| Monthly | `max(0, target_cost_posisi − realisasiCostPosisi)` |
| Sisa Uang \| Akumulasi | akumulatif |

Kolom pcs bulanan (`Target | Monthly`, `Realisasi | Monthly`, `Sisa Target | Monthly`, `Target | Daily`, `Target Ngebut | Daily`) **tetap** sebagai informasi volume harian.

Kedua kolom Sisa Uang diberi flag `inv` agar tampil untuk semua role (keputusan 11).

### Tab Utang Staf

Tetap kumulatif, kolom: Nama | Total Target Cost | Total Realisasi Cost | Utang. Tidak ada kolom per bulan.

Catatan label: header saat ini berbunyi "Total Nilai PCS". Karena nilainya kini murni biaya (bukan pcs), label perlu disesuaikan agar tidak menyesatkan.

### Tab Belum Jahit

Tambah kolom **Nilai Rupiah** setelah Tarif Jahit + Obras, baik di baris grup maupun rincian Work Order.

### Overlay detail Target

Kartu Sisa Uang tidak lagi digate role — konsisten dengan keputusan 11, karena nilainya kini tampil di tabel untuk semua role. Tambahkan Sisa Uang Akumulasi.

## Files to Change

| File | Perubahan |
|---|---|
| `src/lib/targetCompute.ts` | Akumulasi Rupiah; progress & status basis biaya; field `sisaUangMonthly`, `sisaUangAccum`, `targetCostAccum`, `realisasiCostAccum`, `selisihCostAccum`, `progressCostAccum`, `statusFinalCost*` |
| `src/lib/sewingBacklog.ts` | Tambah `nilaiBacklog: number \| null` per Work Order dan ringkasannya |
| `src/services/staffDebt.ts` | `computeDebt()` diganti/direlokasi: realisasi dari enriched row, tanpa potongan complain |
| `src/lib/staffDebtEligibility.ts` | Ganti `selisihAccum` → `selisihCostAccum` |
| `src/pages/TargetJahitPage.tsx` | Definisi kolom, perhitungan utang dari enriched row, role gating, kolom Nilai Rupiah |
| `src/data/mockData.ts` | `viewConfig['target-jahit']` mengikuti kolom baru; bersihkan field akumulasi pcs pada baris contoh |
| `src/components/Panel/DetailPanel.tsx` | Field akumulasi mengikuti nama baru |
| `tests/` | Tes baru untuk akumulasi Rupiah dan utang |

## Risks

1. **Angka utang berubah bagi staf ber-complain** — potongan tidak lagi menguranginya. Dampak aktual bergantung pada data complain yang ada; perlu dikonfirmasi ke pemilik data.
2. **`Target Ngebut | Akumulasi` hilang**, sementara varian `Daily`-nya dipertahankan. Asimetri ini disengaja (keputusan 13): akumulasi kini Rupiah sehingga tidak bisa dibagi hari kerja, sedangkan varian harian masih bermakna dalam pcs. Perlu dipastikan pengguna tidak mengartikan hilangnya varian akumulasi sebagai bug.
3. **Metrik "Pending Penalties" pada dashboard sudah tidak berfungsi** (membaca `selisih_accum` dari DB yang selalu 0). **Diputuskan: dilaporkan saja**, diperbaiki terpisah; dicatat pada `project.md`.
4. **Perubahan perhitungan utang menyentuh logika finansial**, sehingga termasuk kategori yang menurut CLAUDE.md harus dikerjakan model utama, bukan didelegasikan.
5. **Baris contoh `mockData`** memuat nilai akumulasi pcs yang tidak lagi selaras; harus dibersihkan.

## Open Questions

Tidak ada. Seluruh pertanyaan terjawab; spec siap ditinjau.
