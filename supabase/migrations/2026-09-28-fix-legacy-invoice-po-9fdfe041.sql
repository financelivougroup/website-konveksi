-- =============================================================================
-- Koreksi invoice lama INV/MP/LVU/150926/001 (PO-9fdfe041): 100 pcs -> 400 pcs
-- =============================================================================
--
-- Permintaan user (verbatim):
--   "iya betulin juga"  — menjawab temuan: invoice lama PO-9fdfe041 hanya
--   100 pcs padahal kode produksinya 4 variasi (400 pcs).
--
-- Keputusan user saat ditanya (dua pilihan yang artinya berbeda):
--   "Perbaiki nominalnya jadi 400 pcs sekarang" — nomor invoice 001 tetap ada,
--   nominalnya diperbaiki jadi penuh. Alternatifnya (hapus invoice, biarkan
--   sistem menerbitkan ulang saat keempat variasi selesai) TIDAK dipilih.
--   Konsekuensi yang disadari: 3 dari 4 variasi masih PROGRESS (belum selesai)
--   tetapi sudah ditagih penuh.
--
-- Masalah asalnya: invoice ini dibuat 2026-09-15, SEBELUM sistem invoice per
-- kode produksi diberlakukan (migrasi `invoices_per_production_code`,
-- 20260916170034). Saat itu invoice diterbitkan per WORK ORDER, jadi
-- `pcs_linked` = 100 (satu variasi) untuk kode produksi yang sebenarnya
-- 4 variasi x 100 = 400 pcs. Totalnya Rp 4.000.000, padahal seharusnya
-- Rp 16.000.000 (400 x Rp 40.000).
--
-- Dampak kalau dibiarkan: kode produksi ini TIDAK AKAN PERNAH ditagih lagi.
-- `ensureInvoiceForProductionOrder` memanggil `fetchInvoiceByProductionOrderId`
-- lebih dulu dan berhenti bila invoice sudah ada (penjaga "jangan tagih dua
-- kali"), sehingga kekurangan Rp 12.000.000 hilang permanen.
--
-- Kenapa aman dikoreksi (diperiksa lewat Supabase MCP, bukan diasumsikan):
--   - BELUM ADA PEMBAYARAN: `invoice_payments`, `payments`, dan
--     `invoice_payment_files` semuanya KOSONG (0 baris). `finance_validation`
--     masih 'Collect Payment'. Jadi tidak ada alokasi pembayaran yang perlu
--     disesuaikan, dan tidak ada uang yang sudah masuk yang jadi tidak cocok.
--   - Tidak ada trigger pada `invoices` yang menghitung ulang nominal; satu-
--     satunya (`invoice_requires_complete_order_price`) hanya memeriksa harga
--     order saat INSERT/UPDATE work_order_id, dan kolom itu tidak disentuh.
--   - `unit_price` (40.000) dan `rate_operational` (40.000) memang benar dan
--     tidak diubah; hanya kuantitasnya yang salah.
--
-- Nilai diturunkan dari data, bukan ditulis tangan:
--   pcs          = SUM(work_orders.quantity) kode produksi ini
--   total_amount = pcs x unit_price
--   income_oper  = pcs x rate_operational
--   income_man   = pcs x (unit_price - rate_operational)
-- Rumusnya sama persis dengan computeInvoiceFinancials() di
-- src/lib/invoiceCompute.ts, sehingga hasilnya cocok dengan invoice baru mana pun.
--
-- Penjaga `i.pcs_linked <> t.total_pcs` membuat migrasi ini idempoten: baris
-- yang sudah benar tidak akan tersentuh, dan menjalankannya dua kali aman.
--
-- Yang sengaja TIDAK disentuh:
--   - `invoice_code`, `invoice_date`, `month_year` — nomor & tanggal terbit
--     tetap (keputusan user: invoice 001 tetap ada).
--   - `work_order_id` — masih NOT NULL + UNIQUE di skema; WO-67128379 tetap
--     menjadi wakilnya. Mengubahnya tidak menyelesaikan apa pun.
--   - `finance_validation` — tetap 'Collect Payment'.
--   - Status work order (lihat migrasi terpisah
--     `2026-09-28-fix-odette-ivory-s-status.sql` untuk koreksi status).
--   - Tabel pembayaran — semuanya kosong, tidak ada yang perlu diubah.

UPDATE public.invoices i
SET
  pcs_linked = t.total_pcs,
  total_amount = t.total_pcs * i.unit_price,
  total_income_operational = t.total_pcs * i.rate_operational,
  total_income_manpower = t.total_pcs * (i.unit_price - i.rate_operational),
  updated_at = now()
FROM (
  SELECT coalesce(sum(quantity), 0)::int AS total_pcs
  FROM public.work_orders
  WHERE source_order_id = 'PO-9fdfe041'
) t
WHERE i.production_order_id = 'PO-9fdfe041'
  AND t.total_pcs > 0
  AND i.pcs_linked <> t.total_pcs;
