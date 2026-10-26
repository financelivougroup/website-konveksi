# Verifikasi Monitor Kinerja Produksi

Tanggal awal: 2026-10-19. Diperbarui 2026-10-20. Checkpoint verifikasi, bukan persetujuan rilis.

> **Konteks dokumentasi 2026-10-22:** dokumen ini mempertahankan bukti pada tanggal pengujian; jumlah tes, gate lama, dan fitur ekspor di bagian historis bukan status terkini. Baca [CONTEXT.md](../CONTEXT.md) dan [indeks dokumentasi](README.md) untuk keadaan aktif. Scope pribadi KPI tetap tidak membuktikan seluruh jalur baca legacy aman. Audit dokumentasi tidak mengulangi tes concurrency/browser atau mengaktifkan release pembayaran Benefit.

## Verifikasi lanjutan 2026-10-20 — build dan browser lulus

- **Build terbaru:** `npm run build` exit 0 dengan heap Node dibatasi 1024 MB. TypeScript ikut lulus; 3857 modul, bundle utama 2493.85 kB / gzip 665.29 kB. Warning existing Browserslist lama, import invoiceCode campuran dan chunk besar tetap ada.
- **Browser Chrome nyata, komponen asli + service fixture:** `scripts/check-kpi-browser.mjs` lulus untuk redirect Owner/Staff/Inventory, Team/pribadi, mode Bulan/Akumulasi, pergantian bulan/race, sort, riwayat, dan layout 390px tanpa horizontal page overflow. Tidak ada runtime exception. Ini **bukan sesi login atau database live**.
- **Settings browser:** Owner alasan wajib, dialog konfirmasi finalisasi, refresh setelah simpan menonaktifkan status stale, tombol unlock setelah respons final, edit target existing, error simpan + retry, filter audit dan pagination habis; Finance tidak mendapat unlock, Staff dialihkan tanpa request settings. Semua write diarahkan ke fixture in-memory, tidak memfinalkan bulan bisnis. Tab Orang dan alur hapus permanen penuh tidak diuji di browser pada sesi ini.
- **Heatmap browser:** ArrowRight, Home, End menggeser fokus tanggal benar, satu tab stop, switch Jahit/Finishing, computed colors light/dark. Tema gelap dipilih melalui menu Radix asli dan bertahan setelah reload. Screenshot Team, pribadi, settings HP dan tema diperiksa.
- **Theme fixture:** `KPI_BROWSER_PORT=9246 node scripts/check-kpi-theme-browser.mjs` lulus untuk permukaan gelap yang terpisah, teks tabel/header, badge, gauge, menu portal dan mobile tanpa overflow; kembali light menjaga header hitam.
- **Harness diperbaiki, bukan kode aplikasi:** fixture menyediakan Auth/settings boundaries terbaru dan `import.meta.env` kosong agar modul media tidak crash saat import; stylesheet hasil esbuild `app.css` kini benar-benar disajikan agar warna heatmap diuji, bukan kotak tanpa CSS. Theme assertion menunggu computed style selesai berganti.
- **Regresi:** suite saat ini **854/854 lulus, 0 gagal/skip** (`node --test --test-concurrency=1 --test-reporter=spec tests/*.test.ts`); smoke settings, service, generation lulus; scoped ESLint empat harness dan `git diff --check` lulus. Jumlah berbeda dari log 853 lama; hasil ini berdasarkan suite working tree saat verifikasi, bukan klaim ada tes produk baru ditambahkan sesi ini.
- **Koreksi catatan WhatsApp:** file `kpiExport.ts`, `KpiExportActions.tsx`, tes/smoke export dan tombol salin WhatsApp **tidak ada pada working tree saat diperiksa**, bertentangan dengan catatan sebelumnya yang menyebut dipertahankan. Tidak mengembalikannya atau mengklaim clipboard lulus; scope WhatsApp perlu konfirmasi bila masih diinginkan. CSV/PDF juga tetap tidak ada pada komponen KPI.
- **Batas yang tersisa:** login/API nyata per role, rekonsiliasi data operasional, alur pengaturan lain/hapus libur end-to-end, dan SPA fallback hosting belum dibuktikan sesi ini. Tidak mengulangi tes SQL atau menyimpulkan keadaan database live dari log lama. Tidak ada DB write/migration/seed/commit/push/deploy. Browser dan dua server fixture ditutup setelah pengujian untuk mengembalikan memori; server aplikasi utama tidak dinyalakan.

