# Target Jahit: Informasi Belum Jahit dan Sisa Uang Bulanan

**Date:** 2026-08-29
**Status:** Approved in chat; pending written-spec review
**Scope:** Target Jahit table, Target detail overlay, and a new global Belum Jahit tab

## Context

Tabel Target Jahit saat ini menampilkan dua kolom hari kerja—Hari Kerja Efektif dan Hari Kerja Hari Ini—yang dibutuhkan oleh perhitungan internal tetapi tidak perlu terlihat dalam UI. Perhitungan tersebut harus tetap hidup karena menghasilkan Sisa Hari, Target Daily, Target Ngebut Daily, dan Target Ngebut Akumulasi.

Atasan pengguna juga membutuhkan informasi operasional yang lebih sederhana daripada kalkulator simulasi: pengguna cukup melihat sisa nominal bulanan yang perlu dikejar dan daftar seluruh pekerjaan yang belum selesai dijahit. Pengguna akan menghitung kemungkinan kombinasi pekerjaan sendiri. Sistem tidak perlu memberi rekomendasi, menyimpan simulasi, atau memindahkan alokasi penjahit.

## Goals

1. Hilangkan Hari Kerja Efektif dan Hari Kerja Hari Ini dari seluruh permukaan UI Target Jahit tanpa mengubah logika hari kerja maupun Target Ngebut.
2. Tampilkan Sisa Uang yang Harus Dikejar per baris penjahit/bulan untuk Owner dan Finance.
3. Tambahkan daftar global semua Work Order yang masih memiliki Total Belum Jahit.
4. Kelompokkan daftar utama berdasarkan Product Note dan izinkan pengguna membuka rincian Work Order.
5. Tampilkan daftar backlog lengkap pada tab Belum Jahit dan ringkasannya pada overlay Target.
6. Pertahankan fitur sebagai informasi baca-saja tanpa perubahan database atau alokasi pekerjaan.

## Non-Goals

- Kalkulator simulasi kombinasi Product Note atau jumlah PCS.
- Rekomendasi produk yang harus dikerjakan.
- Penyimpanan hasil simulasi.
- Pemindahan alokasi pekerjaan antarpenjahit.
- Integrasi prioritas low stock.
- Perubahan rumus Target, Benefit, Utang Staf, akumulasi, atau Target Ngebut.
- Perubahan schema, migration, view, RPC, atau data produksi.
- Penggunaan Cutting untuk menghitung backlog; keputusan produk menetapkan Cutting selalu sama dengan Qty Order.

## Approved Decisions

1. Fitur hanya menyajikan informasi baca-saja.
2. Sisa Uang bersifat bulanan, bukan kumulatif.
3. Rumus Sisa Uang adalah `max(0, salary bulan tersebut - realisasi cost bulan tersebut)`.
4. Sisa Uang tidak memasukkan penalti dan tidak mengubah tab Utang Staf.
5. Daftar Belum Jahit bersifat global: semua Work Order aktif yang masih memiliki backlog, bukan hanya desain yang dialokasikan kepada penjahit pada overlay.
6. Total Belum Jahit adalah `max(0, Qty Order - total Qty Jahit Work Order)`.
7. Total Qty Jahit menjumlahkan seluruh `sewing_records.qty_selesai` untuk Work Order, lintas penjahit dan lintas bulan.
8. Baris utama dikelompokkan per Product Note dan dapat dibuka untuk melihat rincian Work Order.
9. Semua role dapat melihat Product Note, Product, rincian Work Order, Total Belum Jahit, dan tarif Jahit + Obras per PCS.
10. Hanya Owner dan Finance dapat melihat Sisa Uang yang Harus Dikejar; Inventory tidak melihat kartu, label, atau nilainya.
11. Tarif harus berasal dari Register PO yang terkait langsung dengan `work_orders.source_order_id`, bukan fallback harga terbaru berdasarkan nama Product.
12. Jika tarif Work Order dalam satu Product Note berbeda, baris ringkas menampilkan `Bervariasi`; rincian menampilkan tarif persis setiap Work Order.
13. Daftar lengkap tersedia pada tab Belum Jahit dan ringkasan tersedia pada overlay Target.
14. Urutan backlog adalah Total Belum Jahit terbesar lebih dahulu, lalu Product Note alfabetis.

## Verified Live Data Relationships

Live schema diperiksa melalui Supabase MCP pada 2026-08-29:

- `work_orders.source_order_id` adalah FK ke `production_orders.id`.
- `register_po.production_order_id` adalah FK unik ke `production_orders.id`.
- `register_po_components.register_po_id` adalah FK ke `register_po.id`.
- Komponen tarif memiliki `key` dan `value`; tarif penjahit memakai key `jahit` + `obras`.
- `sewing_records.work_order_id` adalah FK ke `work_orders.id`.
- `work_orders` memiliki `product_note`, `product`, `warna`, `size`, `work_code`, dan `quantity`.

