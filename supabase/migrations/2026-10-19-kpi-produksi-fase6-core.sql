-- Phase 6. Gate-first with fail-fast transaction advisory lock: no waiting while
-- a legacy writer holds a table lock (permanent_delete_execute included).
-- READ COMMITTED only, fresh VOLATILE fingerprint checks after each statement.
CREATE TABLE public.kpi_price_baselines (
  order_id text PRIMARY KEY REFERENCES public.production_orders(id) ON DELETE CASCADE,
  components jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.kpi_price_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  components jsonb NOT NULL,
  register_harga_id bigint,
  actor uuid NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason))>=3),
  revision integer NOT NULL DEFAULT 1,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,effective_from)
);
CREATE TABLE public.kpi_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL,record_id text,action text NOT NULL,
  before_data jsonb,after_data jsonb,actor uuid,changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,affected_months text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE public.kpi_final_snapshots (
  bulan date PRIMARY KEY REFERENCES public.bulan_status(bulan),
  fingerprint text NOT NULL
);
ALTER TABLE public.kpi_price_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_price_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_final_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kpi_price_baselines,public.kpi_price_versions,public.kpi_audit,public.kpi_final_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.kpi_price_versions,public.kpi_price_baselines,public.kpi_audit TO authenticated;
CREATE POLICY kpi_baselines_team ON public.kpi_price_baselines FOR SELECT TO authenticated USING(public.kpi_can_view_team());
CREATE POLICY kpi_versions_team ON public.kpi_price_versions FOR SELECT TO authenticated USING(public.kpi_can_view_team());
CREATE POLICY kpi_audit_team ON public.kpi_audit FOR SELECT TO authenticated USING(public.kpi_can_view_team());

INSERT INTO public.kpi_price_baselines(order_id,components)
SELECT p.production_order_id,jsonb_agg(jsonb_build_object('key',c.component_key,'value',c.amount_per_piece) ORDER BY c.component_key)
FROM public.production_order_prices p JOIN public.production_order_price_components c ON c.order_price_id=p.id GROUP BY p.production_order_id;

CREATE FUNCTION public.kpi_write_gate() RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'KPI_ISOLATION_RETRY' USING ERRCODE='40001';END IF;
 IF NOT pg_try_advisory_xact_lock(626019,6) THEN RAISE EXCEPTION 'KPI_WRITE_BUSY_RETRY' USING ERRCODE='40001';END IF;
END $$;
REVOKE ALL ON FUNCTION public.kpi_write_gate() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.kpi_resolve_rate(p_order text,p_date date,p_divisi text)
RETURNS TABLE(tarif numeric,provenance text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH chosen AS (
 SELECT v.components,'dated'::text AS source FROM public.kpi_price_versions v WHERE v.order_id=p_order AND v.effective_from<=p_date ORDER BY v.effective_from DESC LIMIT 1
 ), source AS (
 SELECT * FROM chosen UNION ALL SELECT b.components,'baseline_unverified' FROM public.kpi_price_baselines b WHERE b.order_id=p_order AND NOT EXISTS(SELECT FROM chosen)
 ), amounts AS (
 SELECT s.source,max((x->>'value')::numeric) FILTER(WHERE x->>'key'='jahit') AS jahit,
 max((x->>'value')::numeric) FILTER(WHERE x->>'key'='obras') AS obras,
 max((x->>'value')::numeric) FILTER(WHERE x->>'key'='finishing') AS finishing
 FROM source s CROSS JOIN LATERAL jsonb_array_elements(s.components) x GROUP BY s.source
 ) SELECT CASE WHEN p_divisi='finishing' THEN a.finishing ELSE a.jahit+a.obras END, a.source FROM amounts a
$$;
REVOKE ALL ON FUNCTION public.kpi_resolve_rate(text,date,text) FROM PUBLIC,anon,authenticated;

-- Fingerprint includes every KPI input for the month, not cached derived numbers.
-- Thus OLD+NEW date/person/source changes and cascades are checked automatically.
CREATE FUNCTION public.kpi_month_fingerprint(p_month date) RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT md5(jsonb_build_object(
 'entries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.entry_id,'date',v.tanggal,'source',v.divisi,'person',v.orang_id,'name',v.orang_nama,'pcs',v.pcs,'wo',v.work_order_id,'order',w.source_order_id,'position',r.posisi,'rate',rate.tarif,'provenance',rate.provenance) ORDER BY v.tanggal,v.divisi,v.entry_id)
 FROM public.v_produksi_harian v LEFT JOIN public.work_orders w ON w.id=v.work_order_id LEFT JOIN public.register_penjahit r ON r.id=v.orang_id LEFT JOIN LATERAL public.kpi_resolve_rate(w.source_order_id,v.tanggal,v.divisi) rate ON true WHERE date_trunc('month',v.tanggal)::date=p_month),'[]'::jsonb),
 'targets',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.target_jahit t WHERE t."bulanTahun"=to_char(p_month,'YYYY-MM')),'[]'::jsonb),
 'details',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.target_jahit_detail d JOIN public.target_jahit t ON t.id=d.target_jahit_id WHERE t."bulanTahun"=to_char(p_month,'YYYY-MM')),'[]'::jsonb),
 'holidays',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.daftar_libur l WHERE date_trunc('month',l.tanggal)::date=p_month),'[]'::jsonb),
 'costs',coalesce((SELECT jsonb_agg(jsonb_build_object('division',b.divisi,'value',b.target_per_pcs) ORDER BY b.divisi) FROM public.target_biaya b WHERE b.bulan=p_month),'[]'::jsonb),
 'people',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'name',r.pic_penjahit,'position',r.posisi) ORDER BY r.id) FROM public.register_penjahit r WHERE EXISTS(SELECT FROM public.target_jahit t WHERE t."bulanTahun"=to_char(p_month,'YYYY-MM') AND t.nama=r.pic_penjahit)),'[]'::jsonb)
 )::text)
