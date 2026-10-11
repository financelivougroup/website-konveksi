-- supabase/migrations/2026-09-24-planning-client-production-code.sql
--
-- Planning Produksi memisahkan Kode Produksi Konveksi dari Kode Produksi Client,
-- sama seperti `work_orders` dan `production_orders` yang sudah lebih dulu
-- memisahkan keduanya.
--
-- KENAPA KOLOM BARU, BUKAN MEMAKAI `product_note` YANG SUDAH ADA:
-- `planning_produksi.product_note` menyimpan Kode Produksi Konveksi
-- (PO/001-LVU/09/2026/002) dan dipakai lintas modul sebagai **kunci pencarian
-- harga**:
--
--   src/services/staffDebt.ts:210
--     const price = priceMap[productionCodePriceKey(productNote)]
--     const pcsCost = (price ? price.jahit + price.obras : 0) * qty
--
-- `priceMap` di-key dari `production_orders.product_note`. Kalau kolom itu
-- diisi kode client, lookup-nya meleset dan `pcsCost` menjadi 0 **tanpa error**
-- — target_cost_posisi seluruh penjahit jadi 0 dan statusnya berbalik menjadi
-- "Tidak Utang". Jadi kode client harus punya kolomnya sendiri.
--
-- KEADAAN SEBELUM MIGRASI (diverifikasi lewat Supabase MCP, bukan dari tipe):
--   planning_produksi: 8 baris; `product_note` ada (text, nullable),
--   `client_production_code` belum ada. Kedelapan baris `product_note` = NULL,
--   jadi tidak ada backfill yang bisa maupun perlu dilakukan.
--
-- Diterapkan via Supabase MCP; berkas ini catatan repo.

ALTER TABLE public.planning_produksi
  ADD COLUMN IF NOT EXISTS client_production_code TEXT;

-- Tidak ada perubahan RLS, index, atau trigger: kolom aditif ikut terbawa
-- keempat policy `authenticated` yang sudah ada (SELECT/INSERT/UPDATE/DELETE),
-- dan grant tabel diwarisi dari default ACL instance.
