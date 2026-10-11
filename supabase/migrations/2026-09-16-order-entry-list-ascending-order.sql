-- supabase/migrations/2026-09-16-order-entry-list-ascending-order.sql
-- Order Entry: urutan daftar dibalik menjadi terbaru DI BAWAH.
--
-- Permintaan user: daftar order harus menampilkan yang terbaru di baris paling
-- bawah, bukan paling atas. `order_entry_list` memakai `ORDER BY created_at
-- DESC`, dan itu yang diubah menjadi ASC.
--
-- Diverifikasi lebih dulu lewat Supabase MCP bahwa Production Monitoring
-- SUDAH ascending (`decoratedWO` menyortir menaik), jadi hanya definisi fungsi
-- ini yang perlu diubah — bukan dua tempat.
--
-- Badan fungsi TIDAK ditulis ulang dengan tangan. Definisi aslinya diambil apa
-- adanya lewat pg_get_functiondef, lalu HANYA klausa ORDER BY yang diganti.
-- Dua guard dipasang supaya kegagalan tidak lolos diam-diam:
--   1. pola DESC harus ditemukan — kalau tidak, definisinya berubah dan
--      penggantian otomatis tidak boleh jalan;
--   2. setelah penggantian tidak boleh ada sisa 'ORDER BY created_at DESC'.
--
-- Diterapkan ke database live lewat Supabase MCP; berkas ini adalah catatan
-- repo. Hasilnya diverifikasi di DB: kini_asc = true, masih_desc = false.

DO $mig$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'order_entry_list';

  v_def := pg_get_functiondef(v_oid);

  IF position('row_data ORDER BY created_at DESC' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Pola ORDER BY DESC tidak ditemukan — definisi order_entry_list berubah, periksa manual';
  END IF;

  v_def := replace(v_def, 'row_data ORDER BY created_at DESC', 'row_data ORDER BY created_at ASC');

  IF position('ORDER BY created_at DESC' IN v_def) > 0 THEN
    RAISE EXCEPTION 'Masih ada ORDER BY DESC setelah penggantian';
  END IF;

  EXECUTE v_def;
END
$mig$;
