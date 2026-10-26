-- Approved settlement model: monthly chronological extra, JAHIT+OBRAS,
-- salary minus all realized cost, final-only benefit payments linked to Expense.
-- Live schema/functions inspected through Supabase MCP on 2026-10-20.
CREATE TABLE public.staff_benefit_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 staff_id integer NOT NULL REFERENCES public.register_penjahit(id) ON DELETE RESTRICT,
 expense_id bigint NOT NULL UNIQUE REFERENCES public.expense_entries(id) ON DELETE RESTRICT,
 cutoff_month date NOT NULL CHECK(extract(day FROM cutoff_month)=1),
 paid_date date NOT NULL,
 amount numeric NOT NULL CHECK(amount>0 AND amount=trunc(amount)),
 reason text NOT NULL CHECK(length(btrim(reason))>=3),
 actor uuid NOT NULL REFERENCES auth.users(id),
 request_id uuid NOT NULL UNIQUE,
 allocations jsonb NOT NULL,
 voided_at timestamptz, void_reason text, void_actor uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_entries ADD COLUMN benefit_payment_id uuid UNIQUE
 REFERENCES public.staff_benefit_payments(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.staff_benefit_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY benefit_privileged_read ON public.staff_benefit_payments FOR SELECT TO authenticated USING(public.is_owner() OR public.is_finance());
REVOKE ALL ON public.staff_benefit_payments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staff_benefit_payments TO authenticated;
CREATE TABLE public.staff_settlement_release (id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false);
INSERT INTO public.staff_settlement_release(id,enabled) VALUES(true,false);
REVOKE ALL ON public.staff_settlement_release FROM PUBLIC,anon,authenticated;
ALTER TABLE public.staff_settlement_release ENABLE ROW LEVEL SECURITY;

-- Find parent by path, not generated IDs; do not alter salary taxonomy.
INSERT INTO public.expense_categories(level,parent_id,name,sort_order,is_active)
SELECT 'sub',m.id,'BENEFIT',100,true FROM public.expense_categories m
JOIN public.expense_categories t ON t.id=m.parent_id AND t.level='type' AND t.name='EXPENSE'
WHERE m.level='main' AND m.name='MANPOWER'
AND NOT EXISTS(SELECT FROM public.expense_categories b WHERE b.parent_id=m.id AND b.name='BENEFIT');

CREATE FUNCTION public.staff_settlement_months(p_staff integer,p_until date)
RETURNS TABLE(month date,target numeric,actual numeric,cost numeric,benefit numeric,extra numeric,salary numeric,missing_rate bigint,missing_target boolean,identity_issue boolean,is_final boolean,entries jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH person AS(SELECT r.*,(SELECT count(*) FROM public.register_penjahit x WHERE x.pic_penjahit=r.pic_penjahit)>1 AS ambiguous FROM public.register_penjahit r WHERE r.id=p_staff),
 targets AS(SELECT to_date(t."bulanTahun"||'-01','YYYY-MM-DD') AS month,sum(t.target_monthly) AS target,count(*) AS n FROM public.target_jahit t JOIN person p ON p.pic_penjahit=t.nama WHERE t."bulanTahun"~'^\d{4}-(0[1-9]|1[0-2])$' GROUP BY t."bulanTahun"),
 source AS(SELECT s.*,w.source_order_id,w.product_note,w.product,w.warna,rate.tarif,rate.provenance,date_trunc('month',s.tgl_laporan)::date AS month FROM public.sewing_records s JOIN person p ON p.pic_penjahit=s.pic_penjahit LEFT JOIN public.work_orders w ON w.id=s.work_order_id LEFT JOIN LATERAL public.kpi_resolve_rate(w.source_order_id,s.tgl_laporan,'penjahit') rate ON true WHERE s.tgl_laporan<=p_until),
 ordered AS(SELECT s.*,t.target,coalesce(sum(s.qty_selesai) OVER(PARTITION BY s.month ORDER BY s.tgl_laporan,s.input_at,s.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS previous FROM source s LEFT JOIN targets t ON t.month=s.month),
 allocated AS(SELECT o.*,CASE WHEN o.target IS NULL THEN 0 ELSE greatest(0,o.previous+o.qty_selesai-o.target)-greatest(0,o.previous-o.target) END AS extra FROM ordered o),
 prod AS(SELECT a.month,sum(a.qty_selesai) AS actual,sum(a.qty_selesai*a.tarif) AS cost,sum(a.extra*a.tarif) AS benefit,sum(a.extra) AS extra,count(*) FILTER(WHERE a.tarif IS NULL OR a.qty_selesai<0) AS missing_rate,jsonb_agg(jsonb_build_object('id',a.id,'date',a.tgl_laporan,'inputAt',a.input_at,'pcs',a.qty_selesai,'rate',a.tarif,'provenance',a.provenance,'orderId',a.source_order_id,'productNote',a.product_note,'product',a.product,'warna',a.warna,'extra',a.extra,'cost',a.qty_selesai*a.tarif,'benefit',a.extra*a.tarif) ORDER BY a.tgl_laporan,a.input_at,a.id) AS entries FROM allocated a GROUP BY a.month),
 sal AS(SELECT date_trunc('month',e.entry_date)::date AS month,sum(e.total_payment) AS salary FROM public.expense_entries e WHERE e.staff_id=p_staff AND e.sub_category_name='SALARY' AND e.benefit_payment_id IS NULL AND e.entry_date<=p_until GROUP BY 1),
 months AS(SELECT month FROM targets UNION SELECT month FROM prod UNION SELECT month FROM sal UNION SELECT b.cutoff_month FROM public.staff_benefit_payments b WHERE b.staff_id=p_staff)
 SELECT m.month,t.target,coalesce(pr.actual,0),CASE WHEN coalesce(pr.missing_rate,0)>0 THEN NULL ELSE coalesce(pr.cost,0) END,CASE WHEN coalesce(pr.missing_rate,0)>0 THEN NULL ELSE coalesce(pr.benefit,0) END,coalesce(pr.extra,0),coalesce(s.salary,0),coalesce(pr.missing_rate,0),t.target IS NULL,(p.ambiguous OR coalesce(t.n,0)>1),coalesce(b.status='final',false),coalesce(pr.entries,'[]')
 FROM months m CROSS JOIN person p LEFT JOIN targets t USING(month) LEFT JOIN prod pr USING(month) LEFT JOIN sal s USING(month) LEFT JOIN public.bulan_status b ON b.bulan=m.month
 WHERE m.month<=date_trunc('month',p_until)::date ORDER BY m.month
$$;
REVOKE ALL ON FUNCTION public.staff_settlement_months(integer,date) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.staff_settlement_person(p_staff integer,p_until date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_rows jsonb;v_pay jsonb;v_r numeric:=0;v_s numeric:=0;v_b numeric:=0;v_p numeric:=0;v_total numeric:=0;v_ok boolean:=true;v_eligible boolean:=true;v_available numeric:=0;v_cutoff date;v_month record;v_result jsonb:='[]';v_fingerprint text;v_name text;v_position text;v_salary_missing boolean;
BEGIN
 SELECT pic_penjahit,posisi INTO v_name,v_position FROM public.register_penjahit WHERE id=p_staff;
 IF NOT FOUND THEN RAISE EXCEPTION 'SETTLEMENT_STAFF_NOT_FOUND';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.month),'[]') INTO v_rows FROM public.staff_settlement_months(p_staff,p_until) x;
 SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.paid_date,b.created_at,b.id),'[]'),coalesce(sum(b.amount) FILTER(WHERE b.voided_at IS NULL AND b.paid_date<=p_until),0) INTO v_pay,v_total FROM public.staff_benefit_payments b WHERE b.staff_id=p_staff;
 FOR v_month IN SELECT * FROM public.staff_settlement_months(p_staff,p_until) LOOP
  v_r:=v_r+coalesce(v_month.cost,0);v_s:=v_s+v_month.salary;v_b:=v_b+coalesce(v_month.benefit,0);
  -- Allocations are production months, not transfer months. A November transfer
  -- for October remains paid when the user opens October's settlement.
  SELECT coalesce(sum((a->>'amount')::numeric),0) INTO v_p FROM public.staff_benefit_payments b CROSS JOIN LATERAL jsonb_array_elements(b.allocations) a WHERE b.staff_id=p_staff AND b.voided_at IS NULL AND (a->>'month')::date<=v_month.month;
  v_ok:=v_ok AND v_month.missing_rate=0 AND NOT v_month.identity_issue;
  v_salary_missing:=v_month.salary=0 AND (v_month.actual>0 OR coalesce(v_month.target,0)>0);
  v_eligible:=v_eligible AND v_ok AND v_month.is_final AND NOT v_month.missing_target AND NOT v_salary_missing;
  IF v_eligible AND lower(coalesce(v_position,''))='penjahit' THEN
   v_available:=greatest(0,least(v_b-v_p,v_r-v_s-v_p));v_cutoff:=v_month.month;
  ELSE
   -- Later open months do not invalidate the already-final prefix.
   NULL;
  END IF;
  v_result:=v_result||jsonb_build_array(to_jsonb(v_month)||jsonb_build_object('paid',v_p,'debt',CASE WHEN v_ok THEN greatest(0,v_s+v_p-v_r) ELSE NULL END,'grossRemaining',CASE WHEN v_ok THEN greatest(0,v_b-v_p) ELSE NULL END,'payable',CASE WHEN v_ok THEN greatest(0,least(v_b-v_p,v_r-v_s-v_p)) ELSE NULL END,'salaryMissing',v_salary_missing));
 END LOOP;
 -- Global debt includes every actual transfer; no double-count with salary.
 v_fingerprint:=md5(jsonb_build_object('months',v_rows,'payments',v_pay)::text);
 RETURN jsonb_build_object('staffId',p_staff,'nama',v_name,'posisi',v_position,'months',v_result,'payments',v_pay,'cost',CASE WHEN v_ok THEN v_r ELSE NULL END,'salary',v_s,'benefit',CASE WHEN v_ok THEN v_b ELSE NULL END,'paid',v_total,'debt',CASE WHEN v_ok THEN greatest(0,v_s+v_total-v_r) ELSE NULL END,'payable',CASE WHEN v_ok THEN greatest(0,least(v_b-v_total,v_r-v_s-v_total)) ELSE NULL END,'finalPayable',CASE WHEN v_ok THEN least(v_available,greatest(0,least(v_b-v_total,v_r-v_s-v_total))) ELSE 0 END,'cutoff',v_cutoff,'complete',v_ok,'fingerprint',v_fingerprint,'enabled',(SELECT enabled FROM public.staff_settlement_release WHERE id));
END $$;
REVOKE ALL ON FUNCTION public.staff_settlement_person(integer,date) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.staff_settlement_read(p_staff integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT(public.is_owner() OR public.is_finance()) THEN RAISE EXCEPTION 'SETTLEMENT_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(public.staff_settlement_person(r.id,current_date) ORDER BY r.id),'[]') INTO result FROM public.register_penjahit r WHERE (p_staff IS NULL OR r.id=p_staff) AND (lower(coalesce(r.posisi,''))='penjahit' OR EXISTS(SELECT FROM public.target_jahit t WHERE t.nama=r.pic_penjahit) OR EXISTS(SELECT FROM public.staff_benefit_payments b WHERE b.staff_id=r.id));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.staff_settlement_read(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_settlement_read(integer) TO authenticated;

-- Salary mutations share the production write gate, and cannot change final
-- inputs. Linked benefit Expenses can only be created by the settlement RPC.
CREATE FUNCTION public.staff_expense_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE oldj jsonb;newj jsonb;linked boolean;salaryrow boolean;v_month date;
BEGIN
 IF TG_OP<>'INSERT' THEN oldj:=to_jsonb(OLD);END IF;
 IF TG_OP<>'DELETE' THEN newj:=to_jsonb(NEW);END IF;
 linked:=coalesce(oldj->>'benefit_payment_id',newj->>'benefit_payment_id') IS NOT NULL;
 IF linked OR coalesce(newj->>'sub_category_name','')='BENEFIT' THEN
  IF current_user<>'postgres' OR coalesce(current_setting('staff.benefit_write',true),'')<>'yes' THEN RAISE EXCEPTION 'BENEFIT_USE_SETTLEMENT_ACTION' USING ERRCODE='42501';END IF;
 END IF;
 salaryrow:=((oldj->>'staff_id') IS NOT NULL AND oldj->>'sub_category_name'='SALARY') OR ((newj->>'staff_id') IS NOT NULL AND newj->>'sub_category_name'='SALARY');
 IF salaryrow OR linked THEN
  PERFORM public.staff_expense_gate();
  IF salaryrow AND oldj IS DISTINCT FROM newj THEN
   FOR v_month IN SELECT DISTINCT date_trunc('month',(j->>'entry_date')::date)::date FROM jsonb_array_elements(jsonb_build_array(oldj,newj)) j WHERE j->>'staff_id' IS NOT NULL AND j->>'sub_category_name'='SALARY' LOOP
    IF public.bulan_is_final(v_month) THEN RAISE EXCEPTION 'KPI_MONTH_FINAL' USING ERRCODE='42501';END IF;
   END LOOP;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
REVOKE ALL ON FUNCTION public.staff_expense_guard() FROM PUBLIC,anon,authenticated;
-- Invoker trigger needs private gate privilege via a narrowly scoped definer wrapper.
CREATE FUNCTION public.staff_expense_gate() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT public.kpi_write_gate() $$;
REVOKE ALL ON FUNCTION public.staff_expense_gate() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_expense_gate() TO authenticated;
-- Guard calls gate through the public wrapper; it only acquires a lock, never writes.
CREATE TRIGGER staff_00_settlement_guard BEFORE INSERT OR UPDATE OR DELETE ON public.expense_entries FOR EACH ROW EXECUTE FUNCTION public.staff_expense_guard();

CREATE FUNCTION public.staff_benefit_pay(p_staff integer,p_amount integer,p_paid_date date,p_reason text,p_request uuid,p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_person jsonb;v_previous public.staff_benefit_payments;v_cutoff date;v_id uuid:=gen_random_uuid();v_expense bigint;v_category bigint;v_name text;v_actor text;v_left numeric;v_alloc jsonb:='[]';v_month record;v_used numeric;v_take numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT(public.is_owner() OR public.is_finance()) THEN RAISE EXCEPTION 'SETTLEMENT_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF NOT(SELECT enabled FROM public.staff_settlement_release WHERE id) THEN RAISE EXCEPTION 'BENEFIT_PAYMENT_PENDING_VERIFICATION';END IF;
 IF p_request IS NULL OR p_staff IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_paid_date IS NULL OR p_paid_date>current_date OR length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'BENEFIT_INVALID_INPUT';END IF;
 PERFORM public.kpi_write_gate();
 SELECT * INTO v_previous FROM public.staff_benefit_payments WHERE request_id=p_request;
 IF FOUND THEN
  IF v_previous.staff_id<>p_staff OR v_previous.amount<>p_amount OR v_previous.paid_date<>p_paid_date OR v_previous.reason<>p_reason OR v_previous.actor<>auth.uid() THEN RAISE EXCEPTION 'BENEFIT_IDEMPOTENCY_CONFLICT';END IF;
  RETURN jsonb_build_object('paymentId',v_previous.id,'expenseId',v_previous.expense_id,'replayed',true);
 END IF;
 v_person:=public.staff_settlement_person(p_staff,current_date);v_cutoff:=(v_person->>'cutoff')::date;
 IF v_person->>'fingerprint' IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'BENEFIT_STALE_BALANCE';END IF;
 IF v_cutoff IS NULL OR p_paid_date<(v_cutoff+interval '1 month - 1 day')::date OR p_amount>coalesce((v_person->>'finalPayable')::numeric,0) THEN RAISE EXCEPTION 'BENEFIT_INSUFFICIENT_FINAL_BALANCE';END IF;
 v_left:=p_amount;
 FOR v_month IN SELECT * FROM public.staff_settlement_months(p_staff,current_date) WHERE month<=v_cutoff ORDER BY month LOOP
  SELECT coalesce(sum((a->>'amount')::numeric),0) INTO v_used FROM public.staff_benefit_payments b CROSS JOIN LATERAL jsonb_array_elements(b.allocations) a WHERE b.staff_id=p_staff AND b.voided_at IS NULL AND (a->>'month')::date=v_month.month;
  v_take:=least(v_left,greatest(0,v_month.benefit-v_used));
  IF v_take>0 THEN v_alloc:=v_alloc||jsonb_build_array(jsonb_build_object('month',v_month.month,'amount',v_take));v_left:=v_left-v_take;END IF;
  EXIT WHEN v_left=0;
 END LOOP;
 IF v_left<>0 THEN RAISE EXCEPTION 'BENEFIT_ALLOCATION_MISMATCH';END IF;
 SELECT b.id INTO v_category FROM public.expense_categories b JOIN public.expense_categories m ON m.id=b.parent_id JOIN public.expense_categories t ON t.id=m.parent_id WHERE b.level='sub' AND b.name='BENEFIT' AND m.name='MANPOWER' AND t.name='EXPENSE' AND b.is_active;
 IF v_category IS NULL THEN RAISE EXCEPTION 'BENEFIT_CATEGORY_MISSING';END IF;
 SELECT pic_penjahit INTO v_name FROM public.register_penjahit WHERE id=p_staff;
 SELECT display_name INTO v_actor FROM public.profiles WHERE id=auth.uid();
 PERFORM set_config('staff.benefit_write','yes',true);
 INSERT INTO public.expense_entries(entry_date,category_id,item_id,type_name,main_category_name,sub_category_name,item_name,category_path,note,input_by,vendor_id,vendor_name,staff_id,quantity,unit_price,shipping_admin,discount_cashback,flow_transaction,nama_barang,pic,benefit_payment_id)
 VALUES(p_paid_date,v_category,NULL,'EXPENSE','MANPOWER','BENEFIT','','EXPENSE > MANPOWER > BENEFIT',p_reason,v_actor,NULL,v_name,p_staff,1,p_amount,0,0,'Cash','Benefit produksi',v_actor,v_id) RETURNING id INTO v_expense;
 INSERT INTO public.staff_benefit_payments(id,staff_id,expense_id,cutoff_month,paid_date,amount,reason,actor,request_id,allocations) VALUES(v_id,p_staff,v_expense,v_cutoff,p_paid_date,p_amount,p_reason,auth.uid(),p_request,v_alloc);
 PERFORM set_config('staff.benefit_write','',true);
 RETURN jsonb_build_object('paymentId',v_id,'expenseId',v_expense,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.staff_benefit_pay(integer,integer,date,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_benefit_pay(integer,integer,date,text,uuid,text) TO authenticated;

-- Forward additions installed separately through MCP; preserve exact replay.
ALTER TABLE public.staff_benefit_payments ALTER COLUMN expense_id DROP NOT NULL;
ALTER TABLE public.staff_benefit_payments ADD COLUMN original_expense_id bigint;
CREATE FUNCTION public.staff_benefit_void(p_payment uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.staff_benefit_payments;
BEGIN
 IF auth.uid() IS NULL OR NOT(public.is_owner() OR public.is_finance()) THEN RAISE EXCEPTION 'SETTLEMENT_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'BENEFIT_REASON_REQUIRED';END IF;
 PERFORM public.kpi_write_gate();SELECT * INTO v FROM public.staff_benefit_payments WHERE id=p_payment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BENEFIT_PAYMENT_NOT_FOUND';END IF;
 IF v.voided_at IS NOT NULL THEN RETURN;END IF;
 IF EXISTS(SELECT FROM public.expense_entries WHERE id=v.expense_id AND (proof_path IS NOT NULL OR proof_payment_path IS NOT NULL)) THEN RAISE EXCEPTION 'BENEFIT_PROOF_REQUIRES_CLEANUP';END IF;
 PERFORM set_config('staff.benefit_write','yes',true);PERFORM set_config('kpi.audit_reason',p_reason,true);
 UPDATE public.expense_entries SET benefit_payment_id=NULL WHERE id=v.expense_id;
 UPDATE public.staff_benefit_payments SET voided_at=now(),void_reason=p_reason,void_actor=auth.uid(),original_expense_id=expense_id,expense_id=NULL WHERE id=p_payment;
 DELETE FROM public.expense_entries WHERE id=v.expense_id;
 PERFORM set_config('staff.benefit_write','',true);
END $$;
REVOKE ALL ON FUNCTION public.staff_benefit_void(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_benefit_void(uuid,text) TO authenticated;
CREATE TRIGGER staff_benefit_audit AFTER INSERT OR UPDATE ON public.staff_benefit_payments FOR EACH ROW EXECUTE FUNCTION public.kpi_audit_row();
ALTER FUNCTION public.kpi_delete_blockers(jsonb) RENAME TO kpi_delete_blockers_before_benefit;
REVOKE ALL ON FUNCTION public.kpi_delete_blockers_before_benefit(jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.kpi_delete_blockers(p_rows jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.kpi_delete_blockers_before_benefit(p_rows)
 ||coalesce((SELECT jsonb_agg('Pembayaran benefit terhubung Expense #'||(x->>'id')||'. Batalkan melalui Target Jahit > Benefit, bukan hapus permanen.') FROM jsonb_array_elements(coalesce(p_rows->'expense_entries','[]')) x WHERE x->>'benefit_payment_id' IS NOT NULL),'[]')
 ||coalesce((SELECT jsonb_agg('Gaji bulan '||to_char(b.bulan,'YYYY-MM')||' sudah final. Owner harus membuka kunci.') FROM public.bulan_status b WHERE b.status='final' AND EXISTS(SELECT FROM jsonb_array_elements(coalesce(p_rows->'expense_entries','[]')) x WHERE x->>'staff_id' IS NOT NULL AND x->>'sub_category_name'='SALARY' AND date_trunc('month',(x->>'entry_date')::date)::date=b.bulan)),'[]')
$$;
REVOKE ALL ON FUNCTION public.kpi_delete_blockers(jsonb) FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.kpi_month_fingerprint(date) RENAME TO kpi_month_fingerprint_before_settlement;
REVOKE ALL ON FUNCTION public.kpi_month_fingerprint_before_settlement(date) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.kpi_month_fingerprint(p_month date) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT md5(public.kpi_month_fingerprint_before_settlement(p_month)||coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'staff',e.staff_id,'date',e.entry_date,'amount',e.total_payment,'category',e.sub_category_name) ORDER BY e.id)::text FROM public.expense_entries e WHERE e.staff_id IS NOT NULL AND e.sub_category_name='SALARY' AND e.benefit_payment_id IS NULL AND date_trunc('month',e.entry_date)::date=p_month),'[]'))
$$;
REVOKE ALL ON FUNCTION public.kpi_month_fingerprint(date) FROM PUBLIC,anon,authenticated;
CREATE TRIGGER staff_salary_99_final AFTER INSERT OR UPDATE OR DELETE ON public.expense_entries FOR EACH STATEMENT EXECUTE FUNCTION public.kpi_assert_finals();

-- Keep the verified implementation private while the public action is gated.
DO $$ DECLARE s text;BEGIN
 SELECT pg_get_functiondef('public.staff_benefit_pay(integer,integer,date,text,uuid,text)'::regprocedure) INTO s;
 s:=replace(s,'CREATE OR REPLACE FUNCTION public.staff_benefit_pay(','CREATE OR REPLACE FUNCTION public.staff_benefit_pay_candidate(');
 s:=replace(s,'IF NOT(SELECT enabled FROM public.staff_settlement_release WHERE id) THEN RAISE EXCEPTION ''BENEFIT_PAYMENT_PENDING_VERIFICATION'';END IF;','');
 EXECUTE s;
END $$;
REVOKE ALL ON FUNCTION public.staff_benefit_pay_candidate(integer,integer,date,text,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.staff_benefit_pay(p_staff integer,p_amount integer,p_paid_date date,p_reason text,p_request uuid,p_fingerprint text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT(public.is_owner() OR public.is_finance()) THEN RAISE EXCEPTION 'SETTLEMENT_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF NOT(SELECT enabled FROM public.staff_settlement_release WHERE id) THEN RAISE EXCEPTION 'BENEFIT_PAYMENT_PENDING_VERIFICATION';END IF;
 RETURN public.staff_benefit_pay_candidate(p_staff,p_amount,p_paid_date,p_reason,p_request,p_fingerprint);
END $$;
ALTER FUNCTION public.kpi_month_fingerprint(date) RENAME TO kpi_month_fingerprint_before_ordering;
REVOKE ALL ON FUNCTION public.kpi_month_fingerprint_before_ordering(date) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.kpi_month_fingerprint(p_month date) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT md5(public.kpi_month_fingerprint_before_ordering(p_month)||coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'input_at',s.input_at) ORDER BY s.id)::text FROM public.sewing_records s WHERE date_trunc('month',s.tgl_laporan)::date=p_month),'[]'))
$$;
REVOKE ALL ON FUNCTION public.kpi_month_fingerprint(date) FROM PUBLIC,anon,authenticated;
