-- supabase/migrations/2026-09-17-vendors.sql
-- Master data Vendor + kolom vendor di catatan biaya.
--
-- ALASAN
-- Halaman Expense disesuaikan dengan referensi user yang punya kolom VENDOR.
-- Datanya diminta sebagai master data tersendiri (bukan ketikan bebas) supaya
-- ejaannya konsisten dan bisa direkap per vendor — "Office Depot" dan
-- "office depot " tidak boleh jadi dua vendor berbeda.
--
-- Mengikuti pola `register_client` (migrations/2026-09-03-register-client.sql):
-- id identity, nama unik tanpa peduli huruf besar/kecil, status Aktif/Non-Aktif,
-- RLS baca untuk semua + tulis untuk authenticated.
--
-- KOLOM VENDOR DI expense_entries
-- `vendor_name` DISALIN ke baris, sama seperti nama kategori, dan alasannya
-- sama: catatan biaya adalah dokumen historis. Bila vendor kelak diganti
-- namanya, catatan lama tetap memakai nama saat dicatat. `vendor_id` menyimpan
-- identitasnya untuk pengelompokan.
--
-- FK ON DELETE RESTRICT sejalan dengan keputusan "nonaktifkan, bukan hapus":
-- vendor yang sudah dipakai transaksi tidak boleh hilang diam-diam.
--
-- Diterapkan ke database live lewat Supabase MCP; berkas ini adalah catatan
-- repo. Isinya diverifikasi ulang lewat MCP setelah penerapan.

CREATE TABLE IF NOT EXISTS public.vendors (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nama       text        NOT NULL,
  kontak     text,
  catatan    text,
  status     text        NOT NULL DEFAULT 'Aktif',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendors_nama_key
  ON public.vendors (lower(btrim(nama)));

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for all" ON public.vendors;
CREATE POLICY "Allow read for all"
  ON public.vendors FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Authenticated vendor insert" ON public.vendors;
CREATE POLICY "Authenticated vendor insert"
  ON public.vendors FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated vendor update" ON public.vendors;
CREATE POLICY "Authenticated vendor update"
  ON public.vendors FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated vendor delete" ON public.vendors;
CREATE POLICY "Authenticated vendor delete"
  ON public.vendors FOR DELETE
  TO authenticated
  USING (true);

GRANT SELECT ON public.vendors TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vendors TO authenticated;

ALTER TABLE public.expense_entries
  ADD COLUMN IF NOT EXISTS vendor_id   bigint REFERENCES public.vendors(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS vendor_name text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS expense_entries_vendor_idx
  ON public.expense_entries (vendor_id);
