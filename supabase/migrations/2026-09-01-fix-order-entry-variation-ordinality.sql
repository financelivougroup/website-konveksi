-- Fix PostgreSQL's required syntax for typed recordsets combined with WITH ORDINALITY.

CREATE OR REPLACE FUNCTION public.order_entry_save(
  p_order_id text,
  p_production_code text,
  p_product_id text,
  p_product text,
  p_brand text,
  p_variations jsonb,
  p_components jsonb,
  p_actor text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_order_id text;
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

    INSERT INTO public.production_orders (
      id, product_note, product_id, product, brand, status, created_by, created_at
    ) VALUES (
      v_order_id,
      btrim(p_production_code),
      btrim(p_product_id),
      btrim(p_product),
      btrim(p_brand),
      'PLANNING',
      btrim(p_actor),
      v_now
    );
  ELSE
    v_order_id := p_order_id;

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
    ELSE
      DELETE FROM public.production_order_variations
      WHERE production_order_id = v_order_id;
    END IF;

    UPDATE public.production_orders
    SET product_note = btrim(p_production_code),
        product_id = btrim(p_product_id),
        product = btrim(p_product),
        brand = btrim(p_brand)
    WHERE id = v_order_id;
  END IF;

  IF NOT COALESCE(v_structure_locked, false) THEN
    INSERT INTO public.production_order_variations (
      production_order_id, color, size, quantity, variation_id, work_code,
      sort_order, legacy_needs_review, created_at, updated_at
    )
    SELECT
      v_order_id,
      btrim(color),
      btrim(size),
      quantity::integer,
      btrim(p_product_id) || '-' || public.production_color_abbreviation(color) || '-' || btrim(size),
      btrim(p_production_code) || ' | ' || btrim(p_product) || ' | ' || btrim(color) || ' | ' || btrim(size),
      (ordinality - 1)::integer,
      false,
      v_now,
      v_now
    FROM ROWS FROM (
      jsonb_to_recordset(p_variations)
        AS (color text, size text, quantity numeric)
    ) WITH ORDINALITY AS x(color, size, quantity, ordinality);
  ELSE
    UPDATE public.production_order_variations pov
    SET variation_id = btrim(p_product_id) || '-' || public.production_color_abbreviation(pov.color) || '-' || btrim(pov.size),
        work_code = btrim(p_production_code) || ' | ' || btrim(p_product) || ' | ' || btrim(pov.color) || ' | ' || btrim(pov.size),
        updated_at = v_now
    WHERE pov.production_order_id = v_order_id;

    UPDATE public.work_orders wo
    SET product_note = btrim(p_production_code),
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
