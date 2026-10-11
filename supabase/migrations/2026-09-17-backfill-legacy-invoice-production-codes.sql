-- supabase/migrations/2026-09-17-backfill-legacy-invoice-production-codes.sql
-- Backfill invoice LAMA agar memakai Kode Produksi Konveksi + Kode Produksi Client.
--
-- MASALAH (dilaporkan user): di halaman Invoicing, kolom "Kode Produksi
-- Konveksi" menampilkan "PO/001-LVU/09/2026/002 | Gena Pants | Ivory | XL"
-- dan kolom "Kode Produksi Client" menampilkan "—". Seharusnya:
--   Kode Produksi Konveksi = "PO/001-LVU/09/2026/002"
--   Kode Produksi Client   = "PDFF_LVU-PNT-01_B-00_PRDN"
--
-- SEBABNYA: invoice ini dibuat 15/09, SEBELUM sistem invoice per kode produksi.
-- Saat itu `work_code` diisi gabungan "kode | produk | warna | size" — format
-- yang memang dipakai waktu itu — dan kolom `client_production_code` belum ada.
-- Invoice baru sudah benar (`workCode: productNote` di autoInvoice.ts); hanya
-- baris lama ini yang tertinggal, dan TIDAK ADA backfill yang pernah dijalankan
-- (diverifikasi lewat MCP sebelum migrasi ini).
--
-- Sekaligus mengisi `production_order_id` yang juga NULL pada baris lama. Ini
-- bukan sekadar kerapian: dengan terisi, invoice lama ikut terlihat oleh
-- `fetchInvoiceByProductionOrderId`, sehingga kode produksi ini tidak bisa
-- ditagih dua kali oleh Generate Missing Invoices.
--
-- Nilai diambil dari work order wakil (join `work_order_id`), bukan ditulis
-- tangan, supaya tidak ada nilai yang diketik salah. Hanya menyentuh baris
-- yang `production_order_id`-nya masih NULL — invoice baru tidak diusik.

UPDATE public.invoices i
SET
  work_code = w.product_note,
  client_production_code = w.client_production_code,
  production_order_id = w.source_order_id
FROM public.work_orders w
WHERE w.id = i.work_order_id
  AND i.production_order_id IS NULL
  AND w.source_order_id IS NOT NULL;