Relasi tersebut cukup untuk fitur ini tanpa perubahan schema.

## Computation Design

### 1. Hidden workday fields

`totalHariKerja` dan `hariKerjaHariIni` tetap dihasilkan oleh `enrichTargetRows()`.

Keduanya dikeluarkan dari definisi kolom UI Target Jahit sehingga tidak tersedia pada:

- header dan cell tabel;
- Filter;
- Sort;
- pengaturan Kolom;
- export CSV.

Nilai berikut tetap dihitung dengan input hari kerja yang sama:

- `sisaHari`;
- `targetDaily`;
- `targetNgebutHari`;
- `targetNgebutHariAkumulasi`.

Komponen tooltip Hari Kerja Efektif dihapus dari halaman karena tidak lagi memiliki trigger yang terlihat.

### 2. Monthly remaining money

Untuk setiap enriched Target row:

```text
Sisa Uang yang Harus Dikejar = max(0, salary - realisasiCostPosisi)
```

Sifat rumus:

- scoped ke bulan pada baris Target;
- memakai nilai realisasi desain bulan itu yang sudah dihitung oleh `enrichTargetRows()`;
- tidak memasukkan bulan lain;
- tidak memasukkan complain/penalti;
- tidak menggantikan atau mengubah rumus Utang Staf;
- hasil minimum Rp0.

Nilai diturunkan di helper murni atau pada enrichment, bukan ditulis ke database.

### 3. Work Order backlog

Untuk setiap Work Order:

```text
Qty Jahit = sum(sewing_records.qty_selesai where work_order_id = WorkOrder.id)
Total Belum Jahit = max(0, WorkOrder.quantity - Qty Jahit)
```

Aturan:

- agregasi sewing mencakup seluruh penjahit dan seluruh tanggal;
- Work Order dengan Total Belum Jahit = 0 tidak masuk backlog;
- sewing yang melebihi Qty Order tetap menghasilkan backlog 0;
- status database tidak menjadi sumber utama kelayakan backlog karena angka produksi adalah sumber kebenaran;
- Cutting tidak dibaca untuk rumus ini.

### 4. Exact per-Work-Order rate

Tarif setiap Work Order di-resolve melalui:

```text
work_orders.source_order_id
  -> register_po.production_order_id
  -> register_po_components(register_po_id, key in ['jahit', 'obras'])
```

```text
Tarif Jahit + Obras = component['jahit'] + component['obras']
```

Semantik data tidak lengkap:

- jika Register PO tidak ada, tarif `null` dan UI menampilkan `—`;
- jika hanya satu komponen tersedia, nilai komponen yang tersedia tetap dipakai dan komponen yang hilang bernilai 0;
- jika kedua komponen tidak tersedia, tarif dianggap tidak tersedia (`null`), bukan Rp0;
- Work Order tanpa tarif tetap masuk backlog.

### 5. Product Note grouping

Work Order backlog dikelompokkan per Product Note.

Untuk Product Note non-kosong, group key menggunakan nilai Product Note yang dinormalisasi untuk pencocokan tanpa mengubah label aslinya.

Untuk Work Order legacy tanpa Product Note, jangan satukan seluruh nilai kosong ke satu grup. Gunakan fallback key berbasis `sourceOrderId` bila tersedia, lalu `workOrder.id` sebagai fallback terakhir. Label UI tetap `—`.

Agregat group:

- Total Qty Order = jumlah Qty Order seluruh Work Order di group;
- Qty Jahit = jumlah Qty Jahit seluruh Work Order di group;
- Total Belum Jahit = jumlah Total Belum Jahit seluruh Work Order di group;
- Product = nama Product bila seragam, `Bervariasi` bila berbeda;
- Tarif = nominal bila seluruh tarif Work Order tersedia dan sama;
- Tarif = `Bervariasi` bila terdapat lebih dari satu tarif nominal;
- Tarif = `—` bila tidak ada tarif nominal yang tersedia;
- jika sebagian Work Order bertarif dan sebagian tidak, ringkasan menampilkan `Bervariasi` agar tidak mengklaim satu tarif berlaku untuk semua rincian.

## UI Design

### 1. Tab order and access

Urutan tab Target Jahit menjadi:

1. Target
2. Belum Jahit
3. Utang Staf
4. Benefit

Tab Belum Jahit tersedia untuk Owner, Finance, dan Inventory. Gate existing untuk Utang Staf dan Benefit tetap tidak berubah.

### 2. Belum Jahit tab

Toolbar mengikuti pola tabel dashboard yang sudah ada:

