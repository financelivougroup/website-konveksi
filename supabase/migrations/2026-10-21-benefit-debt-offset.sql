-- User confirmed benefit is additional debt credit: 460000 - 240000 = 220000.
-- Forward patch based on MCP-inspected definitions, preserving historical migration.
-- Keep public payment release gate unchanged (false until broader release tests pass).
DO $$
DECLARE src text;
BEGIN
 SELECT pg_get_functiondef('public.staff_settlement_person(integer,date)'::regprocedure) INTO src;
 IF position('v_r-v_s-v_p' IN src)=0 OR position('v_s+v_total-v_r' IN src)=0 THEN RAISE EXCEPTION 'SETTLEMENT_OFFSET_SOURCE_CHANGED';END IF;
 src:=replace(src,'v_r-v_s-v_p','v_r-v_s+v_b-v_p');
 src:=replace(src,'v_s+v_p-v_r','v_s-v_r+v_p-v_b');
 src:=replace(src,'v_r-v_s-v_total','v_r-v_s+v_b-v_total');
 src:=replace(src,'v_s+v_total-v_r','v_s-v_r+v_total-v_b');
 src:=replace(src,'''paid'',v_p,''debt''','''paid'',v_p,''debtBeforeBenefit'',CASE WHEN v_ok THEN greatest(0,v_s-v_r) ELSE NULL END,''benefitOffset'',CASE WHEN v_ok THEN least(greatest(0,v_s-v_r),greatest(0,v_b-v_p)) ELSE NULL END,''debt''');
 src:=replace(src,'''paid'',v_total,''debt''','''paid'',v_total,''debtBeforeBenefit'',CASE WHEN v_ok THEN greatest(0,v_s-v_r) ELSE NULL END,''benefitOffset'',CASE WHEN v_ok THEN least(greatest(0,v_s-v_r),greatest(0,v_b-v_total)) ELSE NULL END,''grossRemaining'',CASE WHEN v_ok THEN greatest(0,v_b-v_total) ELSE NULL END,''debt''');
 src:=replace(src,'''months'',v_rows,''payments'',v_pay','''rule'',''benefit-debt-offset-v2'',''months'',v_rows,''payments'',v_pay');
 EXECUTE src;

 SELECT pg_get_functiondef('public.staff_benefit_pay_candidate(integer,integer,date,text,uuid,text)'::regprocedure) INTO src;
 IF position('v_month.benefit-v_used' IN src)=0 THEN RAISE EXCEPTION 'BENEFIT_ALLOCATION_SOURCE_CHANGED';END IF;
 src:=replace(src,'v_take numeric;','v_take numeric;v_offset_remaining numeric;v_offset_slice numeric;');
 src:=replace(src,'v_left:=p_amount;',
   'v_left:=p_amount; SELECT coalesce((m->>''benefitOffset'')::numeric,0) INTO v_offset_remaining FROM jsonb_array_elements(v_person->''months'') m WHERE (m->>''month'')::date=v_cutoff; v_offset_remaining:=coalesce(v_offset_remaining,0);');
 src:=replace(src,'v_take:=least(v_left,greatest(0,v_month.benefit-v_used));',
   'v_offset_slice:=least(v_offset_remaining,greatest(0,v_month.benefit-v_used));v_offset_remaining:=v_offset_remaining-v_offset_slice;v_take:=least(v_left,greatest(0,v_month.benefit-v_offset_slice-v_used));');
 EXECUTE src;
END $$;
