-- ============================================================
-- Salary sebagai Target Cost / Posisi (Desain A)
-- Diterapkan: 2026-09-25 lewat Supabase MCP (migration `expense_salary_entries`)
-- ============================================================
-- Permintaan user (verbatim):
--   "saya pengen di Target Jahit, bagian Target Cost / Posisi itu adalah
--    salary mereka di bulan itu. ... tapi yg bisa lihat si Expense Salary ini
--    cuma si USER yang punya nama tsb, finance dan juga owner."
--   "1. saya pengen lgsg di expense aja biar ga kebanyakan loh.
--    2. yang isi cuma boleh finance."
--
-- Kenapa gaji disimpan di `expense_entries` dan BUKAN di `target_jahit`:
-- tabel `target_jahit` punya policy `Allow read for all` (roles {public},
-- qual = true), jadi nilai yang ditulis ke sana bisa dibaca siapa saja lewat
-- API. Syarat visibilitas user (hanya yang bersangkutan + finance + owner)
-- TIDAK MUNGKIN dipenuhi di sana, karena RLS bersifat per-BARIS, bukan
-- per-kolom. Karena itu gaji hidup di `expense_entries` di bawah kategori
-- MANPOWER > SALARY (id 7), dan Target Jahit membacanya dari sana.
--
-- Berkas ini adalah catatan repo. Perubahan yang sama sudah diterapkan ke
-- database lewat Supabase MCP; isinya sengaja ditulis idempoten supaya aman
-- dijalankan ulang di instance lokal.
-- ============================================================

-- ---------- 1. Kolom + constraint ----------
alter table public.expense_entries
  add column if not exists staff_id integer;

-- vendor_id kini opsional: baris gaji dibayarkan ke KARYAWAN, bukan vendor.
alter table public.expense_entries
  alter column vendor_id drop not null;

alter table public.expense_entries
  drop constraint if exists expense_entries_staff_id_fkey;
alter table public.expense_entries
  add constraint expense_entries_staff_id_fkey
  foreign key (staff_id) references public.register_penjahit(id) on delete restrict;

-- Tepat satu pihak yang dibayar: vendor ATAU karyawan — tidak keduanya, tidak
-- kosong. Ini yang menjaga aturan "baris gaji tidak punya vendor" di database,
-- bukan hanya di klien.
alter table public.expense_entries
  drop constraint if exists expense_entries_payee_check;
alter table public.expense_entries
  add constraint expense_entries_payee_check
  check ((vendor_id is not null) <> (staff_id is not null));

-- Satu karyawan = satu baris gaji per bulan. Bulan diambil dari `entry_date`
-- (pilihan user), dan `date_trunc('month', date::timestamp)` bersifat
-- IMMUTABLE sehingga boleh dipakai di index expression. (Fungsi `date_trunc`
-- untuk `timestamptz` bersifat STABLE dan TIDAK boleh dipakai di index — itu
-- sebabnya ada cast eksplisit ke `timestamp`.)
-- Dibatasi ke baris SALARY saja supaya pembayaran lain ke karyawan (mis.
-- reimburse) tidak ikut terkunci.
create unique index if not exists expense_entries_salary_unique
  on public.expense_entries (staff_id, date_trunc('month', entry_date::timestamp))
  where staff_id is not null and sub_category_name = 'SALARY';

-- ---------- 2. Fungsi bantu ----------
-- Dipisah dari can_edit_production_log(): fungsi itu namanya soal log produksi
-- dan menerima owner JUGA, sedangkan menulis gaji hanya untuk finance.
create or replace function public.is_finance()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'finance'
  )
$function$;

comment on function public.is_finance() is
  'True bila pengguna yang login ber-role finance. Dipakai policy expense_entries untuk baris gaji.';

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'owner'
  )
$function$;

comment on function public.is_owner() is
  'True bila pengguna yang login ber-role owner. Owner boleh MELIHAT gaji, tidak mengubahnya.';

