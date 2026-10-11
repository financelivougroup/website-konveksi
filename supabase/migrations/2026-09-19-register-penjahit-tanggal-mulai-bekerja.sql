-- supabase/migrations/2026-09-19-register-penjahit-tanggal-mulai-bekerja.sql
-- Register Karyawan: kolom tanggal masuk kerja + policy UPDATE/DELETE yang hilang.
-- Diterapkan via Supabase MCP (migration record: register_penjahit_tanggal_mulai_bekerja).

-- Dua hal dikerjakan sekaligus karena keduanya prasyarat fitur "Tanggal Mulai
-- Bekerja":
--   1. Kolom baru tanggal_mulai_bekerja.
--   2. Policy UPDATE & DELETE yang selama ini TIDAK ADA pada register_penjahit.
--      Tanpa policy ini, UPDATE/DELETE disaring habis TANPA error, sehingga
--      aplikasi melaporkan "✅ berhasil" padahal 0 baris yang berubah —
--      terbukti dengan uji `BEGIN; SET LOCAL ROLE authenticated; UPDATE ...
--      RETURNING id; ROLLBACK;` yang mengembalikan 0 baris sebelum migrasi ini.

-- 1) Kolom tanggal masuk kerja.
--    NULLABLE, bukan NOT NULL: tiga baris lama sudah telanjur ada, jadi
--    SET NOT NULL akan gagal. Keharusan mengisi ditegakkan di lapisan UI
--    (tombol Simpan nonaktif sampai tanggal dipilih).
ALTER TABLE public.register_penjahit
  ADD COLUMN IF NOT EXISTS tanggal_mulai_bekerja date;

-- 2) Policy tulis yang selama ini hanya ada untuk SELECT dan INSERT.
--    Mengikuti pola register_client (2026-09-03-register-client.sql) dan
--    vendors: tulis hanya untuk role authenticated, karena aplikasi berjalan
--    di belakang AuthGate.
--    Policy baca/insert yang sudah ada (TO public) sengaja DIBIARKAN apa adanya:
--    keduanya sudah dipakai jalur baca aplikasi, dan menghapusnya berisiko.
ALTER TABLE public.register_penjahit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated penjahit update" ON public.register_penjahit;
CREATE POLICY "Authenticated penjahit update"
  ON public.register_penjahit FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated penjahit delete" ON public.register_penjahit;
CREATE POLICY "Authenticated penjahit delete"
  ON public.register_penjahit FOR DELETE
  TO authenticated
  USING (true);

GRANT UPDATE, DELETE ON public.register_penjahit TO authenticated;
