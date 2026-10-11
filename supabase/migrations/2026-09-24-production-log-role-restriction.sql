-- supabase/migrations/2026-09-24-production-log-role-restriction.sql
--
-- Tujuan: membatasi **ubah dan hapus** baris log produksi (Sewing / Kancing /
-- Finishing) hanya untuk role `owner` dan `finance`. Role lain (`inventory`)
-- tetap boleh membaca dan membuat entri baru, tetapi tidak boleh mengubah atau
-- menghapusnya.
--
-- Permintaan user (verbatim):
--   "tolong buat settingan kalau khusus role finance dan owner bisa delete/edit
--    row di bagian sewing, kancing, finishing. selain role tsb hanya bisa read
--    dan input di awal aja."
--
-- Diterapkan via Supabase MCP (migration record: production_log_role_restriction).

-- ============================================================================
-- Latar belakang: kenapa policy, bukan hanya tombol di UI
-- ============================================================================
-- Sebelum migrasi ini, ketiga tabel memberi UPDATE dan DELETE kepada `anon`
-- DAN `authenticated` dengan policy `using (true)`:
--
--   "Allow anon all on <table>"          [ALL, anon,          using true, check true]
--   "Allow authenticated all on <table>" [ALL, authenticated, using true, check true]
--   "Allow read for all"                 [SELECT, public,     using true]
--
-- Artinya SETIAP pengguna yang login sudah bisa mengubah/menghapus catatan log
-- langsung lewat API, walaupun UI-nya tidak menyediakan tombolnya. Menyembunyikan
-- tombol saja karena itu kosmetik: aturannya harus ditegakkan di database.
--
-- Policy `ALL` lama harus DIBUANG, bukan ditimpa. Policy bersifat OR — kalau
-- `using (true)` masih ada, policy baru yang lebih ketat tidak akan berpengaruh
-- sama sekali.

-- ============================================================================
-- 1. Satu fungsi penentu hak ubah/hapus log produksi
-- ============================================================================
-- SECURITY DEFINER supaya pembacaan `public.profiles` tidak bergantung pada
-- policy tabel itu sendiri. Tanpa ini, perubahan policy `profiles` di kemudian
-- hari bisa diam-diam melumpuhkan aturan ini (dan sebaliknya).
--
-- `STABLE`, bukan `VOLATILE`: isinya hanya membaca, dan STABLE membuat Postgres
-- dapat mengevaluasinya sekali per query, bukan sekali per baris.
--
-- Cerminan di sisi aplikasi: `src/lib/permissions.ts` (`canEditProductionLog`).
-- Keduanya harus diubah bersamaan — lihat komentar di berkas itu.
CREATE OR REPLACE FUNCTION public.can_edit_production_log()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'finance')
  )
$function$;

COMMENT ON FUNCTION public.can_edit_production_log() IS
  'True bila pengguna yang login berperan owner atau finance. Cerminan src/lib/permissions.ts; dipakai policy RLS sewing_records / kancing_records / finishing_records.';

-- ============================================================================
-- 2. sewing_records
-- ============================================================================
ALTER TABLE public.sewing_records ENABLE ROW LEVEL SECURITY;

-- Buang policy ALL yang membuka segalanya. Keduanya HARUS hilang; selama masih
-- ada, policy ketat di bawah tidak akan pernah berlaku.
DROP POLICY IF EXISTS "Allow anon all on sewing_records" ON public.sewing_records;
DROP POLICY IF EXISTS "Allow authenticated all on sewing_records" ON public.sewing_records;

DROP POLICY IF EXISTS "Authenticated sewing insert" ON public.sewing_records;
CREATE POLICY "Authenticated sewing insert"
  ON public.sewing_records FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Owner finance sewing update" ON public.sewing_records;
CREATE POLICY "Owner finance sewing update"
  ON public.sewing_records FOR UPDATE
  TO authenticated
  USING (public.can_edit_production_log())
  WITH CHECK (public.can_edit_production_log());

DROP POLICY IF EXISTS "Owner finance sewing delete" ON public.sewing_records;
CREATE POLICY "Owner finance sewing delete"
  ON public.sewing_records FOR DELETE
  TO authenticated
  USING (public.can_edit_production_log());

