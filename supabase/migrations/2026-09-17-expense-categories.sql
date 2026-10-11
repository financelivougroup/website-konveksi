-- supabase/migrations/2026-09-17-expense-categories.sql
-- Kategori Biaya: taksonomi biaya 4 tingkat (Type -> Main Category -> Sub
-- Category -> Item) yang menjadi fondasi pencatatan seluruh cost konveksi.
--
-- ALASAN BENTUK SKEMA
-- Empat tingkatnya dangkal dan tetap (tidak akan berkembang jadi 5), jadi
-- dipakai SATU tabel bersarang-sendiri (`parent_id`) alih-alih empat tabel
-- terpisah. Menambah kategori = menambah baris, bukan mengubah skema — itulah
-- yang diminta user pada ketentuan "struktur data harus mudah ditambahkan".
--
-- TIGA SIFAT DATA USER YANG MENENTUKAN DESAIN (dibaca dari daftar kategori
-- yang mereka kirim, bukan diasumsikan):
--   1. Item boleh kosong — `MANPOWER; SALARY; -` tidak punya item.
--   2. Nama Item TIDAK unik secara global — `Visit Offline Purchase` muncul di
--      TRANSPORTATION dan MEALS; `Support Tools` dan `Mesin` di SEWING dan
--      CUTTING. Maka identitas kategori adalah JALUR LENGKAPNYA, bukan namanya.
--   3. Kedalaman cabang tidak seragam.
--
-- Diterapkan ke database live lewat Supabase MCP; berkas ini adalah catatan
-- repo. Isinya diverifikasi ulang lewat MCP setelah penerapan (tabel, indeks,
-- trigger, policy, dan hitungan baris per level).

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level       text        NOT NULL CHECK (level IN ('type', 'main', 'sub', 'item')),
  parent_id   bigint      REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  name        text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- `level` DISIMPAN, bukan disimpulkan dari kedalaman rantai `parent_id`.
-- Menyimpulkannya menuntut CTE rekursif di setiap query; kolomnya membuat
-- validasi dan penyaringan jadi sepele. Konsistensinya dijaga trigger di bawah.

-- ON DELETE RESTRICT, bukan CASCADE: user memilih "nonaktifkan, bukan hapus",
-- jadi FK yang MENOLAK penghapusan induk adalah penjaga yang benar.

-- ===== Keunikan nama =====
-- Arti "kembar" berbeda menurut tingkat, jadi dipakai dua indeks parsial.
-- Perhatikan: dua baris dengan `parent_id IS NULL` TIDAK dianggap kembar oleh
-- indeks unik biasa (NULL != NULL). Karena itu tingkat `type` — yang parent_id-nya
-- selalu NULL — diberi indeks tersendiri yang hanya melihat namanya, sehingga
-- 'EXPENSE' tidak bisa masuk dua kali.
CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_type_name_key
  ON public.expense_categories (lower(btrim(name)))
  WHERE level = 'type';

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_parent_name_key
  ON public.expense_categories (parent_id, lower(btrim(name)))
  NULLS NOT DISTINCT
  WHERE level <> 'type';

CREATE INDEX IF NOT EXISTS expense_categories_parent_idx
  ON public.expense_categories (parent_id);

CREATE INDEX IF NOT EXISTS expense_categories_level_idx
  ON public.expense_categories (level);

