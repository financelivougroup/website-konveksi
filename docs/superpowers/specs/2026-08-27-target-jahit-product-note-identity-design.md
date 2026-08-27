# Target Jahit: Product Note sebagai Identitas Produksi

**Date:** 2026-08-27  
**Status:** Approved in chat; pending written-spec review  
**Scope:** Planning Produksi → Generate Target Jahit → Rincian Realisasi per Desain

## Context

Overlay detail Target Jahit saat ini menampilkan Product, Warna, Qty Target, Qty Realisasi, Progress, dan nominal. Product Note belum tersedia, padahal field tersebut adalah identitas produksi/restock keberapa.

Inspeksi live schema melalui Supabase MCP pada 2026-08-26 mengonfirmasi:

- `work_orders.product_note` tersedia dan nullable.
- `sewing_records.work_order_id` berelasi ke `work_orders.id`.
- `planning_produksi` belum memiliki `product_note`.
- `target_jahit_detail` belum memiliki `product_note`.
- Generator Target Jahit saat ini menggabungkan planning berdasarkan `product + warna`.
- Komputasi realisasi detail saat ini menggabungkan sewing berdasarkan `product` saja.

Menambahkan header dan cell Product Note hanya di UI tidak cukup: Product dan Warna yang sama dapat berasal dari beberapa produksi, sehingga satu baris detail dapat mencampur identitas, qty realisasi, dan nominal dari produksi yang berbeda.

## Goal

Product Note menjadi identitas produksi yang dibawa sejak Planning Produksi sampai Rincian Realisasi per Desain. Detail dengan Product Note berbeda harus menjadi baris terpisah dan realisasinya tidak boleh tercampur.

## Non-Goals

- Mengubah rumus target bulanan, benefit, Utang Staf, atau akumulasi.
- Mengubah harga Jahit/Obras yang saat ini ditentukan dari Product.
- Mengubah struktur `work_orders` atau `sewing_records`.
- Memaksa backfill tebakan untuk data lama yang tidak memiliki Product Note.
- Mengubah Product Note pada order produksi yang sudah ada.

## Decisions

1. Tambahkan `product_note TEXT NULL` pada `planning_produksi` dan `target_jahit_detail`.
2. Product Note wajib diisi melalui form Planning Produksi untuk planning baru atau yang diedit setelah fitur ini tersedia.
3. Kolom database tetap nullable agar migration aman dan data lama tetap dapat dibaca.
4. Generator mengelompokkan detail memakai identitas `productNote + product + warna`.
5. Realisasi detail dicocokkan memakai identitas Work Order `productNote + product + warna`.
6. Detail lama dengan `productNote = null` memakai fallback kompatibilitas berdasarkan Product, mengikuti perilaku lama. Fallback ini hanya untuk data lama; detail baru harus memakai Product Note.
7. Overlay menampilkan Product Note tepat sebelum Product; nilai kosong ditampilkan `—`.
8. Planning Produksi juga menampilkan Product Note pada tabel, pencarian, filter/sort, pengaturan kolom, dan export agar identitas dapat diperiksa sebelum Generate Target.

## Data Model

### `planning_produksi`

Tambah:

```sql
product_note TEXT
```

Semantik:

- Nilai berasal dari input pengguna pada Planning Produksi.
- Nilai kosong pada baris lama diperbolehkan.
- UI menolak create/update baru bila Product Note kosong.

### `target_jahit_detail`

Tambah:

```sql
product_note TEXT
```

Semantik:

- Disalin dari `planning_produksi.product_note` saat Generate Target.
- Menjadi bagian identitas detail bersama Product dan Warna.
- Nullable untuk kompatibilitas data lama.

### Migration

