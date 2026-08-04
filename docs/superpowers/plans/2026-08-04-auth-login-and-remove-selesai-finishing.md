# Login Berbasis Role & Penghapusan Selesai Finishing — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikasi hanya bisa dibuka setelah login dengan salah satu dari tiga akun (`owner`, `finance`, `inventory`), dan sisa kode modul Selesai Finishing dibersihkan.

**Architecture:** Gerbang auth dipasang di akar aplikasi mengikuti pola `viewMode` yang sudah ada di `src/App.tsx`, sehingga tidak ada halaman yang bisa lupa dipasangi pengaman. Peran disimpan di tabel `public.profiles` (bukan `raw_user_meta_data` yang bisa disunting pengguna sendiri). Username dipetakan ke email internal `<username>@konveksi.local` di dalam fungsi login.

**Tech Stack:** React 19, TypeScript, Vite 7, Supabase Auth (`@supabase/supabase-js` 2.110), Tailwind 3 + shadcn/ui, PostgreSQL 17 (Supabase).

**Spec:** `docs/superpowers/specs/2026-08-04-auth-login-and-remove-selesai-finishing-design.md`

## Global Constraints

- Semua operasi database **wajib** lewat Supabase MCP. Jangan menulis SQL berbasis asumsi.
- Password ketiga akun **tidak boleh** masuk git — tidak di file migration, tidak di kode, tidak di dokumen.
- Kebijakan RLS `anon` yang sudah ada **tidak dicabut** dalam pekerjaan ini.
- Tabel `work_orders`, `sewing_records`, `cutting_records` harus tetap bisa **ditulis penuh** setelah login.
- Ketiga peran melihat **seluruh** menu. Tidak ada penyaringan sidebar berdasarkan peran.
- Peran yang sah hanya tiga: `owner`, `finance`, `inventory`.
- Proyek ini **tidak punya test runner**. Siklus verifikasi tiap task = `npm run build` lolos + menjalankan aplikasi dan mengamati perilakunya. Jangan memasang vitest/jest — itu di luar cakupan yang disetujui.
- Gunakan komponen shadcn/ui yang **sudah ada** di `src/components/ui/`. Card, Input, Label, dan Button semuanya sudah tersedia — tidak perlu mengambil apa pun dari registry.
- Alias impor `@/` menunjuk ke `src/` (`vite.config.ts:15`).
- Dev server berjalan di port 3000 (`vite.config.ts:11`).

---

## Struktur Berkas

**Dibuat:**

| Berkas | Tanggung jawab |
|---|---|
| `supabase/migrations/2026-08-04-auth-profiles.sql` | Skema tabel `profiles` + kebijakan RLS. Tanpa password. |
| `src/lib/auth.ts` | Pemetaan username→email, `signIn`, `signOut`, `fetchProfile`. Satu-satunya tempat yang tahu soal `@konveksi.local`. |
| `src/contexts/AuthContext.tsx` | Context + hook `useAuth()`. Menyimpan profil pengguna aktif. |
| `src/components/Auth/AuthGate.tsx` | Memutuskan: memuat / form login / aplikasi. Berlangganan `onAuthStateChange`. |
| `src/pages/LoginPage.tsx` | Form username + password. |

**Disunting:**

| Berkas | Perubahan |
|---|---|
| `src/App.tsx` | Bungkus dengan provider + gate; hapus `mockUsers`, dropdown Role, dan seluruh `selesai-finishing`. |
| `src/pages/ProductionMonitoring.tsx` | `inputBy` dari `useAuth()`, bukan localStorage. |
| `src/components/Layout/Sidebar.tsx` | Blok pengguna menampilkan identitas nyata + tombol logout. |
| `src/types/pipeline.ts` | `AppRole` menyusut jadi 3 nilai. |
| `src/types/index.ts` | Hapus `'selesai-finishing'` dari `ModuleId`. |
| `src/data/mockData.ts` | Hapus `viewConfig`, `buildFinishingRow`, fixture. |
| `src/components/Panel/DetailPanel.tsx` | Hapus `SelesaiFinishingForm`. |
| `src/components/Layout/TopBar.tsx` | Hapus entri warna ikon. |
| `project.md` | Perbarui bagian "Latest Progress". |

**Urutan task:** Task 1-3 menyiapkan fondasi (database → lapisan auth → UI login). Task 4 memasang gerbang. Task 5 memindahkan sumber identitas. Task 6 menyusutkan `AppRole` — dipisah dari Task 4 karena baru mungkin setelah `mockUsers` hilang. Task 7 membersihkan Selesai Finishing. Task 8 memperbarui dokumentasi.

---

### Task 1: Tabel profiles, kebijakan RLS, dan tiga akun

**Files:**
- Create: `supabase/migrations/2026-08-04-auth-profiles.sql`