- search;
- jumlah Product Note backlog;
- tombol Refresh memakai refresh halaman existing.

Search mencocokkan:

- Product Note;
- Product;
- Work Code;
- Warna;
- Size.

Tabel ringkas:

| Product Note | Product | Total Qty Order | Qty Jahit | Total Belum Jahit | Tarif Jahit + Obras | Expand |
|---|---|---:|---:|---:|---|---|

Baris diurutkan berdasarkan Total Belum Jahit descending, lalu Product Note ascending. Baris dapat dibuka/tutup secara independen.

Rincian Work Order:

| Work Code | Product | Warna | Size | Qty Order | Qty Jahit | Total Belum Jahit | Tarif Jahit + Obras |
|---|---|---|---|---:|---:|---:|---:|

Semua role melihat seluruh kolom di kedua tingkat, termasuk tarif.

Empty state:

- `Semua Work Order sudah selesai dijahit.` bila tidak ada backlog;
- `Tidak ada hasil yang cocok dengan pencarian.` bila backlog ada tetapi search kosong hasilnya.

### 3. Target detail overlay

Overlay existing tetap mempertahankan:

- header penjahit dan bulan;
- stat Target Bulanan, Realisasi, Sisa Target, Status;
- progress bulanan;
- Rincian Realisasi per Desain.

Tambahan:

1. Owner/Finance melihat kartu **Sisa Uang yang Harus Dikejar** dengan rumus bulanan.
2. Inventory tidak melihat kartu, label, atau nilai tersebut.
3. Bagian **Product Note Belum Jahit** menampilkan ringkasan backlog global teratas sesuai urutan tab.
4. Ringkasan overlay dibatasi pada lima Product Note pertama agar overlay tetap ringkas.
5. Tombol **Lihat Semua Belum Jahit** menutup overlay dan mengaktifkan tab Belum Jahit.
6. Ringkasan tidak menawarkan input, pilihan jumlah PCS, rekomendasi, atau aksi oper alokasi.

Kartu stat overlay menggunakan layout responsif yang menampung jumlah kartu berbeda berdasarkan role tanpa menyisakan ruang kosong yang menyesatkan.

## Architecture and File Boundaries

### New pure helper: `src/lib/sewingBacklog.ts`

Tanggung jawab:

- agregasi Qty Jahit per Work Order;
- hitung Total Belum Jahit;
- bentuk item backlog Work Order;
- group backlog per Product Note;
- hitung ringkasan Product dan tarif;
- sort group;
- hitung Sisa Uang bulanan.

Helper tidak melakukan fetch dan menerima data yang sudah dinormalisasi. Interface input/output eksplisit agar unit test tidak memerlukan Supabase.

### Service addition

Tambahkan fungsi service terfokus untuk mengambil tarif Jahit + Obras per Production Order dari `register_po` dan `register_po_components`.

Batasan:

- service hanya fetch dan mapping;
- tidak menghitung backlog;
- tidak memakai latest-price-by-product;
- tidak melakukan write;
- error dikembalikan eksplisit kepada halaman.

Fungsi dapat ditempatkan pada service Register PO existing jika sesuai idiom file tersebut; jangan membuat service baru tanpa kebutuhan.

### `src/pages/TargetJahitPage.tsx`

Tanggung jawab tambahan:

- fetch rate map per Production Order bersama sumber data existing;
- simpan error backlog/rate tanpa menjatuhkan tab Target;
- memanggil helper murni melalui `useMemo`;
- state tab Belum Jahit dan expanded Product Note groups;
- rendering tab dan ringkasan overlay;
- role gating Sisa Uang.

Halaman tidak mengandung algoritma grouping atau tarif.

### Existing helper: `src/lib/targetCompute.ts`

Tetap menghitung hari kerja dan Target Ngebut tanpa perubahan semantik. Jika Sisa Uang ditambahkan sebagai bagian enrichment, rumusnya harus murni dan diuji; jika ditempatkan di `sewingBacklog.ts`, `TargetJahitPage` memanggil helper tersebut dari enriched row.

### Static view configuration

Jika `viewConfig['target-jahit']` masih mengekspos dua kolom hari kerja pada jalur UI lain yang aktif, hapus kedua kolom dari konfigurasi tampilan juga. Tipe/data database tidak dihapus.

## Error Handling

1. Fetch Work Order atau sewing gagal:
   - tab Belum Jahit menampilkan pesan gagal memuat dan tombol Refresh;
   - tab Target serta data yang berhasil dimuat tetap dapat digunakan;
   - jangan menampilkan empty state seolah backlog benar-benar nol.
2. Fetch tarif gagal:
   - backlog tetap dihitung;
   - tarif tampil `—`;
   - tampilkan pesan non-blocking bahwa tarif belum dapat dimuat.
