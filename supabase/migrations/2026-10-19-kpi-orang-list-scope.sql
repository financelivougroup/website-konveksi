-- Batasi daftar identitas KPI di server, bukan hanya di UI.
-- Tidak mengubah policy baca tabel register/profiles yang sudah ada.
CREATE OR REPLACE FUNCTION public.kpi_orang_list()
RETURNS TABLE (orang_id integer, nama text, divisi text, aktif boolean, punya_akun boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT r.id, r.pic_penjahit, lower(r.posisi),
    coalesce(r.status, 'Aktif') = 'Aktif',
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.orang_id = r.id)
  FROM public.register_penjahit r
  WHERE r.pic_penjahit IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND public.kpi_can_view_orang(r.id)
  ORDER BY lower(r.posisi), r.pic_penjahit
$$;

REVOKE ALL ON FUNCTION public.kpi_orang_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_orang_list() TO authenticated;