**Interfaces:**
- Consumes: tidak ada (task pertama)
- Produces: tabel `public.profiles` dengan kolom `id uuid`, `username text`, `display_name text`, `role text`. Tiga baris terisi. Kebijakan RLS `authenticated` pada `work_orders`, `sewing_records`, `cutting_records`. Task 2 membaca tabel ini lewat `supabase.from('profiles')`.

- [ ] **Step 1: Verifikasi kondisi awal lewat Supabase MCP**

Jalankan `mcp__supabase__list_tables` dengan `schemas: ["public"]`. Pastikan **belum** ada tabel `profiles`. Jika sudah ada, berhenti dan laporkan — jangan menimpa.

- [ ] **Step 2: Tulis file migration**

Buat `supabase/migrations/2026-08-04-auth-profiles.sql`. Ikuti gaya file migration yang ada (lihat `supabase/migrations/2026-07-23-target-jahit.sql`): komentar header berisi path, lalu blok penjelasan.

```sql
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
```

- [ ] **Step 3: Terapkan migration lewat Supabase MCP**

Gunakan `mcp__supabase__apply_migration` dengan `name: "auth_profiles"` dan isi SQL dari Step 2.

- [ ] **Step 4: Verifikasi tabel dan kebijakan sudah ada**

Gunakan `mcp__supabase__execute_sql`:

```sql
select tablename, policyname, roles::text, cmd
from pg_policies
where schemaname = 'public'
  and (tablename = 'profiles'
       or policyname like '%authenticated%')
order by tablename, policyname;
```

Diharapkan: 4 baris — satu SELECT pada `profiles` untuk `{authenticated}`, dan tiga ALL untuk `{authenticated}` pada `cutting_records`, `sewing_records`, `work_orders`.

- [ ] **Step 5: Buat tiga akun**

Password yang dipakai sudah dibuat dengan RNG kriptografis dan disampaikan ke pengguna di luar repositori. **Jangan menulis password ke berkas apa pun.** Ambil nilainya dari pesan pengguna di percakapan, lalu jalankan lewat `mcp__supabase__execute_sql` — satu blok, ganti `<PASSWORD_OWNER>` dan seterusnya dengan nilai sebenarnya:

```sql
-- Ekstensi pgcrypto sudah terpasang di schema `extensions` (terverifikasi
-- lewat list_extensions), jadi crypt() dipanggil dengan prefiks skema.
with new_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values
    ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
     'owner@konveksi.local', extensions.crypt('<PASSWORD_OWNER>', extensions.gen_salt('bf')),
     now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
     'finance@konveksi.local', extensions.crypt('<PASSWORD_FINANCE>', extensions.gen_salt('bf')),
     now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
     'inventory@konveksi.local', extensions.crypt('<PASSWORD_INVENTORY>', extensions.gen_salt('bf')),
     now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
  returning id, email
)
insert into public.profiles (id, username, display_name, role)
select
  id,
  split_part(email, '@', 1),
  case split_part(email, '@', 1)
    when 'owner' then 'Pemilik'
    when 'finance' then 'Finance'
    when 'inventory' then 'Inventory'
  end,
  split_part(email, '@', 1)
from new_users;
```

- [ ] **Step 6: Buat baris identity untuk tiap akun**

Supabase memerlukan baris di `auth.identities` agar login email/password berfungsi. Kolom `email` di tabel itu bertipe generated (terverifikasi lewat `information_schema`), jadi jangan menulisinya langsung — nilainya diturunkan dari `identity_data`.

```sql
insert into auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  'email',
  now(), now(), now()
from auth.users u
where u.email like '%@konveksi.local'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );
```

- [ ] **Step 7: Verifikasi ketiga akun terbentuk lengkap**

```sql
select p.username, p.display_name, p.role,
       u.email, u.email_confirmed_at is not null as confirmed,
       exists (select 1 from auth.identities i where i.user_id = u.id) as has_identity
from public.profiles p
join auth.users u on u.id = p.id
order by p.username;
```

Diharapkan: tepat 3 baris (`finance`, `inventory`, `owner`), semuanya `confirmed = true` dan `has_identity = true`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/2026-08-04-auth-profiles.sql
git commit -m "feat(auth): add profiles table and authenticated RLS policies"
```

---

### Task 2: Lapisan auth dan context

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/contexts/AuthContext.tsx`

**Interfaces:**
- Consumes: tabel `public.profiles` dari Task 1. Klien `supabase` dari `src/lib/supabase.ts:10`. Tipe `AppRole` dari `src/types/pipeline.ts:176` (masih 5 nilai pada tahap ini — disusutkan di Task 6; kode di sini hanya memakai tiga nilai yang sah, jadi tidak terpengaruh).
- Produces:
  - `src/lib/auth.ts` → `usernameToEmail(username: string): string`, `signIn(username: string, password: string): Promise<{ error: Error | null }>`, `signOut(): Promise<void>`, `fetchProfile(userId: string): Promise<{ data: Profile | null; error: Error | null }>`, dan `interface Profile { id: string; username: string; displayName: string; role: AppRole }`
  - `src/contexts/AuthContext.tsx` → `AuthProvider` (props: `value: AuthState`, `children`), `useAuth(): AuthState`, dan `interface AuthState { profile: Profile; signOut: () => Promise<void> }`

  Task 3 memakai `signIn`. Task 4 memakai `fetchProfile` + `AuthProvider`. Task 5 dan Task 7 memakai `useAuth`.

