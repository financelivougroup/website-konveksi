-- supabase/migrations/2026-08-04-auth-profiles.sql

-- ============================================================
-- Profil pengguna & peran aplikasi.
--
-- Peran TIDAK disimpan di auth.users.raw_user_meta_data karena kolom itu
-- bisa disunting pengguna sendiri lewat API, jadi tidak layak menjadi
-- sumber kebenaran otorisasi. Tabel terpisah bisa dilindungi RLS.
--
-- Hanya ada tiga akun tetap yang dibuat sekali, jadi tidak ada trigger
-- on auth.users insert — lapisan otomatis untuk tiga baris justru
-- menyulitkan pelacakan.
--
-- CATATAN: file ini hanya berisi skema. Akun beserta passwordnya dibuat
-- langsung ke database supaya password tidak pernah masuk git.
--
-- Kalau nanti perlu membuat akun tambahan lewat SQL langsung, ada dua hal
-- yang wajib diperhatikan — keduanya ditemukan saat akun pertama dibuat:
--
--   1. auth.identities perlu satu baris per akun, kalau tidak login gagal.
--      Kolom `email` di tabel itu bertipe GENERATED, jadi nilainya harus
--      diturunkan lewat identity_data, bukan ditulis langsung.
--
--   2. Kolom token di auth.users (confirmation_token, recovery_token,
--      email_change_token_new, email_change, email_change_token_current,
--      phone_change, phone_change_token, reauthentication_token) harus
--      berisi string kosong, BUKAN NULL. GoTrue memindai kolom itu ke
--      dalam tipe non-nullable saat login; NULL membuatnya mengembalikan
--      500 "Database error querying schema" — galat yang tidak menyebut
--      kolom mana pun, jadi sulit dilacak kalau tidak tahu sebelumnya.
--
--   Cara paling aman untuk akun berikutnya adalah lewat dashboard Supabase
--   atau Admin API, yang menangani kedua hal di atas sendiri.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('owner', 'finance', 'inventory'))
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Pengguna yang login boleh membaca seluruh baris agar nama pemilik
-- entri bisa ditampilkan. Tanpa hak tulis dari klien.
DROP POLICY IF EXISTS "Authenticated can read profiles" ON public.profiles;
CREATE POLICY "Authenticated can read profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- Hak tulis untuk role `authenticated`.
--
-- Sebelum ini, hak tulis pada work_orders dan sewing_records hanya
-- diberikan ke role `anon`. Begitu pengguna login, supabase-js beralih
-- ke role `authenticated` dan kebijakan `anon` tidak lagi berlaku —
-- Production Monitoring dan Sewing Entry akan berhenti bisa menyimpan.
-- Kebijakan di bawah menyamai hak `anon` yang ada sekarang.
--
-- Kebijakan `anon` sengaja TIDAK dicabut di sini. Mencabutnya adalah
-- pengamanan yang benar tapi berisiko memutus jalur yang belum
-- diperiksa satu per satu; itu pekerjaan terpisah.
-- ============================================================

DROP POLICY IF EXISTS "Allow authenticated all on work_orders" ON public.work_orders;
CREATE POLICY "Allow authenticated all on work_orders"
  ON public.work_orders FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated all on sewing_records" ON public.sewing_records;
CREATE POLICY "Allow authenticated all on sewing_records"
  ON public.sewing_records FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated all on cutting_records" ON public.cutting_records;
CREATE POLICY "Allow authenticated all on cutting_records"
  ON public.cutting_records FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);
