-- supabase/migrations/2026-09-25-account-renames-roles-and-staff.sql
--
-- Tujuan: mengganti identitas akun agar menyebut ORANG, bukan fungsi; menambah
-- dua role baru (`supervisor`, `staff`); dan memberi akun login kepada 7 staf
-- produksi.
--
-- Permintaan user (verbatim):
--   "tolong ubah nama owner, finance, dan inventory ya. Owner : Jan Chun Siong,
--    Finance : Shinta Nuraini, Inventory : Esteria Tifanny. Supervisor : Iman.
--    buat login dan password pakai nama masing2 aja. role itu buat fungsinya aja,
--    akunnya ya per nama. buat staff penjahit ada Suwati, Arief Budiman,
--    Asmeriani Bulolo, Fajar Budiman, Umul Munfaridah, staff finishing Azrul, Ince"
--
-- Keputusan user saat ditanya (jangan diubah tanpa bertanya lagi):
--   1. Username memakai garis bawah: `jan_chun_siong`, `shinta_nuraini`,
--      `esteria_tifanny`, `iman`. Spasi tidak bisa dipakai karena `usernameToEmail`
--      di `src/lib/auth.ts` memetakan username ke alamat email.
--   2. Password = NAMA LENGKAP ASLI (huruf besar-kecil dan spasi apa adanya).
--   3. Role `supervisor` haknya SAMA DENGAN `inventory`: baca semua + input
--      produksi; tanpa ubah/hapus, tanpa lihat biaya/gaji/utang.
--   4. Ketujuh staf produksi DIBERI AKUN juga, dengan role baru `staff`.
--   5. Baris `register_penjahit` milik Sidik Faisal DIBIARKAN Non-Aktif.
--
-- Diterapkan via Supabase MCP (migration record: account_renames_roles_and_staff).
--
-- ⚠️ PASSWORD SENGAJA TIDAK ADA DI BERKAS INI.
-- `apply_migration` menyimpan teks SQL ke `supabase_migrations.schema_migrations`,
-- jadi password yang ditulis di sini akan ikut tersimpan di database — persis
-- yang dilarang aturan repo ("password ketiga akun tidak boleh masuk git").
-- Karena itu akun dibuat dengan `encrypted_password = NULL` (tidak bisa login),
-- lalu password di-set lewat `execute_sql` TERPISAH yang tidak terekam sebagai
-- migrasi. Jangan pindahkan blok password ke berkas ini.
--
-- Catatan teknis: TIDAK ada tabel TEMP di berkas ini, dan itu disengaja. MCP
-- dapat menjalankan tiap pernyataan pada koneksi yang berbeda, sehingga tabel
-- TEMP bisa hilang di tengah jalan. Id akun karena itu diambil kembali dengan
-- mencocokkan `auth.users.email`, bukan disimpan di variabel.

-- ============================================================================
-- 1. Role baru diizinkan
-- ============================================================================
-- Tanpa ini, INSERT profil supervisor/staff ditolak `profiles_role_check`.
-- `DROP CONSTRAINT IF EXISTS` dipakai supaya berkas ini aman dijalankan ulang.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['owner', 'finance', 'inventory', 'supervisor', 'staff']));

-- ============================================================================
-- 2. Tiga akun lama: username, email, dan nama tampilan
-- ============================================================================
-- Akunnya TETAP TIGA — hanya identitasnya yang berubah. Role TIDAK diubah:
-- user memutuskan "role itu buat fungsinya aja, akunnya ya per nama", jadi
-- pemegang fungsi owner tetap berrole `owner` (kini atas nama Jan Chun Siong).
--
-- `encrypted_password` tidak disentuh di sini; ia di-set pada langkah terpisah
-- (lihat catatan di kepala berkas).
UPDATE public.profiles p
SET username = v.new_username,
    display_name = v.new_display_name
FROM (VALUES
  ('owner',     'jan_chun_siong',  'Jan Chun Siong'),
  ('finance',   'shinta_nuraini',  'Shinta Nuraini'),
  ('inventory', 'esteria_tifanny', 'Esteria Tifanny')
) AS v(old_username, new_username, new_display_name)
WHERE p.username = v.old_username;

UPDATE auth.users u
SET email = v.new_username || '@konveksi.local',
    updated_at = now()
FROM (VALUES
  ('owner',     'jan_chun_siong'),
  ('finance',   'shinta_nuraini'),
  ('inventory', 'esteria_tifanny')
) AS v(old_username, new_username)
WHERE u.email = v.old_username || '@konveksi.local';

-- `auth.identities.identity_data` menyimpan salinan email. Kalau tidak ikut
-- diubah, GoTrue masih mencocokkan email lama dan login dengan username baru
-- gagal walaupun `auth.users.email` sudah benar.
UPDATE auth.identities i
SET identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(u.email::text)),
    updated_at = now()
FROM auth.users u
WHERE i.user_id = u.id
  AND i.identity_data->>'email' IS DISTINCT FROM u.email;

-- ============================================================================
-- 3. Akun baru: 1 supervisor + 7 staf produksi
-- ============================================================================
-- Iman dan Suwati memang perlu akun BARU: akun lama adalah owner/finance/inventory,
-- dan nama tampilannya (Iman / Sidik Faisal / Suwati) sudah diganti di bagian 2.
--
-- Urutannya penting: `auth.users` dulu, baru `auth.identities` dan
-- `public.profiles`, karena dua yang terakhir mencari id lewat email.
--
-- Kolom `auth.users` ditulis eksplisit satu per satu (bukan mengandalkan DEFAULT)
-- supaya baris baru persis sebentuk dengan tiga akun yang sudah ada. `aud` dan
-- `role` di `auth.users` adalah peran Postgres/GoTrue, BUKAN `public.profiles.role`.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token, is_sso_user, is_anonymous
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  v.username || '@konveksi.local',
  NULL,                       -- diisi pada langkah terpisah; lihat kepala berkas
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  '', '', '', '',
  '', '', '',
  '', false, false