Bagian setelah ini merupakan riwayat; status gate lama dan keberadaan WhatsApp harus dibaca bersama koreksi terbaru di atas.

## Perubahan scope 2026-10-20 — CSV dan PDF dibatalkan

Atas permintaan user, **Monitor Kinerja Produksi tidak lagi menyediakan ekspor CSV maupun cetak/PDF**, baik Team maupun pribadi. Tombol unduhan/pratinjau, helper CSV/slip, komponen slip dan print root/CSS, serta smoke test cetak khusus sudah dihapus. Ekspor invoice dan modul laporan lain tidak diubah. Ringkasan WhatsApp, heatmap, dark mode, dan tampilan KPI tetap dipertahankan.

Verifikasi setelah penghapusan: TypeScript dan scoped lint lulus; 6 tes WhatsApp/heatmap dan smoke handler yang memastikan ketiadaan CSV/PDF sekaligus clipboard tetap berfungsi lulus; seluruh suite **853/853 lulus** (9 tes fitur yang dibatalkan dihapus, bukan gagal). Build/browser tidak dijalankan pada revisi ini. Unduhan CSV dan cetak/PDF **bukan lagi blocker atau syarat rilis fitur KPI**. Bagian CSV/PDF di catatan lama di bawah hanya riwayat keputusan yang telah digantikan.

## Pembaruan 2026-10-20 — backend Fase 6

Status lama di bagian-bagian di bawah merupakan **riwayat checkpoint 2026-10-19**. Temuan terbaru:

- Finalisasi sudah diaktifkan melalui `2026-10-20-kpi-finalization-release.sql` setelah kandidat close privat diuji. RPC publik memanggil implementasi privat yang sama; tidak ada perubahan bulan operasional menjadi final.
- **Overlap close → writer:** holder PID `1922383`, `2026-10-20 01:19:45.819533–01:19:49.833840 UTC`; INSERT libur contender PID `1922384` pada `01:19:46.174211 UTC` ditolak `40001 KPI_WRITE_BUSY_RETRY`. Ini benar-benar overlap, berbeda dari probe serial sebelumnya.
- **Overlap writer → close:** holder INSERT libur PID `1923154`, `01:30:34.100426–01:30:38.106067 UTC`; close contender PID `1923155` pada `01:30:37.807723 UTC` ditolak `40001 KPI_WRITE_BUSY_RETRY`. Kedua transaksi dibatalkan/rollback; tidak memakai fixture operasional permanen.
- Close idempotent tidak menimpa snapshot final, penulisan setelah close ditolak, Owner unlock mengizinkan perubahan. Role kandidat dan RPC publik: Finance close diizinkan, Finance unlock ditolak, staff close ditolak, Owner unlock diizinkan.
- **Matrix 17 penolakan** pada transaksi fixture: qty sewing, tanggal sewing ke bulan lain, delete sewing, finishing sync/error/delete, target qty/delete, detail target, tanggal libur/delete, cost, effective date/delete versi, WO source reassignment, posisi/nama karyawan, dan permanent-delete cascade order. Cascade ditolak atomic tanpa partial delete. No-op edit dan Owner unlock tetap diizinkan.
- `2026-10-20-kpi-delete-preview.sql` menambahkan blocker final-month ke graph yang dipakai preview **dan** execute. Fixture hapus libur menampilkan bulan final di preview dan execute ditolak `DELETE_BLOCKED`.
- Planning Generate dipindahkan ke RPC `kpi_generate_targets` satu transaksi (`2026-10-20-kpi-atomic-generation.sql`), bukan preflight plus beberapa mutation HTTP. Tes qty parent/detail: create 30, merge menjadi 40; tes error pada grup bulan final kedua membuktikan grup bulan terbuka pertama ikut rollback, lalu setelah unlock kedua grup berhasil dibuat. Eligibility gaji tetap dicek ulang server dan kelompok tanpa gaji dilewati.
- UI settings kini mempunyai daftar target existing untuk edit, Hapus libur memakai `PermanentDeleteDialog`, filter audit yang sudah termuat, serta pagination audit berhenti saat habis. Settings dikunci pada `loadKey` bulan+nonce: status/data lama tidak dipakai untuk menyimpan ketika refresh masih berjalan. `scripts/smoke-kpi-settings.mjs` mengeksekusi handler asli dengan hooks/UI/service tiruan dan lulus untuk alasan/loaded-state, refresh stale, role unlock Finance, target existing, error simpan, dan shared holiday deletion. Ini bukan bukti browser/Radix nyata. Typecheck dan lint file perubahan lulus, termasuk setelah aktivasi close.
- Pemeriksaan setelah fixture: **0 final month, 0 fixture order/person/holiday**; authenticated tidak dapat memanggil helper close privat, anon tidak dapat Generate. Perubahan permanen hanya migration/schema/fungsi yang diizinkan, bukan data fixture bisnis.
- **Render cetak tanpa browser:** `scripts/smoke-kpi-print.mjs` merender komponen slip asli dengan React server renderer. Menguji escaping nama HTML, scope satu orang/bulan, 31 baris hari kalender, estimasi nol/parsial/null. Menemukan dan memperbaiki teks “Nilai diketahui…” yang sebelumnya muncul ketika estimasi sebenarnya null. Tes render dan lint terkait lulus; ini bukan bukti pagination PDF atau dialog cetak nyata.
- **Gate yang belum selesai:** browser settings/refresh, keyboard heatmap, tema gelap, download/clipboard browser, print/Save as PDF dan pagination cetak. Memori terakhir **16 MB free dari 7886 MB**; tidak menyalakan Chrome/server/build tambahan. Full suite terbaru dijalankan **serial** setelah refactor Generate/settings: **862/862 lulus**. Smoke `scripts/smoke-kpi-generation.mjs`, typecheck, scoped lint, dan diff-check juga lulus. Build belum diulang setelah patch terbaru. Pemeriksaan memori berikutnya 215–300 MB free (sebelumnya 460 MB), tetap tidak membuka browser. Tidak ada commit/push/deploy.

