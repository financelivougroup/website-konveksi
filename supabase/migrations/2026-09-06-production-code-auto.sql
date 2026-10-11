-- Kode produksi otomatis: PO/<ordinal client>-<KODE_CLIENT>/<MM>/<YYYY>/<NNN>
--
-- Menggantikan kode internal KV-<YYMM>-<NNN> yang dibuat kemarin. Kode yang
-- dihasilkan server ditaruh di production_orders.product_note — kolom yang
-- menyebar ke work_orders.product_note, work_code, dan Production Monitoring.
-- Aman bagi harga karena production_order_prices ber-FK ke production_order_id,
-- bukan ke kode; kode hanya dipakai sebagai kunci lookup runtime.

-- 1. Bersihkan penomor KV
DROP FUNCTION IF EXISTS public.next_internal_code();
DROP TABLE IF EXISTS public.internal_code_sequence;
DROP INDEX IF EXISTS public.production_orders_internal_code_unique;
ALTER TABLE public.production_orders DROP COLUMN IF EXISTS internal_code;

-- 2. Penomor bulanan. RLS dibiarkan nonaktif, dan fungsi di bawah dibuat
--    SECURITY DEFINER supaya klien tidak perlu policy tulis atas tabel ini.
CREATE TABLE IF NOT EXISTS public.production_code_sequence (
  period text PRIMARY KEY,          -- 'YYYY-MM'
  last_value integer NOT NULL DEFAULT 0
);

-- 3. Pembentuk kode; MENGKONSUMSI nomor urut.
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

  -- ON CONFLICT mengunci baris, jadi dua penyimpanan bersamaan tidak
  -- menghasilkan nomor kembar.
  INSERT INTO public.production_code_sequence (period, last_value)
  VALUES (v_period, 1)
  ON CONFLICT (period) DO UPDATE
    SET last_value = public.production_code_sequence.last_value + 1
  RETURNING last_value INTO v_seq;

  RETURN 'PO/' || lpad(v_ordinal::text, 3, '0') || '-' || btrim(v_kode)
    || '/' || to_char(now(), 'MM') || '/' || to_char(now(), 'YYYY')
    || '/' || lpad(v_seq::text, 3, '0');
END;
$function$;

-- 4. Pratinjau kode untuk form; TIDAK mengkonsumsi nomor.
--    Nilai ini tidak dipesan — bila user lain menyimpan di antara pratinjau
--    dan simpan, kode final boleh bergeser. Server yang berwenang.
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

  RETURN 'PO/' || lpad(v_ordinal::text, 3, '0') || '-' || btrim(v_kode)
    || '/' || to_char(now(), 'MM') || '/' || to_char(now(), 'YYYY')
    || '/' || lpad(v_seq::text, 3, '0');
END;
$function$;

-- 5. Tanam nilai awal dari kode PO/... yang sudah ada (dibuat manual),
--    supaya order berikutnya tidak menabrak index unik product_note.
DO $$
DECLARE
  r record;
  v_seq integer;
BEGIN
  -- 'PO/001-LVU/09/2026/001' terbagi menjadi 5 segmen:
  --   1 'PO'   2 '001-LVU'   3 '09' (MM)   4 '2026' (YYYY)   5 '001' (urut)
  FOR r IN
    SELECT split_part(product_note, '/', 3) AS mm,
           split_part(product_note, '/', 4) AS yyyy,
           split_part(product_note, '/', 5) AS seq
    FROM public.production_orders
    WHERE product_note LIKE 'PO/%'
  LOOP
    IF r.yyyy ~ '^\d{4}$' AND r.mm ~ '^\d{2}$' AND r.seq ~ '^\d+$' THEN
      v_seq := r.seq::integer;
      INSERT INTO public.production_code_sequence (period, last_value)
      VALUES (r.yyyy || '-' || r.mm, v_seq)
      ON CONFLICT (period) DO UPDATE
        SET last_value = GREATEST(public.production_code_sequence.last_value, EXCLUDED.last_value);
    END IF;
  END LOOP;
END $$;

