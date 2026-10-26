-- One transaction for every selected Planning group: no half-updated parent/detail.
-- Business eligibility is re-read on server, never trusted from client snapshots.
CREATE OR REPLACE FUNCTION public.kpi_generate_targets(p_ids bigint[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g record;d record;t integer;matched bigint;created integer:=0;merged integer:=0;
 missing jsonb:='[]';skipped_incomplete integer;skipped_unapproved integer;pos text;
BEGIN
 PERFORM public.kpi_write_gate();
 IF auth.uid() IS NULL OR NOT public.kpi_can_view_team() THEN RAISE EXCEPTION 'KPI_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_ids IS NULL OR cardinality(p_ids)>200 OR cardinality(p_ids)=0 THEN RAISE EXCEPTION 'Pilihan Planning tidak valid.' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM public.planning_produksi WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE;
 SELECT count(*) FILTER(WHERE status IS DISTINCT FROM 'approved'),
 count(*) FILTER(WHERE status='approved' AND (nullif(btrim(nama_penjahit),'') IS NULL OR nullif(btrim(product),'') IS NULL OR qty IS NULL OR qty<=0 OR coalesce(bulan_target,'')!~'^\d{4}-(0[1-9]|1[0-2])$'))
 INTO skipped_unapproved,skipped_incomplete FROM public.planning_produksi WHERE id=ANY(p_ids);
 PERFORM set_config('kpi.audit_reason','Generate target dari Planning',true);
 FOR g IN SELECT nama_penjahit,bulan_target,sum(qty) AS qty FROM public.planning_produksi
 WHERE id=ANY(p_ids) AND status='approved' AND nullif(btrim(nama_penjahit),'') IS NOT NULL AND nullif(btrim(product),'') IS NOT NULL AND qty>0 AND bulan_target~'^\d{4}-(0[1-9]|1[0-2])$'
 GROUP BY nama_penjahit,bulan_target ORDER BY bulan_target,nama_penjahit LOOP
 IF NOT EXISTS(SELECT FROM public.expense_entries e WHERE e.staff_id IS NOT NULL AND e.sub_category_name='SALARY' AND btrim(e.vendor_name)=btrim(g.nama_penjahit) AND to_char(e.entry_date,'YYYY-MM')=g.bulan_target) THEN
 missing:=missing||jsonb_build_array(jsonb_build_object('nama',g.nama_penjahit,'bulan',g.bulan_target));CONTINUE;END IF;
 IF public.bulan_is_final((g.bulan_target||'-01')::date) THEN RAISE EXCEPTION 'KPI_MONTH_FINAL: %',g.bulan_target USING ERRCODE='55000';END IF;
 SELECT posisi INTO pos FROM public.register_penjahit WHERE pic_penjahit=g.nama_penjahit;
 SELECT id INTO t FROM public.target_jahit WHERE nama=g.nama_penjahit AND "bulanTahun"=g.bulan_target FOR UPDATE;
 IF t IS NULL THEN
 INSERT INTO public.target_jahit(nama,"bulanTahun",posisi,target_monthly) VALUES(g.nama_penjahit,g.bulan_target,pos,g.qty) RETURNING id INTO t;created:=created+1;
 ELSE UPDATE public.target_jahit SET target_monthly=coalesce(target_monthly,0)+g.qty WHERE id=t;merged:=merged+1;END IF;
 FOR d IN SELECT p.product_note,p.product,p.warna,sum(p.qty)::integer AS qty,
 coalesce(max(c.jahit),0) AS jahit,
 coalesce(max(c.obras),0) AS obras
 FROM public.planning_produksi p
 LEFT JOIN public.production_orders o ON lower(btrim(o.product_note))=lower(btrim(p.product_note))
 LEFT JOIN public.production_order_prices pr ON pr.production_order_id=o.id
 LEFT JOIN LATERAL (SELECT max(pc.amount_per_piece) FILTER(WHERE pc.component_key='jahit') AS jahit,max(pc.amount_per_piece) FILTER(WHERE pc.component_key='obras') AS obras FROM public.production_order_price_components pc WHERE pc.order_price_id=pr.id) c ON true
 WHERE p.id=ANY(p_ids) AND p.status='approved' AND p.nama_penjahit=g.nama_penjahit AND p.bulan_target=g.bulan_target AND p.qty>0 AND nullif(btrim(p.product),'') IS NOT NULL
 GROUP BY p.product_note,p.product,p.warna LOOP
 SELECT id INTO matched FROM public.target_jahit_detail x WHERE x.target_jahit_id=t AND x.product=d.product AND x.product_note IS NOT DISTINCT FROM d.product_note AND x.warna IS NOT DISTINCT FROM d.warna ORDER BY id LIMIT 1 FOR UPDATE;
 IF matched IS NULL THEN INSERT INTO public.target_jahit_detail(target_jahit_id,product_note,product,warna,qty_target,qty_realisasi,harga_jahit,harga_obras)
 VALUES(t,d.product_note,d.product,d.warna,d.qty,0,d.jahit,d.obras);
 ELSE UPDATE public.target_jahit_detail SET qty_target=qty_target+d.qty WHERE id=matched;END IF;
 END LOOP;
 END LOOP;
 RETURN jsonb_build_object('created',created,'merged',merged,'processedFound',(SELECT count(*) FROM public.planning_produksi WHERE id=ANY(p_ids)),
 'skippedNotApproved',coalesce(skipped_unapproved,0),'skippedIncomplete',coalesce(skipped_incomplete,0),'skippedNoSalary',jsonb_array_length(missing),'missingSalary',missing);
END $$;
REVOKE ALL ON FUNCTION public.kpi_generate_targets(bigint[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kpi_generate_targets(bigint[]) TO authenticated;
