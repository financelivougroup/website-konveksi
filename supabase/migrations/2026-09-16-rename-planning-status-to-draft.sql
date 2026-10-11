-- supabase/migrations/2026-09-16-rename-planning-status-to-draft.sql
-- Rename lifecycle status 'PLANNING' -> 'DRAFT' pada alur Order Entry.
--
-- Alasan: user meminta order yang belum di-Pull disebut "Draft". Nama lama
-- "Planning" juga bertabrakan dengan modul lain yang sudah ada di aplikasi
-- (Planning Produksi), padahal keduanya tidak berhubungan.
--
-- Kolom production_orders.status bertipe `text` TANPA CHECK constraint
-- (diverifikasi lewat Supabase MCP), jadi tidak ada constraint yang perlu
-- diubah — cukup nilainya.
--
-- WAJIB dijalankan bersama perubahan klien: klien kini mengirim 'DRAFT' saat
-- menyimpan order. Kalau fungsi-fungsi di bawah masih menuntut 'PLANNING',
-- order baru TIDAK AKAN PERNAH bisa di-Pull (guard pull menolaknya), dan
-- pembatalan akan menolak dengan pesan "Status bukan Planning".
--
-- Diterapkan ke database live lewat Supabase MCP; berkas ini adalah catatan
-- repo. Badan fungsi TIDAK ditulis ulang dengan tangan — definisinya diambil
-- apa adanya dari pg_get_functiondef lalu hanya literal statusnya diganti,
-- supaya tidak ada logika lain yang ikut berubah tanpa sengaja.

-- 1) Data lama. Saat migrasi ini dibuat, tidak ada baris 'PLANNING' yang tersisa
--    (data live: CANCELLED 1, PULLED 4), jadi UPDATE ini seharusnya 0 baris.
--    Tetap ditulis supaya migrasi benar walau dijalankan di database lain.
UPDATE public.production_orders
SET status = 'DRAFT'
WHERE status = 'PLANNING';

-- 2) Keenam fungsi yang menyebut 'PLANNING'. Diganti definisi aslinya dengan
--    literal status yang sudah di-rename.
DO $mig$
DECLARE
  r record;
  v_def text;
  v_before integer;
  v_after integer;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'cancel_production_order',
        'cancel_production_orders',
        'order_entry_get',
        'order_entry_list',
        'order_entry_save',
        'pull_production_order_to_konveksi'
      )
    ORDER BY p.proname
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_before := (length(v_def) - length(replace(v_def, '''PLANNING''', ''))) / length('''PLANNING''');

    v_def := replace(v_def, '''PLANNING''', '''DRAFT''');
    -- Pesan yang dibaca user, bukan sekadar nilai kolom.
    v_def := replace(v_def, 'Status bukan Planning', 'Status bukan Draft');

    v_after := (length(v_def) - length(replace(v_def, '''PLANNING''', ''))) / length('''PLANNING''');

    IF v_after <> 0 THEN
      RAISE EXCEPTION 'Masih ada literal PLANNING di % setelah penggantian', r.proname;
    END IF;

    EXECUTE v_def;
    RAISE NOTICE '%: % literal diganti', r.proname, v_before;
  END LOOP;
END
$mig$;
