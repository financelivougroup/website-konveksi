-- =============================================================================
-- Utang Staff & Benefit: terbuka untuk semua akun, tetapi hanya baris sendiri
-- =============================================================================
-- Permintaan user (verbatim): *"semua penjahit bisa akses Utang Staf dan
-- Benefit (jangan di lock). tapi mereka cuma bisa liat nama mereka sendiri
-- (berdasarkan akun login). tapi kalau finance dan owner ya bisa liat semua
-- fitur. gak ada yang di lock."*
--
-- Sebelumnya `staff_settlement_read` menolak SEMUA akun selain owner/finance
-- dengan `SETTLEMENT_FORBIDDEN`, sehingga tab Utang Staf & Benefit tampil
-- terkunci. Sekarang:
--
--   * owner / finance  → seluruh staf (perilaku lama, tidak berubah);
--   * akun lain        → HANYA baris `register_penjahit` miliknya sendiri,
--                        dipetakan lewat `profiles.orang_id`.
--
-- `profiles.orang_id` adalah penghubung yang sudah dipakai KPI
-- (`kpi_can_view_orang`, 2026-10-19-kpi-produksi-fase1.sql). JANGAN mencocokkan
-- `display_name` ke `pic_penjahit` seperti `my_staff_id()` lama — nama bisa
-- berubah dan dua orang bisa bernama sama.
--
-- Akun yang belum terhubung ke data karyawan (mis. inventory) menerima `[]`,
-- bukan error: mereka tetap bisa membuka tab, isinya kosong. Itu sengaja —
-- "jangan di lock" berarti jangan ada tombol mati, bukan berarti membocorkan
-- baris orang lain.
--
-- Yang TIDAK berubah:
--   * `staff_benefit_pay` dan `staff_benefit_void` tetap khusus owner/finance.
--     Akun staff hanya melihat; tombol bayar/batalkan tidak dirender dan RPC-nya
--     tetap menolak.
--   * Rumus saldo, cutoff, dan fingerprint tidak disentuh sama sekali.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.staff_settlement_read(p_staff integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
  v_scope integer;
  v_all boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_all := public.is_owner() OR public.is_finance();

  IF v_all THEN
    -- owner/finance: `p_staff` hanya mempersempit, seperti versi sebelumnya.
    v_scope := p_staff;
  ELSE
    SELECT p.orang_id INTO v_scope
    FROM public.profiles p
    WHERE p.id = auth.uid();

    -- Akun tanpa data karyawan: tab tetap terbuka, isinya kosong.
    IF v_scope IS NULL THEN
      RETURN '[]'::jsonb;
    END IF;

    -- Meminta staf lain lewat parameter ditolak tegas, bukan diam-diam
    -- dikosongkan — supaya pemanggil yang salah tidak mengira datanya nol.
    IF p_staff IS NOT NULL AND p_staff <> v_scope THEN
      RAISE EXCEPTION 'SETTLEMENT_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(public.staff_settlement_person(r.id, current_date) ORDER BY r.id), '[]')
  INTO result
  FROM public.register_penjahit r
  WHERE (v_scope IS NULL OR r.id = v_scope)
    AND (
      lower(coalesce(r.posisi, '')) = 'penjahit'
      OR EXISTS (SELECT 1 FROM public.target_jahit t WHERE t.nama = r.pic_penjahit)
      OR EXISTS (SELECT 1 FROM public.staff_benefit_payments b WHERE b.staff_id = r.id)
    );

  RETURN result;
END
$function$;

COMMENT ON FUNCTION public.staff_settlement_read(integer) IS
  'Saldo Utang Staff & Benefit. Owner/finance: seluruh staf. Akun lain: hanya baris dengan register_penjahit.id = profiles.orang_id miliknya; akun tanpa orang_id menerima array kosong. Pembayaran tetap khusus owner/finance.';