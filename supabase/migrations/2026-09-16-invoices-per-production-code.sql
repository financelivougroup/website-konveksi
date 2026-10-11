-- supabase/migrations/2026-09-16-invoices-per-production-code.sql
-- Invoice per Kode Produksi Konveksi: tambah kolom penaut ke order produksi
-- dan kolom Kode Produksi Client.
--
-- Permintaan user: satu invoice dibuat untuk satu **Kode Produksi Konveksi**
-- (`product_note`), dan hanya ketika SEMUA variasinya selesai. Sebelumnya
-- invoice dibuat per work order (satu variasi) dan terbit begitu variasi
-- pertama selesai — akibatnya kode produksi 4 variasi @100 pcs menerbitkan
-- invoice 100 pcs dan 3 variasi sisanya tidak tertagih.
--
-- `production_order_id` NULLABLE: invoice lama (satu per work order) tetap sah
-- dan rilisan lama tidak langsung rusak saat migrasi ini berjalan.
--
-- `client_code` yang sudah ada TIDAK dipakai untuk Kode Produksi Client —
-- isinya kode client Register Client (mis. 'LVU'), bukan kode produksi client
-- (mis. 'PDFF_LVU-PNT-01_B-00_PRDN'). Karena itu kolom terpisah diperlukan.
--
-- Diterapkan ke database live lewat Supabase MCP; berkas ini adalah catatan
-- repo. Kolomnya diverifikasi ada lewat information_schema setelah migrasi.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS production_order_id text,
  ADD COLUMN IF NOT EXISTS client_production_code text;

-- `production_order_id` sengaja TANPA foreign key ke production_orders:
-- halaman Order Entry punya fitur hapus permanen order, dan FK RESTRICT akan
-- memblokirnya begitu ada invoice. Integritasnya dijaga di sisi aplikasi.
CREATE INDEX IF NOT EXISTS invoices_production_order_id_idx
  ON public.invoices (production_order_id);
