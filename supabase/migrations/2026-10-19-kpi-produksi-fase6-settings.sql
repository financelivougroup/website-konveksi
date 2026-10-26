CREATE FUNCTION public.kpi_capture_price() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_rates jsonb;new_rates jsonb;existed boolean;
BEGIN
 SELECT EXISTS(SELECT FROM public.kpi_price_baselines WHERE order_id=NEW.production_order_id) INTO existed;
 INSERT INTO public.kpi_price_baselines(order_id,components) VALUES(NEW.production_order_id,NEW.components) ON CONFLICT(order_id) DO NOTHING;
 IF NOT existed THEN RETURN NEW;END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'key'),'[]') INTO new_rates FROM jsonb_array_elements(NEW.components) x WHERE x->>'key' IN('jahit','obras','finishing');
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'key'),'[]') INTO old_rates FROM jsonb_array_elements(coalesce((SELECT components FROM public.kpi_price_versions WHERE order_id=NEW.production_order_id AND effective_from<=current_date ORDER BY effective_from DESC LIMIT 1),(SELECT components FROM public.kpi_price_baselines WHERE order_id=NEW.production_order_id))) x WHERE x->>'key' IN('jahit','obras','finishing');
 IF old_rates IS DISTINCT FROM new_rates THEN
 IF NOT public.kpi_can_view_team() THEN RAISE EXCEPTION 'KPI_PRICE_CHANGE_FORBIDDEN' USING ERRCODE='42501';END IF;
 INSERT INTO public.kpi_price_versions(order_id,effective_from,components,register_harga_id,actor,reason)
 VALUES(NEW.production_order_id,current_date,NEW.components,NEW.id,auth.uid(),'Perubahan harga melalui Order Entry')
 ON CONFLICT(order_id,effective_from) DO UPDATE SET components=EXCLUDED.components,register_harga_id=EXCLUDED.register_harga_id,actor=auth.uid(),revision=kpi_price_versions.revision+1,reason=EXCLUDED.reason,recorded_at=now();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.kpi_capture_price() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER kpi_capture_order_price AFTER INSERT OR UPDATE ON public.register_harga FOR EACH ROW EXECUTE FUNCTION public.kpi_capture_price();

