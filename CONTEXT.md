# Konteks Operasional Konveksi

Status dokumentasi: **2026-10-22**, berdasarkan working tree saat ini, bukan hanya commit terakhir. Satu konteks domain mencakup order, pelaksanaan produksi, kinerja karyawan, dan keuangan; folder/menu tidak membentuk bounded context tersendiri.

## Peta baca

- [GLOSSARY.md](GLOSSARY.md): definisi bisnis dan istilah yang dibedakan, tanpa detail implementasi.
- [project.md](project.md): ringkasan proyek, pekerjaan tersisa, dan Latest Progress. Entri bertanggal adalah bukti historis, bukan semuanya aturan aktif.
- [docs/adr/README.md](docs/adr/README.md): alasan keputusan arsitektur/domain yang sudah diambil.
- [docs/README.md](docs/README.md): indeks dokumen, status, dan cakupan verifikasi.
- [CLAUDE.md](CLAUDE.md): aturan kerja; [docs/agents/domain.md](docs/agents/domain.md): cara memperbarui dokumen domain.

## Lingkup dan batas

Dashboard SaaS operasional adalah produk utama. Landing page bukan arah desain untuk layar operasi. Antarmuka memakai React/TypeScript, Tailwind, shadcn/ui dan komponen ReUI yang sudah terpasang. Data persisten melalui `src/services/`; konfigurasi tampilan/fixture di `src/data/` bukan pengganti database.

Backend terkonfigurasi saat audit adalah **Supabase cloud**, bukan stack Supabase lokal: `.env` dan `.mcp.json` menunjuk project yang sama. Dev server lokal dan Worker lokal tidak berarti database lokal. Supabase MCP tetap satu-satunya antarmuka operasi database bagi agent, baik backend kelak lokal maupun cloud. Jangan mengubah tujuan backend sebagai efek samping dokumentasi.

Lampiran memakai Cloudflare R2 melalui Worker. Sumber implementasi: `src/services/r2Storage.ts`, `src/lib/r2.ts`, `worker/src/`. Aplikasi saat ini mengunggah melalui rute Worker `/sign/upload`; komentar lama yang menyebut presigned PUT langsung bukan kontrak unggah terkini. Rute baca Worker `/media/...` menjadi default bila custom public base tidak diisi.

## Model order dan produksi

| Konsep | Representasi / batas penting |
|---|---|
| Order Produksi | `production_orders`; identitas bersama dan referensi Client. |
| Kode Produksi Konveksi | `product_note`; identitas bisnis order, bukan `work_code`. |
| Kode Produksi Client | `client_production_code`; referensi dari Client, bukan `register_client.code`. |
| Variasi | `production_order_variations`; warna/size/qty dan foto variasi. |
| Work Order | `work_orders`; satu variasi setelah Pull, dengan `source_order_id` dan `source_variation_id`. |
| Harga order | `production_order_prices` dan `production_order_price_components`; delapan komponen per pcs pada order. |
| Invoice | `invoices.production_order_id` menunjuk order; `work_order_id` legacy tidak berarti tagihan hanya untuk satu variasi. |

Pelaksanaan dicatat terpisah sebagai Cutting, Sewing, Pasang Kancing, dan Finishing. Status produksi (`NEW`, `PROGRESS`, `FINISHED`, `INVOICED`) tidak sama dengan status invoice atau status Planning. Tampilan kelompok mengikuti status variasi yang paling tertinggal; jangan menyimpulkan seluruh order selesai dari satu Work Order yang selesai. Detail status dan eligibility: `src/lib/productionStatus.ts`, `src/lib/productionEntryOptions.ts`, `src/lib/kanban.ts`.

**Perbedaan yang belum diselesaikan:** `deriveStatus` memerlukan Cutting > 0, sedangkan `deriveVariasiStatuses` mensyaratkan seluruh empat tahap >= qty untuk badge COMPLETED. Keduanya tidak boleh didokumentasikan sebagai satu invariant identik sebelum kode/aturan bisnis diselaraskan.

Planning Produksi adalah penugasan variasi/orang/bulan, bukan pembuatan Order Produksi. Generate Target berbeda dari Pull. Generate memakai RPC `kpi_generate_targets` secara atomik; aturan persetujuan dan kelengkapan, termasuk gaji yang disyaratkan, dicek ulang oleh server. Pilihan Planning baru mengecualikan Work Order `FINISHED`/`INVOICED`; itu tidak menghapus Planning historis.

## Orang dan hak akses

`profiles.id` adalah akun Auth. `register_penjahit.id` adalah identitas Karyawan. `profiles.orang_id` menghubungkan keduanya untuk scope pribadi KPI dan saldo Staff. Nama tampilan, username, dan posisi bukan kunci otorisasi. Role `staff` tidak berarti posisi Penjahit; Finishing juga dapat ber-role Staff, dan Leader dapat ber-role Supervisor.

