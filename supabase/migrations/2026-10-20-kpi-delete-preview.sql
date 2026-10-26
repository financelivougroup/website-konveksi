CREATE OR REPLACE FUNCTION public.kpi_delete_blockers(p_rows jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg('Bulan '||to_char(b.bulan,'YYYY-MM')||' sudah final. Owner harus membuka kunci sebelum hapus permanen.' ORDER BY b.bulan),'[]'::jsonb)
 FROM public.bulan_status b WHERE b.status='final' AND (
 EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_rows->'sewing_records','[]')) x WHERE date_trunc('month',(x->>'tgl_laporan')::date)::date=b.bulan)
 OR EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_rows->'finishing_records','[]')) x WHERE date_trunc('month',(x->>'tgl_import')::date)::date=b.bulan)
 OR EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_rows->'target_jahit','[]')) x WHERE x->>'bulanTahun'=to_char(b.bulan,'YYYY-MM'))
 OR EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_rows->'target_jahit_detail','[]')) x JOIN public.target_jahit t ON t.id=(x->>'target_jahit_id')::integer WHERE t."bulanTahun"=to_char(b.bulan,'YYYY-MM'))
 OR EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_rows->'daftar_libur','[]')) x WHERE date_trunc('month',(x->>'tanggal')::date)::date=b.bulan)
 OR EXISTS(SELECT FROM public.v_produksi_harian v LEFT JOIN public.work_orders w ON w.id=v.work_order_id
 WHERE date_trunc('month',v.tanggal)::date=b.bulan AND (
 EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_rows->'work_orders','[]')) x WHERE x->>'id'=w.id)
 OR EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_rows->'production_orders','[]')) x WHERE x->>'id'=w.source_order_id)
 OR EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_rows->'register_harga','[]')) x WHERE x->>'production_order_id'=w.source_order_id)
 OR EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_rows->'register_penjahit','[]')) x WHERE (x->>'id')::integer=v.orang_id)
 ))
 );
$$;
REVOKE ALL ON FUNCTION public.kpi_delete_blockers(jsonb) FROM PUBLIC,anon,authenticated;

-- Graph is used by both preview and execute: the blocker is rechecked under the write gate.
DO $$ DECLARE def text;marker text:=E' RETURN jsonb_build_object(''rows'',v_graph,';BEGIN
 SELECT pg_get_functiondef('public.permanent_delete_graph(text,text[])'::regprocedure) INTO def;
 IF position('public.kpi_delete_blockers(v_graph)' in def)=0 THEN
  IF position(marker in def)=0 THEN RAISE EXCEPTION 'Unrecognized deletion graph';END IF;
  def:=replace(def,marker,E' v_blocked := v_blocked || public.kpi_delete_blockers(v_graph);\n'||marker);
  EXECUTE def;
 END IF;
END $$;
