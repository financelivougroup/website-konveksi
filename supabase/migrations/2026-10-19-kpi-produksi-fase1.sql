-- FASE 1 — Monitor Kinerja Produksi.
--
-- TIDAK menambah tabel setoran. Realisasi dibaca dari entry yang SUDAH ada:
--   penjahit  -> public.sewing_records   (tgl_laporan, pic_penjahit, qty_selesai)
--   finishing -> public.finishing_records(tgl_import,  pic_finishing, qty_finishing)
--
-- Tarif upah TIDAK memakai tabel baru: komponen `jahit`/`obras`/`finishing`
-- sudah tersimpan per production order di public.register_harga.components.
-- Target bulanan memakai public.target_jahit; hari libur memakai public.daftar_libur.
--
-- Migrasi ini tidak menghapus atau mengubah data bisnis yang ada.

-- ===========================================================================
-- 1. Penghubung akun -> orang
-- ===========================================================================
-- Role penjahit/finishing TIDAK ditambahkan ke profiles_role_check (keputusan
-- user): mereka tetap `staff`, dan pembatasan memakai orang_id. Dengan begitu
-- tidak ada constraint lama yang berubah dan tidak ada RLS lama yang ikut
-- bergeser.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS orang_id integer
  REFERENCES public.register_penjahit(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_orang_id ON public.profiles(orang_id);

COMMENT ON COLUMN public.profiles.orang_id IS
  'Baris register_penjahit milik akun ini. Diisi hanya untuk penjahit/finishing; NULL untuk owner/finance/staff lain.';

-- ===========================================================================
-- 2. Helper otorisasi dashboard
-- ===========================================================================

-- Divisi orang yang terhubung ke akun ini: 'penjahit' | 'finishing' | 'leader' | NULL.
CREATE OR REPLACE FUNCTION public.my_orang_divisi()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT lower(r.posisi)
  FROM public.profiles p
  JOIN public.register_penjahit r ON r.id = p.orang_id
  WHERE p.id = auth.uid()
  LIMIT 1
$$;

-- Nama orang yang terhubung ke akun ini, atau NULL.
CREATE OR REPLACE FUNCTION public.my_orang_nama()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT r.pic_penjahit
  FROM public.profiles p
  JOIN public.register_penjahit r ON r.id = p.orang_id
  WHERE p.id = auth.uid()
  LIMIT 1
$$;

-- True bila akun ini boleh melihat SELURUH tim (owner/finance).
--
-- Allow-list eksplisit, bukan "semua kecuali": role baru otomatis TIDAK dapat
-- akses tim sampai sengaja dimasukkan, sama seperti `canEditProductionLog`.
CREATE OR REPLACE FUNCTION public.kpi_can_view_team()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('owner','finance')
  )
$$;

-- True bila akun ini boleh melihat data orang `p_orang_id`.
--
-- Aturan: owner/finance bebas; selain itu hanya orang_id miliknya sendiri.
-- NULL (akun tanpa orang_id) ditolak — gagal ke arah aman.
CREATE OR REPLACE FUNCTION public.kpi_can_view_orang(p_orang_id integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT public.kpi_can_view_team()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND orang_id IS NOT NULL AND orang_id = p_orang_id
      )
$$;

-- ===========================================================================
-- 3. View realisasi harian
-- ===========================================================================
-- Satu baris = satu entry (bukan agregat per hari), supaya rincian riwayat di
-- halaman per orang bisa memakai sumber yang sama dengan grafik.
--
-- `security_invoker = true` sesuai spec: RLS tabel entry tetap berlaku.
-- Catatan jujur: karena policy baca `sewing_records`/`finishing_records` saat
-- ini masih "Allow read for all", view ini TIDAK dengan sendirinya membatasi
-- penjahit. Pembatasan per-orang ditegakkan `kpi_produksi_harian()` di bawah,
-- dan itulah satu-satunya jalur yang dipakai aplikasi.
CREATE OR REPLACE VIEW public.v_produksi_harian
WITH (security_invoker = true) AS
  SELECT
    s.id                       AS entry_id,
    s.tgl_laporan              AS tanggal,
    'penjahit'::text           AS divisi,
    r.id                       AS orang_id,
    s.pic_penjahit             AS orang_nama,
    s.qty_selesai::numeric     AS pcs,
    s.work_order_id            AS work_order_id,
    s.work_code                AS work_code
  FROM public.sewing_records s
  LEFT JOIN public.register_penjahit r ON r.pic_penjahit = s.pic_penjahit
  UNION ALL
  SELECT
    f.id,
    f.tgl_import,
    'finishing'::text,
    r.id,
    f.pic_finishing,
    f.qty_finishing::numeric,
    f.work_order_id,
    NULL::text
  FROM public.finishing_records f
  LEFT JOIN public.register_penjahit r ON r.pic_penjahit = f.pic_finishing
  -- Entry finishing tanpa tanggal tidak bisa ditempatkan di bulan mana pun,
  -- jadi tidak masuk agregasi. Status selain 'OK' adalah entry gagal sinkron.
  WHERE f.tgl_import IS NOT NULL
    AND coalesce(f.sync_status, 'OK') = 'OK';

