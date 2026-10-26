-- Release follows recorded two-session contention in both arrival orders,
-- rollback matrix, role checks, atomic Planning generation, and preview blockers.
-- Private implementation remains the single owner of permission and snapshot logic.
CREATE OR REPLACE FUNCTION public.kpi_set_month(p_bulan date,p_final boolean,p_reason text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.kpi_change_month_internal(p_bulan,p_final,p_reason);
END $$;
REVOKE ALL ON FUNCTION public.kpi_set_month(date,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kpi_set_month(date,boolean,text) TO authenticated;
