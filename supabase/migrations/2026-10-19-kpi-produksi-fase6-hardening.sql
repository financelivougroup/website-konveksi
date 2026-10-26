-- Verified against live function definition before replacement.
DO $$ DECLARE def text;BEGIN
 SELECT pg_get_functiondef('public.permanent_delete_execute(text,text[],text)'::regprocedure) INTO def;
 IF def NOT LIKE '%PERFORM public.kpi_write_gate();%' THEN
 def:=replace(def,E'BEGIN\n IF NOT public.permanent_delete_allowed()',E'BEGIN\n PERFORM public.kpi_write_gate();\n IF NOT public.permanent_delete_allowed()');
 IF def NOT LIKE '%PERFORM public.kpi_write_gate();%' THEN RAISE EXCEPTION 'Unrecognized permanent delete definition';END IF;
 EXECUTE def;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.kpi_guard_statement() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.kpi_write_gate();
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'KPI_TRUNCATE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME IN('target_jahit','target_jahit_detail','daftar_libur','target_biaya','kpi_price_versions')
 AND ((auth.uid() IS NULL AND session_user NOT IN('postgres','service_role')) OR (auth.uid() IS NOT NULL AND NOT public.kpi_can_view_team())) THEN
 RAISE EXCEPTION 'KPI_SETTINGS_FORBIDDEN' USING ERRCODE='42501';END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.kpi_audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oldj jsonb;newj jsonb;months text[];orderkey text;
BEGIN
 IF TG_OP<>'INSERT' THEN oldj:=to_jsonb(OLD);END IF;
 IF TG_OP<>'DELETE' THEN newj:=to_jsonb(NEW);END IF;
 IF oldj IS NOT DISTINCT FROM newj THEN RETURN NULL;END IF;
 SELECT array_agg(DISTINCT ym) FILTER(WHERE ym IS NOT NULL AND ym<>'') INTO months FROM(
 SELECT left(coalesce(j->>'bulan',j->>'bulanTahun',j->>'tanggal',j->>'effective_from'),7) AS ym
 FROM jsonb_array_elements(jsonb_build_array(oldj,newj)) j) q;
 IF TG_TABLE_NAME='target_jahit_detail' THEN SELECT ARRAY[t."bulanTahun"] INTO months FROM public.target_jahit t WHERE t.id=coalesce(newj->>'target_jahit_id',oldj->>'target_jahit_id')::integer;END IF;
 IF TG_TABLE_NAME IN('kpi_price_versions','kpi_price_baselines') THEN
 orderkey:=coalesce(newj->>'order_id',oldj->>'order_id');
 SELECT array_agg(DISTINCT to_char(v.tanggal,'YYYY-MM')) INTO months FROM public.v_produksi_harian v JOIN public.work_orders w ON w.id=v.work_order_id WHERE w.source_order_id=orderkey;
 END IF;
 INSERT INTO public.kpi_audit(table_name,record_id,action,before_data,after_data,actor,reason,affected_months)
 VALUES(TG_TABLE_NAME,coalesce(newj->>'id',oldj->>'id',newj->>'bulan',oldj->>'bulan',newj->>'order_id',oldj->>'order_id'),TG_OP,oldj,newj,auth.uid(),coalesce(nullif(current_setting('kpi.audit_reason',true),''),'Perubahan melalui alur aplikasi'),coalesce(months,'{}'));
 RETURN NULL;
END $$;