COMMENT ON VIEW public.v_produksi_harian IS
  'Realisasi produksi per entry, gabungan sewing + finishing. Hanya entry valid: finishing wajib bertanggal dan sync_status OK.';

-- ===========================================================================
-- 4. RPC realisasi terfilter role
-- ===========================================================================
-- Inilah pintu yang dipakai aplikasi. SECURITY DEFINER supaya bisa membaca
-- seluruh tim untuk owner/finance tanpa melonggarkan policy tabel entry, dan
-- memaksa filter per-orang untuk akun penjahit/finishing.
CREATE OR REPLACE FUNCTION public.kpi_produksi_harian(
  p_dari date,
  p_sampai date,
  p_orang_id integer DEFAULT NULL
)
RETURNS TABLE (
  tanggal date,
  divisi text,
  orang_id integer,
  orang_nama text,
  pcs numeric,
  work_order_id text,
  work_code text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_scope integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak ditemukan.' USING ERRCODE = '42501';
  END IF;

  IF public.kpi_can_view_team() THEN
    -- owner/finance: boleh menyaring satu orang, atau seluruh tim bila NULL.
    v_scope := p_orang_id;
  ELSE
    -- Selain owner/finance, parameter dari klien DIAIBAIKAN sepenuhnya.
    SELECT p.orang_id INTO v_scope FROM public.profiles p WHERE p.id = auth.uid();
    IF v_scope IS NULL THEN
      RETURN;  -- akun tanpa orang_id tidak melihat data siapa pun
    END IF;
  END IF;

  RETURN QUERY
    SELECT v.tanggal, v.divisi, v.orang_id, v.orang_nama, v.pcs, v.work_order_id, v.work_code
    FROM public.v_produksi_harian v
    WHERE v.tanggal >= p_dari
      AND v.tanggal <= p_sampai
      AND (v_scope IS NULL OR v.orang_id = v_scope)
    ORDER BY v.tanggal, v.divisi, v.orang_nama;
END
$$;

REVOKE ALL ON FUNCTION public.kpi_produksi_harian(date, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_produksi_harian(date, date, integer) TO authenticated;

-- ===========================================================================
-- 5. Target biaya (HPP) per divisi
-- ===========================================================================
-- `target_jahit.target_cost_posisi` TIDAK dipakai: kolom itu sekarang berisi
-- GAJI (lihat src/lib/staffSalary.ts). HPP per pcs adalah angka lain, jadi ia
-- butuh tabel sendiri dan tidak boleh menumpang kolom yang sudah dialihkan.
CREATE TABLE IF NOT EXISTS public.target_biaya (
  id bigserial PRIMARY KEY,
  divisi text NOT NULL CHECK (divisi IN ('penjahit','leader','finishing','total')),
  bulan date NOT NULL CHECK (date_trunc('month', bulan) = bulan),
  target_per_pcs numeric NOT NULL CHECK (target_per_pcs >= 0),
  dibuat_oleh uuid,
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  diubah_pada timestamptz NOT NULL DEFAULT now(),
  UNIQUE (divisi, bulan)
);

ALTER TABLE public.target_biaya ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.target_biaya FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.target_biaya TO authenticated;

-- Hanya owner/finance yang boleh menyentuh target biaya; role lain tidak
-- melihatnya sama sekali (bukan sekadar tidak boleh menulis).
CREATE POLICY "kpi target biaya read team" ON public.target_biaya
  FOR SELECT TO authenticated USING (public.kpi_can_view_team());
CREATE POLICY "kpi target biaya write team" ON public.target_biaya
  FOR ALL TO authenticated
  USING (public.kpi_can_view_team())
  WITH CHECK (public.kpi_can_view_team());

-- ===========================================================================
-- 6. Status bulan (kunci bulan final)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.bulan_status (
  bulan date PRIMARY KEY CHECK (date_trunc('month', bulan) = bulan),
  status text NOT NULL DEFAULT 'terbuka' CHECK (status IN ('terbuka','final')),
  ditutup_oleh uuid,
  ditutup_pada timestamptz,
  dibuka_oleh uuid,
  dibuka_pada timestamptz
);

ALTER TABLE public.bulan_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bulan_status FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulan_status TO authenticated;

-- Semua yang boleh masuk aplikasi perlu TAHU sebuah bulan terkunci (supaya UI
-- tidak menawarkan input yang pasti ditolak), jadi baca dibuka untuk
-- authenticated. Menutup/membuka bulan tetap owner/finance.
CREATE POLICY "kpi bulan status read" ON public.bulan_status
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kpi bulan status write team" ON public.bulan_status
  FOR ALL TO authenticated
  USING (public.kpi_can_view_team())
  WITH CHECK (public.kpi_can_view_team());

-- True bila bulan dari tanggal ini berstatus final. Dipakai trigger di fase berikut.
CREATE OR REPLACE FUNCTION public.bulan_is_final(p_tanggal date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bulan_status
    WHERE bulan = date_trunc('month', p_tanggal)::date AND status = 'final'
  )
$$;

-- ===========================================================================
-- 7. Daftar orang untuk dashboard
-- ===========================================================================
-- `register_penjahit` menyimpan nama sebagai teks tanpa unique, sedangkan
-- dashboard butuh satu baris per orang. Fungsi ini menormalkan daftar itu
-- (nama dinormalisasi trim) dan menyertakan divisi siap pakai.
CREATE OR REPLACE FUNCTION public.kpi_orang_list()
RETURNS TABLE (
  orang_id integer,
  nama text,
  divisi text,
  aktif boolean,
  punya_akun boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT
    r.id,
    r.pic_penjahit,
    lower(r.posisi),
    coalesce(r.status, 'Aktif') = 'Aktif',
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.orang_id = r.id)
  FROM public.register_penjahit r
  WHERE r.pic_penjahit IS NOT NULL
  ORDER BY lower(r.posisi), r.pic_penjahit
$$;

REVOKE ALL ON FUNCTION public.kpi_orang_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_orang_list() TO authenticated;

-- ===========================================================================
-- 8. Hari libur terpakai dashboard
-- ===========================================================================
-- `daftar_libur.tanggal` tidak unique dan tidak punya FK, jadi dibaca lewat
-- fungsi agar bentuknya pasti (satu tanggal satu baris).
CREATE OR REPLACE FUNCTION public.kpi_hari_libur(p_dari date, p_sampai date)
RETURNS TABLE (tanggal date, keterangan text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT DISTINCT l.tanggal, coalesce(l.keterangan, l.hari, 'Libur')
  FROM public.daftar_libur l
  WHERE l.tanggal >= p_dari AND l.tanggal <= p_sampai
  ORDER BY l.tanggal
$$;

REVOKE ALL ON FUNCTION public.kpi_hari_libur(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_hari_libur(date, date) TO authenticated;

-- ===========================================================================
-- 9. Target bulanan terfilter role
-- ===========================================================================
-- `target_jahit` di-key oleh NAMA, bukan orang_id. Fungsi ini yang menjembatani
-- keduanya dan sekaligus menegakkan pembatasan per-orang.
CREATE OR REPLACE FUNCTION public.kpi_target_bulanan(p_dari date, p_sampai date)
RETURNS TABLE (
  target_id integer,
  bulan date,
  orang_id integer,
  nama text,
  divisi text,
  target_pcs numeric,
  status_final text
)
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
    IF v_scope IS NULL THEN RETURN; END IF;
  END IF;

  RETURN QUERY
    SELECT
      t.id,
      (t."bulanTahun" || '-01')::date,
      r.id,
      t.nama,
      lower(coalesce(t.posisi, r.posisi, '')),
      t.target_monthly::numeric,
      t.status_final
    FROM public.target_jahit t
    LEFT JOIN public.register_penjahit r ON r.pic_penjahit = t.nama
    WHERE (t."bulanTahun" || '-01')::date >= date_trunc('month', p_dari)::date
      AND (t."bulanTahun" || '-01')::date <= date_trunc('month', p_sampai)::date
      AND (v_all OR r.id = v_scope)
    ORDER BY (t."bulanTahun" || '-01')::date, t.nama;
END
$$;

REVOKE ALL ON FUNCTION public.kpi_target_bulanan(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_target_bulanan(date, date) TO authenticated;
