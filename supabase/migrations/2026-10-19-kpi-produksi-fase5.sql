-- Fase 5: baca produksi pribadi, estimasi upah pribadi, riwayat keyset.
-- Tidak mengubah policy tabel lama; harga adalah tarif order saat ini, bukan snapshot historis.
CREATE OR REPLACE FUNCTION public.kpi_person_entries(p_dari date, p_sampai date, p_orang_id integer)
RETURNS TABLE(entry_id text, tanggal date, divisi text, orang_id integer, orang_nama text, pcs numeric, work_order_id text, work_code text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id integer; v_divisi text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesi tidak ditemukan.' USING ERRCODE='42501'; END IF;
  IF p_dari IS NULL OR p_sampai IS NULL OR p_sampai < p_dari OR p_sampai-p_dari > 36600 THEN
    RAISE EXCEPTION 'Rentang tanggal tidak valid.' USING ERRCODE='22023';
  END IF;
  IF public.kpi_can_view_team() THEN v_id := p_orang_id;
  ELSE SELECT p.orang_id INTO v_id FROM public.profiles p WHERE p.id=auth.uid(); END IF;
  IF v_id IS NULL THEN RETURN; END IF;
  SELECT CASE WHEN lower(r.posisi)='finishing' THEN 'finishing'
    WHEN lower(r.posisi) IN ('penjahit','leader') THEN 'penjahit' END
    INTO v_divisi FROM public.register_penjahit r WHERE r.id=v_id;
  IF v_divisi IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT v.entry_id,v.tanggal,v.divisi,v.orang_id,v.orang_nama,v.pcs,v.work_order_id,v.work_code
    FROM public.v_produksi_harian v
    WHERE v.orang_id=v_id AND v.divisi=v_divisi AND v.tanggal BETWEEN p_dari AND p_sampai
    ORDER BY v.tanggal,v.divisi,v.entry_id;
END $$;
REVOKE ALL ON FUNCTION public.kpi_person_entries(date,date,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.kpi_produksi_orang(p_dari date, p_sampai date, p_orang_id integer)
RETURNS TABLE(tanggal date,divisi text,orang_id integer,orang_nama text,pcs numeric,work_order_id text,work_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT e.tanggal,e.divisi,e.orang_id,e.orang_nama,e.pcs,e.work_order_id,e.work_code
  FROM public.kpi_person_entries(p_dari,p_sampai,p_orang_id) e
  ORDER BY e.tanggal,e.divisi,e.entry_id
$$;
REVOKE ALL ON FUNCTION public.kpi_produksi_orang(date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kpi_produksi_orang(date,date,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.kpi_upah_pribadi(p_dari date, p_sampai date, p_orang_id integer)
RETURNS TABLE(bulan text,pcs_total numeric,pcs_bertarif numeric,estimasi numeric,entry_tanpa_tarif bigint,pcs_tanpa_tarif numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH rates AS (
    SELECT c.order_price_id,
      max(c.amount_per_piece) FILTER (WHERE c.component_key='jahit') AS jahit,
      max(c.amount_per_piece) FILTER (WHERE c.component_key='obras') AS obras,
      max(c.amount_per_piece) FILTER (WHERE c.component_key='finishing') AS finishing
    FROM public.production_order_price_components c
    WHERE c.component_key IN ('jahit','obras','finishing') GROUP BY c.order_price_id
  ), scoped AS (
    SELECT e.tanggal,greatest(e.pcs,0) AS pcs,
      CASE WHEN e.divisi='finishing' THEN r.finishing::numeric
           WHEN r.jahit IS NOT NULL AND r.obras IS NOT NULL THEN r.jahit::numeric+r.obras::numeric END AS tarif
    FROM public.kpi_person_entries(p_dari,p_sampai,p_orang_id) e
    LEFT JOIN public.work_orders w ON w.id=e.work_order_id
    LEFT JOIN public.production_order_prices p ON p.production_order_id=w.source_order_id
    LEFT JOIN rates r ON r.order_price_id=p.id
  )
  SELECT to_char(s.tanggal,'YYYY-MM'),sum(s.pcs),
    coalesce(sum(s.pcs) FILTER (WHERE s.tarif IS NOT NULL),0),
    sum(s.pcs*s.tarif) FILTER (WHERE s.tarif IS NOT NULL),
    count(*) FILTER (WHERE s.tarif IS NULL),
    coalesce(sum(s.pcs) FILTER (WHERE s.tarif IS NULL),0)
  FROM scoped s GROUP BY to_char(s.tanggal,'YYYY-MM') ORDER BY 1
$$;
REVOKE ALL ON FUNCTION public.kpi_upah_pribadi(date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kpi_upah_pribadi(date,date,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.kpi_riwayat_pribadi(
  p_dari date,p_sampai date,p_orang_id integer,p_limit integer DEFAULT 21,
  p_sebelum_tanggal date DEFAULT NULL,p_sebelum_divisi text DEFAULT NULL,p_sebelum_id text DEFAULT NULL
)
RETURNS TABLE(entry_id text,tanggal date,divisi text,pcs numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 101 THEN RAISE EXCEPTION 'Ukuran halaman tidak valid.' USING ERRCODE='22023'; END IF;
  IF num_nonnulls(p_sebelum_tanggal,p_sebelum_divisi,p_sebelum_id) NOT IN (0,3) THEN
    RAISE EXCEPTION 'Cursor riwayat tidak lengkap.' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT e.entry_id,e.tanggal,e.divisi,e.pcs
    FROM public.kpi_person_entries(p_dari,p_sampai,p_orang_id) e
    WHERE p_sebelum_tanggal IS NULL OR (e.tanggal,e.divisi,e.entry_id)<(p_sebelum_tanggal,p_sebelum_divisi,p_sebelum_id)
    ORDER BY e.tanggal DESC,e.divisi DESC,e.entry_id DESC LIMIT p_limit;
END $$;
REVOKE ALL ON FUNCTION public.kpi_riwayat_pribadi(date,date,integer,integer,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kpi_riwayat_pribadi(date,date,integer,integer,date,text,text) TO authenticated;
