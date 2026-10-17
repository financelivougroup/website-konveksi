-- Permanent business-record deletion. Installation does not delete existing data.
-- Dependency discovery is shared by preview and execution. Files are cleaned only
-- after commit through server-owned jobs; counters, profiles and audit stay intact.
CREATE TABLE public.deletion_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  remaining_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  original_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  lease_token uuid,
  lease_until timestamptz,
  completed_at timestamptz
);
ALTER TABLE public.deletion_cleanup_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deletion_cleanup_jobs FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.permanent_delete_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner','finance')
  )
$$;

-- This allow-list is also the only source of dynamic table identifiers below.
CREATE FUNCTION public.permanent_delete_modules()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT ARRAY['production_orders','work_orders','cutting_records','sewing_records',
 'kancing_records','finishing_records','invoices','invoice_payments','payments',
 'complain_penalti','planning_produksi','target_jahit','target_jahit_detail',
 'selesai_jahit','daftar_libur','register_harga','expense_entries','register_client',
 'register_penjahit','vendors','expense_categories','master_products',
 'raw_product_monitoring','master_imports','invoice_payment_files','complain_files']::text[]
$$;

CREATE FUNCTION public.permanent_delete_rows(p_table text, p_ids text[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_rows jsonb;
BEGIN
 IF p_table IS NULL OR NOT (p_table = ANY(public.permanent_delete_modules() || ARRAY[
   'production_order_variations','production_order_prices','production_order_price_components',
   'invoice_payment_files','complain_files'])) THEN
   RAISE EXCEPTION 'DELETE_INVALID_MODULE';
 END IF;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id::text), ''[]''::jsonb) FROM public.%I t WHERE t.id::text = ANY($1)',p_table)
 INTO v_rows USING coalesce(p_ids,ARRAY[]::text[]);
 RETURN v_rows;
END $$;

CREATE FUNCTION public.permanent_delete_ids(p_rows jsonb)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(array_agg(x->>'id' ORDER BY x->>'id'),ARRAY[]::text[])
 FROM jsonb_array_elements(p_rows) x
$$;

