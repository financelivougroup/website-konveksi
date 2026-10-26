-- Correct legacy capture: compare actual previous Register Harga components,
-- ignoring labels, rather than comparing against a manually overridden KPI rate.
CREATE OR REPLACE FUNCTION public.kpi_capture_price() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_rates jsonb;new_rates jsonb;existed boolean;old_components jsonb;
BEGIN
 SELECT EXISTS(SELECT FROM public.kpi_price_baselines WHERE order_id=NEW.production_order_id) INTO existed;
 INSERT INTO public.kpi_price_baselines(order_id,components) VALUES(NEW.production_order_id,NEW.components) ON CONFLICT(order_id) DO NOTHING;
 IF NOT existed THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' THEN old_components:=OLD.components;
 ELSE SELECT components INTO old_components FROM public.kpi_price_baselines WHERE order_id=NEW.production_order_id;END IF;
 SELECT jsonb_agg(jsonb_build_object('key',x->>'key','value',x->'value') ORDER BY x->>'key') INTO new_rates FROM jsonb_array_elements(NEW.components) x WHERE x->>'key' IN('jahit','obras','finishing');
 SELECT jsonb_agg(jsonb_build_object('key',x->>'key','value',x->'value') ORDER BY x->>'key') INTO old_rates FROM jsonb_array_elements(old_components) x WHERE x->>'key' IN('jahit','obras','finishing');
 IF old_rates IS DISTINCT FROM new_rates THEN
  IF NOT public.kpi_can_view_team() THEN RAISE EXCEPTION 'KPI_PRICE_CHANGE_FORBIDDEN' USING ERRCODE='42501';END IF;
  INSERT INTO public.kpi_price_versions(order_id,effective_from,components,register_harga_id,actor,reason)
  VALUES(NEW.production_order_id,current_date,NEW.components,NEW.id,auth.uid(),'Perubahan harga melalui Order Entry')
  ON CONFLICT(order_id,effective_from) DO UPDATE SET components=EXCLUDED.components,register_harga_id=EXCLUDED.register_harga_id,actor=auth.uid(),revision=kpi_price_versions.revision+1,reason=EXCLUDED.reason,recorded_at=now();
 END IF;
 RETURN NEW;
END $$;

-- No final month may be created through the application until the release tests
-- for overlapping sessions and the complete cascade matrix have actually passed.
-- This is a server gate, not just a disabled UI button. It is intentionally NOT
-- switchable through a client-supplied setting or GUC.
CREATE OR REPLACE FUNCTION public.kpi_set_month(p_bulan date,p_final boolean,p_reason text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role text;
BEGIN
 PERFORM public.kpi_write_gate();
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
 IF v_role IS NULL OR v_role NOT IN('owner','finance') OR (NOT p_final AND v_role<>'owner') THEN
  RAISE EXCEPTION 'KPI_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_bulan IS NULL OR p_bulan<>date_trunc('month',p_bulan)::date OR p_bulan>date_trunc('month',current_date)::date
 OR p_final IS NULL OR length(btrim(coalesce(p_reason,'')))<3 THEN
  RAISE EXCEPTION 'Parameter bulan/alasan tidak valid.' USING ERRCODE='22023';
 END IF;
 IF p_final THEN RAISE EXCEPTION 'KPI_FINALIZATION_PENDING_VERIFICATION' USING ERRCODE='55000';END IF;
 PERFORM set_config('kpi.audit_reason',p_reason,true);
 UPDATE public.bulan_status SET status='terbuka',dibuka_oleh=auth.uid(),dibuka_pada=now()
 WHERE bulan=p_bulan AND status='final';
END $$;
