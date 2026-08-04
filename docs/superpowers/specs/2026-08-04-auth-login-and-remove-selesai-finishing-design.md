# Login Berbasis Role & Penghapusan Tabel Selesai Finishing

**Tanggal:** 2026-08-04
**Status:** Disetujui, siap diimplementasikan

## Ringkasan

Dua perubahan yang saling terkait:

1. **Autentikasi Supabase** — aplikasi tidak lagi bisa dibuka langsung. Pengguna harus login
   dengan username dan password. Tersedia tiga akun: `owner`, `finance`, `inventory`.
2. **Penghapusan tabel Selesai Finishing** — modul ini sudah tidak ada di sidebar dan
   digantikan Production Monitoring. Sisa kodenya dibersihkan.

Keduanya digabung dalam satu pekerjaan karena keduanya menyentuh `src/App.tsx` di titik yang
sama: `selesai-finishing` adalah tampilan awal aplikasi, dan tampilan awal itulah yang kini
digantikan gerbang login.

## Kondisi Awal

### Selesai Finishing sudah setengah mati

`navGroups` di `src/data/mockData.ts:426-457` tidak memuat entri Selesai Finishing. Modul ini
tetap terlihat hanya karena `src/App.tsx:72` menyetelnya sebagai `currentView` awal. Setelah
pengguna berpindah menu, tidak ada jalan kembali ke sana.

### Peran belum berupa otorisasi

`src/App.tsx:684-695` menampilkan dropdown "Role:" yang membiarkan siapa pun menjadi peran apa
pun dengan satu klik. `src/pages/ProductionMonitoring.tsx:104-108` membaca nama pengguna dari
`localStorage['app.currentDisplayName']` untuk mengisi kolom `inputBy`. Keduanya bisa disunting
pengguna, jadi jejak audit yang ada sekarang tidak bisa dipercaya.

### RLS bergantung pada role `anon`

Diverifikasi lewat Supabase MCP (`pg_policies`, 2026-08-04). Hak tulis pada `work_orders` dan
`sewing_records` hanya diberikan ke role `anon`:

| Tabel | Kebijakan | Role | Perintah |
|---|---|---|---|
| `work_orders` | Allow anon all on work_orders | `anon` | ALL |
| `work_orders` | Allow read for all | `public` | SELECT |
| `sewing_records` | Allow anon all on sewing_records | `anon` | ALL |
| `sewing_records` | Allow read for all | `public` | SELECT |
| `cutting_records` | Allow anon all on cutting_records | `anon` | ALL |
| `cutting_records` | insert / update / delete / select for all | `public` | masing-masing |

Ini konsekuensi yang menentukan: begitu pengguna login, supabase-js beralih dari role `anon` ke
`authenticated`, dan kebijakan `anon` tidak lagi berlaku. Tanpa kebijakan baru, Production
Monitoring dan Sewing Entry akan berhenti bisa menyimpan data.

## Keputusan Desain

### Gerbang auth di akar aplikasi

`src/App.tsx:652-656` sudah memakai pola `viewMode` (`'app' | 'landing' | 'seed'`). Gerbang login
dipasang di depan pola yang sama, membungkus seluruh cabang `viewMode === 'app'`.

Ditolak: penjaga per-halaman (mudah bocor kalau ada halaman baru yang lupa dipasangi), dan
migrasi ke react-router (membongkar navigasi sidebar berbasis state tanpa manfaat langsung).

### Peran disimpan di tabel `profiles`, bukan metadata pengguna

`raw_user_meta_data` pada `auth.users` bisa disunting pengguna sendiri lewat API, jadi tidak layak
menjadi sumber kebenaran peran. Tabel terpisah bisa dilindungi RLS dan nanti bisa dibaca dari
dalam policy.

### Username dipetakan ke email internal

Supabase Auth memerlukan email. Username dipetakan di dalam fungsi login:
`owner` → `owner@konveksi.local`, dan seterusnya. Form login hanya meminta username.

Konsekuensi yang diterima: reset password lewat email tidak akan berfungsi karena alamatnya tidak
nyata. Password diganti lewat dashboard Supabase.