- [ ] **Step 1: Tulis `src/lib/auth.ts`**

Gaya berkas mengikuti `src/services/registerPenjahit.ts` — fungsi lepas yang mengembalikan `{ data, error }`, bukan kelas.

```ts
import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/types/pipeline'

// Supabase Auth memerlukan email. Aplikasi ini hanya punya tiga akun tetap
// dan pengguna login dengan username, jadi username dipetakan ke alamat
// internal. Domain ini tidak nyata — reset password lewat email tidak akan
// berfungsi; password diganti lewat dashboard Supabase.
const EMAIL_DOMAIN = '@konveksi.local'

export interface Profile {
  id: string
  username: string
  displayName: string
  role: AppRole
}

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}${EMAIL_DOMAIN}`
}

export async function signIn(username: string, password: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  })
  return { error }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export async function fetchProfile(userId: string): Promise<{ data: Profile | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, role')
    .eq('id', userId)
    .single()

  if (error || !data) return { data: null, error }

  return {
    data: {
      id: data.id as string,
      username: data.username as string,
      displayName: data.display_name as string,
      role: data.role as AppRole,
    },
    error: null,
  }
}
```

- [ ] **Step 2: Tulis `src/contexts/AuthContext.tsx`**

Direktori `src/contexts/` belum ada — buat sekalian.

`profile` bertipe non-nullable karena `AuthGate` (Task 4) tidak merender turunannya sebelum profil tersedia. Ini menghindari pemeriksaan null di setiap pemakai.

```tsx
import { createContext, useContext } from 'react'
import type { Profile } from '@/lib/auth'

export interface AuthState {
  profile: Profile
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ value, children }: { value: AuthState; children: React.ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return ctx
}
```

- [ ] **Step 3: Verifikasi build lolos**

Run: `npm run build`
Expected: selesai tanpa galat TypeScript. Kedua berkas baru belum dipakai siapa pun, jadi tidak ada perubahan perilaku — yang diuji di sini hanyalah tipenya sehat.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts src/contexts/AuthContext.tsx
git commit -m "feat(auth): add auth helpers and AuthContext"
```

---

### Task 3: Halaman login

**Files:**
- Create: `src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `signIn` dari `src/lib/auth.ts` (Task 2). Komponen shadcn/ui yang sudah ada: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` dari `@/components/ui/card`; `Input` dari `@/components/ui/input`; `Label` dari `@/components/ui/label`; `Button` dari `@/components/ui/button`.
- Produces: `LoginPage` sebagai default export. Tanpa props — komponen tidak perlu memberi tahu siapa pun saat login berhasil, karena `onAuthStateChange` di `AuthGate` (Task 4) yang menangkap perubahan sesi.

- [ ] **Step 1: Tulis `src/pages/LoginPage.tsx`**

Ini layar operasional, bukan halaman pemasaran: kartu ringkas terpusat, tanpa ilustrasi atau teks promosi. Warna mengikuti aksen sky yang dipakai sidebar (`Sidebar.tsx:101`).

Galat dari Supabase ditampilkan sebagai satu pesan Indonesia yang sama untuk kredensial salah — jangan bedakan "username tidak ada" dan "password salah", karena itu memberi tahu penyerang username mana yang valid.

```tsx
import { useState } from 'react'
import { Factory, Loader2 } from 'lucide-react'
import { signIn } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) {
      setErrorMsg('Username dan password harus diisi.')
      return
    }
    setSubmitting(true)
    setErrorMsg(null)

    const { error } = await signIn(username, password)

    if (error) {
      // Pesan yang sama untuk username tidak ada maupun password salah,
      // supaya tidak membocorkan username mana yang valid.
      setErrorMsg('Username atau password salah.')
      setSubmitting(false)
    }
    // Berhasil: onAuthStateChange di AuthGate yang mengambil alih.
    // Jangan reset submitting — biarkan tombol tetap nonaktif sampai
    // komponen ini dilepas, agar tidak ada kedipan.
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 font-sans">
      <Card className="w-full max-w-[360px] shadow-sm">
        <CardHeader className="flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-sky-500 flex items-center justify-center shadow-sm shadow-sky-200">
            <Factory className="w-5 h-5 text-white" />
          </div>
          <CardTitle className="text-[17px] font-semibold text-slate-800">Konveksi Pro</CardTitle>
          <CardDescription className="text-[12px] text-slate-500">
            Masuk untuk melanjutkan
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-username" className="text-[12px] text-slate-600">Username</Label>
              <Input
                id="login-username"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={submitting}
                className="h-9 text-[13px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="text-[12px] text-slate-600">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="h-9 text-[13px]"
              />
            </div>

            {errorMsg && (
              <p role="alert" className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {errorMsg}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="w-full h-9 text-[13px] bg-sky-500 hover:bg-sky-600">
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Memproses...
                </>
              ) : (
                'Masuk'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verifikasi build lolos**

Run: `npm run build`
Expected: selesai tanpa galat. Halaman belum terpasang di mana pun.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LoginPage.tsx
git commit -m "feat(auth): add login page"
```

