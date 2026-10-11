-- =============================================================================
-- Order Entry: hapus input quantity manual dari Create New Order
-- =============================================================================
--
-- Permintaan user (verbatim):
--   "pada saat Create New Order di Order Entry, kOlOm quantity harusnya dihapus
--    aja. lalu harus ada tOmbOl buat ambil kde prduksi client yang dari external"
--
-- Keputusan user saat ditanya:
--   - nasib qty        : "Hapus permanen, qty dari POS"
--   - sumber external  : "API Pancake POS"
--   - urutan kerja     : "Hapus qty sekarang juga"
--
-- Alasan: qty itu bukan angka yang diketik konveksi. Ia adalah kuantitas yang
-- diupload client ke POS-nya sendiri (Pancake). Karena itu form Order Entry
-- tidak lagi memintanya, dan `production_order_variations.quantity` disimpan 0
-- sampai sinkronisasi POS mengisinya.
--
-- PENTING — arti angka 0 pada kolom quantity:
--   0 BUKAN "qty nol", melainkan "qty belum diterima dari client". Konvensi ini
--   sudah dipakai di seluruh aplikasi (`Number(x) || 0`, `isPositive()`), jadi
--   tidak ada kolom baru. Yang berubah hanya dua penjaga di bawah, yang tadinya
--   MENOLAK qty 0 — kalau tidak dilonggarkan, order baru tidak bisa disimpan
--   maupun di-Pull sama sekali.
--
-- Yang diubah:
--   1. public.order_entry_save      — variasi tidak lagi wajib ber-qty;
--                                     quantity tidak ditulis saat update supaya
--                                     qty dari POS tidak terhapus saat order
--                                     diedit; struktur terkunci tidak lagi
--                                     membandingkan quantity.
--   2. public.pull_production_order_to_konveksi
--                                   — penjaga `quantity <= 0` dibuang, hanya
--                                     `legacy_needs_review` yang tersisa.
--
-- Yang sengaja TIDAK disentuh:
--   - Skema tabel (`quantity` tetap integer NOT NULL DEFAULT 0). Tidak diubah
--     jadi nullable supaya tipe `number` di TypeScript tidak perlu dirombak di
--     ~40 pemakai — 0 sudah menjadi sentinel "belum ada" di seluruh repo.
--   - `work_orders.quantity` tetap diisi dari variasi saat Pull (jadi 0), dan
--     nanti ditimpa oleh sinkronisasi POS.
--   - Guard komponen harga, register harga, dan seluruh blok lain: tidak ada
--     hubungannya dengan permintaan ini.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.order_entry_save(
  p_order_id text,
  p_production_code text,
  p_client_production_code text,
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

  -- Quantity TIDAK lagi diperiksa: nilainya datang dari POS client, bukan dari
  -- form. Yang wajib tetap identitas variasinya (warna + size).
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_variations) AS x(color text, size text)
    WHERE NULLIF(btrim(color), '') IS NULL
      OR NULLIF(btrim(size), '') IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Setiap variasi wajib memiliki warna dan size';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_variations) AS x(color text, size text)
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
      'DRAFT',
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

    IF v_po.status NOT IN ('DRAFT', 'PULLED') OR public.production_order_has_progress(v_order_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORDER_EDIT_BLOCKED_BY_PROGRESS';
    END IF;

    v_structure_locked := v_po.status = 'PULLED'
      OR EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.source_order_id = v_order_id);

    IF v_structure_locked THEN
      -- Struktur terkunci = identitas variasi saja (warna + size). Quantity
      -- sengaja TIDAK ikut dibandingkan: ia milik POS client, jadi sinkronisasi
      -- POS yang mengubahnya tidak boleh membuat order lama jadi tidak bisa
      -- diedit.
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'color', lower(btrim(color)),
        'size', lower(btrim(size))
      ) ORDER BY lower(btrim(color)), lower(btrim(size))), '[]'::jsonb)
      INTO v_existing_structure
      FROM public.production_order_variations
      WHERE production_order_id = v_order_id;

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'color', lower(btrim(color)),
        'size', lower(btrim(size))
      ) ORDER BY lower(btrim(color)), lower(btrim(size))), '[]'::jsonb)
      INTO v_input_structure
      FROM jsonb_to_recordset(p_variations) AS x(color text, size text);

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
        FROM jsonb_to_recordset(p_variations) AS x(color text, size text)
        WHERE lower(btrim(x.color)) = lower(btrim(pov.color))
          AND lower(btrim(x.size)) = lower(btrim(pov.size))
      );

    -- `quantity` sengaja TIDAK ada di SET: baris yang sudah punya qty dari POS
    -- harus mempertahankannya saat order diedit.
    UPDATE public.production_order_variations pov
    SET color = btrim(x.color),
        size = btrim(x.size),
        variation_id = btrim(p_product_id) || '-' || public.production_color_abbreviation(x.color) || '-' || btrim(x.size),
        work_code = v_production_code || ' | ' || btrim(p_product) || ' | ' || btrim(x.color) || ' | ' || btrim(x.size),
        sort_order = (x.ordinality - 1)::integer,
        legacy_needs_review = false,
        updated_at = v_now
    FROM ROWS FROM (
      jsonb_to_recordset(p_variations)
        AS (color text, size text)
    ) WITH ORDINALITY AS x(color, size, ordinality)
    WHERE pov.production_order_id = v_order_id
      AND lower(btrim(pov.color)) = lower(btrim(x.color))
      AND lower(btrim(pov.size)) = lower(btrim(x.size));

    -- Variasi baru lahir dengan quantity 0 = "qty belum diterima dari client".
    INSERT INTO public.production_order_variations (
      production_order_id, color, size, quantity, variation_id, work_code,
      sort_order, legacy_needs_review, created_at, updated_at
    )
    SELECT
      v_order_id,
      btrim(x.color),
      btrim(x.size),
      0,
      btrim(p_product_id) || '-' || public.production_color_abbreviation(x.color) || '-' || btrim(x.size),
      v_production_code || ' | ' || btrim(p_product) || ' | ' || btrim(x.color) || ' | ' || btrim(x.size),
      (x.ordinality - 1)::integer,
      false,
      v_now,
      v_now
    FROM ROWS FROM (
      jsonb_to_recordset(p_variations)
        AS (color text, size text)
    ) WITH ORDINALITY AS x(color, size, ordinality)
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
  -- recompute_production_order_price_total yang memeliharanya.
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

-- =============================================================================
-- Pull: izinkan variasi tanpa qty
-- =============================================================================
-- Penjaga lama menolak `pov.quantity <= 0`, sehingga order baru (qty 0 sampai
-- POS mengisinya) tidak akan pernah bisa di-Pull. Yang tersisa hanya
-- `legacy_needs_review` — penanda data lama yang memang perlu diperiksa manusia.

CREATE OR REPLACE FUNCTION public.pull_production_order_to_konveksi(
  p_production_order_id text,
  p_pulled_by text
)
RETURNS SETOF public.work_orders
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

  IF v_po.status NOT IN ('DRAFT', 'PULLED') THEN
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
      AND pov.legacy_needs_review
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
