-- Kode master bernomor (001-LVU) sudah memuat ordinalnya sendiri.
-- Kode lama (LVU) tetap mendapat ordinal otomatis. Tidak mengubah kode tersimpan.
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
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Client belum terdaftar di Register Client';
  END IF;

  v_period := to_char(now(), 'YYYY-MM');

  -- ON CONFLICT mengunci baris agar penyimpanan bersamaan tetap unik.
  INSERT INTO public.production_code_sequence (period, last_value)
  VALUES (v_period, 1)
  ON CONFLICT (period) DO UPDATE
    SET last_value = public.production_code_sequence.last_value + 1
  RETURNING last_value INTO v_seq;

  RETURN 'PO/' || CASE
    WHEN btrim(v_kode) ~ '^[0-9]+-' THEN btrim(v_kode)
    ELSE lpad(v_ordinal::text, 3, '0') || '-' || btrim(v_kode)
  END
    || '/' || to_char(now(), 'MM') || '/' || to_char(now(), 'YYYY')
    || '/' || lpad(v_seq::text, 3, '0');
END;
$function$;

-- Pratinjau memakai aturan yang sama dan tetap tidak memesan nomor.
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
  v_period text;
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

  v_period := to_char(now(), 'YYYY-MM');

  SELECT COALESCE(max(last_value), 0) + 1
  INTO v_seq
  FROM public.production_code_sequence
  WHERE period = v_period;

  RETURN 'PO/' || CASE
    WHEN btrim(v_kode) ~ '^[0-9]+-' THEN btrim(v_kode)
    ELSE lpad(v_ordinal::text, 3, '0') || '-' || btrim(v_kode)
  END
    || '/' || to_char(now(), 'MM') || '/' || to_char(now(), 'YYYY')
    || '/' || lpad(v_seq::text, 3, '0');
END;
$function$;