---

### Task 4: Gerbang auth dan penghapusan dropdown Role

**Files:**
- Create: `src/components/Auth/AuthGate.tsx`
- Modify: `src/App.tsx` — impor (baris 34), `mockUsers` (37-43), state `currentRole` (85), `handleChangeRole` (87-93), dropdown Role (684-695), pembungkus render (652-656 dan 967-970)

**Interfaces:**
- Consumes: `fetchProfile`, `signOut` dari `src/lib/auth.ts`; `AuthProvider`, `AuthState` dari `src/contexts/AuthContext.tsx`; `LoginPage` dari `src/pages/LoginPage.tsx` (Task 2 dan 3).
- Produces: `AuthGate` sebagai named export, props `{ children: React.ReactNode }`. Setelah task ini, `useAuth()` dijamin tersedia di seluruh pohon di bawah `AuthGate` — itulah yang diandalkan Task 5 dan Task 7.

- [ ] **Step 1: Tulis `src/components/Auth/AuthGate.tsx`**

Direktori `src/components/Auth/` belum ada — buat sekalian.

Perhatikan penanganan kasus profil hilang: sesi sah tapi baris `profiles` tidak ada berarti data tidak konsisten. Jangan diam-diam merender aplikasi tanpa identitas — paksa logout dan tampilkan form login lagi.

```tsx
import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchProfile, signOut as authSignOut } from '@/lib/auth'
import type { Profile } from '@/lib/auth'
import { AuthProvider } from '@/contexts/AuthContext'
import LoginPage from '@/pages/LoginPage'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await fetchProfile(userId)
    if (data) {
      setProfile(data)
    } else {
      // Sesi sah tapi baris profiles tidak ada — data tidak konsisten.
      // Jangan render aplikasi tanpa identitas; paksa keluar.
      await authSignOut()
      setProfile(null)
    }
    setChecking(false)
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setChecking(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setChecking(false)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  if (checking) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
      </div>
    )
  }

  if (!profile) return <LoginPage />

  const value = { profile, signOut: authSignOut }
  return <AuthProvider value={value}>{children}</AuthProvider>
}
```

- [ ] **Step 2: Hapus `mockUsers` dan impor `AppRole` dari `src/App.tsx`**

Hapus baris 34 dan 36-43:

```tsx
import type { AppRole } from '@/types/pipeline';

// Static role switcher data (auth Phase B later)
const mockUsers = [
  { id: 'user-1', username: 'owner', displayName: 'Pemilik', role: 'owner' as AppRole, avatar: 'PO' },
  { id: 'user-2', username: 'admin', displayName: 'Admin', role: 'admin' as AppRole, avatar: 'AD' },
  { id: 'user-3', username: 'inventory', displayName: 'Budi (Gudang)', role: 'inventory' as AppRole, avatar: 'BG' },
  { id: 'user-4', username: 'spv', displayName: 'Ani (Spv)', role: 'spv_konveksi' as AppRole, avatar: 'AS' },
  { id: 'user-5', username: 'finance', displayName: 'Dewi (Finance)', role: 'finance' as AppRole, avatar: 'DF' },
];
```

Tambahkan impor `AuthGate` di dekat impor komponen lain:

```tsx
import { AuthGate } from '@/components/Auth/AuthGate';
```

- [ ] **Step 3: Hapus state dan handler peran dari `src/App.tsx`**

Hapus baris 85:

```tsx
  const [currentRole, setCurrentRole] = useState<AppRole>('owner');
```

Hapus baris 87-93 seluruhnya:

```tsx
  function handleChangeRole(next: AppRole) {
    setCurrentRole(next);
    const match = mockUsers.find((u) => u.role === next);
    if (match) {
      try { localStorage.setItem('app.currentDisplayName', match.displayName); } catch { /* ignore */ }
    }
  }
```

- [ ] **Step 4: Hapus dropdown Role dari `src/App.tsx`**

Hapus blok di baris 683-695:

```tsx
        {/* Role Switcher */}
        <div className="px-4 pt-2 pb-0 flex items-center justify-end gap-2">
          <span className="text-[10px] text-slate-400">Role:</span>
          <select
            value={currentRole}
            onChange={(e) => handleChangeRole(e.target.value as AppRole)}
            className="h-6 text-[10px] px-2 border border-gray-200 rounded outline-none bg-white"
          >
            {mockUsers.map((u) => (
              <option key={u.id} value={u.role}>{u.displayName}</option>
            ))}
          </select>
        </div>
```

Dropdown ini membiarkan siapa pun menjadi peran apa pun dengan satu klik, jadi ia bukan otorisasi — sekarang digantikan sesi login yang sebenarnya.

- [ ] **Step 5: Bungkus cabang aplikasi dengan `AuthGate`**

Di baris 656, ubah:

```tsx
      {viewMode === 'app' && (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden font-sans">
```

menjadi:

```tsx
      {viewMode === 'app' && (
    <AuthGate>
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden font-sans">
```

Lalu di ujung berkas (baris 967-968), ubah:

```tsx
    </div>
      )}
    </>
```

menjadi:

```tsx
    </div>
    </AuthGate>
      )}
    </>
```

`Landing` dan `SeedPage` sengaja dibiarkan di luar gerbang: keduanya adalah cabang `viewMode` terpisah, dan `Landing` memang halaman publik.

- [ ] **Step 6: Verifikasi build lolos**

Run: `npm run build`
Expected: selesai tanpa galat. Jika muncul galat "`currentRole` is declared but never read" atau serupa, berarti masih ada sisa rujukan yang terlewat — bersihkan.

- [ ] **Step 7: Jalankan aplikasi dan buktikan gerbangnya bekerja**

```bash
npm run dev
```

Buka `http://localhost:3000/`. Yang harus terlihat:
1. Halaman login muncul — dashboard tidak bisa diakses tanpa sesi.
2. Masukkan username `owner` dengan password yang salah → pesan "Username atau password salah."
3. Masukkan username `owner` dengan password yang benar → dashboard terbuka.
4. Muat ulang halaman (F5) → tetap di dashboard, tidak diminta login lagi. Ini membuktikan sesi tersimpan.
5. Buka DevTools → Console. Tidak boleh ada galat merah.

- [ ] **Step 8: Commit**

```bash
git add src/components/Auth/AuthGate.tsx src/App.tsx
git commit -m "feat(auth): gate app behind login, remove role switcher"
```

---

### Task 5: Identitas nyata di Sidebar dan jejak audit

**Files:**
- Modify: `src/components/Layout/Sidebar.tsx` — blok pengguna (236-252), props (42-50)
- Modify: `src/pages/ProductionMonitoring.tsx` — state dan effect (104-111), impor (1)

**Interfaces:**
- Consumes: `useAuth()` dari `src/contexts/AuthContext.tsx` (Task 2), dijamin tersedia oleh `AuthGate` (Task 4).
- Produces: tidak ada antarmuka baru. `Sidebar` tidak mendapat props tambahan — ia memanggil `useAuth()` sendiri, karena `App.tsx` tidak punya kepentingan pada identitas pengguna dan meneruskannya lewat props hanya menambah sambungan.

- [ ] **Step 1: Tampilkan identitas nyata di blok pengguna Sidebar**

Di `src/components/Layout/Sidebar.tsx`, tambahkan impor:

```tsx
import { useAuth } from '@/contexts/AuthContext';
```

Tambahkan `LogOut` ke daftar ikon lucide yang sudah diimpor di baris 2-22 berkas itu (setelah `ExternalLink`).

Di dalam fungsi `Sidebar`, dekat state lain (setelah baris 54), tambahkan:

```tsx
  const { profile, signOut } = useAuth();
  const initials = profile.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
```

Ganti blok pengguna (baris 236-252) — yang sekarang menuliskan "AD / Admin / Manager" secara keras — dengan:

```tsx
      {/* User Block */}
      <div
        className={cn(
          'mb-3 rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-100/60 flex items-center gap-2.5',
          collapsed ? 'mx-2 p-2 justify-center' : 'mx-3 p-2.5'
        )}
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-sky-500 flex items-center justify-center shadow-sm shadow-sky-200 flex-shrink-0">
          <span className="text-[11px] font-bold text-white">{initials}</span>
        </div>
        {!collapsed && (
          <>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[12px] font-semibold text-slate-700 truncate">{profile.displayName}</span>
              <span className="text-[10px] text-slate-400 capitalize">{profile.role}</span>
            </div>
            <button
              onClick={() => signOut()}
              title="Keluar"
              aria-label="Keluar"
              className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
```

- [ ] **Step 2: Ganti sumber `inputBy` di ProductionMonitoring**

Di `src/pages/ProductionMonitoring.tsx`, tambahkan impor:

```tsx
import { useAuth } from '@/contexts/AuthContext';
```

Hapus baris 104 dan effect di baris 106-111:

