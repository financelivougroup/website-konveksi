-- Normalize Order Entry into one production-code parent with many variations and shared pricing.
-- This additive migration keeps the legacy Register PO tables temporarily so consumers can be cut over safely.

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS product_id text;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.production_orders
    WHERE NULLIF(btrim(product_note), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Order Entry migration blocked: production order with blank Product Note exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.production_orders
    GROUP BY lower(btrim(product_note))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Order Entry migration blocked: duplicate normalized Product Note exists';
  END IF;
END;
$preflight$;

ALTER TABLE public.production_orders
  ALTER COLUMN product_note SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS production_orders_product_note_normalized_unique
  ON public.production_orders (lower(btrim(product_note)));

CREATE OR REPLACE FUNCTION public.production_color_abbreviation(p_color text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $function$
  SELECT CASE lower(btrim(p_color))
    WHEN 'black' THEN 'BLK'
    WHEN 'white' THEN 'WHT'
    WHEN 'navy' THEN 'NVY'
    WHEN 'red' THEN 'RED'
    WHEN 'grey' THEN 'GRY'
    WHEN 'gray' THEN 'GRY'
    WHEN 'beige' THEN 'BEG'
    WHEN 'blue' THEN 'BLU'
    WHEN 'green' THEN 'GRN'
    WHEN 'brown' THEN 'BRN'
    WHEN 'pink' THEN 'PNK'
    WHEN 'yellow' THEN 'YLW'
    WHEN 'orange' THEN 'ORG'
    WHEN 'purple' THEN 'PRP'
    WHEN 'cream' THEN 'CRM'
    WHEN 'khaki' THEN 'KHK'
    WHEN 'maroon' THEN 'MRN'
    WHEN 'silver' THEN 'SLV'
    WHEN 'gold' THEN 'GLD'
    ELSE COALESCE(
      NULLIF(upper(substr(regexp_replace(lower(btrim(p_color)), '[aeiou]', '', 'g'), 1, 3)), ''),
      upper(substr(btrim(p_color), 1, 3))
    )
  END
$function$;

CREATE TABLE IF NOT EXISTS public.production_order_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id text NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  color text NOT NULL,
  size text NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  variation_id text NOT NULL,
  work_code text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  legacy_needs_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS production_order_variations_combination_unique
  ON public.production_order_variations (
    production_order_id,
    lower(btrim(color)),
    lower(btrim(size))
  );
CREATE UNIQUE INDEX IF NOT EXISTS production_order_variations_work_code_unique
  ON public.production_order_variations (work_code);
CREATE INDEX IF NOT EXISTS production_order_variations_order_idx
  ON public.production_order_variations (production_order_id, sort_order);

CREATE TABLE IF NOT EXISTS public.production_order_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id text NOT NULL UNIQUE REFERENCES public.production_orders(id) ON DELETE CASCADE,
  total_per_piece integer NOT NULL DEFAULT 0 CHECK (total_per_piece >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.production_order_price_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_price_id uuid NOT NULL REFERENCES public.production_order_prices(id) ON DELETE CASCADE,
  component_key text NOT NULL CHECK (component_key IN (
    'potong',
    'jahit',
    'obras',
    'finishing',
    'operational',
    'material_basic',
    'margin',
    'jasa_pasang_kancing'
  )),
  label text NOT NULL,
  amount_per_piece integer NOT NULL DEFAULT 0 CHECK (amount_per_piece >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_price_id, component_key)
);
CREATE INDEX IF NOT EXISTS production_order_price_components_price_idx
  ON public.production_order_price_components (order_price_id, sort_order);

CREATE OR REPLACE FUNCTION public.recompute_production_order_price_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE public.production_order_prices
  SET total_per_piece = (
        SELECT COALESCE(sum(amount_per_piece), 0)::integer
        FROM public.production_order_price_components
        WHERE order_price_id = COALESCE(NEW.order_price_id, OLD.order_price_id)
      ),
      updated_at = now()
  WHERE id = COALESCE(NEW.order_price_id, OLD.order_price_id);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS recompute_production_order_price_total_trigger
  ON public.production_order_price_components;
CREATE TRIGGER recompute_production_order_price_total_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.production_order_price_components
FOR EACH ROW EXECUTE FUNCTION public.recompute_production_order_price_total();

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS source_variation_id uuid;

DO $work_order_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_orders_source_variation_id_fkey'
      AND conrelid = 'public.work_orders'::regclass
  ) THEN
    ALTER TABLE public.work_orders
      ADD CONSTRAINT work_orders_source_variation_id_fkey
      FOREIGN KEY (source_variation_id)
      REFERENCES public.production_order_variations(id)
      ON DELETE RESTRICT;
  END IF;
END;
$work_order_fk$;

DROP INDEX IF EXISTS public.work_orders_source_order_id_unique;
CREATE INDEX IF NOT EXISTS work_orders_source_order_id_idx
  ON public.work_orders (source_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS work_orders_source_variation_id_unique
  ON public.work_orders (source_variation_id)
  WHERE source_variation_id IS NOT NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS order_price_id uuid;

DO $invoice_price_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_order_price_id_fkey'
      AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_order_price_id_fkey
      FOREIGN KEY (order_price_id)
      REFERENCES public.production_order_prices(id)
      ON DELETE SET NULL;
  END IF;
END;
$invoice_price_fk$;

-- Preserve the Product ID already used by a linked Work Order; derive only when no snapshot exists.
UPDATE public.production_orders po
SET product_id = COALESCE(
  (
    SELECT NULLIF(btrim(wo.product_id), '')
    FROM public.work_orders wo
    WHERE wo.source_order_id = po.id
      AND NULLIF(btrim(wo.product_id), '') IS NOT NULL
    ORDER BY wo.created_at, wo.id
    LIMIT 1
  ),
  upper(substr(COALESCE(po.brand, ''), 1, 3)) || '-' ||
    upper(substr(replace(po.product, ' ', '-'), 1, 5))
)
WHERE NULLIF(btrim(po.product_id), '') IS NULL;

-- Backfill exactly one variation per legacy Production Order.
INSERT INTO public.production_order_variations (
  production_order_id,
  color,
  size,
  quantity,
  variation_id,
  work_code,
  sort_order,
  legacy_needs_review,
  created_at,
  updated_at
)
SELECT
  po.id,
  COALESCE(NULLIF(btrim(po.warna), ''), 'NEEDS REVIEW'),
  COALESCE(NULLIF(btrim(po.size), ''), 'NEEDS REVIEW'),
  COALESCE(
    (
      SELECT wo.quantity
      FROM public.work_orders wo
      WHERE wo.source_order_id = po.id AND wo.quantity > 0
      ORDER BY wo.created_at, wo.id
      LIMIT 1
    ),
    CASE WHEN po.quantity > 0 THEN po.quantity ELSE 0 END
  ),
  COALESCE(
    (
      SELECT NULLIF(btrim(wo.variation_id), '')
      FROM public.work_orders wo
      WHERE wo.source_order_id = po.id
      ORDER BY wo.created_at, wo.id
      LIMIT 1
    ),
    po.product_id || '-' ||
      public.production_color_abbreviation(COALESCE(NULLIF(btrim(po.warna), ''), 'NEEDS REVIEW')) || '-' ||
      COALESCE(NULLIF(btrim(po.size), ''), 'NEEDS-REVIEW')
  ),
  COALESCE(
    NULLIF(btrim(po.work_code), ''),
    btrim(po.product_note) || ' | ' || btrim(po.product) || ' | ' ||
      COALESCE(NULLIF(btrim(po.warna), ''), 'NEEDS REVIEW') || ' | ' ||
      COALESCE(NULLIF(btrim(po.size), ''), 'NEEDS REVIEW')
  ),
  0,
  NULLIF(btrim(po.warna), '') IS NULL
    OR NULLIF(btrim(po.size), '') IS NULL
    OR COALESCE(
      (
        SELECT wo.quantity
        FROM public.work_orders wo
        WHERE wo.source_order_id = po.id AND wo.quantity > 0
        ORDER BY wo.created_at, wo.id
        LIMIT 1
      ),
      CASE WHEN po.quantity > 0 THEN po.quantity ELSE 0 END
    ) <= 0,
  COALESCE(po.created_at, now()),
  now()
FROM public.production_orders po
WHERE NOT EXISTS (
  SELECT 1
  FROM public.production_order_variations pov
  WHERE pov.production_order_id = po.id
);

UPDATE public.work_orders wo
SET source_variation_id = pov.id
FROM public.production_order_variations pov
WHERE pov.production_order_id = wo.source_order_id
  AND wo.source_variation_id IS NULL;

-- Parent status is lifecycle only; execution completion remains on Work Orders.
UPDATE public.production_orders po
SET status = CASE
  WHEN po.status = 'CANCELLED' THEN 'CANCELLED'
  WHEN EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.source_order_id = po.id) THEN 'PULLED'
  ELSE 'PLANNING'
END;

-- Move existing Register PO business values into the new order-pricing model.
INSERT INTO public.production_order_prices (
  production_order_id,
  total_per_piece,
  created_at,
  updated_at
)
SELECT production_order_id, total_per_pcs, created_at, updated_at
FROM public.register_po
ON CONFLICT (production_order_id) DO NOTHING;

INSERT INTO public.production_order_price_components (
  order_price_id,
  component_key,
  label,
  amount_per_piece,
  sort_order,
  created_at,
  updated_at
)
SELECT
  pop.id,
  rpc.key,
  rpc.label,
  rpc.value,
  rpc.sort_order,
  COALESCE(rp.created_at, now()),
  COALESCE(rp.updated_at, now())
FROM public.register_po rp
JOIN public.register_po_components rpc ON rpc.register_po_id = rp.id
JOIN public.production_order_prices pop ON pop.production_order_id = rp.production_order_id
ON CONFLICT (order_price_id, component_key) DO NOTHING;

UPDATE public.invoices i
SET order_price_id = pop.id
FROM public.work_orders wo
JOIN public.production_order_prices pop ON pop.production_order_id = wo.source_order_id
WHERE wo.id = i.work_order_id
  AND i.order_price_id IS NULL;

DO $pricing_verify$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.register_po rp
    LEFT JOIN public.production_order_prices pop
      ON pop.production_order_id = rp.production_order_id
    WHERE pop.id IS NULL OR pop.total_per_piece <> rp.total_per_pcs
  ) THEN
    RAISE EXCEPTION 'Order Entry migration blocked: migrated price total mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.register_po rp
    JOIN public.production_order_prices pop
      ON pop.production_order_id = rp.production_order_id
    WHERE (
      SELECT count(*)
      FROM public.register_po_components rpc
      WHERE rpc.register_po_id = rp.id
    ) <> (
      SELECT count(*)
      FROM public.production_order_price_components popc
      WHERE popc.order_price_id = pop.id
    )
  ) THEN
    RAISE EXCEPTION 'Order Entry migration blocked: migrated price component count mismatch';
  END IF;
