-- supabase/migrations/2026-09-04-order-entry-product-photo.sql
-- Order Entry: foto produk per kode produksi.
-- Diterapkan via Supabase MCP (migration record: order_entry_product_photo).
--
-- Yang disimpan adalah PATH objek storage, bukan URL publik lengkap.
-- complain_files/invoice_payment_files menyimpan keduanya karena file-nya
-- banyak dan di-query lewat tabel anak; untuk satu kolom tunggal di sini,
-- menyimpan URL duplikat hanya menambah risiko URL basi — path adalah satu
-- sumber kebenaran, URL diturunkan di klien lewat getPublicUrl.

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS product_photo_path text;

-- ============================================================
-- Bucket storage (public) — pola mengikuti complain-proofs di
-- 2026-08-15-complain-redesign.sql.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated upload product photos" ON storage.objects;
CREATE POLICY "Authenticated upload product photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-photos');

DROP POLICY IF EXISTS "Authenticated delete product photos" ON storage.objects;
CREATE POLICY "Authenticated delete product photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-photos');

-- ============================================================
-- order_entry_list(): tambahkan productPhotoPath.
-- Salinan persis definisi live, satu field ditambahkan.
-- ============================================================

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

-- ============================================================
-- order_entry_get(p_order_id text): tambahkan productPhotoPath.
-- Signature tidak berubah — order_entry_save memanggil fungsi ini di
-- baris terakhirnya, jadi panggilan itu tetap valid.
-- ============================================================

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
