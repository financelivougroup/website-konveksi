-- Nomor urut Order Entry mengikuti data yang MASIH ADA, bukan riwayat.
--
-- Sebelumnya `production_code_sequence` adalah penghitung monoton: sekali nomor
-- terpakai ia tidak pernah dipakai lagi, walau order-nya sudah dihapus permanen.
-- Setelah semua order dihapus, order baru tetap mendapat nomor lanjutan (004)
-- padahal tidak ada satu pun order 001..003 yang tersisa.
--
-- Sekarang nomor = (nomor tertinggi yang masih tersimpan pada periode ini) + 1.
-- Kalau periode itu kosong, hitungannya kembali ke 001.
--
-- Catatan perilaku:
--   * Celah di TENGAH tidak diisi. Kalau 001..005 ada lalu 003 dihapus,
--     nomor berikutnya tetap 006 — bukan 003. Hanya ekor yang dipadatkan,
--     sehingga urutan kode di laporan tidak pernah "melompat ke belakang"
--     selama masih ada order yang lebih besar.
--   * Tabel `production_code_sequence` tetap dipakai, tetapi kini hanya
--     berfungsi sebagai mutex per periode: barisnya dikunci FOR UPDATE agar
--     dua penyimpanan bersamaan tidak mendapat nomor yang sama. Nilainya
--     disimpan sebagai cermin nomor terakhir yang diterbitkan.
--
-- Karena nomor boleh dipakai ulang, tombstone `deleted_business_references`
-- untuk kode tersebut dibersihkan pada saat nomor diklaim. Tanpa itu
-- `permanent_delete_writer_guard` menolak order baru dengan
-- DELETE_STALE_REFERENCE (kode itu masih tercatat sebagai "sudah dihapus").
-- Pembersihan hanya menyentuh kode yang benar-benar diterbitkan ulang, dan
-- ikut rollback bila penyimpanan order gagal.

CREATE OR REPLACE FUNCTION public.next_production_code(p_brand text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ordinal integer;
  v_kode text;
  v_period text;
  v_year text;
  v_month text;
  v_live integer;
  v_seq integer;
  v_code text;
BEGIN
  SELECT c.ordinal, c.kode_client
  INTO v_ordinal, v_kode
  FROM (
    SELECT nama_client, kode_client, row_number() OVER (ORDER BY id) AS ordinal
    FROM public.register_client
  ) c
  WHERE lower(btrim(c.nama_client)) = lower(btrim(p_brand));

  IF v_ordinal IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Client belum terdaftar di Register Client';
  END IF;

  v_year  := to_char(now(), 'YYYY');
  v_month := to_char(now(), 'MM');
  v_period := v_year || '-' || v_month;

  -- Mutex per periode. Baris ini dikunci sampai transaksi pemanggil selesai,
  -- sehingga pemanggil kedua baru membaca data setelah yang pertama commit.
  INSERT INTO public.production_code_sequence (period, last_value)
  VALUES (v_period, 0)
  ON CONFLICT (period) DO NOTHING;

  PERFORM 1
  FROM public.production_code_sequence
  WHERE period = v_period
  FOR UPDATE;

  -- Nomor tertinggi yang masih ada pada periode berjalan.
  SELECT coalesce(max((regexp_match(btrim(po.product_note), '/([0-9]+)$'))[1]::integer), 0)
  INTO v_live
  FROM public.production_orders po
  WHERE btrim(po.product_note) ~ ('^PO/[^/]+/' || v_year || '/' || v_month || '/[0-9]+$');

  v_seq := v_live + 1;

  UPDATE public.production_code_sequence
  SET last_value = v_seq
  WHERE period = v_period;

  v_code := 'PO/' || CASE
    WHEN btrim(v_kode) ~ '^[0-9]+-' THEN btrim(v_kode)
    ELSE lpad(v_ordinal::text, 3, '0') || '-' || btrim(v_kode)
  END
    || '/' || v_year || '/' || v_month
    || '/' || lpad(v_seq::text, 3, '0');

  -- Kode ini kembali hidup, jadi catatan "sudah dihapus"-nya harus dibuang.
  -- `work_code` lama berformat '<kode> | <product> | <color> | <size>'.
  DELETE FROM public.deleted_business_references d
  WHERE (d.kind = 'production_code' AND d.value = v_code)
     OR (d.kind = 'work_code' AND starts_with(d.value, v_code || ' | '));

  RETURN v_code;
END;
$function$;

-- Pratinjau memakai aturan yang sama supaya angka di form tidak berbeda dari
-- angka yang benar-benar disimpan.
CREATE OR REPLACE FUNCTION public.production_code_preview(p_brand text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ordinal integer;
  v_kode text;
  v_year text;
  v_month text;
  v_seq integer;
BEGIN
  SELECT c.ordinal, c.kode_client
  INTO v_ordinal, v_kode
  FROM (
    SELECT nama_client, kode_client, row_number() OVER (ORDER BY id) AS ordinal
    FROM public.register_client
  ) c
  WHERE lower(btrim(c.nama_client)) = lower(btrim(p_brand));

  IF v_ordinal IS NULL THEN
    RETURN NULL;
  END IF;

  v_year  := to_char(now(), 'YYYY');
  v_month := to_char(now(), 'MM');

  SELECT coalesce(max((regexp_match(btrim(po.product_note), '/([0-9]+)$'))[1]::integer), 0) + 1
  INTO v_seq
  FROM public.production_orders po
  WHERE btrim(po.product_note) ~ ('^PO/[^/]+/' || v_year || '/' || v_month || '/[0-9]+$');

  RETURN 'PO/' || CASE
    WHEN btrim(v_kode) ~ '^[0-9]+-' THEN btrim(v_kode)
    ELSE lpad(v_ordinal::text, 3, '0') || '-' || btrim(v_kode)
  END
    || '/' || v_year || '/' || v_month
    || '/' || lpad(v_seq::text, 3, '0');
END;
$function$;

-- Fungsi ini sekarang menghapus tombstone, jadi tidak boleh dipanggil langsung
-- dari klien. Pemanggilnya hanya RPC SECURITY DEFINER (order_entry_save) yang
-- berjalan sebagai pemilik fungsi.
REVOKE EXECUTE ON FUNCTION public.next_production_code(text) FROM PUBLIC, anon, authenticated;

-- Samakan cermin penomor dengan data yang tersisa. Hanya tabel counter sistem,
-- bukan data bisnis.
UPDATE public.production_code_sequence s
SET last_value = coalesce((
  SELECT max((regexp_match(btrim(po.product_note), '/([0-9]+)$'))[1]::integer)
  FROM public.production_orders po
  WHERE btrim(po.product_note) ~ (
    '^PO/[^/]+/' || split_part(s.period, '-', 1) || '/' || split_part(s.period, '-', 2) || '/[0-9]+$'
  )
), 0);
