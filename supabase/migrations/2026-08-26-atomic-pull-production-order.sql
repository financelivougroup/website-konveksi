-- Make pulling a production order into Production Monitoring atomic and retry-safe.

DROP POLICY IF EXISTS "Allow authenticated update on production_orders"
  ON public.production_orders;
CREATE POLICY "Allow authenticated update on production_orders"
  ON public.production_orders
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS work_orders_source_order_id_unique
  ON public.work_orders (source_order_id)
  WHERE source_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pull_production_order_to_konveksi(
  p_production_order_id text,
  p_product_id text,
  p_variation_id text,
  p_pulled_by text
)
RETURNS SETOF public.work_orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_po public.production_orders%ROWTYPE;
  v_wo public.work_orders%ROWTYPE;
  v_pulled_at timestamptz;
  v_updated_count integer;
BEGIN
  IF NULLIF(btrim(p_production_order_id), '') IS NULL THEN
    RAISE EXCEPTION 'Production order ID wajib diisi';
  END IF;
  IF NULLIF(btrim(p_product_id), '') IS NULL THEN
    RAISE EXCEPTION 'Product ID wajib diisi';
  END IF;
  IF NULLIF(btrim(p_variation_id), '') IS NULL THEN
    RAISE EXCEPTION 'Variation ID wajib diisi';
  END IF;
  IF NULLIF(btrim(p_pulled_by), '') IS NULL THEN
    RAISE EXCEPTION 'Identitas pengguna wajib diisi';
  END IF;

  SELECT *
  INTO v_po
  FROM public.production_orders
  WHERE id = p_production_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order % tidak ditemukan', p_production_order_id;
  END IF;

  SELECT *
  INTO v_wo
  FROM public.work_orders
  WHERE source_order_id = v_po.id;

  IF FOUND THEN
    IF v_po.status = 'PLANNING' THEN
      v_pulled_at := COALESCE(v_wo.pulled_at, now());

      UPDATE public.production_orders
      SET status = 'PULLED',
          pulled_at = v_pulled_at,
          pulled_by = COALESCE(NULLIF(btrim(v_wo.created_by), ''), p_pulled_by)
      WHERE id = v_po.id;

      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
      IF v_updated_count <> 1 THEN
        RAISE EXCEPTION 'Gagal memperbarui production order %', v_po.id;
      END IF;
    ELSIF v_po.status <> 'PULLED' THEN
      RAISE EXCEPTION 'Production order % berstatus %, tidak dapat di-pull', v_po.id, v_po.status;
    END IF;

    RETURN NEXT v_wo;
    RETURN;
  END IF;

  IF v_po.status <> 'PLANNING' THEN
    RAISE EXCEPTION 'Production order % berstatus % tanpa work order terkait', v_po.id, v_po.status;
  END IF;

  v_pulled_at := now();

  INSERT INTO public.work_orders (
    id,
    work_code,
    source_order_id,
    product_note,
    product,
    product_id,
    variation_id,
    information_variation,
    warna,
    size,
    brand,
    quantity,
    prod_status,
    invoice_status,
    created_by,
    created_at,
    pulled_at
  )
  VALUES (
    'WO-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    v_po.work_code,
    v_po.id,
    v_po.product_note,
    v_po.product,
    p_product_id,
    p_variation_id,
    v_po.information_variation,
    v_po.warna,
    v_po.size,
    v_po.brand,
    v_po.quantity,
    'NEW',
    'NONE',
    p_pulled_by,
    v_po.created_at,
    v_pulled_at
  )
  RETURNING * INTO v_wo;

  UPDATE public.production_orders
  SET status = 'PULLED',
      pulled_at = v_pulled_at,
      pulled_by = p_pulled_by
  WHERE id = v_po.id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'Gagal memperbarui production order %', v_po.id;
  END IF;

  RETURN NEXT v_wo;
END;
$function$;

REVOKE ALL ON FUNCTION public.pull_production_order_to_konveksi(text, text, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pull_production_order_to_konveksi(text, text, text, text)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.pull_production_order_to_konveksi(text, text, text, text)
  TO authenticated;

-- Repair only the confirmed Sheen Pants partial pull. A fresh database without
-- this historical row remains migratable; ambiguous or unexpected matches fail closed.
DO $reconcile$
DECLARE
  v_work_code constant text := 'Produksi - Awal | Sheen Pants | White | S';
  v_po public.production_orders%ROWTYPE;
  v_wo public.work_orders%ROWTYPE;
  v_po_count integer;
  v_wo_count integer;
BEGIN
  SELECT count(*) INTO v_po_count
  FROM public.production_orders
  WHERE work_code = v_work_code;

  IF v_po_count = 0 THEN
    RETURN;
  END IF;
  IF v_po_count <> 1 THEN
    RAISE EXCEPTION 'Rekonsiliasi dibatalkan: ditemukan % PO untuk work code %', v_po_count, v_work_code;
  END IF;

  SELECT * INTO v_po
  FROM public.production_orders
  WHERE work_code = v_work_code;

  IF v_po.status = 'PULLED' THEN
    RETURN;
  END IF;
  IF v_po.status <> 'PLANNING' THEN
    RAISE EXCEPTION 'Rekonsiliasi dibatalkan: status PO % adalah %', v_po.id, v_po.status;
  END IF;

  SELECT count(*) INTO v_wo_count
  FROM public.work_orders
  WHERE source_order_id = v_po.id;

  IF v_wo_count <> 1 THEN
    RAISE EXCEPTION 'Rekonsiliasi dibatalkan: ditemukan % WO untuk PO %', v_wo_count, v_po.id;
  END IF;

  SELECT * INTO v_wo
  FROM public.work_orders
  WHERE source_order_id = v_po.id;

  IF v_wo.pulled_at IS NULL OR NULLIF(btrim(v_wo.created_by), '') IS NULL THEN
    RAISE EXCEPTION 'Rekonsiliasi dibatalkan: metadata pull WO % tidak lengkap', v_wo.id;
  END IF;

  UPDATE public.production_orders
  SET status = 'PULLED',
      pulled_at = v_wo.pulled_at,
      pulled_by = v_wo.created_by
  WHERE id = v_po.id
    AND status = 'PLANNING';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rekonsiliasi PO % tidak memperbarui satu baris', v_po.id;
  END IF;
END;
$reconcile$;