CREATE FUNCTION public.kpi_save_price_version(p_order text,p_from date,p_components jsonb,p_reason text,p_id uuid DEFAULT NULL,p_revision integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; n integer; total numeric;
BEGIN
 PERFORM public.kpi_write_gate();
 IF auth.uid() IS NULL OR NOT public.kpi_can_view_team() THEN RAISE EXCEPTION 'KPI_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_from IS NULL OR length(btrim(coalesce(p_reason,'')))<3 OR jsonb_typeof(p_components)<>'array' THEN RAISE EXCEPTION 'Tanggal, komponen dan alasan wajib diisi.' USING ERRCODE='22023';END IF;
 SELECT count(DISTINCT x->>'key'),sum((x->>'value')::numeric) INTO n,total FROM jsonb_array_elements(p_components) x;
 IF n<>8 OR jsonb_array_length(p_components)<>8 OR EXISTS(SELECT FROM jsonb_array_elements(p_components) x WHERE x->>'key' NOT IN('potong','jahit','obras','finishing','operational','material_basic','margin','jasa_pasang_kancing') OR x->>'value' IS NULL OR (x->>'value')::numeric<0 OR (x->>'value')::numeric<>trunc((x->>'value')::numeric)) OR total<=0 THEN RAISE EXCEPTION 'Delapan komponen harga nonnegatif wajib lengkap.' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT FROM public.kpi_price_baselines WHERE order_id=p_order) THEN RAISE EXCEPTION 'Baseline harga order belum tersedia.';END IF;
 PERFORM set_config('kpi.audit_reason',p_reason,true);
 IF p_id IS NULL THEN
 INSERT INTO public.kpi_price_versions(order_id,effective_from,components,actor,reason) VALUES(p_order,p_from,p_components,auth.uid(),p_reason) RETURNING id INTO v_id;
 ELSE
 UPDATE public.kpi_price_versions SET effective_from=p_from,components=p_components,actor=auth.uid(),reason=p_reason,revision=revision+1,recorded_at=now()
 WHERE id=p_id AND order_id=p_order AND revision=p_revision RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'KPI_STALE_REVISION' USING ERRCODE='40001';END IF;
 END IF;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.kpi_save_price_version(text,date,jsonb,text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kpi_save_price_version(text,date,jsonb,text,uuid,integer) TO authenticated;

CREATE FUNCTION public.kpi_save_setting(p_kind text,p_data jsonb,p_reason text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_name text;v_position text;v_id integer;v_month date;v_value numeric;
BEGIN
 PERFORM public.kpi_write_gate();
 IF auth.uid() IS NULL OR NOT public.kpi_can_view_team() THEN RAISE EXCEPTION 'KPI_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'Alasan wajib diisi.' USING ERRCODE='22023';END IF;
 PERFORM set_config('kpi.audit_reason',p_reason,true);
 IF p_kind='target' THEN
 v_month:=(p_data->>'bulan')::date;v_value:=(p_data->>'value')::numeric;
 IF v_month<>date_trunc('month',v_month)::date OR v_value<0 OR v_value IS NULL OR v_value<>trunc(v_value) THEN RAISE EXCEPTION 'Target pcs/bulan tidak valid.' USING ERRCODE='22023';END IF;
 SELECT pic_penjahit,posisi INTO v_name,v_position FROM public.register_penjahit WHERE id=(p_data->>'orangId')::integer;
 IF v_name IS NULL THEN RAISE EXCEPTION 'Karyawan tidak ditemukan.';END IF;
 INSERT INTO public.target_jahit("bulanTahun",nama,posisi,target_monthly) VALUES(to_char(v_month,'YYYY-MM'),v_name,v_position,v_value)
 ON CONFLICT("bulanTahun",nama) DO UPDATE SET target_monthly=EXCLUDED.target_monthly;
 ELSIF p_kind='cost' THEN
 v_month:=(p_data->>'bulan')::date;v_value:=(p_data->>'value')::numeric;
 IF v_month IS NULL OR v_month<>date_trunc('month',v_month)::date OR v_value IS NULL OR v_value<0 THEN RAISE EXCEPTION 'Target biaya tidak valid.' USING ERRCODE='22023';END IF;
 INSERT INTO public.target_biaya(divisi,bulan,target_per_pcs,dibuat_oleh) VALUES(p_data->>'divisi',v_month,v_value,auth.uid())
 ON CONFLICT(divisi,bulan) DO UPDATE SET target_per_pcs=EXCLUDED.target_per_pcs,diubah_pada=now();
 ELSIF p_kind='holiday' THEN
 IF nullif(btrim(p_data->>'tanggal'),'') IS NULL OR nullif(btrim(p_data->>'keterangan'),'') IS NULL THEN RAISE EXCEPTION 'Tanggal dan keterangan wajib diisi.';END IF;
 IF p_data->>'id' IS NULL THEN
 IF EXISTS(SELECT FROM public.daftar_libur WHERE tanggal=(p_data->>'tanggal')::date) THEN RAISE EXCEPTION 'Tanggal libur sudah ada.' USING ERRCODE='23505';END IF;
 INSERT INTO public.daftar_libur(tanggal,keterangan,is_national) VALUES((p_data->>'tanggal')::date,p_data->>'keterangan',false);
 ELSE
 UPDATE public.daftar_libur SET tanggal=(p_data->>'tanggal')::date,keterangan=p_data->>'keterangan' WHERE id=(p_data->>'id')::integer RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Libur tidak ditemukan.';END IF;
 END IF;
 ELSE RAISE EXCEPTION 'Jenis pengaturan tidak dikenal.' USING ERRCODE='22023';END IF;
END $$;
REVOKE ALL ON FUNCTION public.kpi_save_setting(text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kpi_save_setting(text,jsonb,text) TO authenticated;

CREATE FUNCTION public.kpi_tarif_entries(p_dari date,p_sampai date,p_orang_id integer DEFAULT NULL)
RETURNS TABLE(tanggal date,divisi text,orang_id integer,orang_nama text,pcs numeric,work_order_id text,work_code text,tarif numeric,provenance text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.kpi_can_view_team() THEN RAISE EXCEPTION 'KPI_FORBIDDEN' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT e.tanggal,e.divisi,e.orang_id,e.orang_nama,e.pcs,e.work_order_id,e.work_code,r.tarif,r.provenance
 FROM public.kpi_produksi_harian(p_dari,p_sampai,p_orang_id) e LEFT JOIN public.work_orders w ON w.id=e.work_order_id LEFT JOIN LATERAL public.kpi_resolve_rate(w.source_order_id,e.tanggal,e.divisi) r ON true
 WHERE p_orang_id IS NULL OR EXISTS(SELECT FROM public.register_penjahit o WHERE o.id=e.orang_id AND e.divisi=CASE WHEN lower(o.posisi)='finishing' THEN 'finishing' ELSE 'penjahit' END)
 ORDER BY e.tanggal,e.divisi,e.orang_nama,e.work_order_id;
END $$;
REVOKE ALL ON FUNCTION public.kpi_tarif_entries(date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kpi_tarif_entries(date,date,integer) TO authenticated;

-- Private estimate now resolves exactly the same effective-dated rates as Team.
CREATE OR REPLACE FUNCTION public.kpi_upah_pribadi(p_dari date,p_sampai date,p_orang_id integer)
RETURNS TABLE(bulan text,pcs_total numeric,pcs_bertarif numeric,estimasi numeric,entry_tanpa_tarif bigint,pcs_tanpa_tarif numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH scoped AS (SELECT e.tanggal,greatest(e.pcs,0) AS pcs,r.tarif FROM public.kpi_person_entries(p_dari,p_sampai,p_orang_id) e LEFT JOIN public.work_orders w ON w.id=e.work_order_id LEFT JOIN LATERAL public.kpi_resolve_rate(w.source_order_id,e.tanggal,e.divisi) r ON true)
 SELECT to_char(s.tanggal,'YYYY-MM'),sum(s.pcs),coalesce(sum(s.pcs) FILTER(WHERE s.tarif IS NOT NULL),0),sum(s.pcs*s.tarif) FILTER(WHERE s.tarif IS NOT NULL),count(*) FILTER(WHERE s.tarif IS NULL),coalesce(sum(s.pcs) FILTER(WHERE s.tarif IS NULL),0)
 FROM scoped s GROUP BY to_char(s.tanggal,'YYYY-MM') ORDER BY 1
$$;

-- Full baseline versions are not raw tariffs for staff. Only a safe own-data flag.
CREATE FUNCTION public.kpi_legacy_pribadi(p_dari date,p_sampai date,p_orang_id integer) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT FROM public.kpi_person_entries(p_dari,p_sampai,p_orang_id) e JOIN public.work_orders w ON w.id=e.work_order_id JOIN LATERAL public.kpi_resolve_rate(w.source_order_id,e.tanggal,e.divisi) r ON true WHERE r.provenance='baseline_unverified')
$$;
REVOKE ALL ON FUNCTION public.kpi_legacy_pribadi(date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kpi_legacy_pribadi(date,date,integer) TO authenticated;