$$;
REVOKE ALL ON FUNCTION public.kpi_month_fingerprint(date) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.kpi_assert_finals() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s record;
BEGIN
 FOR s IN SELECT b.bulan,f.fingerprint FROM public.bulan_status b LEFT JOIN public.kpi_final_snapshots f USING(bulan) WHERE b.status='final' ORDER BY b.bulan LOOP
  IF s.fingerprint IS NULL OR s.fingerprint<>public.kpi_month_fingerprint(s.bulan) THEN RAISE EXCEPTION 'KPI_MONTH_FINAL: %; Owner harus membuka kunci lebih dahulu.',to_char(s.bulan,'YYYY-MM') USING ERRCODE='55000';END IF;
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.kpi_assert_finals() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.kpi_guard_statement() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.kpi_write_gate();
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'KPI_TRUNCATE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME IN ('target_jahit','target_jahit_detail','daftar_libur','target_biaya','kpi_price_versions')
    AND auth.uid() IS NOT NULL AND NOT public.kpi_can_view_team() THEN
   RAISE EXCEPTION 'KPI_SETTINGS_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.kpi_guard_statement() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.kpi_audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oldj jsonb;newj jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN oldj:=to_jsonb(OLD);END IF;
 IF TG_OP<>'DELETE' THEN newj:=to_jsonb(NEW);END IF;
 IF oldj IS NOT DISTINCT FROM newj THEN RETURN NULL;END IF;
 INSERT INTO public.kpi_audit(table_name,record_id,action,before_data,after_data,actor,reason,affected_months)
 VALUES(TG_TABLE_NAME,coalesce(newj->>'id',oldj->>'id',newj->>'bulan',oldj->>'bulan',newj->>'order_id',oldj->>'order_id'),TG_OP,oldj,newj,auth.uid(),coalesce(nullif(current_setting('kpi.audit_reason',true),''),'Perubahan melalui alur aplikasi'),ARRAY(SELECT to_char(bulan,'YYYY-MM') FROM public.bulan_status WHERE status='final'));
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.kpi_audit_row() FROM PUBLIC,anon,authenticated;

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['sewing_records','finishing_records','target_jahit','target_jahit_detail','daftar_libur','target_biaya','register_penjahit','work_orders','production_orders','production_order_prices','production_order_price_components','register_harga','kpi_price_versions','kpi_price_baselines'] LOOP
 EXECUTE format('CREATE TRIGGER kpi_00_gate BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.kpi_guard_statement()',t);
 EXECUTE format('CREATE TRIGGER kpi_99_final AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.kpi_assert_finals()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['target_jahit','target_jahit_detail','daftar_libur','target_biaya','register_penjahit','kpi_price_versions','kpi_price_baselines','bulan_status'] LOOP
 EXECUTE format('CREATE TRIGGER kpi_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.kpi_audit_row()',t);
 END LOOP;
END $$;

-- Status can only be changed inside the definer RPC, not arbitrary role writes.
DROP POLICY "kpi bulan status write team" ON public.bulan_status;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER ON public.bulan_status FROM PUBLIC,anon,authenticated;
REVOKE TRUNCATE,TRIGGER ON public.kpi_price_baselines,public.kpi_price_versions,public.kpi_audit,public.kpi_final_snapshots,public.target_biaya FROM PUBLIC,anon,authenticated;
CREATE TRIGGER kpi_status_no_truncate BEFORE TRUNCATE ON public.bulan_status FOR EACH STATEMENT EXECUTE FUNCTION public.kpi_guard_statement();

CREATE FUNCTION public.kpi_set_month(p_bulan date,p_final boolean,p_reason text) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role text;
BEGIN
 PERFORM public.kpi_write_gate();
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
 IF v_role IS NULL OR v_role NOT IN ('owner','finance') OR (NOT p_final AND v_role<>'owner') THEN RAISE EXCEPTION 'KPI_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_bulan IS NULL OR p_bulan<>date_trunc('month',p_bulan)::date OR p_bulan>date_trunc('month',current_date)::date OR p_final IS NULL OR length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'Parameter bulan/alasan tidak valid.' USING ERRCODE='22023';END IF;
 PERFORM set_config('kpi.audit_reason',p_reason,true);
 IF p_final THEN
 INSERT INTO public.bulan_status(bulan,status,ditutup_oleh,ditutup_pada) VALUES(p_bulan,'final',auth.uid(),now()) ON CONFLICT(bulan) DO UPDATE SET status='final',ditutup_oleh=auth.uid(),ditutup_pada=now();
 INSERT INTO public.kpi_final_snapshots(bulan,fingerprint) VALUES(p_bulan,public.kpi_month_fingerprint(p_bulan)) ON CONFLICT(bulan) DO UPDATE SET fingerprint=excluded.fingerprint;
 ELSE
 UPDATE public.bulan_status SET status='terbuka',dibuka_oleh=auth.uid(),dibuka_pada=now() WHERE bulan=p_bulan;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.kpi_set_month(date,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kpi_set_month(date,boolean,text) TO authenticated;