FROM (VALUES
  ('iman'), ('suwati'), ('arief_budiman'), ('asmeriani_bulolo'),
  ('fajar_budiman'), ('umul_munfaridah'), ('azrul'), ('ince')
) AS v(username)
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users x WHERE x.email = v.username || '@konveksi.local'
);

INSERT INTO auth.identities (
  id, user_id, provider, provider_id, identity_data,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  'email',
  u.id::text,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  now(), now(), now()
FROM auth.users u
JOIN (VALUES
  ('iman'), ('suwati'), ('arief_budiman'), ('asmeriani_bulolo'),
  ('fajar_budiman'), ('umul_munfaridah'), ('azrul'), ('ince')
) AS v(username) ON u.email = v.username || '@konveksi.local'
WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id);

INSERT INTO public.profiles (id, username, display_name, role)
SELECT u.id, v.username, v.display_name, v.role
FROM auth.users u
JOIN (VALUES
  ('iman',             'Iman',             'supervisor'),
  ('suwati',           'Suwati',           'staff'),
  ('arief_budiman',    'Arief Budiman',    'staff'),
  ('asmeriani_bulolo', 'Asmeriani Bulolo', 'staff'),
  ('fajar_budiman',    'Fajar Budiman',    'staff'),
  ('umul_munfaridah',  'Umul Munfaridah',  'staff'),
  ('azrul',            'Azrul',            'staff'),
  ('ince',             'Ince',             'staff')
) AS v(username, display_name, role) ON u.email = v.username || '@konveksi.local'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- ============================================================================
-- 4. Baris Register Karyawan untuk 7 staf baru
-- ============================================================================
-- Iman (id 2, Leader) dan Suwati (id 3, Penjahit) SUDAH punya baris di
-- `register_penjahit`, jadi hanya tujuh orang ini yang perlu baris baru.
--
-- Posisi mengikuti `POSISI_OPTIONS` di `src/services/registerPenjahit.ts`
-- ('Leader' | 'Penjahit' | 'Finishing'). Azrul dan Ince adalah staf finishing,
-- jadi posisinya 'Finishing' — bukan 'Penjahit'.
--
-- `tanggal_mulai_bekerja` sengaja DIBIARKAN NULL: user tidak menyebutkannya, dan
-- mengarang tanggal untuk data kepegawaian lebih buruk daripada membiarkannya
-- kosong. Kolomnya nullable, dan `toDateOnly` di service mengubah NULL menjadi
-- '' sehingga tabel menampilkannya sebagai kosong — bukan sebagai tanggal palsu.
-- Isi lewat Contact → Karyawan begitu tanggal sebenarnya diketahui.
INSERT INTO public.register_penjahit (pic_penjahit, posisi, status, tanggal_mulai_bekerja)
SELECT v.nama, v.posisi, 'Aktif', NULL
FROM (VALUES
  ('Suwati',           'Penjahit'),
  ('Arief Budiman',    'Penjahit'),
  ('Asmeriani Bulolo', 'Penjahit'),
  ('Fajar Budiman',    'Penjahit'),
  ('Umul Munfaridah',  'Penjahit'),
  ('Azrul',            'Finishing'),
  ('Ince',             'Finishing')
) AS v(nama, posisi)
WHERE NOT EXISTS (
  SELECT 1 FROM public.register_penjahit r WHERE r.pic_penjahit = v.nama
);

-- ============================================================================
-- 5. Verifikasi (hasilnya dipakai sebagai bukti, bukan sekadar hiasan)
-- ============================================================================
SELECT p.username, p.display_name, p.role,
       u.email,
       (u.encrypted_password IS NOT NULL) AS password_sudah_diset,
       (SELECT count(*) FROM auth.identities i WHERE i.user_id = u.id) AS jumlah_identitas
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
ORDER BY p.role, p.username;

-- ============================================================================
-- Yang SENGAJA tidak disentuh
-- ============================================================================
-- 1. `public.my_staff_id()` — fungsi itu mencocokkan `profiles.display_name`
--    dengan `register_penjahit.pic_penjahit`. Setelah rename di bagian 2, tidak
--    ada lagi profil owner/finance/inventory yang cocok dengan baris karyawan
--    mana pun; tautan itu kini dipegang akun `iman` dan `suwati` yang baru.
--    Jadi Suwati tetap bisa melihat baris gajinya sendiri lewat akun `suwati`.
--    Fungsi tidak diubah — hanya datanya yang membuatnya cocok kembali.
--
-- 2. `profiles_role_check` hanya ditambah nilainya; `owner`, `finance`, dan
--    `inventory` tetap ada. Menghapusnya akan memutus tiga akun yang sekarang
--    dipegang Jan Chun Siong, Shinta Nuraini, dan Esteria Tifanny.
--
-- 3. Sidik Faisal (register_penjahit id 4) tetap `Non-Aktif` dan tetap tanpa
--    akun, sesuai keputusan user "biarkan saja".
--
-- 4. Nama "Dedi Kurniawan" yang muncul di `finishing_records.pic_finishing` dan
--    `kancing_records.pic_kancing` TIDAK ditambahkan sebagai karyawan: ia tidak
--    ada di daftar user, dan menambah orang yang tidak diminta adalah perubahan
--    di luar permintaan. Perlu ditanyakan terpisah.
--
-- 5. `tanggal_mulai_bekerja` ketujuh staf baru dibiarkan NULL (lihat bagian 4).
