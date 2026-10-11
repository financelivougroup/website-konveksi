-- =============================================================================
-- Koreksi data: Odette Shirt Ivory S tidak lagi FINISHED
-- =============================================================================
--
-- Permintaan user (verbatim):
--   "iya bleh"  — menjawab pertanyaan: koreksi baris Odette Shirt Ivory/S yang
--   masih FINISHED padahal finishingnya 0?
--
-- Latar: revisi Status 2026-09-28 mengubah aturan level-2 — FINISHED baru saat
-- KEEMPAT tahap (cutting, jahit, kancing, finishing) mencapai qty order. Baris
-- WO-e4ee0dec (PO/002-CSC/09/2026/005 | Odette Shirt | Ivory | S) berstatus
-- FINISHED dari aturan LAMA, padahal keadaannya:
--
--   qty 80 | cutting 80 | jahit 80 | kancing 50 | finishing 0
--
-- Persis kasus yang user sebut: "kalau cutting dan jahit sudah sama angkanya,
-- tapi finishing, kancing masih 0 ya artinya masih progress".
--
-- Kenapa harus dikoreksi lewat SQL, bukan lewat aplikasi: `syncWorkOrderStatus`
-- SENGAJA keluar lebih awal untuk WO yang sudah FINISHED/INVOICED (idempotensi
-- — supaya laporan susulan tidak menghitung ulang status yang sudah final).
-- Jadi tidak ada jalur aplikasi yang akan menurunkan baris ini sendiri.
--
-- Kenapa aman:
--   - Tidak ada trigger pada `work_orders` yang menghitung ulang `prod_status`
--     (diverifikasi lewat pg_trigger: trigger hanya ada di kancing_records,
--     finishing_records, dan invoices — semuanya `assert_work_order_has_complete_price`).
--   - `invoice_status` baris ini sudah 'NONE' dan kode produksi PO-0cb91687
--     BELUM punya invoice sama sekali, jadi tidak ada tagihan yang jadi salah.
--   - Variasi kembarannya (Champagne | M) masih PROGRESS, sehingga grup ini
--     memang belum layak diinvoice — baik sebelum maupun sesudah koreksi.
--   - `pcs_linked` pada invoice PO-9fdfe041 (invoice lama, 100 pcs dari kode
--     4 variasi) TIDAK disentuh: itu masalah terpisah yang sudah ada sejak
--     2026-09-15, sebelum aturan invoice-per-kode-produksi diberlakukan.
--
-- Penjaga di WHERE membuat migrasi ini idempoten dan tidak akan menyentuh baris
-- yang sudah benar: status hanya diturunkan bila memang ada tahap yang kurang.
--
-- Yang sengaja TIDAK disentuh:
--   - `work_orders.invoice_status` — sudah 'NONE', tidak perlu diubah.
--   - Invoice INV/MP/LVU/150926/001 (PO-9fdfe041, pcs_linked 100) — lihat di atas.
--   - `production_orders.status` — baris ini tidak terkait.
--   - Baris WO lain — semuanya sudah konsisten (diverifikasi: hanya
--     WO-67128379 yang FINISHED, dan keempat tahapnya penuh 100/100/100/100).

UPDATE public.work_orders wo
SET prod_status = 'PROGRESS'
WHERE wo.id = 'WO-e4ee0dec'
  AND wo.prod_status = 'FINISHED'
  AND (
    coalesce((select sum(total_cutting) from public.cutting_records c where c.work_order_id = wo.id), 0) < wo.quantity
    OR coalesce((select sum(qty_selesai) from public.sewing_records s where s.work_order_id = wo.id), 0) < wo.quantity
    OR coalesce((select sum(qty_kancing) from public.kancing_records k where k.work_order_id = wo.id), 0) < wo.quantity
    OR coalesce((select sum(qty_finishing) from public.finishing_records f where f.work_order_id = wo.id), 0) < wo.quantity
  );