**Kesimpulan terbaru:** blocker backend utama sudah mempunyai bukti overlap dua arah dan matrix rollback; **Fase 6–7 belum boleh disebut selesai penuh sebelum regresi patch terbaru dan browser/cetak lulus**. Server lokal tetap OFF. Instruksi mempertahankan release gate nonaktif di bagian lama di bawah sudah digantikan migration release yang disebut di atas; jangan menerapkan ulang migration lama secara terpisah.

---

## Riwayat checkpoint 2026-10-19

## Keputusan

**BELUM SIAP RILIS PENUH.** Pemeriksaan kode, unit test, smoke service/handler, dan pengujian role database terisolasi lulus. Finalisasi bulan tetap dinonaktifkan di backend dan UI karena concurrency/cascade belum terverifikasi lengkap. Tampilan browser terbaru, dark mode dan hasil cetak belum diuji.

Tidak ada commit, push, deployment, atau aktivasi finalisasi dalam checkpoint ini. Server lokal tidak dinyalakan kembali.

## Bukti yang dijalankan pada Fase 8

| Pemeriksaan | Hasil | Batas bukti |
|---|---|---|
| `node --test tests/*.test.ts` | 862 lulus, 0 gagal | Unit test tidak membuktikan RLS, concurrency, atau browser |
| `npx tsc -b --noEmit` | Lulus | Tipe aplikasi |
| ESLint file `kpi*`, folder KPI, service/types KPI, test/harness KPI, main dan Vite config | Lulus | Bukan lint seluruh repo |
| ESLint seluruh `src` | Gagal: 46 error, 18 warning | Terdapat error di App, primitive/vendor, hooks dan file non-KPI; tidak diperbaiki massal |
| `node scripts/smoke-kpi-service.mjs` | Lulus | Service asli dengan backend tiruan, tidak membuktikan koneksi API live |
| `node scripts/smoke-kpi-export.mjs` | Lulus | Handler asli dengan hooks/UI tiruan, bukan unduhan/cetak browser nyata |
| `npm run build` | Lulus, exit 0 | 3861 modul; main bundle 2507.15 kB / gzip 668.89 kB |
| Pemeriksaan database via Supabase MCP | Lulus untuk cakupan di bawah | Tidak memperketat legacy SELECT policy |
| Browser terbaru / cetak PDF / dark mode | Belum dijalankan | Memori bebas sempat 934 MB, kemudian 438 MB dari 7886 MB |
| Dua transaksi saling overlap | Belum terbukti | Probe holder berurutan tidak menguji kompetisi lock |