-- 6. order_entry_save — kode dibentuk server, dipakai konsisten untuk
--    product_note maupun work_code/variation_id.
CREATE OR REPLACE FUNCTION public.order_entry_save(p_order_id text, p_production_code text, p_product_id text, p_product text, p_brand text, p_variations jsonb, p_components jsonb, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_id text;
  v_production_code text;
  v_po public.production_orders%ROWTYPE;
  v_structure_locked boolean;
  v_existing_structure jsonb;
  v_input_structure jsonb;
  v_price_id uuid;
  v_component_count integer;
  v_component_total numeric;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL AND session_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF NULLIF(btrim(p_production_code), '') IS NULL
    OR NULLIF(btrim(p_product_id), '') IS NULL
    OR NULLIF(btrim(p_product), '') IS NULL
    OR NULLIF(btrim(p_brand), '') IS NULL
    OR NULLIF(btrim(p_actor), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Kode produksi, Product ID, product, buyer, dan pengguna wajib diisi';
  END IF;

  IF jsonb_typeof(p_variations) <> 'array' OR jsonb_array_length(p_variations) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Minimal satu variasi wajib diisi';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_variations) AS x(color text, size text, quantity numeric)
    WHERE NULLIF(btrim(color), '') IS NULL
      OR NULLIF(btrim(size), '') IS NULL
      OR quantity IS NULL
      OR quantity <= 0
      OR quantity <> trunc(quantity)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Setiap variasi wajib memiliki warna, size, dan qty bilangan bulat positif';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_variations) AS x(color text, size text, quantity numeric)
    GROUP BY lower(btrim(color)), lower(btrim(size))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Kombinasi warna dan size tidak boleh duplikat';
  END IF;

  IF jsonb_typeof(p_components) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Komponen harga tidak valid';
  END IF;

  SELECT count(*), COALESCE(sum(value), 0)
  INTO v_component_count, v_component_total
  FROM jsonb_to_recordset(p_components) AS x(key text, value numeric)
  WHERE key IN (
    'potong', 'jahit', 'obras', 'finishing', 'operational',
    'material_basic', 'margin', 'jasa_pasang_kancing'
  );

  IF v_component_count <> 8
    OR (SELECT count(DISTINCT key) FROM jsonb_to_recordset(p_components) AS x(key text, value numeric)) <> 8
    OR EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_components) AS x(key text, value numeric)
      WHERE key NOT IN (
        'potong', 'jahit', 'obras', 'finishing', 'operational',
        'material_basic', 'margin', 'jasa_pasang_kancing'
      )
        OR value IS NULL
        OR value < 0
        OR value <> trunc(value)
    )
    OR v_component_total <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Delapan komponen harga wajib lengkap, berupa bilangan bulat nonnegatif, dan total harus lebih dari 0';
  END IF;

  IF NULLIF(btrim(COALESCE(p_order_id, '')), '') IS NULL THEN
    v_order_id := 'PO-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_production_code := public.next_production_code(btrim(p_brand));

    INSERT INTO public.production_orders (
      id, product_note, product_id, product, brand, status, created_by, created_at
    ) VALUES (
      v_order_id,
      v_production_code,
      btrim(p_product_id),
      btrim(p_product),
      btrim(p_brand),
      'PLANNING',
      btrim(p_actor),
      v_now
    );
  ELSE
    v_order_id := p_order_id;
    v_production_code := btrim(p_production_code);

    SELECT * INTO v_po
    FROM public.production_orders
    WHERE id = v_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Order tidak ditemukan';
    END IF;

    PERFORM 1
    FROM public.work_orders
    WHERE source_order_id = v_order_id
    FOR UPDATE;

    IF v_po.status NOT IN ('PLANNING', 'PULLED') OR public.production_order_has_progress(v_order_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORDER_EDIT_BLOCKED_BY_PROGRESS';
    END IF;

    v_structure_locked := v_po.status = 'PULLED'
      OR EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.source_order_id = v_order_id);

    IF v_structure_locked THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'color', lower(btrim(color)),
        'size', lower(btrim(size)),
        'quantity', quantity
      ) ORDER BY lower(btrim(color)), lower(btrim(size))), '[]'::jsonb)
      INTO v_existing_structure
      FROM public.production_order_variations
      WHERE production_order_id = v_order_id;

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'color', lower(btrim(color)),
        'size', lower(btrim(size)),
        'quantity', quantity::integer
      ) ORDER BY lower(btrim(color)), lower(btrim(size))), '[]'::jsonb)
      INTO v_input_structure
      FROM jsonb_to_recordset(p_variations) AS x(color text, size text, quantity numeric);

      IF v_existing_structure <> v_input_structure THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORDER_VARIATIONS_LOCKED_AFTER_PULL';
      END IF;
    END IF;

    UPDATE public.production_orders
    SET product_note = v_production_code,
        product_id = btrim(p_product_id),
        product = btrim(p_product),
        brand = btrim(p_brand)
    WHERE id = v_order_id;
  END IF;

  IF NOT COALESCE(v_structure_locked, false) THEN
    -- Hapus baris yang tidak lagi muncul di input LEBIH DULU.
    -- production_order_variations_work_code_unique adalah index unik pada
    -- work_code, dan work_code diturunkan dari kode produksi + warna + size;
    -- kalau baris lama tidak dibuang dulu, UPDATE bisa menabraknya.
    -- Aman karena cabang ini hanya jalan saat order belum di-Pull, sehingga
    -- belum ada work_orders yang merujuk (FK ON DELETE RESTRICT).
    DELETE FROM public.production_order_variations pov
    WHERE pov.production_order_id = v_order_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_variations) AS x(color text, size text, quantity numeric)
        WHERE lower(btrim(x.color)) = lower(btrim(pov.color))
          AND lower(btrim(x.size)) = lower(btrim(pov.size))
      );

    -- Baris yang masih ada: perbarui nilainya, TANPA menyentuh id maupun
    -- photo_path. Inilah inti perbaikan — id bertahan, foto tidak yatim.
    UPDATE public.production_order_variations pov
    SET color = btrim(x.color),
        size = btrim(x.size),
        quantity = x.quantity::integer,
        variation_id = btrim(p_product_id) || '-' || public.production_color_abbreviation(x.color) || '-' || btrim(x.size),
        work_code = v_production_code || ' | ' || btrim(p_product) || ' | ' || btrim(x.color) || ' | ' || btrim(x.size),
        sort_order = (x.ordinality - 1)::integer,
        legacy_needs_review = false,
        updated_at = v_now
    FROM ROWS FROM (
      jsonb_to_recordset(p_variations)
        AS (color text, size text, quantity numeric)
    ) WITH ORDINALITY AS x(color, size, quantity, ordinality)
    WHERE pov.production_order_id = v_order_id
      AND lower(btrim(pov.color)) = lower(btrim(x.color))
      AND lower(btrim(pov.size)) = lower(btrim(x.size));

    -- Baris yang benar-benar baru.
    INSERT INTO public.production_order_variations (
      production_order_id, color, size, quantity, variation_id, work_code,
      sort_order, legacy_needs_review, created_at, updated_at
    )
    SELECT
      v_order_id,
      btrim(x.color),
      btrim(x.size),
      x.quantity::integer,
      btrim(p_product_id) || '-' || public.production_color_abbreviation(x.color) || '-' || btrim(x.size),
      v_production_code || ' | ' || btrim(p_product) || ' | ' || btrim(x.color) || ' | ' || btrim(x.size),
      (x.ordinality - 1)::integer,
      false,
      v_now,
      v_now
    FROM ROWS FROM (
      jsonb_to_recordset(p_variations)
        AS (color text, size text, quantity numeric)
    ) WITH ORDINALITY AS x(color, size, quantity, ordinality)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.production_order_variations pov
      WHERE pov.production_order_id = v_order_id
        AND lower(btrim(pov.color)) = lower(btrim(x.color))
        AND lower(btrim(pov.size)) = lower(btrim(x.size))
    );
  ELSE
    UPDATE public.production_order_variations pov
    SET variation_id = btrim(p_product_id) || '-' || public.production_color_abbreviation(pov.color) || '-' || btrim(pov.size),
        work_code = v_production_code || ' | ' || btrim(p_product) || ' | ' || btrim(pov.color) || ' | ' || btrim(pov.size),
        updated_at = v_now
    WHERE pov.production_order_id = v_order_id;

    UPDATE public.work_orders wo
    SET product_note = v_production_code,
        product_id = btrim(p_product_id),
        product = btrim(p_product),
        brand = btrim(p_brand),
        variation_id = pov.variation_id,
        work_code = pov.work_code,
        information_variation = 'Colour: ' || pov.color || ' Size: ' || pov.size
    FROM public.production_order_variations pov
    WHERE wo.source_variation_id = pov.id
      AND wo.source_order_id = v_order_id;
  END IF;

  INSERT INTO public.production_order_prices (production_order_id, total_per_piece, created_at, updated_at)
  VALUES (v_order_id, 0, v_now, v_now)
  ON CONFLICT (production_order_id)
  DO UPDATE SET updated_at = EXCLUDED.updated_at
  RETURNING id INTO v_price_id;

  DELETE FROM public.production_order_price_components
  WHERE order_price_id = v_price_id;

  INSERT INTO public.production_order_price_components (
    order_price_id, component_key, label, amount_per_piece, sort_order, created_at, updated_at
  )
  SELECT
    v_price_id,
    key,
    CASE key
      WHEN 'potong' THEN 'Potong'
      WHEN 'jahit' THEN 'Jahit'
      WHEN 'obras' THEN 'Obras'
      WHEN 'finishing' THEN 'Finishing'
      WHEN 'operational' THEN 'Operational'
      WHEN 'material_basic' THEN 'Material Basic'
      WHEN 'margin' THEN 'Margin'
      WHEN 'jasa_pasang_kancing' THEN 'Jasa Pasang Kancing'
    END,
    value::integer,
    CASE key
      WHEN 'potong' THEN 0
      WHEN 'jahit' THEN 1
      WHEN 'obras' THEN 2
      WHEN 'finishing' THEN 3
      WHEN 'operational' THEN 4
      WHEN 'material_basic' THEN 5
      WHEN 'margin' THEN 6
      WHEN 'jasa_pasang_kancing' THEN 7
    END,
    v_now,
    v_now
  FROM jsonb_to_recordset(p_components) AS x(key text, value numeric);

  RETURN public.order_entry_get(v_order_id);
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM ILIKE '%product_note%' THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Kode produksi sudah digunakan';
    END IF;
    RAISE;