```tsx
  const [currentDisplayName, setCurrentDisplayName] = useState<string>('Owner');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('app.currentDisplayName');
      if (stored) setCurrentDisplayName(stored);
    } catch { /* ignore */ }
  }, []);
```

Ganti dengan satu baris:

```tsx
  const { profile } = useAuth();
  const currentDisplayName = profile.displayName;
```

Nama variabel `currentDisplayName` dipertahankan supaya pemakaiannya di baris 168 (`inputBy: currentDisplayName`) tidak perlu diubah. Nilai lama berasal dari localStorage yang bisa disunting pengguna, jadi jejak audit sebelum ini tidak bisa dipercaya.

- [ ] **Step 3: Verifikasi build lolos**

Run: `npm run build`
Expected: selesai tanpa galat. Perhatikan kemungkinan peringatan `useEffect` atau `useState` yang jadi tidak terpakai di `ProductionMonitoring.tsx` — keduanya masih dipakai di tempat lain pada berkas itu (baris 117 dan 95-103), jadi impornya tetap.

- [ ] **Step 4: Jalankan aplikasi dan buktikan jejak audit benar**

```bash
npm run dev
```

1. Login sebagai `owner`. Periksa blok pengguna di bawah sidebar: harus menampilkan "Pemilik" dan peran "owner", bukan "Admin / Manager".
2. Di Production Monitoring, simpan satu entri cutting. Ini sekaligus membuktikan kebijakan RLS `authenticated` dari Task 1 bekerja — sebelum kebijakan itu ada, penyimpanan akan gagal.
3. Verifikasi kolom `inputBy` lewat Supabase MCP:

```sql
select work_order_id, total_cutting, input_by, input_at
from public.cutting_records
order by id desc
limit 3;
```

Diharapkan: baris terbaru punya `input_by = 'Pemilik'`.

4. Klik tombol logout di sidebar → kembali ke halaman login.
5. Login sebagai `finance` → blok pengguna menampilkan "Finance / finance", dan seluruh menu sidebar tetap terlihat (tidak ada penyaringan berdasarkan peran).

- [ ] **Step 5: Commit**

```bash
git add src/components/Layout/Sidebar.tsx src/pages/ProductionMonitoring.tsx
git commit -m "feat(auth): use real identity in sidebar and audit trail"
```

---

### Task 6: Susutkan AppRole menjadi tiga nilai

**Files:**
- Modify: `src/types/pipeline.ts:176`

**Interfaces:**
- Consumes: tidak ada. Task ini hanya mungkin setelah `mockUsers` hilang di Task 4 — itulah satu-satunya tempat yang memakai `'admin'` dan `'spv_konveksi'`.
- Produces: `AppRole` = `'owner' | 'finance' | 'inventory'`. `Profile.role` di `src/lib/auth.ts` (Task 2) otomatis ikut menyempit, dan kini sejalan dengan batasan `CHECK` pada kolom `profiles.role` (Task 1).

- [ ] **Step 1: Pastikan tidak ada lagi pemakai `admin` / `spv_konveksi`**

Cari di seluruh `src/`:

```bash
grep -rn "spv_konveksi\|'admin'" src/
```

Expected: tidak ada hasil. Jika masih ada, Task 4 belum tuntas — jangan lanjut, selesaikan dulu.

- [ ] **Step 2: Sunting `src/types/pipeline.ts:176`**

Ubah:

```ts
export type AppRole = 'owner' | 'admin' | 'inventory' | 'spv_konveksi' | 'finance';
```

menjadi:

```ts
// Sejalan dengan batasan CHECK pada kolom public.profiles.role.
export type AppRole = 'owner' | 'finance' | 'inventory';
```

- [ ] **Step 3: Verifikasi build lolos**

Run: `npm run build`
Expected: selesai tanpa galat. Kalau ada galat, artinya ada tempat yang masih menyebut peran yang dihapus — Step 1 melewatkannya.

- [ ] **Step 4: Commit**

```bash
git add src/types/pipeline.ts
git commit -m "refactor(types): narrow AppRole to three roles in use"
```

---

### Task 7: Hapus modul Selesai Finishing

**Files:**
- Modify: `src/types/index.ts:92`
- Modify: `src/data/mockData.ts` — `viewConfig` (41-61), builder (213-306), fixture (309-323)
- Modify: `src/components/Panel/DetailPanel.tsx` — case (119-120), komponen (136-276)
- Modify: `src/components/Layout/TopBar.tsx:17`
- Modify: `src/App.tsx` — default view (72), preset view (109-134), config pengganti (170-175), empat `case`

**Interfaces:**
- Consumes: tidak ada. Task ini murni penghapusan.
- Produces: `ModuleId` tanpa `'selesai-finishing'`.

- [ ] **Step 1: Hapus dari `ModuleId`**

Di `src/types/index.ts`, hapus baris 92:

```ts
  | 'selesai-finishing'
```

