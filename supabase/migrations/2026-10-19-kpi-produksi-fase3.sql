-- FASE 3 — Monitor Kinerja Produksi: identitas sesi & daftar bulan.
--
-- Dua fungsi kecil yang dibutuhkan kerangka halaman:
--
--   1. `kpi_orang_scope()` — memberi tahu aplikasi SIAPA yang sedang login
--      menurut database, tanpa mempercayai apa pun dari klien. Halaman per
--      orang membutuhkannya untuk judul header; tanpa ini, akun tanpa satu pun
--      entry tidak punya nama untuk ditampilkan sama sekali.
--
--   2. `kpi_bulan_tersedia()` — daftar bulan yang punya data (entry atau
--      target), untuk mengisi chip "Pilih Bulan". Dihitung di database supaya
--      tidak perlu menarik seluruh riwayat ke browser hanya untuk tahu bulannya.
--
-- Keduanya read-only dan tidak mengubah data bisnis apa pun.

-- ===========================================================================
-- 1. Identitas orang milik sesi
-- ===========================================================================
-- Mengembalikan TEPAT SATU baris:
--   - owner/finance  -> orang_id NULL, bisa_tim true  (mereka melihat semua)
--   - akun ber-orang -> orang_id + nama + divisi miliknya, bisa_tim false
--   - akun tanpa orang_id -> orang_id NULL, bisa_tim false (tidak melihat apa pun)
--
-- `punya_akses` memisahkan "akun tanpa orang_id" dari "owner/finance": keduanya
-- sama-sama ber-orang_id NULL, tetapi hanya yang pertama yang tidak boleh
-- melihat data siapa pun. Aplikasi memakai flag ini untuk mengarahkan rute,
-- bukan menebak dari NULL.
CREATE OR REPLACE FUNCTION public.kpi_orang_scope()
RETURNS TABLE (
  orang_id integer,
  nama text,
  divisi text,
  bisa_tim boolean,
  punya_akses boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_bisa_tim boolean;
  v_orang_id integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak ditemukan.' USING ERRCODE = '42501';
  END IF;

  v_bisa_tim := public.kpi_can_view_team();

  IF v_bisa_tim THEN
    RETURN QUERY SELECT NULL::integer, NULL::text, NULL::text, true, true;
    RETURN;
  END IF;

  SELECT p.orang_id INTO v_orang_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_orang_id IS NULL THEN
    -- Akun sah tetapi tidak terhubung ke baris register mana pun.
    RETURN QUERY SELECT NULL::integer, NULL::text, NULL::text, false, false;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      r.id,
      r.pic_penjahit,
      lower(r.posisi),
      false,
      true
    FROM public.register_penjahit r
    WHERE r.id = v_orang_id;
END
$$;

REVOKE ALL ON FUNCTION public.kpi_orang_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_orang_scope() TO authenticated;

-- ===========================================================================
-- 2. Bulan yang punya data
-- ===========================================================================
-- Gabungan bulan dari entry valid (`v_produksi_harian`) dan dari target bulanan.
-- Target ikut disertakan karena bulan yang baru punya target — belum ada
-- setoran — tetap harus bisa dipilih supaya user melihat realisasi 0, bukan
-- bulan itu menghilang dari daftar.
--
-- Cakupan mengikuti aturan yang sama dengan `kpi_produksi_harian`: akun
-- non-owner/finance hanya melihat bulan yang ada datanya UNTUK DIRINYA. Kalau
-- tidak, daftar chip itu sendiri sudah membocorkan aktivitas orang lain.
CREATE OR REPLACE FUNCTION public.kpi_bulan_tersedia()
RETURNS TABLE (bulan text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_scope integer;
  v_all boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak ditemukan.' USING ERRCODE = '42501';
  END IF;

  v_all := public.kpi_can_view_team();
  IF NOT v_all THEN
    SELECT p.orang_id INTO v_scope FROM public.profiles p WHERE p.id = auth.uid();
    IF v_scope IS NULL THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
    SELECT DISTINCT to_char(sumber.bulan, 'YYYY-MM') AS bulan
    FROM (
      SELECT date_trunc('month', v.tanggal)::date AS bulan
      FROM public.v_produksi_harian v
      WHERE (v_all OR v.orang_id = v_scope)

      UNION

      SELECT (t."bulanTahun" || '-01')::date
      FROM public.target_jahit t
      LEFT JOIN public.register_penjahit r ON r.pic_penjahit = t.nama
      WHERE (v_all OR r.id = v_scope)
    ) AS sumber
    WHERE sumber.bulan IS NOT NULL
    ORDER BY 1 DESC;
END
$$;

REVOKE ALL ON FUNCTION public.kpi_bulan_tersedia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_bulan_tersedia() TO authenticated;