### Peran tidak menyaring menu

Keputusan pengguna: ketiga peran punya hak yang sama karena data bersifat sekali-input dan tidak
bisa disunting, hanya bisa dihapus. Peran berfungsi sebagai identitas — dicatat pada `inputBy`
dan `audit_logs.changed_by`.

### Hak tulis penuh dipertahankan untuk tiga tabel produksi

Keputusan pengguna: `work_orders`, `sewing_records`, dan `cutting_records` tetap bisa ditulis
penuh setelah login.

Kebijakan `anon` **tidak dicabut** dalam pekerjaan ini. Mencabutnya adalah pengamanan yang benar,
tapi berisiko memutus jalur yang belum diperiksa satu per satu, dan lebih tepat menjadi pekerjaan
terpisah setelah login terbukti berjalan. Dicatat sebagai tindak lanjut.

## Perubahan Database

Semua lewat Supabase MCP. Skema masuk file migration; password tidak.

### Tabel `public.profiles`

```
id           uuid  primary key  references auth.users(id) on delete cascade
username     text  unique not null
display_name text  not null
role         text  not null  check (role in ('owner','finance','inventory'))
```

Tanpa trigger `on auth.users insert` — hanya ada tiga akun tetap yang dibuat sekali, dan lapisan
otomatis untuk itu justru menyulitkan pelacakan.

RLS: pengguna yang login boleh `SELECT` seluruh baris (agar nama pemilik entri bisa ditampilkan).
Tanpa hak tulis dari klien.

### Kebijakan RLS baru untuk role `authenticated`

Menyamai hak `anon` yang ada sekarang, sehingga perilaku aplikasi tidak berubah setelah login:

- `work_orders` — ALL untuk `authenticated`
- `sewing_records` — ALL untuk `authenticated`
- `cutting_records` — ALL untuk `authenticated`

### Akun pengguna

Tiga akun dibuat langsung ke database (bukan lewat migration, agar password tidak masuk git):

| Username | Email internal | Peran | Nama tampilan |
|---|---|---|---|
| `owner` | owner@konveksi.local | `owner` | Pemilik |
| `finance` | finance@konveksi.local | `finance` | Finance |
| `inventory` | inventory@konveksi.local | `inventory` | Inventory |

Password acak 16 karakter, dibuat dengan RNG kriptografis dan disampaikan ke pengguna di luar
repositori.

## Perubahan Frontend

### Berkas baru

- `src/lib/auth.ts` — pemetaan username→email, `signIn()`, `signOut()`, pengambilan profil.
- `src/contexts/AuthContext.tsx` — context berisi pengguna aktif dan profilnya.
- `src/components/Auth/AuthGate.tsx` — memanggil `supabase.auth.getSession()` saat memuat.
  Belum ada sesi → render `LoginPage`. Sudah ada → ambil baris `profiles`, render aplikasi.
  Berlangganan `onAuthStateChange` agar tetap sinkron saat logout atau token kedaluwarsa.
- `src/pages/LoginPage.tsx` — form username + password. Memakai komponen shadcn/ui yang sudah
  tersedia di `src/components/ui/` (Card, Input, Label, Button). Tidak ada komponen baru yang
  perlu diambil dari registry.

### Berkas yang disunting

`src/App.tsx`
- Bungkus cabang `viewMode === 'app'` dengan `AuthGate`.
- Hapus array `mockUsers` (baris 37-43) dan state `currentRole` (baris 85).
- Hapus `handleChangeRole` (baris 87-93) beserta penulisan ke `localStorage`.
- Hapus dropdown "Role:" (baris 684-695).
- Ubah `currentView` awal dari `'selesai-finishing'` menjadi `'production-monitoring'`.
- Hapus blok preset view Selesai Finishing (baris 109-134).
- Ubah baris 170-175: ganti `viewConfig['selesai-finishing']` yang dipakai sebagai config
  pengganti menjadi `viewConfig['production-monitoring']`. Production Monitoring dan Sewing Entry
  merender komponennya sendiri dan tidak memakai config ini, jadi ini penopang kosong.
