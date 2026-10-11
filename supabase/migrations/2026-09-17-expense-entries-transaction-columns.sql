-- supabase/migrations/2026-09-17-expense-entries-transaction-columns.sql
-- Expense: kolom transaksi lengkap sesuai daftar kolom yang ditulis user.
--
-- `amount` (Nominal) DIGANTI Total Payment yang DIHITUNG. Nilai lama dibuang,
-- bukan dipertahankan: menyimpan nilai yang bisa diketik bebas di samping nilai
-- generated dengan makna sama berarti dua sumber kebenaran yang bisa berbeda.
-- Tabel sudah kosong saat migrasi ini berjalan, jadi tidak ada data hilang.
--
-- CATATAN TEKNIS PENTING
-- Kolom generated Postgres TIDAK BOLEH merujuk kolom generated lain. Karena itu
-- `total_payment` ditulis penuh sebagai
--   (quantity * unit_price + shipping_admin - discount_cashback)
-- dan BUKAN (total + shipping_admin - discount_cashback). Kalau diubah jadi
-- bentuk yang "lebih rapi" itu, migrasinya akan gagal.
--
-- Diterapkan ke database live lewat Supabase MCP; berkas ini catatan repo.

ALTER TABLE public.expense_entries RENAME COLUMN amount TO total_payment;
ALTER TABLE public.expense_entries ALTER COLUMN total_payment DROP NOT NULL;

ALTER TABLE public.expense_entries
  ADD COLUMN quantity           integer NOT NULL CHECK (quantity > 0),
  ADD COLUMN unit_price         integer NOT NULL CHECK (unit_price > 0),
  ADD COLUMN shipping_admin     integer NOT NULL DEFAULT 0 CHECK (shipping_admin >= 0),
  ADD COLUMN discount_cashback  integer NOT NULL DEFAULT 0 CHECK (discount_cashback >= 0),
  ADD COLUMN flow_transaction   text    NOT NULL,
  ADD COLUMN invoice_number     text    NOT NULL,
  ADD COLUMN nama_barang        text    NOT NULL,
  ADD COLUMN pic                text    NOT NULL,
  ADD COLUMN proof_payment_path text,
  ADD COLUMN proof_payment_url  text;

-- Vendor jadi WAJIB (permintaan user). Tabel sudah kosong, jadi tidak ada baris
-- lama yang melanggar.
ALTER TABLE public.expense_entries
  ALTER COLUMN vendor_id   SET NOT NULL,
  ALTER COLUMN vendor_name SET NOT NULL;

-- Kolom hasil hitungan: database yang menghitung, jadi mustahil tidak sinkron.
ALTER TABLE public.expense_entries
  ADD COLUMN total integer GENERATED ALWAYS AS (quantity * unit_price) STORED,
  ADD COLUMN total_payment_generated integer GENERATED ALWAYS AS
    (quantity * unit_price + shipping_admin - discount_cashback) STORED;

-- Total Payment tidak boleh nol atau negatif: diskon yang melebihi
-- total + ongkir bukan pembelian, dan itu hampir pasti salah ketik.
ALTER TABLE public.expense_entries
  ADD CONSTRAINT expense_entries_total_payment_positive
  CHECK (quantity * unit_price + shipping_admin - discount_cashback > 0);

CREATE INDEX IF NOT EXISTS expense_entries_invoice_idx
  ON public.expense_entries (invoice_number);
CREATE INDEX IF NOT EXISTS expense_entries_pic_idx
  ON public.expense_entries (pic);

-- ===== Berkas susulan: expense_entries_cleanup_total_payment =====
-- Sisa rename `total_payment` lama (bekas `amount`) masih ada dan namanya
-- sangat mirip `total_payment_generated`, sehingga rawan salah pakai. Dibuang,
-- lalu yang generated memakai nama bersih.
ALTER TABLE public.expense_entries DROP COLUMN total_payment;
ALTER TABLE public.expense_entries
  RENAME COLUMN total_payment_generated TO total_payment;
