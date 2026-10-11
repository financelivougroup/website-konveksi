-- supabase/migrations/2026-09-17-expense-drop-invoice-not-null.sql
-- Nomor Invoice tidak lagi diminta user: kolomnya dihapus dari tabel Expense
-- maupun dari form.
--
-- Kolomnya DIBIARKAN ada, hanya berhenti diwajibkan. Kalau ia di-DROP, data
-- yang terlanjur terisi akan hilang tanpa bisa dikembalikan — sedangkan
-- melonggarkan NOT NULL sudah cukup untuk membuat penyimpanan berikutnya
-- berhasil (service tidak lagi mengirim `invoice_number`).
--
-- Tabel kosong saat ini, tetapi pelonggaran ini tetap diperlukan: tanpa ini
-- setiap INSERT akan ditolak karena `invoice_number` tidak punya nilai default
-- dan tidak lagi dikirim klien.

ALTER TABLE public.expense_entries ALTER COLUMN invoice_number DROP NOT NULL;

-- Indeksnya ikut dibuang: tidak ada lagi pencarian yang memakainya, karena
-- kolomnya tidak lagi tampil maupun dicari di UI.
DROP INDEX IF EXISTS public.expense_entries_invoice_idx;