Warning build: data Browserslist lama, import `invoiceCode` statis/dinamis bercampur, dan chunk utama >500 kB.

## Dua perbaikan yang dibuktikan dengan tes regresi

Berkas: `src/lib/kpiTeam.ts`, `tests/kpiTeam.test.ts`.

1. **Entry masa depan menggelembungkan Team:** fixture dengan tambahan 999 pcs pada 2026-10-25, tanggal acuan 2026-10-19, sebelumnya menghasilkan 1154 pcs alih-alih 155. Team kini membatasi input teramati sampai tanggal acuan, termasuk HPP dan akumulasi.
2. **Pembanding historis terpotong:** memilih September dengan tanggal acuan Oktober 19 sebelumnya membuang entry Agustus 25. Pembanding bulan lampau kini memakai bulan sebelumnya penuh; hanya bulan berjalan memakai cutoff tanggal sebanding. Override ritme lintas bulan hanya dipakai untuk bulan berjalan.

Kedua tes gagal sebelum patch dan lulus sesudah patch. Tanggal acuan eksplisit sehingga tes deterministik.

## Pemeriksaan database Fase 8

Supabase MCP memeriksa definisi live gate, trigger guard, fingerprint, resolver capture, finalisasi dan privilege.

### Role matrix non-vacuous

Fixture order, harga lengkap, baseline, work order, tiga entry sewing (1+2+3 pcs) dan satu entry finishing (5 pcs) dibuat untuk identitas profil di **satu transaksi yang di-rollback**. Sumber asing atas nama orang yang sama sengaja disertakan.

| Role/cakupan | Produksi pribadi | Estimasi fixture |
|---|---:|---:|
| Owner memilih penjahit | 6 pcs sewing | Rp78.000 |
| Finance memilih penjahit | 6 pcs sewing | Rp78.000 |
| Staff penjahit, termasuk permintaan ID asing | 6 pcs sewing sendiri | Rp78.000 |
| Dua staff finishing, termasuk permintaan ID asing | Masing-masing 5 pcs finishing sendiri | Masing-masing Rp10.000 |
| Supervisor/leader terhubung profil | 6 pcs sewing sendiri | Rp78.000 |
| Inventory tanpa orang | 0 pcs | Tidak tersedia |

Staff tidak melihat baris `kpi_audit` dan `kpi_price_baselines` melalui RLS tabel baru. Pengujian tidak membuktikan semua jalur baca legacy aman: policy baca tabel lama memang tidak diperketat pada fitur ini.

### Pengaman rilis

- Anon tidak dapat EXECUTE `kpi_tarif_entries` atau `kpi_upah_pribadi`.
- Authenticated tidak dapat EXECUTE helper resolver privat.
- Authenticated tidak mempunyai grant UPDATE/TRUNCATE langsung pada `bulan_status` atau INSERT pada `kpi_audit`.
- Permintaan Owner untuk close melalui `kpi_set_month` ditolak dengan `KPI_FINALIZATION_PENDING_VERIFICATION`.
- Setelah rollback: 0 order/WO/sewing/finishing fixture Fase 8 tersisa, 0 bulan final.
- Tidak ada migration atau perubahan data bisnis permanen pada Fase 8.

## Checklist fitur brief

**Implementasi + bukti unit/service** bukan sinonim **lulus visual/E2E**.