END;
$function$;

-- 7. order_entry_list & order_entry_get — buang internalCode yang kolomnya
--    sudah dihapus. Keduanya bukan SECURITY DEFINER, jadi bila dibiarkan
--    menyebut internal_code keduanya langsung error.
CREATE OR REPLACE FUNCTION public.order_entry_list()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      po.created_at,
      jsonb_build_object(
        'id', po.id,
        'productionCode', po.product_note,
        'productId', po.product_id,
        'product', po.product,
        'brand', po.brand,
        'status', po.status,
        'createdBy', po.created_by,
        'createdAt', po.created_at,
        'pulledAt', po.pulled_at,
        'pulledBy', po.pulled_by,
        'productPhotoPath', po.product_photo_path,
        'variationPhotoPath', first_variation.photo_path,
        'totalQuantity', COALESCE(v.total_quantity, 0),
        'variationCount', COALESCE(v.variation_count, 0),
        'totalPerPiece', COALESCE(pop.total_per_piece, 0),
        'priceComplete', public.production_order_price_is_complete(po.id),
        'legacyNeedsReview', COALESCE(v.legacy_needs_review, false),
        'productionStatus', CASE
          WHEN po.status = 'CANCELLED' THEN 'CANCELLED'
          WHEN COALESCE(w.work_order_count, 0) = 0 THEN 'PLANNING'
          WHEN COALESCE(w.invoice_count, 0) = COALESCE(w.work_order_count, 0) AND w.work_order_count > 0 THEN 'INVOICED'
          WHEN COALESCE(w.finished_count, 0) = COALESCE(w.work_order_count, 0) AND w.work_order_count > 0 THEN 'FINISHED'
          WHEN public.production_order_has_progress(po.id) THEN 'IN PROGRESS'
          ELSE 'PULLED'
        END,
        'canEdit', po.status IN ('PLANNING', 'PULLED') AND NOT public.production_order_has_progress(po.id),
        'structureLocked', po.status = 'PULLED' OR COALESCE(w.work_order_count, 0) > 0,
        'editBlockReason', CASE
          WHEN po.status = 'CANCELLED' THEN 'Order dibatalkan'
          WHEN public.production_order_has_progress(po.id) THEN 'Order sudah memiliki progres produksi atau invoice'
          ELSE NULL
        END
      ) AS row_data
    FROM public.production_orders po
    LEFT JOIN (
      SELECT
        production_order_id,
        sum(quantity)::integer AS total_quantity,
        count(*)::integer AS variation_count,
        bool_or(legacy_needs_review) AS legacy_needs_review
      FROM public.production_order_variations
      GROUP BY production_order_id
    ) v ON v.production_order_id = po.id
    LEFT JOIN LATERAL (
      SELECT pov.photo_path
      FROM public.production_order_variations pov
      WHERE pov.production_order_id = po.id
      ORDER BY pov.sort_order, pov.created_at
      LIMIT 1
    ) first_variation ON true
    LEFT JOIN public.production_order_prices pop ON pop.production_order_id = po.id
    LEFT JOIN (
      SELECT
        source_order_id,
        count(*)::integer AS work_order_count,
        count(*) FILTER (WHERE prod_status IN ('FINISHED', 'INVOICED'))::integer AS finished_count,
        count(*) FILTER (WHERE invoice_status IN ('INVOICED', 'PARTIAL_PAID', 'PAID'))::integer AS invoice_count
      FROM public.work_orders
      WHERE source_order_id IS NOT NULL
      GROUP BY source_order_id
    ) w ON w.source_order_id = po.id
  ) listed
