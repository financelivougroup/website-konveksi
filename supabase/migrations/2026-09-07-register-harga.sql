-- supabase/migrations/2026-09-07-register-harga.sql
--
-- Tujuan: membentuk Register Harga secara otomatis setiap kali order disimpan
-- lewat Order Entry, dan menyediakan pembacaan "harga produksi terakhir" untuk
-- mengisi otomatis harga order baru yang merupakan restock.
--
-- Mengapa perlu tabel baru, bukan view:
--   production_order_prices punya UNIQUE(production_order_id) dan
--   order_entry_save menimpa isinya (INSERT ... ON CONFLICT DO UPDATE, lalu
--   DELETE + INSERT ulang komponennya). Jadi tabel itu hanya menyimpan harga
--   *terkini* — begitu order diedit, harga lama hilang dan riwayatnya tidak
--   tersimpan di mana pun. Register Harga butuh riwayat, maka dibuat tabel
--   append-only sendiri.
--
-- Mengapa jalur tulisnya di dalam order_entry_save:
--   Tabel ini sengaja TIDAK diberi policy INSERT/UPDATE/DELETE dan tidak
--   diberi GRANT tulis. Dengan begitu "Register Harga hanya bisa diinput lewat
--   Order Entry" terjamin di level database, bukan sekadar tombol yang
--   disembunyikan di UI.
--
-- Diterapkan via Supabase MCP.

-- 1. Tabel register harga (append-only)
CREATE TABLE IF NOT EXISTS public.register_harga (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  production_order_id text NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  production_code text,
  client_production_code text,
  product_id text,
  product text,
  brand text,
  total_per_piece integer NOT NULL DEFAULT 0 CHECK (total_per_piece >= 0),
  -- Snapshot 8 komponen harga saat baris ini ditulis. Sengaja jsonb, bukan
  -- tabel anak: baris riwayat tidak pernah ditanyai per komponen, yang dibaca
  -- hanya totalnya dan snapshot lengkapnya untuk auto-fill.
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  actor text,
  saved_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Index
CREATE INDEX IF NOT EXISTS register_harga_order_saved_idx
  ON public.register_harga (production_order_id, saved_at DESC);

-- Pencocokan Product ID dinormalisasi: data nyata tidak konsisten (artikel
-- yang sama tercatat sebagai "LIV-MINA-" dan "LVU-TOP-01"), jadi spasi dibuang
-- dan huruf diseragamkan.
CREATE INDEX IF NOT EXISTS register_harga_product_id_idx
  ON public.register_harga (upper(replace(btrim(product_id), ' ', '')));

-- Fallback bila Product ID tidak cocok: pasangkan Client + Nama Produk.
CREATE INDEX IF NOT EXISTS register_harga_brand_product_idx
  ON public.register_harga (lower(btrim(brand)), lower(btrim(product)), saved_at DESC);

-- 3. RLS: hanya boleh dibaca. Tanpa policy tulis dan tanpa GRANT tulis.
ALTER TABLE public.register_harga ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read register harga" ON public.register_harga;
CREATE POLICY "Authenticated read register harga"
  ON public.register_harga FOR SELECT
  TO authenticated
  USING (true);

-- GRANT bawaan Postgres memberi INSERT/UPDATE/DELETE/TRUNCATE ke PUBLIC pada
-- tabel baru. RLS memang sudah memblokirnya (tidak ada policy tulis), tapi
-- haknya dicabut juga supaya perlindungannya berlapis dan niatnya tertulis di
-- skema: Register Harga hanya boleh ditulis lewat order_entry_save.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.register_harga FROM anon, authenticated;
REVOKE ALL ON public.register_harga FROM PUBLIC;
GRANT SELECT ON public.register_harga TO authenticated;

-- 4. Backfill: order yang sudah punya harga ikut dimasukkan supaya halaman
--    tidak kosong dan auto-fill langsung berguna untuk Product ID lama.
INSERT INTO public.register_harga (
  production_order_id, production_code, client_production_code, product_id,
  product, brand, total_per_piece, components, actor, saved_at
)
SELECT
  po.id,
  po.product_note,
  po.client_production_code,
  po.product_id,
  po.product,
  po.brand,
  p.total_per_piece,
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('key', pc.component_key, 'label', pc.label, 'value', pc.amount_per_piece)
      ORDER BY pc.sort_order
    )
    FROM public.production_order_price_components pc
    WHERE pc.order_price_id = p.id
  ), '[]'::jsonb),
  po.created_by,
  p.updated_at
FROM public.production_order_prices p
JOIN public.production_orders po ON po.id = p.production_order_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.register_harga rh WHERE rh.production_order_id = po.id
);