| Kelompok | Status implementasi | Sisa verifikasi |
|---|---|---|
| Bulan-Team: chip, gauge jahit, sisa hari/target, normal/ngebut, HPP | Ada; rumus dan cutoff diuji | Browser live terbaru dan rekonsiliasi data nyata |
| Bulan-Penjahit: progress, upah/pcs, sisa target sortable, normal/hari | Ada | Sort/keyboard/visual dengan data banyak dan sesi nyata |
| Bulan-Finishing: progress, sisa target, upah/pcs | Ada; sumber dipisah | Browser live dan rekonsiliasi nyata |
| Akumulasi-Team: gauge, sisa/ngebut, HPP dan tren, upah divisi | Ada; unit test | Periode historis panjang dan chart visual |
| Akumulasi per orang: progress, selisih dan ngebut, upah | Ada | Data nyata dan surplus/target kosong di UI |
| Halaman pribadi Harian/Bulanan/Akumulasi | Ada; scope/helper diuji | Login nyata tiap role, zoom dan riwayat browser terbaru |
| Estimasi upah pribadi staff | RPC aggregate scoped; matrix database lulus | Browser login/API nyata; bukan izin melihat tarif orang lain |
| Settings, audit dan kualitas data | Ada sebagian | Form/role/refresh browser; aksi hapus libur baru/filter audit belum lengkap |
| Finalisasi dan unlock | Close sengaja dinonaktifkan; Owner unlock tersedia | Release blocker concurrency/cascade/legacy writers |
| CSV | Scope/escaping/formula defense dan handler diuji | File unduhan browser nyata dan aplikasi spreadsheet |
| Ringkasan WhatsApp | Handler copy/fallback diuji | Izin clipboard browser nyata; tidak mengirim pesan |
| Slip bulanan Cetak / Save as PDF | Model/preview/print CSS ada | Dialog cetak, pagination panjang, hasil PDF |
| Heatmap, dark mode dan HP | Ada; data/ramp diuji sebelumnya | Visual, focus/keyboard/tooltip, overflow di browser terbaru |
| Rekonsiliasi sewing/finishing | Fixture database pribadi dan unit Team lulus | Total setiap bulan data operasional nyata |

## Blocker rilis yang masih terbuka

1. **Finalisasi:** dua sesi database benar-benar overlap untuk close-vs-writer/delete/version/holiday; dua arrival orders dan retry harus diuji. Jangan mengganti pengujian ini dengan `pg_sleep` holder yang dieksekusi serial. Hanya Supabase MCP sebagai antarmuka DB.
2. **Cascade:** matrix permanent-delete preview/execute, parent/WO reassignment, person/name/division, target detail/Planning, price interval dan holiday old/new. Gate harus tetap fail-closed sampai semua jalur yang memengaruhi bulan final terbukti.
3. **Planning generation:** masih multi-request; preflight dan error propagation bukan transaksi atomic. Partial writes tidak boleh disalahartikan sebagai berhasil penuh.
4. **Browser/resource:** pengaturan Fase 6 serta hasil Fase 7 (print, dark, heatmap, exports) belum diverifikasi dengan versi aplikasi saat ini. Server yang dihentikan low-memory tidak boleh direstart tanpa permintaan user.
5. **Akses legacy:** hasil pengujian RPC/tabel KPI baru bukan bukti pembatasan semua query tabel legacy; keputusan memperketat legacy reads tetap terpisah.
6. **Hosting:** SPA fallback `/laporan/*` belum dibuktikan pada hosting produksi. Build/frontend saja tidak menerapkan migration backend.
7. **Kualitas umum:** full-source lint masih gagal dan bundle besar. Scoped KPI lint/build lulus tidak menghilangkan dua temuan ini.

## Urutan lanjutan yang disarankan

1. Tuntaskan pengujian backend dua sesi dan matrix cascade dengan fixture terisolasi, tanpa menyentuh data operasional.
2. Perbaiki defect yang ditemukan, lalu ulangi role/regresi; aktifkan finalisasi hanya lewat forward migration setelah gate lulus.
3. Saat memori cukup dan user meminta server/browser dibuka, lakukan browser settings/export/print/dark/heatmap serta login nyata per role.
4. Rekonsiliasi angka dengan data nyata secara read-only dan verifikasi konfigurasi hosting/migration tujuan.
5. Baru evaluasi ulang readiness. Dokumen ini tidak menyatakan seluruh delapan fase selesai atau siap deploy.