-- Collect only exact, canonical references; never match product/colour names.
CREATE FUNCTION public.permanent_delete_graph(p_module text, p_ids text[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
 v_graph jsonb := '{}'::jsonb; v_selected jsonb; v_po text[] := '{}';
 v_wo text[] := '{}'; v_inv text[] := '{}'; v_pay text[] := '{}';
 v_codes text[] := '{}'; v_work_codes text[] := '{}'; v_detail text[];
 v_table text; v_rows jsonb; v_ids text[]; v_roots jsonb; v_blocked jsonb := '[]';
 v_row jsonb; v_used boolean; v_norm text; v_po_graph boolean; v_context jsonb := '{}';
BEGIN
 IF p_module IS NULL OR NOT (p_module = ANY(public.permanent_delete_modules())) THEN RAISE EXCEPTION 'DELETE_INVALID_MODULE'; END IF;
 IF cardinality(p_ids) < 1 OR cardinality(p_ids) > 200 OR p_ids IS NULL OR EXISTS(SELECT FROM unnest(p_ids) x WHERE x IS NULL OR btrim(x)='') THEN
  RAISE EXCEPTION 'DELETE_INVALID_SELECTION';
 END IF;
 SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids FROM unnest(p_ids) x;
 v_selected := public.permanent_delete_rows(p_module,v_ids);
 IF jsonb_array_length(v_selected) <> cardinality(v_ids) THEN RAISE EXCEPTION 'DELETE_RECORD_NOT_FOUND'; END IF;
 v_graph := jsonb_build_object(p_module,v_selected);
 v_po_graph := p_module IN ('production_orders','work_orders');
 IF p_module='production_orders' THEN v_po := v_ids;
 ELSIF p_module='work_orders' THEN
   SELECT coalesce(array_agg(DISTINCT source_order_id) FILTER(WHERE source_order_id IS NOT NULL),'{}') INTO v_po FROM public.work_orders WHERE id=ANY(v_ids);
   v_wo := v_ids;
 ELSIF p_module IN ('cutting_records','sewing_records','kancing_records','finishing_records') THEN
   SELECT array_agg(DISTINCT x->>'work_order_id') INTO v_wo FROM jsonb_array_elements(v_selected) x;
   SELECT coalesce(array_agg(DISTINCT source_order_id) FILTER(WHERE source_order_id IS NOT NULL),'{}') INTO v_po FROM public.work_orders WHERE id=ANY(v_wo);
 ELSIF p_module='invoices' THEN v_inv := v_ids;
 ELSIF p_module='invoice_payments' THEN
   SELECT array_agg(DISTINCT invoice_id::text) INTO v_inv FROM public.invoice_payments WHERE id::text=ANY(v_ids);
 ELSIF p_module='payments' THEN
   SELECT coalesce(array_agg(DISTINCT i.id::text),'{}') INTO v_inv FROM public.invoices i JOIN public.payments p ON p.invoice_id=i.id::text WHERE p.id=ANY(v_ids);
 END IF;
 IF cardinality(v_po)>0 THEN
  SELECT coalesce(array_agg(DISTINCT product_note),'{}') INTO v_codes FROM public.production_orders WHERE id=ANY(v_po);
  SELECT coalesce(array_agg(id),'{}') INTO v_detail FROM public.work_orders WHERE source_order_id=ANY(v_po) OR id=ANY(v_wo);
  v_wo := v_detail;
 END IF;
 IF cardinality(v_wo)>0 THEN
  SELECT coalesce(array_agg(DISTINCT work_code) FILTER(WHERE nullif(work_code,'') IS NOT NULL),'{}') INTO v_work_codes FROM public.work_orders WHERE id=ANY(v_wo);
 END IF;
 IF p_module IN ('invoices','invoice_payments','payments') THEN
  SELECT coalesce(array_agg(DISTINCT w.id),'{}') INTO v_wo
  FROM public.work_orders w
  WHERE EXISTS(SELECT FROM public.invoices i JOIN public.work_orders representative ON representative.id=i.work_order_id
   WHERE i.id::text=ANY(v_inv) AND (w.id=i.work_order_id OR w.source_order_id=coalesce(i.production_order_id,representative.source_order_id)));
 END IF;
 -- Fingerprint surviving status/payment inputs too, not just deleted rows.
 v_context := jsonb_build_object('work_orders',public.permanent_delete_rows('work_orders',v_wo));
 IF p_module IN ('invoices','cutting_records','sewing_records','kancing_records','finishing_records') THEN
  FOREACH v_table IN ARRAY ARRAY['cutting_records','sewing_records','kancing_records','finishing_records'] LOOP
   EXECUTE format('SELECT coalesce(array_agg(id::text),''{}'') FROM public.%I WHERE work_order_id=ANY($1)',v_table) INTO v_detail USING v_wo;
   v_context := v_context || jsonb_build_object(v_table,public.permanent_delete_rows(v_table,v_detail));
  END LOOP;
 END IF;
 IF v_po_graph OR p_module IN ('cutting_records','sewing_records','kancing_records','finishing_records') THEN
  SELECT coalesce(array_agg(id::text),'{}') INTO v_inv FROM public.invoices
   WHERE production_order_id=ANY(v_po) OR work_order_id=ANY(v_wo)
    OR (production_order_id IS NULL AND (work_code=ANY(v_codes) OR work_code=ANY(v_work_codes)));
 END IF;
 IF v_po_graph THEN
  v_graph := v_graph || jsonb_build_object('production_orders',public.permanent_delete_rows('production_orders',v_po), 'work_orders',public.permanent_delete_rows('work_orders',v_wo));
  FOREACH v_table IN ARRAY ARRAY['production_order_variations','production_order_prices','register_harga'] LOOP
   EXECUTE format('SELECT coalesce(array_agg(id::text),''{}'') FROM public.%I WHERE production_order_id=ANY($1)',v_table) INTO v_detail USING v_po;
   v_graph := v_graph || jsonb_build_object(v_table,public.permanent_delete_rows(v_table,v_detail));
  END LOOP;
  SELECT coalesce(array_agg(c.id::text),'{}') INTO v_detail FROM public.production_order_price_components c
    WHERE c.order_price_id::text=ANY(public.permanent_delete_ids(v_graph->'production_order_prices'));
  v_graph := v_graph || jsonb_build_object('production_order_price_components',public.permanent_delete_rows('production_order_price_components',v_detail));
  FOREACH v_table IN ARRAY ARRAY['cutting_records','sewing_records','kancing_records','finishing_records'] LOOP
   EXECUTE format('SELECT coalesce(array_agg(id::text),''{}'') FROM public.%I WHERE work_order_id=ANY($1)',v_table) INTO v_detail USING v_wo;
   v_graph := v_graph || jsonb_build_object(v_table,public.permanent_delete_rows(v_table,v_detail));
  END LOOP;
  -- Reject corrupt/ambiguous legacy work-code links instead of touching another order.
  IF EXISTS(SELECT FROM public.work_orders WHERE work_code=ANY(v_work_codes) AND NOT(id=ANY(v_wo))) THEN
   v_blocked := v_blocked || '"Kode WO dipakai order lain; perbaiki relasi sebelum menghapus."'::jsonb;
  END IF;
  SELECT coalesce(array_agg(id::text),'{}') INTO v_detail FROM public.selesai_jahit WHERE work_code=ANY(v_work_codes);
  v_graph := v_graph || jsonb_build_object('selesai_jahit',public.permanent_delete_rows('selesai_jahit',v_detail));
  SELECT coalesce(array_agg(id::text),'{}') INTO v_detail FROM public.complain_penalti WHERE production_code=ANY(v_codes) OR work_code=ANY(v_work_codes);
  IF EXISTS(SELECT FROM public.complain_penalti WHERE id::text=ANY(v_detail) AND
     ((nullif(production_code,'') IS NOT NULL AND NOT(production_code=ANY(v_codes))) OR
      (nullif(work_code,'') IS NOT NULL AND NOT(work_code=ANY(v_work_codes))))) THEN
   v_blocked := v_blocked || '"Complain memiliki relasi kode yang bertentangan."'::jsonb;
  END IF;
  v_graph := v_graph || jsonb_build_object('complain_penalti',public.permanent_delete_rows('complain_penalti',v_detail));
  FOREACH v_table IN ARRAY ARRAY['planning_produksi','target_jahit_detail'] LOOP
   EXECUTE format('SELECT coalesce(array_agg(id::text),''{}'') FROM public.%I WHERE product_note=ANY($1)',v_table) INTO v_detail USING v_codes;
   v_graph := v_graph || jsonb_build_object(v_table,public.permanent_delete_rows(v_table,v_detail));
  END LOOP;
 END IF;
 IF cardinality(v_inv)>0 THEN
  v_context := v_context || jsonb_build_object('invoices',public.permanent_delete_rows('invoices',v_inv));
  IF p_module IN ('invoice_payments','payments') THEN
   SELECT coalesce(array_agg(id::text),'{}') INTO v_detail FROM public.invoice_payments WHERE invoice_id::text=ANY(v_inv);
   v_context := v_context || jsonb_build_object('invoice_payments',public.permanent_delete_rows('invoice_payments',v_detail));
   SELECT coalesce(array_agg(id),'{}') INTO v_detail FROM public.payments WHERE invoice_id=ANY(v_inv);
   v_context := v_context || jsonb_build_object('payments',public.permanent_delete_rows('payments',v_detail));
  END IF;
  -- A contradictory representative-WO / parent-order link must never widen deletion.
  IF (v_po_graph OR p_module IN ('cutting_records','sewing_records','kancing_records','finishing_records')) AND EXISTS(
   SELECT FROM public.invoices i JOIN public.work_orders w ON w.id=i.work_order_id WHERE i.id::text=ANY(v_inv)
   AND (NOT(w.id=ANY(v_wo)) OR (i.production_order_id IS NOT NULL AND NOT(i.production_order_id=ANY(v_po))))) THEN
   v_blocked := v_blocked || '"Invoice memiliki relasi order yang bertentangan."'::jsonb;
  END IF;
  IF p_module NOT IN ('invoice_payments','payments') THEN
   v_graph := v_graph || jsonb_build_object('invoices',public.permanent_delete_rows('invoices',v_inv));
   SELECT coalesce(array_agg(id::text),'{}') INTO v_pay FROM public.invoice_payments WHERE invoice_id::text=ANY(v_inv);
   v_graph := v_graph || jsonb_build_object('invoice_payments',public.permanent_delete_rows('invoice_payments',v_pay));
   SELECT coalesce(array_agg(id),'{}') INTO v_detail FROM public.payments WHERE invoice_id=ANY(v_inv);
   v_graph := v_graph || jsonb_build_object('payments',public.permanent_delete_rows('payments',v_detail));
  ELSE
   v_pay := CASE WHEN p_module='invoice_payments' THEN v_ids ELSE '{}'::text[] END;
  END IF;
 END IF;
 IF cardinality(v_pay)>0 THEN
  SELECT coalesce(array_agg(id::text),'{}') INTO v_detail FROM public.invoice_payment_files WHERE payment_id::text=ANY(v_pay);
  v_graph := v_graph || jsonb_build_object('invoice_payment_files',public.permanent_delete_rows('invoice_payment_files',v_detail));
 END IF;
 IF v_graph ? 'complain_penalti' THEN
  SELECT coalesce(array_agg(id::text),'{}') INTO v_detail FROM public.complain_files WHERE complain_id::text=ANY(public.permanent_delete_ids(v_graph->'complain_penalti'));
  v_graph := v_graph || jsonb_build_object('complain_files',public.permanent_delete_rows('complain_files',v_detail));
 END IF;
 IF p_module='target_jahit' THEN
  SELECT coalesce(array_agg(id::text),'{}') INTO v_detail FROM public.target_jahit_detail WHERE target_jahit_id::text=ANY(v_ids);
  v_graph := v_graph || jsonb_build_object('target_jahit_detail',public.permanent_delete_rows('target_jahit_detail',v_detail));
 END IF;
 -- Master references include legacy name snapshots as well as actual FKs.
 FOR v_row IN SELECT value FROM jsonb_array_elements(v_selected) LOOP
  v_used := false;
  IF p_module='register_client' THEN
   v_norm := lower(btrim(v_row->>'nama_client'));
   v_used := EXISTS(SELECT FROM public.production_orders WHERE lower(btrim(brand))=v_norm)
    OR EXISTS(SELECT FROM public.work_orders WHERE lower(btrim(brand))=v_norm)
    OR EXISTS(SELECT FROM public.invoices WHERE lower(btrim(client_name))=v_norm OR lower(btrim(client_code))=lower(btrim(v_row->>'kode_client')))
    OR EXISTS(SELECT FROM public.master_products WHERE lower(btrim(brand))=v_norm)
    OR EXISTS(SELECT FROM public.raw_product_monitoring WHERE lower(btrim(brand))=v_norm)
    OR EXISTS(SELECT FROM public.register_harga WHERE lower(btrim(brand))=v_norm)
    OR EXISTS(SELECT FROM public.selesai_jahit WHERE lower(btrim(brand))=v_norm);
  ELSIF p_module='register_penjahit' THEN
   v_norm := lower(btrim(v_row->>'pic_penjahit'));
   v_used := EXISTS(SELECT FROM public.sewing_records WHERE lower(btrim(pic_penjahit))=v_norm)
    OR EXISTS(SELECT FROM public.kancing_records WHERE lower(btrim(pic_kancing))=v_norm)
    OR EXISTS(SELECT FROM public.finishing_records WHERE lower(btrim(pic_finishing))=v_norm)
    OR EXISTS(SELECT FROM public.planning_produksi WHERE lower(btrim(nama_penjahit))=v_norm)
    OR EXISTS(SELECT FROM public.target_jahit WHERE lower(btrim(nama))=v_norm)
    OR EXISTS(SELECT FROM public.complain_penalti WHERE lower(btrim(pic))=v_norm)
    OR EXISTS(SELECT FROM public.selesai_jahit WHERE lower(btrim(pic_penjahit))=v_norm)
    OR EXISTS(SELECT FROM public.expense_entries WHERE staff_id::text=v_row->>'id' OR lower(btrim(pic))=v_norm);
  ELSIF p_module='vendors' THEN
   v_used := EXISTS(SELECT FROM public.expense_entries WHERE vendor_id::text=v_row->>'id' OR lower(btrim(vendor_name))=lower(btrim(v_row->>'nama')));
  ELSIF p_module='expense_categories' THEN
   v_used := EXISTS(SELECT FROM public.expense_categories WHERE parent_id::text=v_row->>'id')
    OR EXISTS(SELECT FROM public.expense_entries WHERE category_id::text=v_row->>'id' OR item_id::text=v_row->>'id'
     OR CASE v_row->>'level' WHEN 'type' THEN type_name WHEN 'main' THEN main_category_name WHEN 'sub' THEN sub_category_name ELSE item_name END = v_row->>'name');
  ELSIF p_module IN ('master_products','raw_product_monitoring','master_imports') THEN
   v_norm := v_row->>'product_id';
   v_used := EXISTS(SELECT FROM public.production_orders WHERE product_id=v_norm)
    OR EXISTS(SELECT FROM public.work_orders WHERE product_id=v_norm)
    OR (p_module='master_products' AND EXISTS(SELECT FROM public.raw_product_monitoring WHERE product_id=v_norm))
    OR (p_module='master_products' AND EXISTS(SELECT FROM public.master_imports WHERE product_id=v_norm))
    OR EXISTS(SELECT FROM public.register_harga WHERE product_id=v_norm);
  END IF;
  IF v_used THEN v_blocked := v_blocked || jsonb_build_array(coalesce(v_row->>'nama_client',v_row->>'pic_penjahit',v_row->>'nama',v_row->>'name',v_row->>'product',v_row->>'id') || ': masih dipakai. Hapus transaksi/data pemakainya terlebih dahulu.'); END IF;
 END LOOP;
 IF v_po_graph THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','label',coalesce(x->>'product_note',x->>'id')) ORDER BY x->>'id'),'[]') INTO v_roots FROM jsonb_array_elements(v_graph->'production_orders') x;
  SELECT v_roots || coalesce(jsonb_agg(jsonb_build_object('id',id,'label',coalesce(nullif(work_code,''),id)) ORDER BY id),'[]') INTO v_roots FROM public.work_orders WHERE id=ANY(v_wo) AND source_order_id IS NULL;
 ELSE
  SELECT jsonb_agg(jsonb_build_object('id',x->>'id','label',coalesce(x->>'invoice_code',x->>'nama_client',x->>'pic_penjahit',x->>'nama',x->>'name',x->>'product',x->>'id')) ORDER BY x->>'id') INTO v_roots FROM jsonb_array_elements(v_selected) x;
 END IF;
 RETURN jsonb_build_object('rows',v_graph,'context',v_context,'roots',v_roots,'blocked',v_blocked,'requestedIds',to_jsonb(v_ids));
END $$;

CREATE FUNCTION public.permanent_delete_file_referenced(p_bucket text,p_path text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE p_bucket
 WHEN 'product-photos' THEN EXISTS(SELECT FROM public.production_orders WHERE product_photo_path=p_path) OR EXISTS(SELECT FROM public.production_order_variations WHERE photo_path=p_path)
 WHEN 'invoice-payment-proofs' THEN EXISTS(SELECT FROM public.invoice_payment_files WHERE file_path=p_path)
 WHEN 'complain-proofs' THEN EXISTS(SELECT FROM public.complain_files WHERE file_path=p_path)
 WHEN 'expense-proofs' THEN EXISTS(SELECT FROM public.expense_entries WHERE proof_path=p_path OR proof_payment_path=p_path)
 ELSE true END
$$;

CREATE FUNCTION public.permanent_delete_files(p_graph jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH files AS (
 SELECT 'product-photos' bucket,x->>'product_photo_path' path FROM jsonb_array_elements(coalesce(p_graph->'production_orders','[]')) x
 UNION SELECT 'product-photos',x->>'photo_path' FROM jsonb_array_elements(coalesce(p_graph->'production_order_variations','[]')) x
 UNION SELECT 'invoice-payment-proofs',x->>'file_path' FROM jsonb_array_elements(coalesce(p_graph->'invoice_payment_files','[]')) x
 UNION SELECT 'complain-proofs',x->>'file_path' FROM jsonb_array_elements(coalesce(p_graph->'complain_files','[]')) x
 UNION SELECT 'expense-proofs',x->>'proof_path' FROM jsonb_array_elements(coalesce(p_graph->'expense_entries','[]')) x
 UNION SELECT 'expense-proofs',x->>'proof_payment_path' FROM jsonb_array_elements(coalesce(p_graph->'expense_entries','[]')) x
 ), descriptors AS (
  SELECT bucket,path,'r2'::text AS backend FROM files WHERE nullif(path,'') IS NOT NULL
  UNION ALL
  SELECT bucket,path,'supabase' FROM files f WHERE nullif(path,'') IS NOT NULL
   AND EXISTS(SELECT FROM storage.objects o WHERE o.bucket_id=f.bucket AND o.name=f.path)
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'path',path,'backend',backend) ORDER BY bucket,path,backend),'[]')
 FROM descriptors
$$;

CREATE FUNCTION public.permanent_delete_preview(p_module text,p_ids text[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_graph jsonb; v_counts jsonb;
BEGIN
 IF NOT public.permanent_delete_allowed() THEN RAISE EXCEPTION 'DELETE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 v_graph := public.permanent_delete_graph(p_module,p_ids);
 SELECT jsonb_object_agg(key,jsonb_array_length(value)) INTO v_counts FROM jsonb_each(v_graph->'rows');
 RETURN jsonb_build_object('module',p_module,'requestedIds',v_graph->'requestedIds','roots',v_graph->'roots','counts',v_counts,'blocked',v_graph->'blocked','fingerprint',md5(v_graph::text));
END $$;

CREATE FUNCTION public.permanent_delete_recompute(p_wo text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 WITH progress AS (
 SELECT w.id, CASE
   WHEN coalesce((SELECT total_cutting FROM public.cutting_records WHERE work_order_id=w.id ORDER BY input_at DESC LIMIT 1),0)<=0 THEN 'NEW'
   WHEN w.quantity>0 AND public.production_order_price_is_complete(w.source_order_id)
    AND coalesce((SELECT sum(qty_selesai) FROM public.sewing_records WHERE work_order_id=w.id),0)>=w.quantity
    AND coalesce((SELECT sum(qty_kancing) FROM public.kancing_records WHERE work_order_id=w.id),0)>=w.quantity
    AND coalesce((SELECT sum(qty_finishing) FROM public.finishing_records WHERE work_order_id=w.id),0)>=w.quantity
    THEN 'FINISHED' ELSE 'PROGRESS' END AS status
 FROM public.work_orders w
 WHERE w.id=ANY(p_wo) AND NOT EXISTS(SELECT FROM public.invoices i JOIN public.work_orders representative ON representative.id=i.work_order_id WHERE i.work_order_id=w.id OR w.source_order_id=coalesce(i.production_order_id,representative.source_order_id))
 ) UPDATE public.work_orders w SET prod_status=p.status,
   invoice_status=CASE WHEN p.status='FINISHED' THEN 'WAITING_INVOICE' ELSE 'NONE' END
 FROM progress p WHERE w.id=p.id;
END $$;

CREATE FUNCTION public.permanent_delete_execute(p_module text,p_ids text[],p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_graph jsonb; v_rows jsonb; v_table text; v_ids text[]; v_counts jsonb;
 v_files jsonb; v_job uuid; v_remaining jsonb; v_wo text[] := '{}'; v_inv text[] := '{}';
 v_invoice record; v_total numeric; v_actor text;
BEGIN
 IF NOT public.permanent_delete_allowed() THEN RAISE EXCEPTION 'DELETE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Rare destructive action: bounded table-write locks guarantee text-linked
 -- dependents cannot be inserted between impact validation and commit. Reads
 -- remain available. Acquire in one deterministic order; fail instead of hanging.
 PERFORM set_config('lock_timeout','5s',true);
 LOCK TABLE public.complain_files,public.complain_penalti,public.cutting_records,
 public.daftar_libur,public.expense_categories,public.expense_entries,public.finishing_records,
 public.invoice_payment_files,public.invoice_payments,public.invoices,public.kancing_records,
 public.master_imports,public.master_products,public.payments,public.planning_produksi,
 public.production_order_price_components,public.production_order_prices,
 public.production_order_variations,public.production_orders,public.raw_product_monitoring,
 public.register_client,public.register_harga,public.register_penjahit,public.selesai_jahit,
 public.sewing_records,public.target_jahit,public.target_jahit_detail,public.vendors,
 public.work_orders IN SHARE ROW EXCLUSIVE MODE;
 v_graph := public.permanent_delete_graph(p_module,p_ids);
 IF p_fingerprint IS NULL OR md5(v_graph::text)<>p_fingerprint THEN RAISE EXCEPTION 'DELETE_PREVIEW_STALE'; END IF;
 IF jsonb_array_length(v_graph->'blocked')>0 THEN RAISE EXCEPTION 'DELETE_BLOCKED' USING DETAIL=(v_graph->'blocked')::text; END IF;
 v_rows := v_graph->'rows';
 v_files := public.permanent_delete_files(v_rows);
 -- Reconcile only surviving order groups; order deletion removes their WOs.
 IF p_module IN ('cutting_records','sewing_records','kancing_records','finishing_records') THEN
  SELECT array_agg(DISTINCT x->>'work_order_id') INTO v_wo FROM jsonb_array_elements(v_rows->p_module) x;
 ELSIF p_module IN ('invoices','invoice_payments','payments') THEN
  IF p_module='invoices' THEN v_inv := public.permanent_delete_ids(v_rows->'invoices');
  ELSIF p_module='invoice_payments' THEN SELECT array_agg(DISTINCT x->>'invoice_id') INTO v_inv FROM jsonb_array_elements(v_rows->'invoice_payments') x;
  ELSE SELECT array_agg(DISTINCT x->>'invoice_id') INTO v_inv FROM jsonb_array_elements(v_rows->'payments') x; END IF;
 END IF;
 IF v_rows ? 'invoices' THEN v_inv := public.permanent_delete_ids(v_rows->'invoices'); END IF;
 SELECT coalesce(array_agg(DISTINCT w.id),'{}') INTO v_wo FROM public.work_orders w WHERE w.id=ANY(v_wo)
  OR EXISTS(SELECT FROM public.invoices i JOIN public.work_orders representative ON representative.id=i.work_order_id WHERE i.id::text=ANY(v_inv) AND (i.work_order_id=w.id OR w.source_order_id=coalesce(i.production_order_id,representative.source_order_id)))
  OR w.source_order_id IN (SELECT source_order_id FROM public.work_orders WHERE id=ANY(v_wo) AND source_order_id IS NOT NULL);
 FOREACH v_table IN ARRAY ARRAY['invoice_payment_files','invoice_payments','payments','invoices',
  'complain_files','complain_penalti','cutting_records','sewing_records','kancing_records','finishing_records',
  'selesai_jahit','planning_produksi','target_jahit_detail','register_harga','work_orders',
  'production_order_price_components','production_order_prices','production_order_variations',
  'production_orders','target_jahit','expense_entries','daftar_libur','raw_product_monitoring',
  'master_imports','master_products','expense_categories','vendors','register_client','register_penjahit'] LOOP
  IF v_rows ? v_table THEN
   v_ids := public.permanent_delete_ids(v_rows->v_table);
   EXECUTE format('DELETE FROM public.%I WHERE id::text=ANY($1)',v_table) USING v_ids;
  END IF;
 END LOOP;
 IF p_module IN ('invoices','cutting_records','sewing_records','kancing_records','finishing_records') THEN
  PERFORM public.permanent_delete_recompute(v_wo);
 ELSIF p_module IN ('invoice_payments','payments') THEN
  FOR v_invoice IN SELECT * FROM public.invoices WHERE id::text=ANY(v_inv) LOOP
   SELECT coalesce(sum(amount),0) INTO v_total FROM public.invoice_payments WHERE invoice_id=v_invoice.id;
   v_total := v_total + coalesce((SELECT sum(amount) FROM public.payments WHERE invoice_id=v_invoice.id::text),0);
   UPDATE public.invoices SET finance_validation=CASE WHEN v_total>=total_amount THEN 'Paid' WHEN v_total>0 THEN 'Partial Paid' ELSE 'Collect Payment' END,updated_at=now() WHERE id=v_invoice.id;
   UPDATE public.work_orders SET invoice_status=CASE WHEN v_total>=v_invoice.total_amount THEN 'PAID' WHEN v_total>0 THEN 'PARTIAL_PAID' ELSE 'INVOICED' END,prod_status='INVOICED'
    WHERE id=v_invoice.work_order_id OR source_order_id=coalesce(v_invoice.production_order_id,(SELECT source_order_id FROM public.work_orders WHERE id=v_invoice.work_order_id));
  END LOOP;
 END IF;
 INSERT INTO public.deleted_business_references(kind,value)
 SELECT 'order_id',x->>'id' FROM jsonb_array_elements(coalesce(v_rows->'production_orders','[]')) x
 UNION SELECT 'production_code',x->>'product_note' FROM jsonb_array_elements(coalesce(v_rows->'production_orders','[]')) x WHERE nullif(x->>'product_note','') IS NOT NULL
 UNION SELECT 'work_code',x->>'work_code' FROM jsonb_array_elements(coalesce(v_rows->'work_orders','[]')) x WHERE nullif(x->>'work_code','') IS NOT NULL
 UNION SELECT 'invoice_order',coalesce(x->>'production_order_id',w->>'source_order_id') FROM jsonb_array_elements(coalesce(v_rows->'invoices','[]')) x LEFT JOIN jsonb_array_elements(coalesce(v_graph->'context'->'work_orders','[]')) w ON w->>'id'=x->>'work_order_id' WHERE coalesce(x->>'production_order_id',w->>'source_order_id') IS NOT NULL
 UNION SELECT 'invoice_code',x->>'invoice_code' FROM jsonb_array_elements(coalesce(v_rows->'invoices','[]')) x WHERE nullif(x->>'invoice_code','') IS NOT NULL
 UNION SELECT 'client',lower(btrim(x->>'nama_client')) FROM jsonb_array_elements(coalesce(v_rows->'register_client','[]')) x
 UNION SELECT 'staff',lower(btrim(x->>'pic_penjahit')) FROM jsonb_array_elements(coalesce(v_rows->'register_penjahit','[]')) x
 UNION SELECT 'product_id',x->>'product_id' FROM jsonb_array_elements(coalesce(v_rows->'master_products','[]')) x WHERE nullif(x->>'product_id','') IS NOT NULL
 ON CONFLICT(kind,value) DO UPDATE SET deleted_at=now();
 -- Keep only orphaned media; shared paths on surviving records never become jobs.
 SELECT coalesce(jsonb_agg(f),'[]') INTO v_remaining FROM jsonb_array_elements(v_files) f
  WHERE NOT public.permanent_delete_file_referenced(f->>'bucket',f->>'path');
 IF jsonb_array_length(v_remaining)>0 THEN
  INSERT INTO public.deletion_cleanup_jobs(created_by,remaining_files,original_files) VALUES(auth.uid(),v_remaining,v_remaining) RETURNING id INTO v_job;
 END IF;
 SELECT jsonb_object_agg(key,jsonb_array_length(value)) INTO v_counts FROM jsonb_each(v_rows);
 SELECT display_name INTO v_actor FROM public.profiles WHERE id=auth.uid();
 INSERT INTO public.audit_logs(phase,record_id,field,old_value,new_value,changed_by,reason)
 VALUES('permanent_delete',p_module,'deleted_ids',(v_graph->'requestedIds')::text,v_counts::text,v_actor,'Hapus permanen dikonfirmasi; actor='||auth.uid()::text);
 RETURN jsonb_build_object('deletedIds',v_graph->'requestedIds','counts',v_counts,'cleanupJobIds',CASE WHEN v_job IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_job) END,'cleanupPending',CASE WHEN v_job IS NULL THEN 0 ELSE 1 END);
END $$;

CREATE FUNCTION public.permanent_delete_pending_cleanup()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_jobs jsonb;
BEGIN
 IF NOT public.permanent_delete_allowed() THEN RAISE EXCEPTION 'DELETE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'remaining',jsonb_array_length(remaining_files),'lastError',last_error) ORDER BY created_at),'[]') INTO v_jobs
 FROM public.deletion_cleanup_jobs WHERE completed_at IS NULL;
 RETURN v_jobs;
END $$;

CREATE FUNCTION public.permanent_delete_claim_cleanup(p_job_ids uuid[],p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_job record; v_result jsonb := '[]'; v_token uuid; v_files jsonb;
BEGIN
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=p_user_id AND role IN ('owner','finance')) THEN RAISE EXCEPTION 'DELETE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_job_ids IS NULL OR cardinality(p_job_ids) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'CLEANUP_INVALID_SELECTION'; END IF;
 IF EXISTS(SELECT FROM unnest(p_job_ids) x WHERE NOT EXISTS(SELECT FROM public.deletion_cleanup_jobs j WHERE j.id=x)) THEN RAISE EXCEPTION 'CLEANUP_NOT_FOUND'; END IF;
 FOR v_job IN SELECT * FROM public.deletion_cleanup_jobs WHERE id=ANY(p_job_ids) ORDER BY id FOR UPDATE LOOP
  IF v_job.lease_until>now() THEN RAISE EXCEPTION 'CLEANUP_BUSY'; END IF;
  SELECT coalesce(jsonb_agg(f),'[]') INTO v_files FROM jsonb_array_elements(v_job.remaining_files) f WHERE NOT public.permanent_delete_file_referenced(f->>'bucket',f->>'path');
  v_token := gen_random_uuid();
  UPDATE public.deletion_cleanup_jobs SET remaining_files=v_files,lease_token=v_token,lease_until=now()+interval '10 minutes' WHERE id=v_job.id;
  v_result := v_result || jsonb_build_array(jsonb_build_object('id',v_job.id,'leaseToken',v_token,'files',v_files));
 END LOOP;
 RETURN v_result;
END $$;

CREATE FUNCTION public.permanent_delete_ack_cleanup(p_job_id uuid,p_lease_token uuid,p_deleted_files jsonb,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_job record; v_remaining jsonb;
BEGIN
 SELECT * INTO v_job FROM public.deletion_cleanup_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND OR v_job.lease_token IS DISTINCT FROM p_lease_token OR p_lease_token IS NULL OR v_job.lease_until IS NULL OR v_job.lease_until<=now() THEN RETURN false; END IF;
 IF p_deleted_files IS NULL OR jsonb_typeof(p_deleted_files)<>'array' THEN RAISE EXCEPTION 'CLEANUP_INVALID_MANIFEST'; END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(p_deleted_files) f WHERE NOT(v_job.remaining_files @> jsonb_build_array(f))) THEN RAISE EXCEPTION 'CLEANUP_INVALID_MANIFEST'; END IF;
 SELECT coalesce(jsonb_agg(f),'[]') INTO v_remaining FROM jsonb_array_elements(v_job.remaining_files) f WHERE NOT(p_deleted_files @> jsonb_build_array(f));
 UPDATE public.deletion_cleanup_jobs SET remaining_files=v_remaining,last_error=left(p_error,500),lease_token=NULL,lease_until=NULL,completed_at=CASE WHEN jsonb_array_length(v_remaining)=0 THEN now() ELSE NULL END WHERE id=p_job_id;
 RETURN true;
END $$;

-- Generic edit/failed-upload compensation may only delete unreferenced media.
-- Pending committed-delete jobs must go through /cleanup, never arbitrary paths.
CREATE FUNCTION public.permanent_delete_authorize_media(p_user_id uuid,p_bucket text,p_paths text[])
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role text; v_path text; v_manifest jsonb;
BEGIN
 -- Retire keys atomically before external deletion; an authorization-only read
 -- would allow a racing editor to reattach a key just before the Worker deletes it.
 PERFORM set_config('lock_timeout','5s',true);
 LOCK TABLE public.complain_files,public.complain_penalti,public.expense_entries,
 public.invoice_payment_files,public.invoice_payments,public.production_order_variations,
 public.production_orders IN SHARE ROW EXCLUSIVE MODE;
 SELECT role INTO v_role FROM public.profiles WHERE id=p_user_id;
 IF v_role IS NULL OR p_paths IS NULL OR cardinality(p_paths) NOT BETWEEN 1 AND 50 THEN RETURN false; END IF;
 IF NOT(v_role IN ('owner','finance') OR (v_role='inventory' AND p_bucket='product-photos')) THEN RETURN false; END IF;
 FOREACH v_path IN ARRAY p_paths LOOP
  IF nullif(v_path,'') IS NULL OR public.permanent_delete_file_referenced(p_bucket,v_path)
   OR EXISTS(SELECT FROM public.deletion_cleanup_jobs j,jsonb_array_elements(j.remaining_files) f WHERE f->>'bucket'=p_bucket AND f->>'path'=v_path) THEN RETURN false; END IF;
  IF p_bucket='product-photos' THEN
   IF NOT EXISTS(SELECT FROM public.production_orders WHERE id=split_part(v_path,'/',1)) THEN RETURN false; END IF;
  ELSIF p_bucket='invoice-payment-proofs' THEN
   IF NOT EXISTS(SELECT FROM public.invoice_payments WHERE invoice_id::text=split_part(v_path,'/',1) AND id::text=split_part(v_path,'/',2)) THEN RETURN false; END IF;
  ELSIF p_bucket='complain-proofs' THEN
   IF NOT EXISTS(SELECT FROM public.complain_penalti WHERE 'complain-'||id::text=split_part(v_path,'/',1)) THEN RETURN false; END IF;
  ELSIF p_bucket='expense-proofs' THEN
   IF NOT EXISTS(SELECT FROM public.expense_entries WHERE 'expense-'||id::text=split_part(v_path,'/',1)) THEN RETURN false; END IF;
  ELSE RETURN false;
  END IF;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('bucket',p_bucket,'path',path,'backend','r2') ORDER BY path)
 INTO v_manifest FROM (SELECT DISTINCT unnest(p_paths) AS path) keys;
 INSERT INTO public.deletion_cleanup_jobs(created_by,remaining_files,original_files)
 VALUES(p_user_id,v_manifest,v_manifest);
 -- The ordinary route attempts deletion immediately; its durable job remains
 -- retryable until the normal cleanup route acknowledges the same exact keys.
 RETURN true;
END $$;

-- Single-proof edits use the same transaction/outbox primitive. No caller can
-- supply a file path or a cleanup manifest.
CREATE FUNCTION public.permanent_delete_attachment(p_module text,p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_preview jsonb;
BEGIN
 IF p_module IS NULL OR p_module NOT IN ('invoice_payment_files','complain_files') THEN RAISE EXCEPTION 'DELETE_INVALID_MODULE'; END IF;
 v_preview := public.permanent_delete_preview(p_module,ARRAY[p_id]);
 RETURN public.permanent_delete_execute(p_module,ARRAY[p_id],v_preview->>'fingerprint');
END $$;

-- Invoice codes currently derive their sequence from existing rows. Retaining
-- deleted codes avoids resetting that high-water mark when test invoices go away.
CREATE FUNCTION public.permanent_delete_invoice_sequence()
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_max integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(max(substring(code FROM '/([0-9]+)$')::integer),0) INTO v_max FROM (
  SELECT invoice_code AS code FROM public.invoices
  UNION ALL SELECT value FROM public.deleted_business_references WHERE kind='invoice_code'
 ) codes;
 RETURN v_max;
END $$;

-- Remember removed identities so delayed multi-request writers cannot recreate
-- text-linked dependents after the deletion transaction has committed.
CREATE TABLE public.deleted_business_references (
 kind text NOT NULL, value text NOT NULL, deleted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,value)
);
ALTER TABLE public.deleted_business_references ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_business_references FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.permanent_delete_writer_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb := to_jsonb(NEW); v text; k text; w record; v_po text;
BEGIN
 FOR k,v IN SELECT * FROM (VALUES
  ('production_code',r->>'product_note'),('production_code',r->>'production_code'),
  ('work_code',r->>'work_code'),('order_id',r->>'production_order_id'),('order_id',r->>'source_order_id'),
  ('order_id',CASE WHEN TG_TABLE_NAME='production_orders' THEN r->>'id' END),
  ('client',lower(btrim(r->>'brand'))),('client',lower(btrim(r->>'client_name'))),
  ('staff',lower(btrim(r->>'pic_penjahit'))),('staff',lower(btrim(r->>'pic_kancing'))),
  ('staff',lower(btrim(r->>'pic_finishing'))),('staff',lower(btrim(r->>'nama_penjahit'))),
  ('staff',CASE WHEN TG_TABLE_NAME='target_jahit' THEN lower(btrim(r->>'nama')) WHEN TG_TABLE_NAME IN ('expense_entries','complain_penalti') THEN lower(btrim(r->>'pic')) END),
  ('product_id',r->>'product_id')) vals(kind,value)
 LOOP
  IF nullif(v,'') IS NOT NULL AND EXISTS(SELECT FROM public.deleted_business_references WHERE kind=k AND value=v) THEN
   RAISE EXCEPTION 'DELETE_STALE_REFERENCE' USING DETAIL=k;
  END IF;
 END LOOP;
 IF TG_TABLE_NAME='invoices' THEN
  SELECT source_order_id INTO v_po FROM public.work_orders WHERE id=NEW.work_order_id;
  IF (TG_OP='INSERT' AND v_po IS NULL) OR (NEW.production_order_id IS NOT NULL AND NEW.production_order_id IS DISTINCT FROM v_po) THEN RAISE EXCEPTION 'INVOICE_ORDER_MISMATCH'; END IF;
  IF TG_OP='INSERT' AND NEW.auto_created AND EXISTS(SELECT FROM public.deleted_business_references WHERE kind='invoice_order' AND value=v_po) THEN RAISE EXCEPTION 'INVOICE_PROGRESS_CHANGED'; END IF;
  -- Recheck physical completion, not a stale browser's FINISHED snapshot.
  IF TG_OP='INSERT' AND NEW.auto_created AND EXISTS(SELECT FROM public.work_orders wo WHERE wo.source_order_id=v_po AND (
    wo.quantity<=0 OR coalesce((SELECT total_cutting FROM public.cutting_records WHERE work_order_id=wo.id ORDER BY input_at DESC LIMIT 1),0)<=0
    OR coalesce((SELECT sum(qty_selesai) FROM public.sewing_records WHERE work_order_id=wo.id),0)<wo.quantity
    OR coalesce((SELECT sum(qty_kancing) FROM public.kancing_records WHERE work_order_id=wo.id),0)<wo.quantity
    OR coalesce((SELECT sum(qty_finishing) FROM public.finishing_records WHERE work_order_id=wo.id),0)<wo.quantity
  )) THEN RAISE EXCEPTION 'INVOICE_PROGRESS_CHANGED'; END IF;
 ELSIF TG_TABLE_NAME='work_orders' AND TG_OP='UPDATE' THEN
  IF NEW.prod_status='INVOICED' AND NOT EXISTS(SELECT FROM public.invoices i JOIN public.work_orders representative ON representative.id=i.work_order_id WHERE i.work_order_id=NEW.id OR NEW.source_order_id=coalesce(i.production_order_id,representative.source_order_id)) THEN RAISE EXCEPTION 'INVOICE_PROGRESS_CHANGED'; END IF;
  IF NEW.prod_status='FINISHED' AND OLD.prod_status IS DISTINCT FROM NEW.prod_status AND (
    NEW.quantity<=0 OR coalesce((SELECT total_cutting FROM public.cutting_records WHERE work_order_id=NEW.id ORDER BY input_at DESC LIMIT 1),0)<=0
    OR coalesce((SELECT sum(qty_selesai) FROM public.sewing_records WHERE work_order_id=NEW.id),0)<NEW.quantity
    OR coalesce((SELECT sum(qty_kancing) FROM public.kancing_records WHERE work_order_id=NEW.id),0)<NEW.quantity
    OR coalesce((SELECT sum(qty_finishing) FROM public.finishing_records WHERE work_order_id=NEW.id),0)<NEW.quantity
   ) THEN RAISE EXCEPTION 'PRODUCTION_PROGRESS_CHANGED'; END IF;
 ELSIF TG_TABLE_NAME IN ('cutting_records','sewing_records','kancing_records','finishing_records') AND TG_OP='INSERT' THEN
  DELETE FROM public.deleted_business_references WHERE kind='invoice_order' AND value=(SELECT source_order_id FROM public.work_orders WHERE id=r->>'work_order_id');
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['production_orders','work_orders','cutting_records','sewing_records','kancing_records','finishing_records','invoices','planning_produksi','target_jahit_detail','target_jahit','complain_penalti','selesai_jahit','register_harga','raw_product_monitoring','master_imports','expense_entries'] LOOP
  EXECUTE format('CREATE TRIGGER permanent_delete_writer_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.permanent_delete_writer_guard()',t);
 END LOOP;
END $$;

-- Re-registering a deleted master deliberately restores its name/code. This
-- keeps normal create/edit behavior while rejecting stale dangling writers.
CREATE FUNCTION public.permanent_delete_restore_master()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb := to_jsonb(NEW); k text; v text;
BEGIN
 k := CASE TG_TABLE_NAME WHEN 'register_client' THEN 'client' WHEN 'register_penjahit' THEN 'staff' ELSE 'product_id' END;
 v := CASE TG_TABLE_NAME WHEN 'register_client' THEN lower(btrim(r->>'nama_client')) WHEN 'register_penjahit' THEN lower(btrim(r->>'pic_penjahit')) ELSE r->>'product_id' END;
 DELETE FROM public.deleted_business_references WHERE kind=k AND value=v;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['register_client','register_penjahit','master_products'] LOOP
  EXECUTE format('CREATE TRIGGER permanent_delete_restore_master AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.permanent_delete_restore_master()',t);
 END LOOP;
END $$;

-- Media keys in a committed cleanup job cannot be attached again, including
-- during an external delete lease; uploaders must create a fresh unique key.
CREATE FUNCTION public.permanent_delete_media_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb := to_jsonb(NEW); b text; p text;
BEGIN
 b := CASE TG_TABLE_NAME WHEN 'production_orders' THEN 'product-photos' WHEN 'production_order_variations' THEN 'product-photos' WHEN 'invoice_payment_files' THEN 'invoice-payment-proofs' WHEN 'complain_files' THEN 'complain-proofs' ELSE 'expense-proofs' END;
 FOR p IN SELECT value FROM jsonb_each_text(r) WHERE key IN ('product_photo_path','photo_path','file_path','proof_path','proof_payment_path') LOOP
  IF nullif(p,'') IS NOT NULL AND EXISTS(SELECT FROM public.deletion_cleanup_jobs j,jsonb_array_elements(j.original_files) f WHERE f->>'bucket'=b AND f->>'path'=p) THEN RAISE EXCEPTION 'DELETE_MEDIA_KEY_RETIRED'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['production_orders','production_order_variations','invoice_payment_files','complain_files','expense_entries'] LOOP
  EXECUTE format('CREATE TRIGGER permanent_delete_media_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.permanent_delete_media_guard()',t);
 END LOOP;
END $$;

-- Destructive graph tables can only be deleted through the above transactions.
-- Preserve old SELECT/INSERT/UPDATE policy expressions when splitting ALL.
DO $$
DECLARE p record; v_roles text; v_cmd text; v_suffix text; v_table text;
BEGIN
 FOR p IN SELECT * FROM pg_policies WHERE schemaname='public' AND (tablename=ANY(public.permanent_delete_modules()) OR tablename IN ('invoice_payment_files','complain_files','production_order_variations','production_order_prices','production_order_price_components')) AND cmd IN ('ALL','DELETE') LOOP
  SELECT string_agg(CASE WHEN x='public' THEN 'PUBLIC' ELSE quote_ident(x) END,',') INTO v_roles FROM unnest(p.roles) x;
  EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
  IF p.cmd='ALL' THEN
   EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO %s USING (%s)',left(p.policyname,48)||'_keep_select',p.tablename,v_roles,coalesce(p.qual,'true'));
   EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO %s WITH CHECK (%s)',left(p.policyname,48)||'_keep_insert',p.tablename,v_roles,coalesce(p.with_check,p.qual,'true'));
   EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO %s USING (%s) WITH CHECK (%s)',left(p.policyname,48)||'_keep_update',p.tablename,v_roles,coalesce(p.qual,'true'),coalesce(p.with_check,p.qual,'true'));
  END IF;
 END LOOP;
 FOREACH v_table IN ARRAY public.permanent_delete_modules() || ARRAY['invoice_payment_files','complain_files','production_order_variations','production_order_prices','production_order_price_components'] LOOP
  EXECUTE format('REVOKE DELETE, TRUNCATE ON public.%I FROM PUBLIC,anon,authenticated',v_table);
 END LOOP;
 REVOKE DELETE,TRUNCATE ON public.audit_logs,public.profiles,public.production_code_sequence FROM PUBLIC,anon,authenticated;
END $$;

-- Storage mutation is server-mediated. Uploads remain unchanged; cleanup uses
-- the service-role Storage API, not client DELETE or SQL storage-row deletion.
DROP POLICY "Authenticated delete complain proofs" ON storage.objects;
DROP POLICY "Authenticated delete invoice payment proofs" ON storage.objects;
DROP POLICY "Authenticated delete product photos" ON storage.objects;
DROP POLICY "Authenticated delete expense proofs" ON storage.objects;

-- Internal helpers are not public RPCs. Worker-only functions use its server key.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT proc.oid::regprocedure sig FROM pg_proc proc JOIN pg_namespace n ON n.oid=proc.pronamespace WHERE n.nspname='public' AND proc.proname LIKE 'permanent_delete_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',p.sig);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.permanent_delete_allowed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanent_delete_invoice_sequence() TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanent_delete_preview(text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanent_delete_execute(text,text[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanent_delete_pending_cleanup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanent_delete_attachment(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanent_delete_claim_cleanup(uuid[],uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.permanent_delete_ack_cleanup(uuid,uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.permanent_delete_authorize_media(uuid,text,text[]) TO service_role;