-- Karyawan yang sedang login, dicocokkan lewat nama.
--
-- CATATAN JUJUR: pencocokan ini memakai NAMA (`profiles.display_name` =
-- `register_penjahit.pic_penjahit`), dan tidak ada constraint yang menjaganya.
-- Kalau salah satu nama diganti, tautannya putus dan orang itu berhenti bisa
-- melihat gajinya sendiri. Ini keterbatasan yang diketahui, bukan kelalaian.
create or replace function public.my_staff_id()
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select r.id
  from public.register_penjahit r
  join public.profiles p on p.display_name = r.pic_penjahit
  where p.id = auth.uid()
  limit 1
$function$;

comment on function public.my_staff_id() is
  'id register_penjahit milik pengguna yang login, dicocokkan lewat profiles.display_name. NULL bila tidak ketemu.';

-- ---------- 3. RLS expense_entries ----------
-- Policy bersifat OR, jadi policy lama HARUS dibuang. Selama
-- `Allow read for all` masih ada, policy ketat apa pun tidak berpengaruh.
drop policy if exists "Allow read for all" on public.expense_entries;
drop policy if exists "Authenticated expense insert" on public.expense_entries;
drop policy if exists "Authenticated expense update" on public.expense_entries;
drop policy if exists "Authenticated expense delete" on public.expense_entries;

-- Baris NON-gaji tetap bisa dibaca siapa saja — persis seperti sebelumnya.
-- Mengunci seluruh tabel akan jadi regresi: semua peran butuh melihat biaya
-- operasional.
create policy "Read non-salary expenses for all"
  on public.expense_entries for select
  to public
  using (staff_id is null);

-- Baris gaji: hanya yang bersangkutan, finance, dan owner.
create policy "Read own salary or finance owner"
  on public.expense_entries for select
  to authenticated
  using (
    staff_id is not null
    and (staff_id = public.my_staff_id() or public.is_finance() or public.is_owner())
  );

-- Menulis baris gaji hanya finance. Baris non-gaji tidak berubah.
create policy "Authenticated expense insert"
  on public.expense_entries for insert
  to authenticated
  with check (staff_id is null or public.is_finance());

create policy "Authenticated expense update"
  on public.expense_entries for update
  to authenticated
  using (staff_id is null or public.is_finance())
  with check (staff_id is null or public.is_finance());

create policy "Authenticated expense delete"
  on public.expense_entries for delete
  to authenticated
  using (staff_id is null or public.is_finance());

-- ---------- 4. GRANT ----------
-- anon memegang arwdDxtm di tabel ini, jadi perubahan RLS saja tidak cukup:
-- tanpa REVOKE, jalur tulis tanpa login tetap terbuka. Aplikasi selalu di
-- belakang AuthGate, jadi tidak ada jalur tulis anonim yang sah.
-- Mengikuti preseden 2026-09-24-production-log-role-restriction.sql.
revoke insert, update, delete, truncate on public.expense_entries from anon;
grant insert, update, delete on public.expense_entries to authenticated;

-- ---------- 5. Data lama ----------
-- `target_cost_posisi` tidak lagi ditulis (nilainya kini dibaca dari gaji),
-- jadi seluruh nilai lama adalah sisa hitungan harga yang menyesatkan.
-- Kolomnya SENGAJA tidak dihapus (permintaan user: "di null kan saja").
update public.target_jahit set target_cost_posisi = null;

-- ============================================================
-- Yang SENGAJA tidak disentuh:
-- - Kolom `target_jahit.target_cost_posisi` (dibiarkan ada, hanya di-NULL-kan).
-- - Kolom `expense_entries.total` / `total_payment` (kolom generated).
-- - Policy tabel lain (target_jahit, register_penjahit, dst).
-- - `vendor_name` tetap NOT NULL: untuk baris gaji diisi NAMA KARYAWAN,
--   mengikuti konvensi repo bahwa nama yang tersalin saat dicatat adalah
--   dokumen historis.
-- ============================================================
