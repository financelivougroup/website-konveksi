-- Private candidate used to test the full close path while the public release gate stays closed.
CREATE OR REPLACE FUNCTION public.kpi_change_month_internal(p_bulan date,p_final boolean,p_reason text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role text;v_status text;
BEGIN
 PERFORM public.kpi_write_gate();
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
 IF v_role IS NULL OR v_role NOT IN('owner','finance') OR (NOT p_final AND v_role<>'owner') THEN
 RAISE EXCEPTION 'KPI_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_bulan IS NULL OR p_final IS NULL OR p_bulan<>date_trunc('month',p_bulan)::date OR p_bulan>date_trunc('month',current_date)::date
 OR length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'Parameter bulan/alasan tidak valid.' USING ERRCODE='22023';END IF;
 SELECT status INTO v_status FROM public.bulan_status WHERE bulan=p_bulan;
 PERFORM set_config('kpi.audit_reason',p_reason,true);
 IF p_final THEN
  -- A second close must never overwrite a final snapshot and legitimize a change.
  IF v_status='final' THEN RETURN;END IF;
  INSERT INTO public.bulan_status(bulan,status,ditutup_oleh,ditutup_pada)
  VALUES(p_bulan,'final',auth.uid(),now())
  ON CONFLICT(bulan) DO UPDATE SET status='final',ditutup_oleh=auth.uid(),ditutup_pada=now();
  INSERT INTO public.kpi_final_snapshots(bulan,fingerprint) VALUES(p_bulan,public.kpi_month_fingerprint(p_bulan))
  ON CONFLICT(bulan) DO UPDATE SET fingerprint=EXCLUDED.fingerprint;
 ELSE
  IF v_status IS DISTINCT FROM 'final' THEN RAISE EXCEPTION 'Bulan tidak sedang final.' USING ERRCODE='22023';END IF;
  UPDATE public.bulan_status SET status='terbuka',dibuka_oleh=auth.uid(),dibuka_pada=now() WHERE bulan=p_bulan;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.kpi_change_month_internal(date,boolean,text) FROM PUBLIC,anon,authenticated;