-- ===== Trigger: jaga `level` tetap sinkron dengan `parent_id` =====
-- Ini yang menegakkan ketentuan 1-3 user DI DATABASE, bukan hanya di UI. Tanpa
-- trigger ini sebuah baris bisa mengaku level 'item' sementara induknya bukan
-- Sub Category, dan dropdown bertingkat akan diam-diam menampilkan hal yang salah.
CREATE OR REPLACE FUNCTION public.expense_categories_check_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_parent_level text;
BEGIN
  IF NEW.level = 'type' THEN
    IF NEW.parent_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'EXPENSE_CATEGORY_TYPE_WITH_PARENT';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.parent_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'EXPENSE_CATEGORY_MISSING_PARENT';
  END IF;

  SELECT level INTO v_parent_level
  FROM public.expense_categories
  WHERE id = NEW.parent_id;

  IF v_parent_level IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'EXPENSE_CATEGORY_PARENT_NOT_FOUND';
  END IF;

  IF NOT (
    (NEW.level = 'main' AND v_parent_level = 'type') OR
    (NEW.level = 'sub'  AND v_parent_level = 'main') OR
    (NEW.level = 'item' AND v_parent_level = 'sub')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'EXPENSE_CATEGORY_LEVEL_MISMATCH';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS expense_categories_check_hierarchy_trg ON public.expense_categories;
CREATE TRIGGER expense_categories_check_hierarchy_trg
  BEFORE INSERT OR UPDATE OF level, parent_id ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.expense_categories_check_hierarchy();

-- ===== Trigger: `updated_at` =====
CREATE OR REPLACE FUNCTION public.expense_categories_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS expense_categories_touch_updated_at_trg ON public.expense_categories;
CREATE TRIGGER expense_categories_touch_updated_at_trg
  BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.expense_categories_touch_updated_at();

-- ===== RLS =====
-- Mengikuti pola `register_client` (migrations/2026-09-03-register-client.sql):
-- baca untuk semua, tulis hanya untuk authenticated. Gating per-role
-- (owner/finance) dilakukan di UI, sama seperti seluruh master data lain.
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for all" ON public.expense_categories;
CREATE POLICY "Allow read for all"
  ON public.expense_categories FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Authenticated category insert" ON public.expense_categories;
CREATE POLICY "Authenticated category insert"
  ON public.expense_categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated category update" ON public.expense_categories;
CREATE POLICY "Authenticated category update"
  ON public.expense_categories FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated category delete" ON public.expense_categories;
CREATE POLICY "Authenticated category delete"
  ON public.expense_categories FOR DELETE
  TO authenticated
  USING (true);

GRANT SELECT ON public.expense_categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;

-- ===== Seed: seluruh daftar kategori dari user =====
-- Induk diambil lewat SUBQUERY berdasarkan nama, bukan id yang diketik tangan
-- (id-nya GENERATED ALWAYS AS IDENTITY, jadi memang tidak bisa ditulis tangan).
-- ON CONFLICT DO NOTHING membuat migrasi ini aman dijalankan ulang.

INSERT INTO public.expense_categories (level, parent_id, name, sort_order)
VALUES ('type', NULL, 'EXPENSE', 1), ('type', NULL, 'PURCHASE', 2)
ON CONFLICT DO NOTHING;

-- Main Category
INSERT INTO public.expense_categories (level, parent_id, name, sort_order)
SELECT 'main', t.id, v.name, v.ord
FROM (VALUES
  ('EXPENSE',  'MOBILITY',  1),
  ('EXPENSE',  'OTHERS',    2),
  ('EXPENSE',  'MANPOWER',  3),
  ('PURCHASE', 'PRODUCTION',1)
) AS v(type_name, name, ord)
JOIN public.expense_categories t
  ON t.level = 'type' AND lower(btrim(t.name)) = lower(v.type_name)
ON CONFLICT DO NOTHING;

-- Sub Category
INSERT INTO public.expense_categories (level, parent_id, name, sort_order)
SELECT 'sub', m.id, v.name, v.ord
FROM (VALUES
  ('MOBILITY',  'TRANSPORTATION', 1),
  ('MOBILITY',  'DELIVERY',       2),
  ('OTHERS',    'MEALS',          1),
  ('MANPOWER',  'SALARY',         1),
  ('PRODUCTION','SEWING',         1),
  ('PRODUCTION','CUTTING',        2),
  ('PRODUCTION','FINISHING',      3)
) AS v(main_name, name, ord)
JOIN public.expense_categories m
  ON m.level = 'main' AND lower(btrim(m.name)) = lower(v.main_name)
ON CONFLICT DO NOTHING;

-- Item. `SALARY` sengaja TIDAK muncul di sini: Sub Category itu memang tidak
-- punya item (di daftar user tertulis '-'), dan Item memang opsional.
INSERT INTO public.expense_categories (level, parent_id, name, sort_order)
SELECT 'item', s.id, v.name, v.ord
FROM (VALUES
  ('TRANSPORTATION','Visit Offline Purchase', 1),
  ('DELIVERY',      'Delivery Accessories',   1),
  ('DELIVERY',      'Delivery Equipment',     2),
  ('MEALS',         'Visit Offline Purchase', 1),
  ('SEWING',        'Mesin',                  1),
  ('SEWING',        'Lampu',                  2),
  ('SEWING',        'Sepatu Jahit',           3),
  ('SEWING',        'Support Tools',          4),
  ('SEWING',        'Resleting',              5),
  ('SEWING',        'Benang',                 6),
  ('SEWING',        'Elastic Band',           7),
  ('SEWING',        'Button Loop',            8),
  ('SEWING',        'Jarum',                  9),
  ('SEWING',        'Kain Pelapis',          10),
  ('SEWING',        'Kapur Jahit',           11),
  ('SEWING',        'Minyak',                12),
  ('CUTTING',       'Meja',                   1),
  ('CUTTING',       'Support Tools',          2),
  ('CUTTING',       'Kertas',                 3),
  ('CUTTING',       'Mesin',                  4),
  ('FINISHING',     'Kancing',                1),
  ('FINISHING',     'Pita',                   2),
  ('FINISHING',     'Peralatan Setrika',      3),
  ('FINISHING',     'Hak Kait',               4),
  ('FINISHING',     'Label',                  5)
) AS v(sub_name, name, ord)
JOIN public.expense_categories s
  ON s.level = 'sub' AND lower(btrim(s.name)) = lower(v.sub_name)
ON CONFLICT DO NOTHING;
