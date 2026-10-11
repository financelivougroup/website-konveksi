-- Kode produksi client (PDFF_...) tetap ada dan diisi manual, terpisah dari
-- kode produksi otomatis PO/... milik konveksi.

-- 1. Kolom baru di kedua tabel.
--    work_orders ikut diberi kolom karena user meminta kode ini tampil juga di
--    Production Monitoring (tab Raw Data), yang sumbernya adalah work_orders.
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS client_production_code text;
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS client_production_code text;

-- 2. Backfill: 3 order lama yang kode produksinya masih PDFF_... — kode
--    produksinya sendiri TIDAK diubah (ia kunci lookup harga lintas modul),
--    hanya kode client-nya yang diisi dengan nilai yang sama supaya riwayatnya
--    terbaca lengkap.
UPDATE public.production_orders
SET client_production_code = product_note
WHERE client_production_code IS NULL
  AND product_note LIKE 'PDFF_%';

UPDATE public.work_orders wo
SET client_production_code = po.client_production_code
FROM public.production_orders po
WHERE wo.source_order_id = po.id
  AND wo.client_production_code IS NULL
  AND po.client_production_code IS NOT NULL;

-- 3. order_entry_save — terima parameter baru dan wajibkan isinya.
--    PERHATIAN: CREATE OR REPLACE FUNCTION dengan daftar argumen yang berbeda
--    membuat OVERLOAD, bukan mengganti fungsi lama. Fungsi 8-argumen yang
--    lama harus di-DROP terpisah, atau pemanggil dengan parameter posisional
--    akan berhadapan dengan fungsi ambigu.
CREATE OR REPLACE FUNCTION public.order_entry_save(p_order_id text, p_production_code text, p_client_production_code text, p_product_id text, p_product text, p_brand text, p_variations jsonb, p_components jsonb, p_actor text)
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
    OR NULLIF(btrim(COALESCE(p_client_production_code, '')), '') IS NULL
    OR NULLIF(btrim(p_product_id), '') IS NULL
    OR NULLIF(btrim(p_product), '') IS NULL
    OR NULLIF(btrim(p_brand), '') IS NULL
    OR NULLIF(btrim(p_actor), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Kode produksi, kode produksi client, Product ID, product, buyer, dan pengguna wajib diisi';
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
      id, product_note, client_production_code, product_id, product, brand, status, created_by, created_at
    ) VALUES (
      v_order_id,
      v_production_code,
      btrim(p_client_production_code),
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
        client_production_code = btrim(p_client_production_code),
        product_id = btrim(p_product_id),
        product = btrim(p_product),
        brand = btrim(p_brand)
    WHERE id = v_order_id;
  END IF;

  IF NOT COALESCE(v_structure_locked, false) THEN
    DELETE FROM public.production_order_variations pov
    WHERE pov.production_order_id = v_order_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_variations) AS x(color text, size text, quantity numeric)
        WHERE lower(btrim(x.color)) = lower(btrim(pov.color))
          AND lower(btrim(x.size)) = lower(btrim(pov.size))
      );

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
        client_production_code = btrim(p_client_production_code),
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

-- 4. Batalkan banyak order sekaligus: yang memenuhi syarat dibatalkan,
--    sisanya dilaporkan beserta alasannya. Syaratnya sama persis dengan
--    cancel_production_order (status PLANNING, belum ada work order, belum
--    ada progres produksi).
CREATE OR REPLACE FUNCTION public.cancel_production_orders(p_production_order_ids text[], p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id text;
  v_po public.production_orders%ROWTYPE;
  v_cancelled integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL AND session_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF p_production_order_ids IS NULL OR array_length(p_production_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('cancelled', 0, 'skipped', v_skipped);
  END IF;

  FOREACH v_id IN ARRAY p_production_order_ids
  LOOP
    SELECT * INTO v_po
    FROM public.production_orders
    WHERE id = v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'Order tidak ditemukan');
      CONTINUE;
    END IF;

    -- Alasan ditentukan dulu supaya pesannya spesifik, bukan generik.
    v_reason := CASE
      WHEN v_po.status = 'CANCELLED' THEN 'Sudah dibatalkan'
      WHEN v_po.status <> 'PLANNING' THEN 'Status bukan Planning'
      WHEN EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.source_order_id = v_po.id) THEN 'Sudah di-Pull'
      WHEN public.production_order_has_progress(v_po.id) THEN 'Sudah ada progres produksi atau invoice'
      ELSE NULL
    END;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'id', v_po.id,
        'productionCode', v_po.product_note,
        'reason', v_reason
      );
      CONTINUE;
    END IF;

    UPDATE public.production_orders
    SET status = 'CANCELLED'
    WHERE id = v_po.id;

    -- audit_logs tidak punya kolom table_name/action: kolomnya adalah
    -- phase, record_id, field, old_value, new_value, changed_by, reason.
    -- Diverifikasi lewat information_schema sebelum ditulis.
    INSERT INTO public.audit_logs (phase, record_id, field, old_value, new_value, changed_by, reason)
    VALUES (
      'order_entry',
      v_po.id,
      'status',
      v_po.status,
      'CANCELLED',
      btrim(p_actor),
      'Pembatalan massal dari halaman Order Entry'
    );

    v_cancelled := v_cancelled + 1;
  END LOOP;

  RETURN jsonb_build_object('cancelled', v_cancelled, 'skipped', v_skipped);