Ini akan memicu galat TypeScript di setiap tempat yang masih merujuknya — itu justru yang kita mau, sebagai daftar kerja untuk langkah berikutnya.

- [ ] **Step 2: Hapus dari `src/data/mockData.ts`**

Hapus entri `viewConfig['selesai-finishing']` di baris 41-61 (14 kolom, dari `'selesai-finishing': {` sampai penutupnya).

Hapus baris 213-306 seluruhnya: komentar header "===== Selesai Finishing row builder =====", `interface FinishingInput`, `function toBlankAware`, dan `function buildFinishingRow`.

Hapus entri fixture `mockData['selesai-finishing']` di baris 309-323 — komentar "===== RAW: Normal records =====" beserta sembilan panggilan `buildFinishingRow({...})` dan komentar "===== PERLU REGISTER INVOICE ... =====" di tengahnya.

**Jangan** hapus `generateWorkCode` (baris 406) — masih dipakai `DetailPanel.tsx:184`. **Jangan** hapus `parseInformationVariation` atau `supabaseWorkCodes` — keduanya masih dipakai `DetailPanel.tsx`.

- [ ] **Step 3: Hapus dari `src/components/Panel/DetailPanel.tsx`**

Hapus dua baris di `PanelForm` (119-120):

```tsx
    case 'selesai-finishing':
      return <SelesaiFinishingForm row={row} isAddingNew={isAddingNew} readOnly={readOnly} />;
```

Hapus komentar "===== Selesai Finishing Form =====" dan seluruh fungsi `SelesaiFinishingForm` (baris 136-276, sekitar 140 baris).

Hapus juga `StatusLegendItem` (didefinisikan di baris 512). Sudah diverifikasi: satu-satunya pemakaiannya ada di baris 262-267, di dalam `SelesaiFinishingForm` — jadi setelah form itu hilang, ia menjadi kode mati dan `npm run build` akan mengeluh soal deklarasi tak terpakai.

Sesudahnya, pastikan tidak ada sisa:

```bash
grep -n "StatusLegendItem" src/components/Panel/DetailPanel.tsx
```

Expected: tidak ada hasil.

- [ ] **Step 4: Hapus warna ikon di `src/components/Layout/TopBar.tsx`**

Hapus baris 17:

```tsx
  'selesai-finishing': 'text-emerald-500',
```

- [ ] **Step 5: Ubah tampilan awal di `src/App.tsx`**

Baris 72, ubah:

```tsx
  const [currentView, setCurrentView] = useState<ModuleId>('selesai-finishing');
```

menjadi:

```tsx
  const [currentView, setCurrentView] = useState<ModuleId>('production-monitoring');
```

Production Monitoring adalah item teratas sidebar (`mockData.ts:430`) dan pengganti fungsional dari tabel yang dihapus.

- [ ] **Step 6: Hapus blok preset view di `src/App.tsx`**

Hapus baris 109-134 di dalam `getModuleViews` — komentar "Preset views for Selesai Finishing" beserta seluruh `if (moduleId === 'selesai-finishing') { ... }` yang mendefinisikan tab "Raw Data", "Clear Finish", dan "Need Invoice". Fungsi jadi langsung ke `return` default di baris 136.

- [ ] **Step 7: Ganti config pengganti di `src/App.tsx`**

Baris 170, 174, dan 175 memakai `selesai-finishing` sebagai config *pengganti* saat Production Monitoring atau Sewing Entry aktif. Kedua halaman itu merender komponennya sendiri dan tidak memakai config tersebut, jadi ini penopang kosong.

Ubah baris 170:

```tsx
  const settings = isPipelineView ? makeDefaultSettings('selesai-finishing') : getSettings(currentView, currentViewTab);
```

menjadi:

```tsx
  const settings = isPipelineView ? makeDefaultSettings('production-monitoring') : getSettings(currentView, currentViewTab);
```

Ubah baris 174-175:

```tsx
  const effectiveModule = isPipelineView ? 'selesai-finishing' : (isCombinedView ? activeSubModule : currentView);
  const config = isPipelineView ? viewConfig['selesai-finishing'] : viewConfig[effectiveModule];
```

menjadi:

```tsx
  const effectiveModule = isPipelineView ? 'production-monitoring' : (isCombinedView ? activeSubModule : currentView);
  const config = isPipelineView ? viewConfig['production-monitoring'] : viewConfig[effectiveModule];
```

`viewConfig['production-monitoring']` sudah ada di `mockData.ts:4` dengan `columns: []`, jadi `makeDefaultSettings` menghasilkan daftar kolom kosong — tepat seperti sebelumnya.

- [ ] **Step 8: Hapus empat `case` di `src/App.tsx`**

Di `fetchModuleData` (baris 187-203), hapus `case 'selesai-finishing': { ... }` beserta komentar "Derived: join work_orders + ...". Perhatikan: `case 'selesai-jahit'` di baris 204 melakukan query `work_orders` yang serupa dan **tetap dipertahankan**.