3. Register PO hilang:
   - tarif Work Order `—`;
   - Work Order tetap tampil.
4. Product Note kosong:
   - label `—`;
   - order legacy tidak tercampur berkat fallback group key.
5. Sewing melebihi Qty Order:
   - backlog dijepit ke 0;
   - Work Order tidak tampil.
6. Tidak ada target row saat overlay akan dibuka:
   - overlay tidak dirender, mengikuti guard existing.

## Access Control

| Data | Owner | Finance | Inventory |
|---|---|---|---|
| Product Note backlog | ✅ | ✅ | ✅ |
| Rincian Work Order | ✅ | ✅ | ✅ |
| Qty Order / Qty Jahit / Total Belum Jahit | ✅ | ✅ | ✅ |
| Tarif Jahit + Obras | ✅ | ✅ | ✅ |
| Sisa Uang yang Harus Dikejar | ✅ | ✅ | ❌ |

Pembatasan Sisa Uang dilakukan sebelum render. Jangan menyertakan nilai tersebut pada struktur view model khusus Inventory jika dapat dihindari. Aturan visibility existing untuk Salary, cost Target, Utang Staf, dan Benefit tidak berubah.

## Testing Strategy

### Pure unit tests

Tambahkan test untuk:

1. Qty Order dikurangi seluruh sewing lintas penjahit dan bulan.
2. Work Order selesai tidak masuk backlog.
3. Sewing melebihi Qty Order menghasilkan backlog 0.
4. Work Order dengan Product Note sama digabung.
5. Product Note kosong dengan source order berbeda tidak tercampur.
6. Product seragam diringkas sebagai satu nama dan product berbeda menjadi `Bervariasi`.
7. Tarif seragam diringkas sebagai nominal.
8. Tarif berbeda diringkas sebagai `Bervariasi`.
9. Sebagian tarif hilang diringkas sebagai `Bervariasi`.
10. Semua tarif hilang diringkas sebagai `—`.
11. Group diurutkan berdasarkan Total Belum Jahit descending lalu Product Note.
12. Sisa Uang bulanan adalah `max(0, salary - realisasiCostPosisi)`.
13. `enrichTargetRows()` tetap menghasilkan `totalHariKerja` dan `hariKerjaHariIni`.
14. Target Ngebut tetap menggunakan hasil hari kerja walaupun dua kolom tidak ada di definisi UI.

### Static verification

- jalankan seluruh Node test suite;
- `npm run build`;
- focused ESLint pada file yang berubah dan bandingkan dengan baseline bila terdapat temuan pre-existing;
- `git diff --check`;
- periksa pencarian statis bahwa dua label hari kerja tidak lagi tersedia pada UI Target Jahit yang aktif;
- periksa tidak ada migration/schema change.

### Manual smoke

1. Buka Target Jahit sebagai Owner/Finance.
2. Pastikan dua kolom hari kerja tidak muncul dan Target Ngebut tetap terisi.
3. Buka overlay Target dan cocokkan Sisa Uang dengan Salary − Realisasi Cost bulan itu.
4. Pastikan ringkasan Belum Jahit tampil dan tombol Lihat Semua membuka tab Belum Jahit.
5. Pada tab Belum Jahit, buka Product Note dan cocokkan agregat dengan rincian Work Order.
6. Cocokkan tarif Work Order dengan komponen Jahit + Obras pada Register PO terkait.
7. Login sebagai Inventory: daftar backlog dan tarif tetap terlihat, Sisa Uang tidak terlihat.
8. Pastikan Work Order selesai tidak tampil.
9. Uji search dengan Product Note, Work Code, warna, dan size.

## Acceptance Criteria

- Hari Kerja Efektif dan Hari Kerja Hari Ini tidak muncul pada tabel Target, Filter, Sort, Column Settings, atau export.
- Kedua nilai hari kerja tetap dihitung dan seluruh rumus Target Ngebut tetap identik.
- Owner/Finance melihat Sisa Uang bulanan yang benar; Inventory tidak melihatnya.
- Tab Belum Jahit tersedia untuk semua role.
- Total Belum Jahit dihitung dari Qty Order dikurangi seluruh sewing Work Order.
- Daftar global dikelompokkan per Product Note dan dapat dibuka hingga rincian Work Order.
- Tarif Work Order berasal dari Register PO yang terkait langsung; tarif berbeda diringkas sebagai `Bervariasi`.
- Ringkasan backlog tersedia pada overlay dan mengarahkan ke tab lengkap.
- Fitur sepenuhnya baca-saja dan tidak mengubah alokasi, data produksi, atau database schema.
- Unit tests, build, focused lint verification, dan diff check selesai dengan hasil dilaporkan apa adanya.
- `project.md` diperbarui pada akhir implementasi.