END;
$function$;

-- 5. Pull menyalin kode produksi client ke work order.
CREATE OR REPLACE FUNCTION public.pull_production_order_to_konveksi(p_production_order_id text, p_pulled_by text)
 RETURNS SETOF work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po public.production_orders%ROWTYPE;
  v_variation public.production_order_variations%ROWTYPE;
  v_pulled_at timestamptz;
BEGIN
  IF auth.uid() IS NULL AND session_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  SELECT * INTO v_po
  FROM public.production_orders
  WHERE id = p_production_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Order tidak ditemukan';
  END IF;

  IF v_po.status NOT IN ('PLANNING', 'PULLED') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Order tidak dapat dimulai dari status saat ini';
  END IF;

  IF NOT public.production_order_price_is_complete(v_po.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORDER_PRICE_INCOMPLETE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.production_order_variations pov
    WHERE pov.production_order_id = v_po.id
  ) OR EXISTS (
    SELECT 1 FROM public.production_order_variations pov
    WHERE pov.production_order_id = v_po.id
      AND (pov.quantity <= 0 OR pov.legacy_needs_review)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORDER_VARIATIONS_INCOMPLETE';
  END IF;

  PERFORM 1
  FROM public.work_orders
  WHERE source_order_id = v_po.id
  FOR UPDATE;

  v_pulled_at := COALESCE(v_po.pulled_at, now());

  FOR v_variation IN
    SELECT *
    FROM public.production_order_variations
    WHERE production_order_id = v_po.id
    ORDER BY sort_order, created_at
  LOOP
    INSERT INTO public.work_orders (
      id, work_code, source_order_id, source_variation_id, product_note,
      client_production_code, product, product_id, variation_id, information_variation, warna, size,
      brand, quantity, prod_status, invoice_status, created_by, created_at, pulled_at
    ) VALUES (
      'WO-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      v_variation.work_code,
      v_po.id,
      v_variation.id,
      v_po.product_note,
      v_po.client_production_code,
      v_po.product,
      v_po.product_id,
      v_variation.variation_id,
      'Colour: ' || v_variation.color || ' Size: ' || v_variation.size,
      v_variation.color,
      v_variation.size,
      v_po.brand,
      v_variation.quantity,
      'NEW',
      'NONE',
      btrim(p_pulled_by),
      now(),
      v_pulled_at
    )
    ON CONFLICT (source_variation_id) WHERE source_variation_id IS NOT NULL
    DO NOTHING;
  END LOOP;

  -- Work order yang dibuat sebelum kolom ini ada ikut disalin, supaya kolom di
  -- Production Monitoring tidak kosong untuk Pull lama.
  UPDATE public.work_orders wo
  SET client_production_code = v_po.client_production_code
  WHERE wo.source_order_id = v_po.id
    AND wo.client_production_code IS NULL
    AND v_po.client_production_code IS NOT NULL;

  UPDATE public.production_orders
  SET status = 'PULLED', pulled_at = v_pulled_at, pulled_by = btrim(p_pulled_by)
  WHERE id = v_po.id;

  RETURN QUERY
  SELECT wo.*
  FROM public.work_orders wo
  WHERE wo.source_order_id = v_po.id
  ORDER BY wo.created_at, wo.id;
END;
$function$;

-- 6. order_entry_list & order_entry_get — sertakan kode produksi client.
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
        'clientProductionCode', po.client_production_code,
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
    'clientProductionCode', po.client_production_code,
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

-- 6. Buang overload lama yang tertinggal dari langkah 3.
DROP FUNCTION IF EXISTS public.order_entry_save(text, text, text, text, text, jsonb, jsonb, text);