$function$;

CREATE OR REPLACE FUNCTION public.order_entry_get(p_order_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id', po.id,
    'productionCode', po.product_note,
    'productId', po.product_id,
    'product', po.product,
    'brand', po.brand,
    'status', po.status,
    'createdBy', po.created_by,
    'createdAt', po.created_at,
    'pulledAt', po.pulled_at,
    'pulledBy', po.pulled_by,
    'productPhotoPath', po.product_photo_path,
    'canEdit', po.status IN ('PLANNING', 'PULLED') AND NOT public.production_order_has_progress(po.id),
    'structureLocked', po.status = 'PULLED' OR EXISTS (
      SELECT 1 FROM public.work_orders wo WHERE wo.source_order_id = po.id
    ),
    'editBlockReason', CASE
      WHEN po.status = 'CANCELLED' THEN 'Order dibatalkan'
      WHEN public.production_order_has_progress(po.id) THEN 'Order sudah memiliki progres produksi atau invoice'
      ELSE NULL
    END,
    'variations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pov.id,
        'color', pov.color,
        'size', pov.size,
        'quantity', pov.quantity,
        'variationId', pov.variation_id,
        'workCode', pov.work_code,
        'sortOrder', pov.sort_order,
        'legacyNeedsReview', pov.legacy_needs_review,
        'photoPath', pov.photo_path
      ) ORDER BY pov.sort_order, pov.created_at)
      FROM public.production_order_variations pov
      WHERE pov.production_order_id = po.id
    ), '[]'::jsonb),
    'pricing', jsonb_build_object(
      'id', pop.id,
      'totalPerPiece', COALESCE(pop.total_per_piece, 0),
      'complete', public.production_order_price_is_complete(po.id),
      'components', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', popc.id,
          'key', popc.component_key,
          'label', popc.label,
          'value', popc.amount_per_piece,
          'sortOrder', popc.sort_order
        ) ORDER BY popc.sort_order)
        FROM public.production_order_price_components popc
        WHERE popc.order_price_id = pop.id
      ), '[]'::jsonb)
    )
  )
  FROM public.production_orders po
  LEFT JOIN public.production_order_prices pop ON pop.production_order_id = po.id
  WHERE po.id = p_order_id
$function$;