-- 5. Pembacaan harga produksi terakhir untuk auto-fill.
--    Bukan SECURITY DEFINER — mengikuti order_entry_get / order_entry_list,
--    jadi pembacaannya tetap tunduk RLS.
CREATE OR REPLACE FUNCTION public.price_register_last_price(
  p_product_id text,
  p_brand text,
  p_product text,
  p_exclude_order_id text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.register_harga%ROWTYPE;
  v_matched_by text := 'product_id';
BEGIN
  IF auth.uid() IS NULL AND session_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  -- (a) Product ID sama persis setelah dinormalisasi.
  IF NULLIF(btrim(COALESCE(p_product_id, '')), '') IS NOT NULL THEN
    SELECT rh.* INTO v_row
    FROM public.register_harga rh
    WHERE upper(replace(btrim(COALESCE(rh.product_id, '')), ' ', ''))
        = upper(replace(btrim(p_product_id), ' ', ''))
      AND (
        NULLIF(btrim(COALESCE(p_exclude_order_id, '')), '') IS NULL
        OR rh.production_order_id <> p_exclude_order_id
      )
    ORDER BY rh.saved_at DESC, rh.id DESC
    LIMIT 1;
  END IF;

  -- (b) Fallback: Client + Nama Produk.
  -- Pemeriksaan pakai v_row.id IS NULL, bukan NOT FOUND: FOUND hanya bergeser
  -- bila statement SELECT benar-benar dijalankan, jadi nilainya tidak bisa
  -- dipakai ketika cabang (a) dilewati karena Product ID kosong.
  IF v_row.id IS NULL THEN
    v_matched_by := 'product';
    IF NULLIF(btrim(COALESCE(p_brand, '')), '') IS NOT NULL
       AND NULLIF(btrim(COALESCE(p_product, '')), '') IS NOT NULL THEN
      SELECT rh.* INTO v_row
      FROM public.register_harga rh
      WHERE lower(btrim(COALESCE(rh.brand, ''))) = lower(btrim(p_brand))
        AND lower(btrim(COALESCE(rh.product, ''))) = lower(btrim(p_product))
        AND (
          NULLIF(btrim(COALESCE(p_exclude_order_id, '')), '') IS NULL
          OR rh.production_order_id <> p_exclude_order_id
        )
      ORDER BY rh.saved_at DESC, rh.id DESC
      LIMIT 1;
    END IF;
  END IF;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'production_order_id', v_row.production_order_id,
    'production_code', v_row.production_code,
    'product_id', v_row.product_id,
    'product', v_row.product,
    'brand', v_row.brand,
    'total_per_piece', v_row.total_per_piece,
    'saved_at', v_row.saved_at,
    'matched_by', v_matched_by,
    'components', v_row.components
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.price_register_last_price(text, text, text, text) TO authenticated;

-- 6. Catat harga ke register setiap kali order disimpan.
--    order_entry_save didefinisikan ulang dengan blok tambahan sebelum RETURN.
--    Baris baru hanya dibuat bila total atau salah satu komponen berubah dari
--    baris terakhir untuk order itu; bila sama, cukup saved_at yang diperbarui
--    supaya riwayat tidak berisik.
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
  v_total integer;
  v_register_components jsonb;
  v_last_id bigint;
  v_last_total integer;
  v_last_components jsonb;
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

  -- Awal blok Register Harga -------------------------------------------------
  -- Total dibaca setelah komponen masuk karena trigger
  -- recompute_production_order_price_total yang memelihara nilainya.
  SELECT p.total_per_piece INTO v_total
  FROM public.production_order_prices p
  WHERE p.id = v_price_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('key', pc.component_key, 'label', pc.label, 'value', pc.amount_per_piece)
    ORDER BY pc.sort_order
  ), '[]'::jsonb)
  INTO v_register_components
  FROM public.production_order_price_components pc
  WHERE pc.order_price_id = v_price_id;

  SELECT rh.id, rh.total_per_piece, rh.components
  INTO v_last_id, v_last_total, v_last_components
  FROM public.register_harga rh
  WHERE rh.production_order_id = v_order_id
  ORDER BY rh.saved_at DESC, rh.id DESC
  LIMIT 1;

  IF v_last_id IS NOT NULL
     AND v_last_total = v_total
     AND v_last_components = v_register_components THEN
    -- Harga tidak berubah: perbarui identitasnya saja, jangan tambah baris.
    UPDATE public.register_harga
    SET production_code = v_production_code,
        client_production_code = btrim(p_client_production_code),
        product_id = btrim(p_product_id),
        product = btrim(p_product),
        brand = btrim(p_brand),
        actor = btrim(p_actor),
        saved_at = v_now
    WHERE id = v_last_id;
  ELSE
    INSERT INTO public.register_harga (
      production_order_id, production_code, client_production_code, product_id,
      product, brand, total_per_piece, components, actor, saved_at
    ) VALUES (
      v_order_id,
      v_production_code,
      btrim(p_client_production_code),
      btrim(p_product_id),
      btrim(p_product),
      btrim(p_brand),
      v_total,
      v_register_components,
      btrim(p_actor),
      v_now
    );
  END IF;
  -- Akhir blok Register Harga ------------------------------------------------

  RETURN public.order_entry_get(v_order_id);
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM ILIKE '%product_note%' THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Kode produksi sudah digunakan';
    END IF;
    RAISE;
END;
$function$;