-- ============================================================================
-- 3. kancing_records
-- ============================================================================
ALTER TABLE public.kancing_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all on kancing_records" ON public.kancing_records;
DROP POLICY IF EXISTS "Allow authenticated all on kancing_records" ON public.kancing_records;

DROP POLICY IF EXISTS "Authenticated kancing insert" ON public.kancing_records;
CREATE POLICY "Authenticated kancing insert"
  ON public.kancing_records FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Owner finance kancing update" ON public.kancing_records;
CREATE POLICY "Owner finance kancing update"
  ON public.kancing_records FOR UPDATE
  TO authenticated
  USING (public.can_edit_production_log())
  WITH CHECK (public.can_edit_production_log());

DROP POLICY IF EXISTS "Owner finance kancing delete" ON public.kancing_records;
CREATE POLICY "Owner finance kancing delete"
  ON public.kancing_records FOR DELETE
  TO authenticated
  USING (public.can_edit_production_log());

-- ============================================================================
-- 4. finishing_records
-- ============================================================================
ALTER TABLE public.finishing_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all on finishing_records" ON public.finishing_records;
DROP POLICY IF EXISTS "Allow authenticated all on finishing_records" ON public.finishing_records;

DROP POLICY IF EXISTS "Authenticated finishing insert" ON public.finishing_records;
CREATE POLICY "Authenticated finishing insert"
  ON public.finishing_records FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Owner finance finishing update" ON public.finishing_records;
CREATE POLICY "Owner finance finishing update"
  ON public.finishing_records FOR UPDATE
  TO authenticated
  USING (public.can_edit_production_log())
  WITH CHECK (public.can_edit_production_log());

DROP POLICY IF EXISTS "Owner finance finishing delete" ON public.finishing_records;
CREATE POLICY "Owner finance finishing delete"
  ON public.finishing_records FOR DELETE
  TO authenticated
  USING (public.can_edit_production_log());

-- ============================================================================
-- 5. Hak tabel (GRANT)
-- ============================================================================
-- Policy "Allow read for all" (TO public, SELECT) sengaja DIBIARKAN apa adanya:
-- itulah jalur baca yang sudah dipakai aplikasi, baik sebagai `anon` maupun
-- `authenticated`.
--
-- Tulis dari `anon` dicabut. Kunci `anon` ikut terkirim ke browser (bundel
-- klien), jadi ia bukan rahasia; aplikasi ini juga selalu berjalan di belakang
-- `AuthGate`, sehingga tidak ada satu pun jalur tulis tanpa login. `TRUNCATE`
-- ikut dicabut karena perintah itu MELEWATI RLS sepenuhnya — membiarkannya
-- berarti menyisakan pintu belakang yang menghapus seluruh tabel.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sewing_records    FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.kancing_records   FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.finishing_records FROM anon;

-- GRANT untuk authenticated tetap apa adanya (sudah ada sebelumnya). Ditulis
-- ulang supaya niatnya eksplisit di skema, seperti pada
-- 2026-09-21-register-harga-delete-policy.sql.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sewing_records    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kancing_records   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finishing_records TO authenticated;

-- ============================================================================
-- Yang SENGAJA tidak disentuh
-- ============================================================================
-- 1. Trigger `assert_work_order_has_complete_price()` pada ketiga tabel
--    (BEFORE INSERT OR UPDATE OF work_order_id). UPDATE dari UI tidak mengubah
--    `work_order_id`, jadi trigger ini tidak menyala pada jalur edit biasa —
--    tetapi ia tetap berlaku bila kelak ada yang memindahkan baris ke work
--    order lain, dan memang seharusnya begitu.
--
-- 2. `kancing_records.work_order_id` ON DELETE CASCADE; sewing & finishing
--    NO ACTION. Aturan ini soal penghapusan work order, bukan soal siapa yang
--    boleh menghapus baris log, jadi tidak diubah di sini.
--
-- 3. Tabel `cutting_records`. Permintaan user menyebut sewing, kancing, dan
--    finishing saja; cutting sengaja dibiarkan seperti semula.
--
-- 4. `work_orders`, yang masih memberi UPDATE/DELETE ke `authenticated` dengan
--    `using (true)` — termasuk jalur hapus massal di tab ALL. Itu di luar
--    cakupan permintaan ini dan punya konsekuensi cascade yang lebih luas.
