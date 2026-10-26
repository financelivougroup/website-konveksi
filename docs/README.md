# Indeks Dokumentasi

Diperbarui 2026-10-22. Dokumentasi aktif menggambarkan working tree yang dapat mencakup perubahan belum commit; keberadaan kode/migration bukan bukti telah di-deploy.

## Sumber aktif

| Dokumen | Fungsi |
|---|---|
| [README](../README.md) | Cara menjalankan dan memverifikasi proyek |
| [project](../project.md) | Ringkasan aktif, backlog dan Latest Progress |
| [CONTEXT](../CONTEXT.md) | Hubungan domain, pemetaan implementasi, batas akses dan kesenjangan |
| [GLOSSARY](../GLOSSARY.md) | Istilah bisnis; tanpa detail implementasi |
| [ADR index](adr/README.md) | Keputusan beserta trade-off, bukan changelog |
| [CLAUDE](../CLAUDE.md) | Aturan kerja agent |
| [Domain docs](agents/domain.md) | Cara membaca dan menjaga dokumen domain |
| [Issue tracker](agents/issue-tracker.md) | Konvensi ticket lokal |

## Spec dan plan historis

Ada **20 spec** di [superpowers/specs/](superpowers/specs/) dan **16 plan** di [superpowers/plans/](superpowers/plans/) pada audit ini. Dokumen bertanggal merekam kebutuhan saat itu; checkbox, contoh schema, urutan status, dan hitungan tes bukan pernyataan status hari ini. Tidak dilakukan rewrite massal agar riwayat keputusan dan hasil pengujian tidak dipalsukan.

| Riwayat / topik | Cara membaca sekarang |
|---|---|
| [Pipeline awal](superpowers/specs/2026-06-22-konveksi-pro-5-phase-pipeline-design.md) | Status tahap awal sudah berubah; lihat `CONTEXT.md` dan `src/lib/productionStatus.ts`. |
| [Integrasi Supabase](superpowers/specs/2026-07-08-supabase-integration-design.md) / [plan](superpowers/plans/2026-07-08-supabase-integration.md) | Batas service/fixture dipertahankan pada [ADR-0001](adr/0001-persistent-data-through-supabase-services.md). |
| [Invoicing](superpowers/specs/2026-07-10-invoicing-module-design.md) / [auto-invoice](superpowers/specs/2026-07-13-auto-invoice-with-register-po-design.md) | Baca bersama identitas order/variasi di [ADR-0002](adr/0002-order-variation-and-production-code-identity.md); bukan invoice per variasi saja. |
| [Target/Planning/harga/utang](superpowers/specs/2026-08-06-target-jahit-planning-pricing-debt-design.md) | Akses Utang Staff/Benefit diperluas 2026-10-22; rumus settlement terbaru pada ADR-0004. |
| [Kanban lima status](superpowers/specs/2026-08-08-kanban-5-status-productionstatus-design.md) | Model historis; kini empat status produksi `NEW`, `PROGRESS`, `FINISHED`, `INVOICED`. |
| [Kanban per Product Note](superpowers/specs/2026-08-10-kanban-productnote-fullscreen-design.md) / [plan](superpowers/plans/2026-08-10-kanban-productnote-fullscreen.md) | Aturan status **tertinggi** sudah digantikan aturan **terendah** di [ADR-0003](adr/0003-kanban-follows-least-advanced-variation.md). |
| [Derived Target](superpowers/specs/2026-08-18-target-jahit-derived-columns-design.md) | Baca bersama sumber settlement server terkini; hasil tanpa detail tidak selalu nol. |
| [Identitas Target per produksi](superpowers/specs/2026-08-27-target-jahit-product-note-identity-design.md) | Alasan pemisahan identitas tetap relevan; lihat ADR-0002. |
| [Belum Jahit](superpowers/specs/2026-08-29-target-jahit-belum-jahit-design.md) | Backlog fisik berbeda dari target bulanan/Utang Staff. Gate Utang/Benefit lama bukan aturan aktif. |
| [Universal Excel import](superpowers/specs/2026-08-26-universal-excel-import-design.md) | Dokumen desain; tidak dianggap fitur selesai hanya karena spec tersedia. |

Spec/plan lain tetap dapat ditemukan di folder masing-masing. Record `.superpowers/sdd/` dan `.scratch/` adalah bukti eksekusi/ticket lokal, bukan pengganti konteks kanonis; checkout worktree lain bukan sumber status working tree utama.

## Checkpoint verifikasi

- [KPI 2026-10-19, dengan pembaruan 2026-10-20](kpi-verification-2026-10-19.md): membedakan unit/service, browser fixture, SQL rollback dan login nyata. Bagian lama tetap historis; jangan menghidupkan kembali fitur ekspor yang sudah dihapus dari KPI.
- [Settlement 2026-10-21, dengan koreksi akses 2026-10-22](target-jahit-settlement-verification-2026-10-21.md): rumus Benefit potong utang, ledger, release gate pembayaran, serta batas verifikasi.

## Temuan terbuka audit domain

1. **Completion berbeda antar helper:** `deriveStatus` mensyaratkan Cutting > 0, sedangkan badge variasi COMPLETED mensyaratkan semua tahap >= qty. Ini perbedaan kode aktual, bukan invariant yang sudah disepakati; audit ini tidak mengubahnya.
2. **Settlement masih jahit:** membuka tab bagi seluruh akun tertaut tidak menambah sumber produksi Finishing/Leader; filter eligibility settlement tetap ada.
3. **Privasi legacy:** scope RPC pribadi tidak memperketat seluruh policy baca lama. Jangan menyatakan isolasi semua data aplikasi telah selesai.
4. **Fixture akses lama:** `scripts/smoke-settlement-browser.mjs` masih menolak non-Owner/Finance; belum mencerminkan akses pribadi yang baru.
5. **Kesiapan rilis:** gate pembayaran Benefit masih false pada MCP read-only 2026-10-22; login/API nyata, rekonsiliasi produksi, dan verifikasi hosting tetap berbeda dari unit/build.