Buat migration baru yang idempoten dengan dua `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

Migration diterapkan melalui Supabase MCP setelah live schema sudah diverifikasi. Tidak dilakukan backfill otomatis karena Product Note lama tidak dapat ditentukan secara andal hanya dari Product/Warna.

## Data Flow

### 1. Planning Produksi

Form create/edit menambahkan input shadcn `Input` berlabel **Product Note*** sebelum Product. Payload service menyimpan `product_note`.

Tabel menambahkan kolom Product Note sebelum Product. Field tersebut ikut:

- pencarian teks;
- Filter dan Sort;
- pengaturan Kolom;
- CSV export;
- form edit.

### 2. Generate Target Jahit

Planning approved dikelompokkan per staf seperti sekarang. Di dalam setiap staf, detail menggunakan composite key yang tidak ambigu, misalnya serialisasi tuple:

```ts
JSON.stringify([productNote ?? '', product, warna ?? ''])
```

Key tidak dibuat dengan concatenation delimiter sederhana agar nilai yang kebetulan mengandung delimiter tidak bertabrakan.

Hasil insert ke `target_jahit_detail` menyertakan:

```ts
{
  product_note: productNote,
  product,
  warna,
  qty_target,
  // field existing lainnya
}
```

Dua planning dengan tuple yang sama tetap digabung dan Qty Target dijumlahkan. Product Note berbeda selalu menghasilkan baris detail berbeda.

### 3. Work Order Metadata

Target Jahit Page tidak lagi memakai map `workOrderId → product` saja. Komputasi menerima metadata minimal:

```ts
interface WorkOrderDesignIdentity {
  productNote: string | null;
  product: string;
  warna: string | null;
}
```

Map dibangun dari hasil service Work Order yang sudah memiliki `productNote`, `product`, dan `warna`.

### 4. Realisasi per Detail

Untuk detail baru yang memiliki Product Note:

- filter sewing berdasarkan staf dan bulan;
- resolve `workOrderId` ke Work Order metadata;
- agregasi Qty Selesai berdasarkan tuple `productNote + product + warna`;
- distribusikan qty hanya di antara detail yang memiliki tuple identik bila terdapat duplikasi detail.

Untuk detail lama tanpa Product Note:

- gunakan agregasi Product seperti perilaku lama;
- distribusikan proporsional terhadap Qty Target di antara detail legacy untuk Product tersebut;
- jangan memasukkan detail baru ber-Product Note ke kelompok fallback legacy, agar satu laporan tidak dihitung ganda.

Aturan ini menjaga data lama tetap terlihat tanpa mengklaim identitas produksi yang tidak diketahui.

### 5. Overlay Target Jahit

Urutan tabel menjadi:

1. Product Note
2. Product
3. Warna
4. Qty Target
5. Qty Realisasi
6. Progress
7. Harga Jahit + Obras — owner/finance saja
8. Nilai Realisasi — owner/finance saja

Product Note tidak memuat nominal sehingga terlihat untuk role inventory seperti Product dan Warna.

## Service and Type Changes

### `src/services/planningProduksi.ts`

- Tambahkan `productNote: string | null` pada `PlanningProduksiRow`.
- Map `product_note ↔ productNote` untuk read/create/update.

### `src/services/targetJahitDetail.ts`

- Tambahkan `productNote: string | null` pada `TargetJahitDetailRow`.
- Map `product_note ↔ productNote` untuk fetch/upsert.

### `src/services/staffDebt.ts`

- Baca `product_note` dari planning.
- Sertakan Product Note dalam struktur grouping dan detail insert.
- Rumus harga, target bulanan, target cost, dan Utang Staf tidak berubah.

### `src/lib/targetCompute.ts`

- Ganti parameter map Product dengan map metadata Work Order.
- Tambahkan helper murni untuk membentuk identity key dan menghitung realisasi detail.
- Pertahankan fallback legacy yang eksplisit dan tidak double-count.
- `enrichTargetRows` tetap menghasilkan perhitungan parent yang sama.

### `src/pages/PlanningProduksiPage.tsx`

- Input, tabel, search/filter/sort/hide/export Product Note.
- Validasi Product Note pada create/update.

### `src/pages/TargetJahitPage.tsx`

- Simpan Work Order metadata map.
- Kirim map tersebut ke fungsi enrichment.
- Render header/cell Product Note sebelum Product.

## Error Handling and Compatibility

- Jika migration gagal, perubahan aplikasi tidak dianggap selesai dan tidak dipakai untuk menulis data.
- Product Note lama yang kosong tidak menyebabkan render crash; UI menampilkan `—`.
- Work Order yang tidak ditemukan tidak menyumbang realisasi detail, sama dengan perilaku existing.
- Product Note kosong pada form baru menghasilkan pesan validasi dan tombol simpan tetap disabled.
- Existing target yang sudah pernah digenerate tidak diregenerate otomatis; Product Note-nya tetap kosong sampai ada keputusan backfill manual yang dapat dipertanggungjawabkan.

## Testing Strategy

### Pure computation tests — RED before production code

Tambahkan test untuk:

1. Product dan Warna sama dengan Product Note berbeda menghasilkan Qty Realisasi terpisah.
2. Tuple Product Note + Product + Warna yang sama mengagregasi beberapa sewing record.
3. Detail legacy tanpa Product Note tetap memakai fallback Product.
4. Detail legacy tidak menghitung ulang sewing yang sudah masuk ke detail baru ber-Product Note.
5. Grouping planning memisahkan Product Note berbeda dan menggabungkan tuple identik.

Jika grouping generator sulit dites karena terikat Supabase, ekstrak hanya transformasi grouping menjadi helper murni kecil; operasi database tetap berada di service.

### Static verification

- TypeScript build: `npm run build`.
- Tests: jalankan seluruh Node test suite yang tersedia, termasuk test Product Note baru.
- ESLint pada file yang berubah; temuan baseline yang sudah ada dilaporkan terpisah.
- Periksa diff dan git status untuk memastikan tidak ada perubahan di luar scope.

### Database verification

Melalui Supabase MCP:

- pastikan kedua kolom ada setelah migration;
- query struktur/row sample secukupnya tanpa memodifikasi data produksi pengguna;
- jangan membuat data uji permanen.

### Manual smoke

1. Buat dua planning untuk staf/bulan/Product/Warna sama tetapi Product Note berbeda.
2. Approve dan Generate Target.
3. Pastikan overlay menampilkan dua baris terpisah.
4. Tambahkan/cek sewing pada Work Order masing-masing dan pastikan Qty Realisasi/nominal tidak silang.
5. Cek data lama tanpa Product Note tetap tampil `—`.
6. Cek role inventory tidak melihat nominal tetapi tetap melihat Product Note.

## Acceptance Criteria

- Product Note tampil sebelum Product pada Rincian Realisasi per Desain.
- Product Note berasal dari Planning Produksi dan tersimpan di Target Jahit Detail.
- Product Note berbeda tidak pernah digabung dalam satu detail target.
- Qty Realisasi dan nominal detail tidak tercampur antara Product Note berbeda.
- Planning Produksi mengekspos Product Note pada input dan tabel operasionalnya.
- Data legacy tanpa Product Note tetap dapat ditampilkan dengan fallback yang tidak double-count.
- Rumus Target, Benefit, Utang Staf, dan akumulasi tidak berubah.
- Migration berdasarkan live schema dan diterapkan hanya melalui Supabase MCP.
- Tests dan build lulus; lint dilaporkan dengan baseline terpisah bila ada temuan pre-existing.
