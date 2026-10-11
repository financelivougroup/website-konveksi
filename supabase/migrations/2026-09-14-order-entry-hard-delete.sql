-- ===== Hapus permanen production order beserta turunannya =====
--
-- Dipakai halaman Order Entry selama masa testing, supaya order yang salah
-- input bisa dibuang sungguhan — bukan sekadar ditandai CANCELLED.
--
-- Membutuhkan RPC (bukan delete langsung dari klien) karena penghapusan ini
-- menyentuh beberapa tabel dan harus memeriksa invoice lebih dulu. Tanpa
-- pemeriksaan itu, invoice akan memblokir di tengah jalan setelah log
-- produksi terlanjur terhapus — persis pola kerusakan yang sebelumnya terjadi
-- pada tombol hapus Work Order di Production Monitoring.
--
-- Turunan yang ikut terhapus (terverifikasi dari migrasi repo ini):
--   production_order_variations      ON DELETE CASCADE
--   production_order_prices          ON DELETE CASCADE
--   production_order_price_components ON DELETE CASCADE (lewat prices)
--   register_harga                   ON DELETE CASCADE
--   cutting_records                  TIDAK ber-FK  -> dihapus eksplisit
--   sewing_records                   TIDAK ber-FK  -> dihapus eksplisit
--   finishing_records                ON DELETE CASCADE (dihapus eksplisit juga)
--   kancing_records                  ON DELETE CASCADE (dihapus eksplisit juga)
--   invoices                         ON DELETE RESTRICT -> MEMBLOKIR, lihat di bawah
--
-- invoice_payment_files sudah CASCADE ke invoice_payments, jadi tidak disebut.

CREATE OR REPLACE FUNCTION public.delete_production_orders(
  p_production_order_ids text[],
  p_actor text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- ==========================================================================
  -- PENANDA MODE TESTING
  --   true  = hapus permanen diizinkan (dipakai saat testing)
  --   false = hapus permanen DITOLAK dengan pesan jelas
  --
  -- Ubah kembali ke false sebelum deployment, atau hapus fungsi ini beserta
  -- tombolnya di Order Entry. Hapus permanen pada data produksi nyata tidak
  -- bisa dikembalikan: tidak ada backup dan tidak ada undo di UI.
  -- ==========================================================================
  c_allow_hard_delete CONSTANT boolean := true;

  v_id text;
  v_po public.production_orders%ROWTYPE;
  v_wo_ids text[];
  v_invoice_code text;
  v_deleted integer := 0;
  v_skipped jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL AND session_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF NOT c_allow_hard_delete THEN
    RAISE EXCEPTION USING ERRCODE = '0A000',
      MESSAGE = 'Hapus permanen order sedang dinonaktifkan (mode deployment).';
  END IF;

  IF p_production_order_ids IS NULL OR array_length(p_production_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0, 'skipped', v_skipped);
  END IF;

  FOREACH v_id IN ARRAY p_production_order_ids
  LOOP
    SELECT * INTO v_po
    FROM public.production_orders
    WHERE id = v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'Order tidak ditemukan');
      CONTINUE;
    END IF;

    SELECT array_agg(wo.id) INTO v_wo_ids
    FROM public.work_orders wo
    WHERE wo.source_order_id = v_po.id;

    IF v_wo_ids IS NOT NULL THEN
      -- Invoice diperiksa SEBELUM apa pun dihapus. Data tagihan tidak boleh
      -- hilang sebagai efek samping penghapusan order; user diarahkan
      -- membatalkannya sendiri di halaman Invoicing.
      SELECT i.invoice_code INTO v_invoice_code
      FROM public.invoices i
      WHERE i.work_order_id = ANY(v_wo_ids)
      LIMIT 1;

      IF v_invoice_code IS NOT NULL THEN
        v_skipped := v_skipped || jsonb_build_object(
          'id', v_po.id,
          'productionCode', v_po.product_note,
          'reason', format(
            'Work order-nya sudah ditagihkan (%s). Hapus invoice-nya dulu di halaman Invoicing.',
            v_invoice_code
          )
        );
        CONTINUE;
      END IF;

      -- Log produksi dibersihkan lebih dulu, lalu work order-nya. cutting dan
      -- sewing tidak punya FK, jadi keduanya wajib eksplisit di sini.
      DELETE FROM public.cutting_records   WHERE work_order_id = ANY(v_wo_ids);
      DELETE FROM public.sewing_records    WHERE work_order_id = ANY(v_wo_ids);
      DELETE FROM public.finishing_records WHERE work_order_id = ANY(v_wo_ids);
      DELETE FROM public.kancing_records   WHERE work_order_id = ANY(v_wo_ids);
      DELETE FROM public.work_orders       WHERE id = ANY(v_wo_ids);
    END IF;

    -- audit_logs tidak didefinisikan di migrasi repo ini (dibuat langsung di
    -- database), jadi kegagalan di sini tidak boleh membatalkan penghapusan
    -- yang sudah terjadi. Daftar kolomnya mengikuti yang sudah terbukti
    -- dipakai cancel_production_orders. Verifikasi lewat Supabase MCP masih
    -- tertunda; setelah terverifikasi, blok penjaga ini bisa dihapus.
    BEGIN
      INSERT INTO public.audit_logs (phase, record_id, field, old_value, new_value, changed_by, reason)
      VALUES (
        'order_entry',
        v_po.id,
        'deleted',
        coalesce(v_po.product_note, '') || ' / ' || coalesce(v_po.status, ''),
        NULL,
        btrim(p_actor),
        'Hapus permanen dari Order Entry (mode testing)'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    DELETE FROM public.production_orders WHERE id = v_po.id;

    v_deleted := v_deleted + 1;
  END LOOP;

  RETURN jsonb_build_object('deleted', v_deleted, 'skipped', v_skipped);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_production_orders(text[], text) TO authenticated;
