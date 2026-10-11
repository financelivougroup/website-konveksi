-- supabase/migrations/2026-09-22-complain-production-codes.sql
-- Complain & Penalti: pisahkan identitas produksi menjadi dua kode, seperti
-- halaman lain (Production Order, Invoicing, Register Harga, Sewing Log).
--
-- PERMINTAAN USER: "di complain & penalti, kolom Work Code ganti jadi Kode
-- Produksi Client, dan otomatis ke isi juga kolom Kode Produksi Konveksi".
--
-- KEADAAN SEBELUM MIGRASI (diverifikasi lewat Supabase MCP, bukan dari tipe):
--   * `complain_penalti` TIDAK punya kolom kode konveksi maupun kode client.
--   * `work_code` berisi gabungan teks lama, mis.
--     "PO/001-LVU/09/2026/002 | Gena Pants | Black | M" — termasuk Size.
--
-- KENAPA HANYA SATU KOLOM BARU: isi `work_code` yang lama itu sebenarnya adalah
-- kode CLIENT (teks gabungannya memuat nomor produksi + produk + warna + size,
-- dan yang menentukan harga potongan adalah order-nya). Jadi kolom yang belum
-- ada hanyalah kode KONVEKSI. Menambah `production_code` sambil terus menulis
-- kode client ke `work_code` membuat semua kolom terpakai — berbeda dengan
-- menambah dua kolom baru lalu membekukan `work_code`, yang hanya menghasilkan
-- kolom yang selamanya NULL untuk baris baru.
--
-- Nama `work_code` memang warisan yang sudah tidak cocok (isinya kode client,
-- bukan work code). Rename tidak sepadan risikonya, jadi ketidakcocokan itu
-- DICATAT di database lewat COMMENT supaya tidak jadi jebakan bagi sesi lain.

ALTER TABLE public.complain_penalti
  ADD COLUMN IF NOT EXISTS production_code text;

COMMENT ON COLUMN public.complain_penalti.work_code IS
  'Kode Produksi CLIENT. Nama kolom warisan — sebelum 2026-09-22 diisi teks gabungan "kode | produk | warna | size".';

COMMENT ON COLUMN public.complain_penalti.production_code IS
  'Kode Produksi KONVEKSI (work_orders.product_note). Pendamping work_code; diisi otomatis saat user memilih kode client.';

-- Backfill baris lama HANYA bila kode client-nya bisa dipulihkan dari work
-- order yang benar-benar ada. Nilainya diambil lewat join, tidak pernah
-- diketik tangan, supaya tidak ada nilai yang salah ketik.
--
-- `split_part(..., ' | ', 1)` mengambil segmen pertama `work_code` — persis
-- bentuk yang dipakai `poCodeFromWorkCode` di sisi klien.
--
-- Baris yang tidak punya padanan (mis. "Produksi - Awal | Sheen Pants | ...",
-- produknya sudah tidak ada di work_orders) sengaja DIBIARKAN NULL. UI
-- menampilkannya sebagai "—" — fakta itu dilaporkan, bukan disembunyikan.
UPDATE public.complain_penalti c
SET production_code = wo.product_note
FROM public.work_orders wo
WHERE c.production_code IS NULL
  AND wo.client_production_code = split_part(c.work_code, ' | ', 1);

-- Tidak ada perubahan RLS, index, atau trigger: keempat policy `authenticated`
-- sudah `true` untuk SELECT/INSERT/UPDATE/DELETE, dan kolom baru ikut terbawa.