- Hapus `case 'selesai-finishing'` pada empat tempat: fetch (baris 187-203), refetch
  (baris 259-273), delete (baris 508), save (baris 556-560 dan 584).

`src/pages/ProductionMonitoring.tsx`
- Ganti pembacaan `localStorage['app.currentDisplayName']` (baris 104-108) dengan pembacaan dari
  `AuthContext`. Kolom `inputBy` (baris 168) kini terisi nama pengguna yang benar-benar login.

`src/components/Layout/Sidebar.tsx`
- Blok pengguna (baris 236-252) kini menampilkan nama dan peran sebenarnya, bukan "Admin /
  Manager" yang ditulis keras. Tambahkan tombol logout.

`src/types/pipeline.ts`
- Kecilkan `AppRole` (baris 176) dari lima nilai menjadi `'owner' | 'finance' | 'inventory'`.
  Nilai `admin` dan `spv_konveksi` tidak dipakai di logika mana pun — hanya muncul di
  `mockUsers` yang ikut terhapus.

`src/types/index.ts`
- Hapus `'selesai-finishing'` dari `ModuleId` (baris 92).

`src/data/mockData.ts`
- Hapus entri `viewConfig['selesai-finishing']` (baris 41-61, 14 kolom).
- Hapus `interface FinishingInput`, `toBlankAware()`, `buildFinishingRow()` (baris 222-306).
- Hapus fixture `mockData['selesai-finishing']` (baris 309-323, 9 baris).

`src/components/Panel/DetailPanel.tsx`
- Hapus `case 'selesai-finishing'` (baris 119-120) dan komponen `SelesaiFinishingForm`
  (baris 136-276, sekitar 140 baris).

`src/components/Layout/TopBar.tsx`
- Hapus entri warna ikon `'selesai-finishing'` (baris 17).

### Tidak disentuh

- Tabel `work_orders` tidak berubah. Selesai Finishing hanya salah satu pembacanya; Production
  Monitoring, Register Jahit, dan Selesai Jahit juga membacanya.
- `generateWorkCode()` di `mockData.ts:406` tetap ada — dipakai `DetailPanel.tsx:184`.
- `computeCutVsUpload()` dan `computeStatusStock()` di `src/lib/utils.ts` tetap ada — dipakai
  `App.tsx:324-325` pada jalur pemrosesan data umum.
- Modul yatim lain (`selesai-jahit`, `production-data`, `register-jahit`, `daftar-libur`,
  `register-penjahit`) sengaja dibiarkan. `daftar-libur` dan `register-penjahit` masih punya
  service layer aktif di `src/services/`.

## Verifikasi

1. `npm run build` (tsc + vite) lolos tanpa galat.
2. Jalankan aplikasi: halaman login muncul, aplikasi tidak bisa diakses tanpa sesi.
3. Login sebagai `owner` → masuk ke Production Monitoring.
4. Simpan satu entri cutting → membuktikan kebijakan RLS `authenticated` bekerja.
5. Periksa kolom `inputBy` terisi nama pengguna yang login, bukan nilai dari localStorage.
6. Logout → kembali ke halaman login.
7. Login sebagai `finance` dan `inventory` → keduanya berhasil dan melihat seluruh menu.

Proyek ini tidak punya test runner, jadi pembuktian dilakukan lewat build ditambah menjalankan
aplikasi.

## Tindak Lanjut (di luar cakupan)

Temuan dari inspeksi RLS yang tidak ditangani di sini:

- Kebijakan `anon` pada `work_orders`, `sewing_records`, dan `cutting_records` masih memberi hak
  tulis tanpa login. Mencabutnya adalah pengamanan yang benar, tapi perlu pemeriksaan jalur satu
  per satu.
- `invoices`, `invoice_payments`, `invoice_payment_files`, `register_po`, dan
  `register_po_components` punya RLS aktif tanpa kebijakan sama sekali — terkunci total dari
  klien.
- Sebagian besar tabel master hanya punya izin baca.

Ketiganya adalah masalah yang sudah ada sebelum pekerjaan ini.
