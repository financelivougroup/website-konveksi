# Website Konveksi

Dashboard operasional konveksi untuk Order Produksi, Cutting, Sewing, Pasang Kancing, Finishing, penagihan, kinerja karyawan, serta Expense. Produk utama adalah dashboard SaaS, bukan landing page.

## Mulai membaca

- [project.md](project.md) — ringkasan aktif, pekerjaan terbuka, dan Latest Progress.
- [CONTEXT.md](CONTEXT.md) — hubungan domain, batas akses, implementasi dan kesenjangan yang diketahui.
- [GLOSSARY.md](GLOSSARY.md) — arti istilah bisnis yang dipakai bersama.
- [docs/README.md](docs/README.md) — indeks dokumen dan status riwayatnya.
- [docs/adr/README.md](docs/adr/README.md) — alasan keputusan arsitektur/domain.
- [CLAUDE.md](CLAUDE.md) — aturan kerja agent; baca sebelum melakukan perubahan.

## Pengembangan

Node.js dan npm diperlukan; versi dependency yang diminta ada di `package.json`, resolusi aktual di `package-lock.json`. Instal dependency proyek dengan `npm ci` bila belum tersedia.

```sh
npm run dev
```

Vite dikonfigurasi di `vite.config.ts` (port 3000 saat dokumentasi ini ditulis). Jika proses dihentikan penjaga memori, nyalakan kembali hanya saat diperlukan/diminta; itu bukan bukti bug aplikasi.

```sh
npm run build
npm run lint
node --test --test-concurrency=1 tests/*.test.ts
```

Build menjalankan TypeScript dan Vite. Proyek tidak menyediakan script `npm test` dan tidak menggunakan Vitest sebagai test runner unit. Lint global dapat memiliki temuan di luar file yang sedang dikerjakan; hasil scoped lint bukan bukti seluruh lint bersih.

## Backend dan lampiran

Gunakan `.env.example` sebagai panduan variabel publik aplikasi; jangan commit credential. Konfigurasi saat audit 2026-10-22 menggunakan **Supabase cloud**, sementara frontend dan Worker dapat berjalan lokal. `supabase/migrations/` adalah riwayat migration, bukan bukti stack lokal terpasang. Semua inspeksi/perubahan database oleh agent wajib lewat Supabase MCP.

Lampiran menggunakan Cloudflare R2 melalui Worker di `worker/`. Perintah Worker ada di `worker/package.json`; `VITE_R2_SIGN_ENDPOINT` menentukan endpoint yang dipakai aplikasi. Default baca melalui `/media/...`, unggah melalui `/sign/upload`; jangan menaruh credential R2 di browser.

## Batas verifikasi

Dokumentasi ini tidak menyatakan seluruh fitur siap rilis. Khusus pembayaran Benefit, release gate live masih nonaktif pada audit 2026-10-22; baca [konteks settlement](CONTEXT.md#kinerja-tarif-dan-settlement) serta [checkpoint verifikasi](docs/target-jahit-settlement-verification-2026-10-21.md). Pengujian fixture tidak menggantikan login/API nyata per role.
