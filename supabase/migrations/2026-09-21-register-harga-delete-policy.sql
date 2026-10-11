-- supabase/migrations/2026-09-21-register-harga-delete-policy.sql
--
-- Tujuan: mengizinkan penghapusan baris Register Harga dari halaman Register
-- Harga, sebagai bagian dari aksi massal (pilih baris → Hapus).
--
-- Latar belakang:
--   Migrasi 2026-09-07-register-harga.sql sengaja membuat tabel ini
--   append-only: hanya ada policy SELECT dan hak tulisnya dicabut eksplisit
--   (REVOKE INSERT, UPDATE, DELETE, TRUNCATE ... FROM anon, authenticated).
--   Tujuannya agar Register Harga hanya bisa diisi lewat order_entry_save.
--
--   Atas permintaan user, halaman Register Harga kini punya checkbox pilih
--   baris dengan aksi massal Hapus. Maka policy DELETE perlu dibuka.
--
-- Yang SENGAJA tetap ditutup:
--   INSERT dan UPDATE tetap dicabut. Baris Register Harga tetap hanya lahir
--   dari order_entry_save, dan satu-satunya perubahan yang diizinkan dari luar
--   adalah penghapusan. Dengan begitu niat "riwayat harga tidak bisa dipalsukan
--   dari UI" masih terjaga, sementara pembersihan baris bisa dilakukan.
--
-- Dampak: siapa pun yang login (role authenticated) dapat menghapus baris
-- Register Harga. Ini konsisten dengan register_client dan planning_produksi
-- yang juga memberi DELETE ke authenticated.
--
-- Diterapkan via Supabase MCP.

-- 1. Hak hapus untuk authenticated (sebelumnya dicabut oleh migrasi 2026-09-07).
GRANT DELETE ON public.register_harga TO authenticated;

-- 2. Policy DELETE. Tanpa policy, GRANT saja tidak cukup: RLS tetap menolak.
DROP POLICY IF EXISTS "Authenticated delete register harga" ON public.register_harga;
CREATE POLICY "Authenticated delete register harga"
  ON public.register_harga FOR DELETE
  TO authenticated
  USING (true);

-- 3. Pastikan INSERT/UPDATE tetap tertutup, walaupun GRANT DELETE di atas
--    tidak menyentuhnya. Ditulis ulang supaya niatnya eksplisit di skema.
REVOKE INSERT, UPDATE, TRUNCATE ON public.register_harga FROM anon, authenticated;