| Operasi | Perilaku terverifikasi / batas |
|---|---|
| KPI Team dan pengaturan berwenang | Owner/Finance; akses pribadi menggunakan scope server. |
| Utang Staff & Benefit | Tab terbuka; RPC memberi Owner/Finance seluruh **staf yang memenuhi eligibility settlement**, akun lain hanya identitas `orang_id` sendiri. Tanpa tautan identitas hasilnya `[]`. |
| Pembayaran/pembatalan Benefit | Tetap Owner/Finance; ketersediaan transaksi juga bergantung release gate dan saldo final. |
| Entri gaji biasa | Hak tulis Finance saja; Owner dapat melihat. Ini bukan hak tulis otomatis untuk semua fitur. |
| Edit log Sewing/Kancing/Finishing | Owner/Finance; role lain tidak memperoleh hak edit hanya karena tab bisa dibuka. |
| Hapus permanen | Owner/Finance, melalui preview/execute dan blocker server. |

**Batas keamanan:** scope RPC KPI/settlement bukan bukti bahwa seluruh query legacy sudah privat. MCP masih menunjukkan policy baca luas pada `target_jahit`, `sewing_records`, dan `finishing_records`. Salary direct-read legacy masih memakai `my_staff_id()`, yang berbeda dari tautan ID pada RPC baru. Memperketat seluruh jalur legacy adalah pekerjaan terpisah, bukan perubahan yang dilakukan audit dokumentasi ini.

## Kinerja, tarif, dan settlement

KPI pribadi membedakan sumber jahit dan finishing. Scope, tarif bertanggal, baseline historis, serta status final dikelola server. Baseline belum terverifikasi bukan tarif historis yang pasti benar. Data hilang/tidak lengkap tidak boleh didokumentasikan sebagai nol yang sah. Implementasi: `src/services/kpiProduksi.ts`, `src/services/kpiSettings.ts`, `src/types/kpi.ts`.

**Settlement Target Jahit bukan perhitungan upah Finishing.** Definisi live `staff_settlement_months` mengambil `sewing_records` dan tarif Penjahit. `staff_settlement_read` saat audit menyertakan orang yang posisinya Penjahit, mempunyai Target Jahit, atau mempunyai riwayat pembayaran Benefit. Membuka akses tab untuk semua akun tertaut tidak mengubah syarat ini atau menambahkan sumber Finishing/Leader. Akun tertaut non-Penjahit dapat menerima array kosong; jangan menjanjikan otomatis muncul setelah gaji saja dicatat.

Rumus kini (lihat `src/lib/staffSettlement.ts` dan fungsi live `staff_settlement_person`):

- `R` = nilai seluruh realisasi, `S` = gaji diterima, `B` = Benefit bruto, `P` = Benefit dibayar tunai.
- Utang sebelum Benefit = `max(0, S - R)`.
- Benefit belum dibayar = `max(0, B - P)`.
- Benefit potong utang = `min(utang sebelum Benefit, Benefit belum dibayar)`.
- Sisa utang = `max(0, S - R + P - B)`.
- Sisa dapat dibayar sementara = `max(0, min(B - P, R - S + B - P))`.

Extra dialokasikan per bulan dengan urutan tanggal kerja, waktu input, lalu ID; tanpa target bukan otomatis extra. Nilai extra sudah menjadi bagian realisasi, tetapi keputusan bisnis **secara eksplisit** tetap memakai Benefit untuk potong utang (ADR-0004). Potongan itu bukan transfer dan tidak membuat Expense baru. Pembayaran tunai mempunyai ledger dan Expense terkait; bukan SALARY dan tidak boleh dihitung lagi sebagai gaji.

Bulan final mengunci perubahan input terkait KPI; Owner dapat membuka kembali menurut aturan server. Release finalisasi KPI dan release pembayaran Benefit adalah **dua gate berbeda**. Pada audit MCP 2026-10-22, release pembayaran Benefit masih `false`; akses baca terbuka bukan berarti transaksi pembayaran sudah aktif. Tidak ada gate yang diubah oleh audit ini.

## Penghapusan dan lampiran

Hapus permanen memakai graph dependensi, preview, fingerprint, lalu execute server. Blocker bulan final dan transaksi terkait tetap berlaku. Database dan object storage tidak satu transaksi: cleanup lampiran dicatat di `deletion_cleanup_jobs`, diklaim dengan lease, lalu diakui setelah penghapusan. UI berhasil menghapus record tidak membuktikan semua berkas selesai dibersihkan. Implementasi: `src/services/permanentDeletion.ts`, `worker/src/cleanup.ts`.

## Kesenjangan dan bukti yang tidak boleh dilebihkan

- Login/browser nyata per role dan rekonsiliasi operasional bukan otomatis lulus karena unit test atau impersonasi SQL lulus.
- `scripts/smoke-settlement-browser.mjs` masih memuat fixture penolakan non-Owner/Finance dari sebelum perubahan akses 2026-10-22; belum menjadi bukti UI akses pribadi terbaru.
- Pergantian nama historis belum seluruhnya dipetakan lewat ID. Tautan akun `orang_id` tidak otomatis memigrasikan catatan lama yang masih memakai nama.
- Perubahan UI terakhir belum otomatis ter-deploy; lihat log bertanggal dan status git.
- Dev server yang dihentikan penjaga memori tidak dinyalakan ulang oleh audit dokumentasi.