Di `refetchTableData` (baris 259-273), hapus `case 'selesai-finishing': { ... }`.

Di `handleDeleteRow` (baris 508), hapus baris `case 'selesai-finishing':`. Baris `case 'selesai-jahit':` dan `case 'register-jahit':` di bawahnya tetap — ketiganya berbagi satu badan `case`, jadi hanya labelnya yang hilang.

Di `handleSaveData`, hapus `case 'selesai-finishing': { ... }` pada cabang `isAddingNew` (baris 556-560), dan hapus label `case 'selesai-finishing':` pada cabang update (baris 584) — dua label di bawahnya tetap.

Setelah semua ini, `computeCutVsUpload` dan `computeStatusStock` (impor di baris 2) **tetap dipakai** di baris 324-325 pada jalur pemrosesan data umum. Jangan hapus impornya.

- [ ] **Step 9: Pastikan tidak ada sisa rujukan**

```bash
grep -rn "selesai-finishing\|SelesaiFinishing\|buildFinishingRow\|FinishingInput" src/
```

Expected: tidak ada hasil sama sekali.

- [ ] **Step 10: Verifikasi build lolos**

Run: `npm run build`
Expected: selesai tanpa galat TypeScript. Kalau `Record<ModuleId, ...>` mengeluh soal kunci yang kurang atau berlebih, berarti ada entri di `viewConfig` atau `mockData` yang belum sinkron dengan `ModuleId` — periksa keduanya.

- [ ] **Step 11: Jalankan aplikasi dan buktikan tidak ada yang rusak**

```bash
npm run dev
```

1. Login sebagai `owner` → halaman pertama yang terbuka adalah **Production Monitoring**, bukan tabel Selesai Finishing.
2. Klik setiap menu di sidebar satu per satu: Production Monitoring, Order Entry, keempat Master Data, Register PO, Target Jahit, Invoicing. Tidak boleh ada layar putih atau galat di konsol.
3. Buka DevTools → Console. Tidak boleh ada galat merah.
4. Di Production Monitoring, buka panel detail satu work order → panel terbuka normal.

- [ ] **Step 12: Commit**

```bash
git add src/types/index.ts src/data/mockData.ts src/components/Panel/DetailPanel.tsx src/components/Layout/TopBar.tsx src/App.tsx
git commit -m "refactor: remove Selesai Finishing module"
```

---

### Task 8: Perbarui dokumentasi proyek

**Files:**
- Modify: `project.md` — bagian "Latest Progress", dan baris 119-122 serta 391 yang menyebut Selesai Finishing

**Interfaces:**
- Consumes: hasil Task 1-7.
- Produces: tidak ada kode.

- [ ] **Step 1: Perbarui bagian yang menyebut Selesai Finishing**

Di `project.md`, hapus bagian "### Selesai Finishing Table" (baris 119-122) dan butir "- Selesai Finishing table with auto-computed fields" (baris 391). Baca dulu sekitarnya untuk memastikan tidak ada rujukan lain yang jadi menggantung.

- [ ] **Step 2: Tulis bagian "Latest Progress"**

Perbarui sesuai aturan wajib di `CLAUDE.md`. Sebutkan:
- Login Supabase Auth dengan tiga akun (`owner`, `finance`, `inventory`); username dipetakan ke `@konveksi.local`.
- Peran di tabel `public.profiles`; ketiga peran melihat seluruh menu — peran hanya identitas untuk jejak audit.
- Kebijakan RLS `authenticated` ditambahkan pada `work_orders`, `sewing_records`, `cutting_records`. Kebijakan `anon` **belum** dicabut — ini tindak lanjut yang tertunda.
- Dropdown "Role:" dan `localStorage['app.currentDisplayName']` dihapus; `inputBy` sekarang dari sesi login.
- Modul Selesai Finishing dihapus; tampilan awal menjadi Production Monitoring.
- Rujukan ke spec dan rencana ini.

- [ ] **Step 3: Commit**

```bash
git add project.md
git commit -m "docs: update project status for auth and module removal"
```

---

## Tindak Lanjut (di luar cakupan rencana ini)

Dicatat di spec, tidak dikerjakan di sini:

- Kebijakan `anon` pada `work_orders`, `sewing_records`, `cutting_records` masih memberi hak tulis **tanpa login**. Mencabutnya perlu pemeriksaan jalur satu per satu.
- `invoices`, `invoice_payments`, `invoice_payment_files`, `register_po`, `register_po_components` punya RLS aktif **tanpa kebijakan sama sekali** — terkunci total dari klien.
- Sebagian besar tabel master hanya punya izin baca.
- Modul yatim yang sengaja dibiarkan: `selesai-jahit`, `production-data`, `register-jahit`, `daftar-libur`, `register-penjahit`.