END;
$pricing_verify$;

CREATE OR REPLACE FUNCTION public.production_order_price_is_complete(p_production_order_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE((
    SELECT count(*) = 8
      AND count(DISTINCT popc.component_key) = 8
      AND pop.total_per_piece > 0
    FROM public.production_order_prices pop
    JOIN public.production_order_price_components popc
      ON popc.order_price_id = pop.id
    WHERE pop.production_order_id = p_production_order_id
    GROUP BY pop.id, pop.total_per_piece
  ), false)
$function$;

CREATE OR REPLACE FUNCTION public.production_order_has_progress(p_production_order_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.work_orders wo
    WHERE wo.source_order_id = p_production_order_id
      AND (
        EXISTS (SELECT 1 FROM public.cutting_records cr WHERE cr.work_order_id = wo.id)
        OR EXISTS (SELECT 1 FROM public.sewing_records sr WHERE sr.work_order_id = wo.id)
        OR EXISTS (SELECT 1 FROM public.finishing_records fr WHERE fr.work_order_id = wo.id)
        OR EXISTS (SELECT 1 FROM public.kancing_records kr WHERE kr.work_order_id = wo.id)
        OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.work_order_id = wo.id)
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.order_entry_list()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
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
SECURITY INVOKER
SET search_path = public, pg_temp
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
        'legacyNeedsReview', pov.legacy_needs_review
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
  v_status text;
  v_structure_locked boolean;
  v_existing_structure jsonb;
  v_input_structure jsonb;
  v_total_quantity integer;
  v_first_color text;
  v_first_size text;
  v_first_work_code text;
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

  SELECT sum(quantity)::integer
  INTO v_total_quantity
  FROM jsonb_to_recordset(p_variations) AS x(color text, size text, quantity integer);

  SELECT btrim(color), btrim(size)
  INTO v_first_color, v_first_size
  FROM ROWS FROM (
    jsonb_to_recordset(p_variations)
      AS (color text, size text, quantity integer)
  ) WITH ORDINALITY AS ordered(color, size, quantity, ordinality)
  ORDER BY ordinality
  LIMIT 1;

  v_first_work_code := btrim(p_production_code) || ' | ' || btrim(p_product) || ' | ' || v_first_color || ' | ' || v_first_size;

  IF NULLIF(btrim(COALESCE(p_order_id, '')), '') IS NULL THEN
    v_order_id := 'PO-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_status := 'PLANNING';

    INSERT INTO public.production_orders (
      id, work_code, product_note, product_id, product, information_variation,
      warna, size, brand, quantity, status, created_by, created_at
    ) VALUES (
      v_order_id,
      v_first_work_code,
      btrim(p_production_code),
      btrim(p_product_id),
      btrim(p_product),
      'Multiple variations: ' || jsonb_array_length(p_variations),
      v_first_color,
      v_first_size,
      btrim(p_brand),
      v_total_quantity,
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

    v_status := v_po.status;
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
        brand = btrim(p_brand),
        work_code = v_first_work_code,
        information_variation = 'Multiple variations: ' || jsonb_array_length(p_variations),
        warna = v_first_color,
        size = v_first_size,
        quantity = v_total_quantity
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

CREATE OR REPLACE FUNCTION public.pull_production_order_to_konveksi(
  p_production_order_id text,
  p_pulled_by text
)
RETURNS SETOF public.work_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
      product, product_id, variation_id, information_variation, warna, size,
      brand, quantity, prod_status, invoice_status, created_by, created_at, pulled_at
    ) VALUES (
      'WO-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      v_variation.work_code,
      v_po.id,
      v_variation.id,
      v_po.product_note,
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

CREATE OR REPLACE FUNCTION public.cancel_production_order(
  p_production_order_id text,
  p_actor text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_po public.production_orders%ROWTYPE;
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

  IF v_po.status <> 'PLANNING'
    OR EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.source_order_id = v_po.id)
    OR public.production_order_has_progress(v_po.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORDER_CANCEL_BLOCKED';
  END IF;

  UPDATE public.production_orders
  SET status = 'CANCELLED'
  WHERE id = v_po.id;

  RETURN public.order_entry_get(v_po.id);
END;
$function$;

-- Prevent any new downstream progress from bypassing the complete-pricing gate.
CREATE OR REPLACE FUNCTION public.assert_work_order_has_complete_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_work_order_id text;
  v_source_order_id text;
BEGIN
  v_work_order_id := NEW.work_order_id;

  SELECT source_order_id INTO v_source_order_id
  FROM public.work_orders
  WHERE id = v_work_order_id;

  IF v_source_order_id IS NULL OR NOT public.production_order_price_is_complete(v_source_order_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORDER_PRICE_INCOMPLETE';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cutting_requires_complete_order_price ON public.cutting_records;
CREATE TRIGGER cutting_requires_complete_order_price
BEFORE INSERT OR UPDATE OF work_order_id ON public.cutting_records
FOR EACH ROW EXECUTE FUNCTION public.assert_work_order_has_complete_price();

DROP TRIGGER IF EXISTS sewing_requires_complete_order_price ON public.sewing_records;
CREATE TRIGGER sewing_requires_complete_order_price
BEFORE INSERT OR UPDATE OF work_order_id ON public.sewing_records
FOR EACH ROW EXECUTE FUNCTION public.assert_work_order_has_complete_price();

DROP TRIGGER IF EXISTS finishing_requires_complete_order_price ON public.finishing_records;
CREATE TRIGGER finishing_requires_complete_order_price
BEFORE INSERT OR UPDATE OF work_order_id ON public.finishing_records
FOR EACH ROW EXECUTE FUNCTION public.assert_work_order_has_complete_price();

DROP TRIGGER IF EXISTS kancing_requires_complete_order_price ON public.kancing_records;
CREATE TRIGGER kancing_requires_complete_order_price
BEFORE INSERT OR UPDATE OF work_order_id ON public.kancing_records
FOR EACH ROW EXECUTE FUNCTION public.assert_work_order_has_complete_price();

DROP TRIGGER IF EXISTS invoice_requires_complete_order_price ON public.invoices;
CREATE TRIGGER invoice_requires_complete_order_price
BEFORE INSERT OR UPDATE OF work_order_id ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.assert_work_order_has_complete_price();

ALTER TABLE public.production_order_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_price_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read production order variations" ON public.production_order_variations;
CREATE POLICY "Authenticated read production order variations"
  ON public.production_order_variations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read production order prices" ON public.production_order_prices;
CREATE POLICY "Authenticated read production order prices"
  ON public.production_order_prices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read production order price components" ON public.production_order_price_components;
CREATE POLICY "Authenticated read production order price components"
  ON public.production_order_price_components FOR SELECT TO authenticated USING (true);

REVOKE ALL ON TABLE public.production_order_variations FROM anon;
REVOKE ALL ON TABLE public.production_order_prices FROM anon;
REVOKE ALL ON TABLE public.production_order_price_components FROM anon;
GRANT SELECT ON TABLE public.production_order_variations TO authenticated;
GRANT SELECT ON TABLE public.production_order_prices TO authenticated;
GRANT SELECT ON TABLE public.production_order_price_components TO authenticated;

REVOKE ALL ON FUNCTION public.order_entry_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.order_entry_get(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.order_entry_save(text, text, text, text, text, jsonb, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pull_production_order_to_konveksi(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_production_order(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_entry_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_entry_get(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_entry_save(text, text, text, text, text, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pull_production_order_to_konveksi(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_production_order(text, text) TO authenticated;
