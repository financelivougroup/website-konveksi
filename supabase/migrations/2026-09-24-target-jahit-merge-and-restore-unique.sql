-- 2026-09-24 — Koreksi: Generate Target TIDAK membuat baris target baru, hanya
-- menambah jumlahnya. Sekaligus memasang kembali unique index (nama, "bulanTahun").
--
-- Permintaan user (verbatim), mengoreksi keputusan sebelumnya:
--   "sorry buat target jahit. harusnya ga kebuat row baru. tapi jumlah targetnya
--    aja yg nambah"
--
-- Konteks: sehari sebelumnya `idx_target_jahit_unique` sempat DILEPAS
-- (migrasi 20260924144002 target_jahit_allow_duplicate_staff_month) karena user
-- menyatakan penjahit+bulan yang sama boleh berulang. User lalu mengoreksi arah:
-- yang boleh bertambah adalah JUMLAHNYA, bukan jumlah barisnya. Jadi index itu
-- dipasang kembali di sini.
--
-- Dua hal dikerjakan:
--   (1) Membersihkan baris duplikat (nama, "bulanTahun") yang terlanjur dibuat saat
--       aturan lama sempat berlaku — digabung ke baris ber-id terkecil per grup.
--   (2) Memasang kembali unique index (nama, "bulanTahun").
--
-- Sengaja TIDAK menulis id tertentu: penggabungan bekerja per grup (nama, bulan),
-- jadi ia tetap benar untuk duplikat apa pun, bukan hanya yang kebetulan ada hari ini.

-- (1a) Pindahkan detail dari baris duplikat ke baris yang dipertahankan.
--      `target_jahit_detail` tidak punya unique constraint, jadi tidak ada konflik.
WITH dupe AS (
  SELECT id, min(id) OVER (PARTITION BY nama, "bulanTahun") AS keep_id
  FROM public.target_jahit
)
UPDATE public.target_jahit_detail d
SET target_jahit_id = dupe.keep_id
FROM dupe
WHERE d.target_jahit_id = dupe.id
  AND dupe.id <> dupe.keep_id;

-- (1b) Jumlahkan target baris duplikat ke baris yang dipertahankan. Hanya kolom
--      jumlah yang disentuh — `benefit_per_pcs` dan kolom lain dibiarkan apa adanya
--      supaya tidak menimpa setelan yang sudah diisi user.
WITH dupe AS (
  SELECT id, min(id) OVER (PARTITION BY nama, "bulanTahun") AS keep_id
  FROM public.target_jahit
),
agg AS (
  SELECT dupe.keep_id,
         sum(t.target_monthly) AS qty,
         sum(t.target_cost_posisi) AS cost
  FROM public.target_jahit t
  JOIN dupe ON dupe.id = t.id
  WHERE dupe.id <> dupe.keep_id
  GROUP BY dupe.keep_id
)
UPDATE public.target_jahit t
SET target_monthly = coalesce(t.target_monthly, 0) + agg.qty,
    target_cost_posisi = coalesce(t.target_cost_posisi, 0) + agg.cost
FROM agg
WHERE t.id = agg.keep_id;

-- (1c) Hapus baris duplikat (detailnya sudah dipindah pada 1a).
WITH dupe AS (
  SELECT id, min(id) OVER (PARTITION BY nama, "bulanTahun") AS keep_id
  FROM public.target_jahit
)
DELETE FROM public.target_jahit t
USING dupe
WHERE t.id = dupe.id
  AND dupe.id <> dupe.keep_id;

-- (2) Pasang kembali penjagaan di level database: satu penjahit, satu baris per bulan.
--     Ini yang membuat aturan baru tidak bisa dilanggar oleh jalur mana pun,
--     termasuk pemanggilan API langsung di luar aplikasi.
CREATE UNIQUE INDEX idx_target_jahit_unique
  ON public.target_jahit ("bulanTahun", nama);
