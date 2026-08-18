# Website Konveksi — Project Documentation

## Project Overview

**Website Konveksi** is a **Production Monitoring Dashboard** for a garment manufacturing (konveksi) business. It tracks clothing orders through a production pipeline — from order intake to cutting, sewing, finishing, and invoicing. The app also includes a marketing landing page for the business.

The system is designed around two conceptual modules:
1. **Production Module** (master/planning) — where inventory staff creates production orders.
2. **Konveksi Module** (execution pipeline) — where orders flow through Cutting → Sewing → Finishing → Invoicing.

Each work order carries two independent status axes: **production status** (physical progress) and **invoice status** (financial progress).

## Tech Stack

| Category | Technology | Version |
|---|---|---|
| Framework | React (TypeScript) | 19.2 |
| Build Tool | Vite | 7.2.4 |
| Styling | Tailwind CSS | 3.4.19 |
| UI Components | shadcn/ui (New York style, slate base) | — |
| UI Primitives | Radix UI | 40+ packages |
| Routing | React Router | 7.6 |
| Forms | React Hook Form + Zod | 7.70 / 4.3 |
| Charts | Recharts | 2.15 |
| Icons | Lucide React | 0.562 |
| Notifications | Sonner | 2.0 |
| Dates | date-fns | 4.4 |
| Carousel | Embla Carousel React | 8.6 |
| Theming | next-themes | 0.4 |

## Database

Currently using **mock data** (`src/data/mockData.ts` and `src/data/pipelineData.ts`). Data is stored in-memory as typed arrays. All mutations (CRUD) modify these arrays directly.

**Planned:** Supabase integration for persistent storage, real-time sync, and authentication.

## Folder Structure

```
Website Konveksi/
├── claude.md                          # Claude Code session instructions
├── project.md                         # This file — project documentation
├── index.html                         # Entry HTML
├── package.json                       # Dependencies & scripts
├── vite.config.ts                     # Vite configuration
├── tailwind.config.js                 # Tailwind theme & plugins
├── postcss.config.js                  # PostCSS config
├── tsconfig.json                      # TypeScript config
├── components.json                    # shadcn/ui config
├── eslint.config.js                   # ESLint config
├── src/
│   ├── main.tsx                       # App entry point
│   ├── App.tsx                        # Root component (routing, state, layout)
│   ├── App.css                        # App-level styles
│   ├── index.css                      # Global styles + Tailwind + CSS variables
│   ├── pages/
│   │   ├── Landing.tsx                # Marketing landing page
│   │   ├── ProductionMonitoring.tsx   # Production pipeline (4 tabs + Kanban)
│   │   ├── SewingEntryForm.tsx        # Sewing entry form
│   │   ├── OrderEntry.tsx             # Production order entry (create/pull/cancel)
│   │   └── Home.tsx                   # Boilerplate (unused)
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Sidebar.tsx            # Navigation sidebar
│   │   │   ├── TopBar.tsx             # Top bar with refresh/add buttons
│   │   │   ├── Toolbar.tsx            # Toolbar (filter, sort, group, etc.)
│   │   │   ├── SearchBar.tsx          # Search input with record count
│   │   │   ├── ViewTabs.tsx           # View tab navigation
│   │   │   └── ToastContainer.tsx     # Toast notification container
│   │   ├── Modals/
│   │   │   ├── ModalShell.tsx         # Reusable modal wrapper
│   │   │   ├── CustomizeFieldModal.tsx # Column visibility & customization
│   │   │   ├── FilterModal.tsx         # Filter rules editor
│   │   │   ├── GroupByModal.tsx        # Group-by rules editor
│   │   │   ├── SortModal.tsx           # Sort rules editor
│   │   │   ├── RowHeightModal.tsx      # Row height selector
│   │   │   ├── ConditionalColorModal.tsx # Conditional row coloring
│   │   │   ├── DateRangeModal.tsx      # Date range filter
│   │   │   └── AddViewModal.tsx        # Create new saved view
│   │   ├── Table/
│   │   │   ├── DataTable.tsx           # Main data table with column features
│   │   │   └── Pagination.tsx          # Pagination controls
│   │   ├── Panel/
│   │   │   └── DetailPanel.tsx         # Row detail/edit panel
│   │   └── ui/                        # 50+ shadcn/ui primitives
│   ├── types/
│   │   ├── index.ts                    # View config, filter/sort/group types, ModuleId
│   │   └── pipeline.ts                # Production pipeline types (WorkOrder, etc.)
│   ├── data/
│   │   ├── mockData.ts                 # Table view mock data + view configs
│   │   └── pipelineData.ts            # Pipeline mock data (orders, cutting, sewing)
│   ├── lib/
│   │   └── utils.ts                    # cn(), format helpers, badge utils
│   └── hooks/
│       ├── useToast.ts                 # Toast notification hook
│       ├── useViewSettings.ts          # View settings state management
│       └── use-mobile.ts              # Mobile detection hook
└── docs/
    └── superpowers/
        ├── specs/
        │   ├── 2026-06-22-konveksi-pro-5-phase-pipeline-design.md
        │   └── 2026-07-07-kanban-view-design.md
        └── plans/
            └── 2026-07-07-kanban-view.md
```

## Current Completed Features

### Landing Page (`/landing`)
- Glass-morphism design with blur orbs background
- Hero section with CTA, stats bar, services bento grid, process steps, contact form, footer
- "Open App" button toggles to dashboard view

### Navigation & Layout
- Sidebar with module groups: Pipeline, Master Data, Finance, System
- Top bar with refresh and add-new buttons
- Toolbar with filter, sort, group-by, row-height, conditional-color, date-range, export, import controls

### Production Monitoring
- **RAW DATA tab**: Table of all work orders with cutting/sewing/qty columns, multi-select, import action
- **Cutting Log tab**: Cutting queue (CUTTING_PENDING) with input form (single-shot, locked), cutting history
- **Sewing Log tab**: Sewing records table with search, sewing progress per work order with progress bars, "Entry Jahitan Baru" button
- **Kanban tab**: 7-column read-only Kanban board grouped by production status (Cutting Pending → Invoiced), card hover animations

### Sewing Entry Form
- Form with: work order selector (SEWING_IN_PROGRESS only), PIC penjahit selector, quantity, image upload, date
- Order info panel showing selected WO details (product, brand, cutting status, remaining quantity)
- Auto-updates WO status to SEWING_COMPLETE when total reaches quantity

### Order Entry
- Table of production orders with status filters (All / Planning / Pulled / Cancelled)
- Create new order modal with product note, product, brand, warna, size, quantity
- Pull-to-Konveksi action (creates WorkOrder with CUTTING_PENDING status)
- Cancel order action (only while PLANNING)

### Data Modules (via sidebar)
| Module | Status | Description |
|---|---|---|
| Production Monitoring | Active | Pipeline view (RAW + Cutting + Sewing + Kanban tabs) |
| Master Data Product | Read-only | Product catalog (sync flag, Supabase planned) |
| Raw Product Monitoring | Read-only | Fabric stock levels with status, priorities |
| Master Data Import | Read-only | Supplier import log |
| Target Jahit | Editable | Penjahit monthly targets & performance |
| Production Data | Combined view | Sub-tabs: Register Jahit, Daftar Libur, Register Penjahit |
| Invoicing | Planned | Coming soon |

### Table Features
- Column visibility toggle, drag-reorder, resize
- Column rename, notes, source indicators
- Conditional row coloring (5 colors, contains/equals operators)
- Row height presets (short/medium/tall/extra)
- Multi-field sorting, filtering, grouping
- Date range filter
- Pagination (10 per page)
- Row detail panel (view/edit/delete)

### Misc
- Role switcher (Owner, Admin, Inventory, Spv Konveksi, Finance)
- Toast notification system
- CSV export
- Import (multi-select mock)

## Pending Tasks

### From the 5-Phase Pipeline Revamp Spec (`docs/superpowers/specs/2026-06-22-konveksi-pro-5-phase-pipeline-design.md`)

| Phase | Task | Status |
|---|---|---|
| Phase A | Schema & Data Layer (new TypeScript types, status engine) | ✅ Done |
| Phase B | Auth & Role Routing (login page, role-based sidebar, route guards) | ❌ Pending |
| Phase C | Production Order Module (list, create, pull, cancel) | ✅ Done |
| Phase D | Cutting Module (queue, input form, locked submission) | ✅ Done |
| Phase E | Sewing Module (queue, entries view, progress bar, target-jahit ref) | 🔶 Partial |
| Phase F | Finishing Module (queue, form-based import, auto status formula) | ❌ Pending |
| Phase G | Invoicing Module (invoice list, generate, record payment, status flow) | ❌ Pending |
| Phase H | Audit Log & Admin Override (audit log page, override modal) | ❌ Pending |
| Phase I | Migration + E2E Testing | ❌ Pending |

### Other Pending Items
- [ ] Supabase integration (replace mock data)
- [ ] Real authentication (currently only role switcher)
- [ ] PDF invoice generation
- [ ] Email delivery for invoices
- [ ] Invoicing module sidebar integration
- [ ] Reports & analytics dashboards
- [ ] Settings page

## Latest Progress

### 2026-08-18 — Fix: Generate Target hasil 0 tanpa penjelasan

- **Root cause** (diverifikasi via Supabase MCP, bukan tebak-tebakan): picker bulan Generate default ke bulan berjalan (**2026-08**), sedangkan satu-satunya planning approved di DB untuk **2026-09** → query `.eq('bulan_target', genMonth).eq('status','approved')` tidak menemukan apa-apa → pesan "0 target jahit dibuat" tanpa penjelasan. INSERT `target_jahit` diuji via probe BEGIN/ROLLBACK — jalur insert berfungsi; RLS SELECT/INSERT policy `public` juga ada.
- **Fix** (commit `b942abe`): `generateTargetsFromPlanning` kini mengembalikan `approvedFound`; UI membedakan 3 hasil — (a) tidak ada planning approved di bulan itu (pesan menyuruh approve/pilih bulan), (b) ada tapi semua staf sudah pernah digenerate, (c) sukses ("N target dibuat dari M planning approved"). Ditambah **chip bulan** di samping picker: bulan-bulan yang punya planning approved (klik = pilih bulan itu).
- Tidak ada perubahan skema/logika status; data target_jahit tetap kosong (belum ada generate sukses oleh user).

### 2026-08-17 — Planning Produksi: kolom Status bisa diedit + gate generate target

- Kolom **Status** di tabel Planning Produksi kini **dropdown yang bisa diedit langsung** dari tabel: `draft` → `approved` / `rejected` (tersimpan ke `planning_produksi.status` via `updatePlanning`; klik dropdown tidak memicu modal edit — stopPropagation). Badge berwarna: hijau approved, merah rejected, abu-abu draft (commit `1960f8f`).
- **Generate Target Jahit kini hanya memproses planning berstatus `approved`** untuk bulan terpilih (`generateTargetsFromPlanning` tambah filter `.eq('status', 'approved')`) — draft/rejected tidak ikut digenerate.
- Tanpa perubahan skema DB (kolom `status` sudah ada tanpa constraint; data live masih kosong).

### 2026-08-17 — Register Karyawan: dropdown filter posisi dihapus

- Dropdown "Semua Posisi / Leader / Penjahit / Finishing" di toolbar Register Karyawan dihapus atas permintaan user (commit `27a8259`). Pemfilteran berdasarkan posisi tetap bisa dilakukan lewat tombol **Filter** baru (field Posisi tersedia). Select Posisi di modal tambah/edit tidak berubah.

### 2026-08-17 — Filter & Sort aktif di semua modul + teks data RAW seragam tanpa bold

- **Filter & Sort kini berfungsi penuh** di semua tabel (commit `d1fd46f`): komponen bersama baru `FilterButton`/`SortButton` (`src/components/Table/TableTools.tsx`) — panel popover multi-aturan; operator filter: mengandung/tidak mengandung/sama dengan/tidak sama dengan/lebih dari/kurang dari/kosong/tidak kosong (antar aturan AND); sort multi-level (naik/turun, nilai kosong selalu terakhir). Logika filter/sort di `src/lib/tableQuery.ts` (dipisah supaya TableTools tetap components-only, bebas warning react-refresh).
- Terpasang di: **RAW DATA** (17 field), **Planning Produksi**, **Register PO** (dengan field Work Code/Brand/Product tambahan di displayData), **Complain & Penalti**, **Register Karyawan**, **Target Jahit** (field mengikuti kolom yang terlihat per role). Tombol menyala biru + badge jumlah saat aktif; counter baris & empty state mengikuti hasil filter ("Tidak ada hasil yang cocok dengan filter").
- **Teks sel RAW DATA diseragamkan** atas permintaan user: semua font-mono 11px, font-medium/bold, dan beda warna dihapus — seluruh sel data kini 13px `text-gray-700` seragam; yang tersisa hanya pewarnaan angka progress (Cutting/Jahit/Finishing/Kancing/Sisa) dan badge Status. Tabel master lain (Register PO, Complain, Planning, Register Karyawan, nama di Target) ikut diratakan; ringkasan Utang Staf tetap punya penekanan sendiri (panel ringkasan, bukan tabel master).

### 2026-08-17 — Paritas tabel RAW ke Complain/Register PO/Target Jahit + hapus semua kolom Action + klik-baris-untuk-edit

- **Paritas RAW DATA** diterapkan ke 3 modul (commit `bbecaac`): **Complain & Penalti** (checkbox multi-select + toolbar Filter/Sort/Export CSV/Import/Delete bulk; tombol **Solve** pindah ke dalam sel Status), **Register PO** (toolbar + multi-select penuh), dan **Target Jahit** (ditulis ulang dari DataTable generik ke design system — 22 kolom, aturan visibilitas per role dipertahankan, tab Utang Staf ikut di-token; baris read-only karena data hasil generate, keputusan user).
- **Semua kolom Action dihapus** dari seluruh tabel modul: Complain, Register PO, Target Jahit (memang tidak ada), Planning Produksi, dan Register Karyawan (untuk konsistensi aturan global).
- **Klik baris = edit**: membuka modal edit di Planning Produksi, Register PO, Complain, Register Karyawan (checkbox di sel pertama tidak memicu edit — `stopPropagation`). Target Jahit tetap read-only tanpa klik.
- Export CSV nyata di semua modul (BOM Excel); Import = mock alert (perilaku sama dengan Import di RAW DATA); Delete bulk dengan konfirmasi benar-benar menghapus dari database (termasuk file storage complain).
- `npm run build` hijau; lint identik dengan baseline HEAD (3 temuan pre-existing `set-state-in-effect`, hanya beda nomor baris).

### 2026-08-17 — Planning Produksi: tabel disamakan penuh dengan RAW DATA Production Monitoring

- Halaman Planning Produksi ditulis ulang dari DataTable generik ke **design system tabel** + **fitur toolbar RAW DATA lengkap**: checkbox multi-select per baris + select-all di header, tombol **Filter, Sort, Export (CSV download nyata dengan BOM Excel), Import (mock alert, perilaku sama dengan Import di RAW DATA), dan Delete bulk** yang muncul saat ada baris terpilih, plus counter jumlah data di kanan (commit `2505daa`).
- Kolom: ☑ | Nama Penjahit | Product | Warna | Size | Qty | Bulan Target (format tanggal via formatDate) | Status (badge) | Action (ikon Edit/Hapus). Tinggi baris compact seragam, zebra rows, sticky header, tabel fit content (`w-auto min-w-full whitespace-nowrap`).
- Header & tombol disamakan dengan pola Production Monitoring/Register Karyawan (judul 17px semibold; Refresh putih, Generate Target violet, Tambah `blue-600`); modal form tidak berubah secara fungsional (aksen sky → blue). Kontrol "Generate untuk bulan" pindah ke toolbar kanan. Pagination DataTable dihapus (scroll penuh, data kecil).
- Dependensi `DataTable`, `Pagination`, `viewConfig['planning-produksi']` dilepas dari halaman ini. Lint: hanya 1 temuan pre-existing `react-hooks/set-state-in-effect` (sama dengan baseline HEAD); `npm run build` hijau.

### 2026-08-17 — Register PO: tampilan disamakan dengan Production Monitoring

- Tabel Register PO diganti dari DataTable generik ke **design system tabel** (`T_WRAP`/`T_TABLE`/`T_HEAD_ROW`/`T_TH`/`T_TD`/`rowClass`) — zebra rows, sticky header, border horizontal saja, tinggi baris compact seragam dengan RAW DATA & Register Karyawan. Kolom: PO ID | Total/PCS (Rp) | Created (formatDate) | Action (ikon Edit/Hapus seperti Register Karyawan) (commit `430eb5e`).
- Header halaman & tombol disamakan dengan pola Register Karyawan (judul 17px semibold, tombol Refresh putih + New Register PO `blue-600` — sebelumnya `sky-500`); aksen modal sky → blue; search focus biru; pagination DataTable dihapus (data sedikit, tidak perlu).
- Dependensi `DataTable`, `Pagination`, `viewConfig['register-po']` dilepas dari halaman ini. Fungsionalitas CRUD & modal komponen biaya tidak berubah.
- Lint: 1 temuan pre-existing `react-hooks/set-state-in-effect` (terkonfirmasi ada di HEAD); tidak ada temuan baru. `npm run build` hijau.

### 2026-08-17 — Hapus caption modul + tinggi baris tabel seragam (compact)

- **7 caption dihapus** atas permintaan user: Sewing Log ("Database hasil jahitan LULUS QC"), Finishing Log, Pasang Kancing Log (ProductionMonitoring — tombol Entry dipindah ke kanan), Order Entry ("Buat order manual... sync Pancake"), Register PO, Target Jahit, Planning Produksi (subtitle `<p>` di header masing-masing halaman).
- **Tinggi baris semua tabel disamakan mengikuti RAW DATA (compact)**: token `T_TD` di `tableStyles.ts` diubah `py-3 px-4` → `py-1.5 px-3` (dampak otomatis: Sewing/Finishing/Kancing Log, Register Karyawan — yang dikeluhkan masih tinggi — dan Complain); tabel hardcoded ikut dipadatkan: OrderEntry (`py-2.5→py-1.5`), InvoicingPage, Utang Staf di TargetJahitPage; preset `medium` DataTable (`py-2→py-1.5`, dipakai Planning Produksi & tab Target); override lokal `TD` di RAW dikembalikan ke token. Header `th` sengaja tidak diubah.
- `npm run build` hijau.

### 2026-08-17 — View `master_raw_data` di Supabase (master table plek ketiplek RAW DATA)

- Dibuat view `public.master_raw_data` via Supabase MCP (migration record `master_raw_data_view`): satu baris per work order dengan **persis** isi tab RAW DATA (19 kolom) — identitas master (product note, product, product id, variation id, information variation, warna, size, work code, brand, qty) + agregat progress (cutting, jahit, finishing, kancing, sisa, status).
- Semantik agregat sengaja disamakan dengan komputasi client app: `cutting` = record `cutting_records` **terbaru** per WO (order `input_at desc, id desc`, mirror `find()` di app), `jahit/finishing/kancing` = SUM record masing-masing, `sisa` = `greatest(cutting-jahit,0)`, `status` = replika SQL dari `deriveStatus()` (`src/lib/productionStatus.ts`).
- View, bukan tabel fisik (keputusan user): selalu sinkron real-time dengan `work_orders` + 4 tabel records, tidak bisa basi, tanpa trigger/maintenance; muncul di bagian **Views** di Supabase dashboard, bukan Tables. `grant select` ke anon/authenticated/service_role; RLS tidak di-enable (baca-saja, sumbernya sudah dilindungi RLS).
- Diverifikasi via Supabase MCP: keempat WO mengembalikan angka + status identik dengan perhitungan app (semua FINISHED).
- Catatan: view ini adalah objek baca untuk reporting/integrasi; tab RAW DATA di app tetap menghitung dari tabel sumber (deriveStatus client) dan tidak diubah.

### 2026-08-17 — RAW DATA jadi tabel master production monitoring

- Tab RAW DATA kini menjadi tabel master: 19 kolom mencakup seluruh identitas master (Product Note, Product ID, Variation ID, Information Variation, Warna, Size) + progress produksi (Cutting, Jahit, Finishing, **Kancing** — agregat baru dari `kancing_records`) + audit (Created At, Created By).
- **Revisi user (hari yang sama)**: kolom **Invoice Status & Source PO dihapus** atas permintaan user; tabel kini **fit content** (`w-auto min-w-full whitespace-nowrap`, tanpa truncate — Work Code tampil utuh, tabel scroll horizontal); tinggi baris dibuat **compact** (padding cell `py-1.5 px-3`, override lokal di tabel RAW — token `tableStyles.ts` tidak diubah supaya tab lain tetap seperti semula).
- Tidak ada perubahan skema database — semua kolom sudah ada di `work_orders` (diverifikasi via Supabase MCP); perubahan murni frontend di `ProductionMonitoring.tsx`: dekorasi `kancingTotal` dan pencarian diperluas mencakup product note/product id/variation id/information variation/size, plus null-safe rendering (`—`).
- Keputusan user: perluas tab RAW yang ada (bukan tab/halaman baru), pendekatan A (markup langsung, tanpa DB view / tanpa migrasi DataTable generik); kolom Invoice Status & Source PO kemudian dihapus atas permintaan user.
- Lint: +2 temuan dibanding baseline HEAD (warning `react-hooks/exhaustive-deps` menyebut `getKancingTotalLocal`, dan error `react-hooks/preserve-manual-memoization` pada memo `decoratedWO` yang memanjang) — keduanya pola rule yang sama dengan 8 temuan pre-existing di file ini; tidak ada temuan jenis baru.
- Spec `docs/superpowers/specs/2026-08-17-raw-data-master-table-design.md`, plan `docs/superpowers/plans/2026-08-17-raw-data-master-table.md`.

### 2026-08-15 — Planning Produksi: kolom Size

- Tabel `planning_produksi` mendapat kolom `size` (diterapkan via Supabase MCP; migration record `2026-08-15-planning-produksi-size.sql`). Form tambah/edit punya field Size, tabel menampilkan kolom Size antara Warna dan Qty, dan pencarian ikut mencakupnya (commit `62fe329`).

### 2026-08-15 — Complain: status otomatis NEED PROCEED → SOLVED

- Status tidak lagi dipilih user di form. Complain baru otomatis berstatus **NEED PROCEED** (default DB, diterapkan via Supabase MCP); setelah potongan gaji dieksekusi, tombol **Solve** di tabel mengubahnya jadi **SOLVED** — badge amber → hijau (commit `df92260`).
- Dropdown Status dihapus dari form; service `create()` tidak lagi menerima status.
- Migration record `2026-08-15-complain-redesign.sql` diperbarui dengan ALTER DEFAULT + UPDATE nilai lama.

### 2026-08-15 — Complain: semua field wajib + dropdown PIC/Posisi/Tingkat seragam dengan Produk

- Tulisan "(otomatis)" di header Poin dihapus (commit `067a92a`).
- **Semua field form complain sekarang wajib**: tanggal, produk, warna, work code, PIC, posisi, tingkat, potongan/PCS (boleh 0, tidak boleh kosong), detail complain.
- **PIC, Posisi, Tingkat** kini memakai komponen dropdown custom yang sama persis dengan field Produk: tombol tertutup dengan placeholder "Pilih ...", klik membuka panel pilihan, klik di luar menutup; dropdown PIC ada search-nya. Select native dengan opsi "— Pilih X —" dihapus.

### 2026-08-15 — Complain: field Produk jadi dropdown tertutup dengan search di dalamnya

- Field Produk di form complain tidak lagi menampilkan list produk secara permanen — sekarang tampil seperti dropdown lain (hanya nilai terpilih / placeholder), klik baru membuka panel berisi search box di atas dan daftar produk di bawah; pilih produk atau klik di luar menutup panel; membuka ulang mereset search ke daftar penuh (commit `db908fd`).

### 2026-08-15 — Planning Produksi: dropdown hanya karyawan posisi Penjahit

- Dropdown Nama Penjahit di Planning Produksi sekarang hanya menampilkan karyawan Register Karyawan yang **posisinya Penjahit DAN statusnya Aktif** (commit `5437cfb`). Leader/Finishing tidak lagi bisa dipilih; karyawan keluar (Non-Aktif) juga tetap tersembunyi.
- Riwayat planning milik orang yang posisinya berubah atau keluar tetap utuh di database.

### 2026-08-15 — Complain form redesign: cascade dropdown + multi-foto

- Form complain ditulis ulang (`src/pages/ComplainPenaltiPage.tsx`, commit `ffcba90`):
  - **Dropdown bertingkat dari data nyata**: Produk (combobox searchable dari `work_orders`) → Warna (auto, 1 warna langsung terpilih) → Work Code → PIC (dari Register Karyawan, hanya yang Aktif).
  - **Saran potongan otomatis** dari Register PO (work code → production order → komponen sesuai posisi) — hanya mengisi default, tidak pernah menimpa input manual.
  - **Level keparahan → poin otomatis**: Ringan=1, Sedang=2, Berat=3 (field poin manual dihapus).
  - **Status tracking**: Baru → Diproses → Selesai.
  - **Multi-foto maksimal 3**: upload ke Storage bucket baru `complain-proofs`, preview thumbnail, hapus per file; menggantikan field Bukti URL.
- Skema (migration `2026-08-15-complain-redesign.sql`, diterapkan via Supabase MCP): `complain_penalti` + `work_code`/`tingkat`/`status`, drop `bukti_url` (kolom `pcs` tetap, selalu 1, dipakai `computeDebt`); tabel baru `complain_files` (FK CASCADE); bucket `complain-proofs` publik + policy authenticated.
- Tabel complain memakai design system tabel Production Monitoring (zebra rows, header sticky, badge solid untuk tingkat & status).
- Catatan minor tertunda: race kecil di openEdit, nilai PIC non-aktif di select edit (kosmetik), tanpa batas ukuran file sebelum upload.

### 2026-08-14 — Styling tabel Production Monitoring (formal design system)

- Semua tabel di Production Monitoring (Raw Data, Cutting queue/history, Sewing/Finishing/Pasang Kancing Log, tabel work-code di overlay full-screen) kini memakai **design system terpusat**:
  - Zebra stripe putih/#F9FAFB, hover #F0F1F3, baris terpilih #EFF6FF
  - Border horizontal saja: 1px #E5E7EB antar baris, 2px #D1D5DB di bawah header
  - Header sticky latar putih; tipografi 12px semibold #4B5563 (header) / 13px reguler (isi), angka tabular-nums, teks panjang truncate + tooltip
  - Padding cell 12-16px horizontal, tinggi baris ±44px; checkbox rata tengah vertikal
  - **Status badge pill solid** teks putih: New=slate, Cutting=biru, Progress=amber, Finished=hijau, Invoiced=ungu
- Commit `c57227c`, build hijau.

### 2026-08-15 — Planning Produksi: nama penjahit hanya yang Aktif (soft delete)

- Dropdown Nama Penjahit di Planning Produksi kini hanya menampilkan penjahit berstatus **Aktif** di `register_penjahit` (commit `92df7fc`).
- Alur karyawan keluar: set status **Non-Aktif** di modul Register Penjahit (soft delete, pilihan user B) — orangnya hilang dari dropdown baru, tapi **riwayat planning produksi tetap utuh** karena `nama_penjahit` tersimpan sebagai teks, bukan FK; berlaku juga untuk riwayat jahit/finishing/kancing.
- Baris planning milik penjahit yang sudah Non-Aktif tetap bisa diedit — namanya muncul di select sebagai opsi "(Non-Aktif)".
- Lanjutan: modul Register Penjahit ditambahkan ke sidebar, lalu direvisi menjadi **Register Karyawan Tim Jahit** — mendaftarkan semua karyawan tim jahit dengan dropdown **Posisi** (Leader / Penjahit / Finishing). Kolom `posisi` ditambahkan ke tabel `register_penjahit` (migration `2026-08-15-register-penjahit-posisi.sql`). Sekaligus memperbaiki mismatch snake/camel lama di service registerPenjahit supaya tabel dan form benar-benar merender data (commit `485327a`).
- Revisi akhir Register Karyawan (commit `49a3187`):
  - Kolom **Konveksi Team dihapus** seluruhnya — form, view config, service, seed data, dan kolom `konveksi_team` di DB ikut di-drop (via Supabase MCP).
  - Tampilan tabel disamakan persis dengan Production Monitoring: token styling dipindah ke `src/lib/tableStyles.ts` (sumber tunggal) dan dipakai kedua halaman — zebra rows, sticky header, border horizontal saja, badge pill solid, tipografi & spacing sama.
  - Halaman khusus `RegisterKaryawanPage` menggantikan render DataTable generik: search, filter posisi, modal tambah/edit, hapus dengan konfirmasi (riwayat tetap aman).

### 2026-08-14 — Bubble Laporan Pasang Kancing di Kanban card overlay

- Overlay full-screen kanban card kini punya **3 bubble laporan**: Laporan Jahit, Laporan Finishing, dan **Laporan Pasang Kancing** (violet, ikon CircleDot). Masing-masing mengagregat record semua work order dalam product note itu; tetap satu bubble terbuka dalam satu waktu (commit `e2fda8e`).

### 2026-08-14 — Header Production Monitoring: redesign formal

- Header & tab bar Production Monitoring didesain ulang tampilannya jadi formal, siap dipakai sebagai aplikasi:
  - Judul/subtitle lebih rapi; tombol **Pull Order Entry** solid gelap dengan shadow saat hover; chip user menampilkan nama akun yang login (bukan label statis "Role: Owner").
  - Tab menjadi **segmented control** dalam kontainer putih ber-border dengan soft shadow; tab aktif solid slate-900 dengan teks putih, tab lain **naik + ber-shadow saat hover**.
  - Emoji diganti ikon lucide (Table2, Scissors, Shirt, PackageCheck, CircleDot, Kanban).
  - Caption satu baris di bawah tab menjelaskan tab aktif.
- Lanjutan: palet disesuaikan **moodboard biru abu-abu** — tab aktif & tombol utama biru-600 dengan shadow bernuansa biru, hover biru-50/700; spacing diperlebar (`px-8`, header lebih tinggi); tab bar kini **memanjang full width** dengan lebar tab sama rata (`flex-1`) sampai ujung.
- `npm run build` hijau (commit `b4ea69d`, `1b65c7d`).

### 2026-08-13 — Finishing Log & Pasang Kancing Log (format Sewing Log)

Revisi atas Finishing Log versi queue (hari yang sama):
- **Finishing Log** kini read-only dengan format **sama persis seperti Sewing Log**: tabel Tanggal | Work Code | PIC | Qty | Bukti + tombol **➕ Entry Finishing Baru** → halaman form terpisah `FinishingEntryForm` (pilih WO, PIC Finishing, qty, bukti, tanggal; boleh entry berulang sampai qty terpenuhi).
- **Tab baru Pasang Kancing Log** (`kancing`) + halaman form `KancingEntryForm` — untuk kerja manual (lubangi + jahit kancing), tersimpan terpisah di tabel baru `kancing_records` (`work_order_id`, `work_code`, `pic_kancing`, `qty_kancing`, `tgl_laporan`, `input_by`, `input_at`, `image_url`, `image_name`) + service `kancingRecords`.
- Skema (via Supabase MCP): `finishing_records` + `pic_finishing` & `image_name`, + policy write authenticated/anon (sebelumnya hanya SELECT — insert pasti gagal); tabel baru `kancing_records` + RLS; `finishing_records.input_by` (commit pagi hari ini).
- Kolom **Finishing** di RAW DATA tetap ada (total qty finishing per WO).
- Urutan tab: RAW DATA → Cutting Log → Sewing Log → Finishing Log → Pasang Kancing Log → Kanban.
- `npm run build` hijau (commit `654be3a`).

### 2026-08-10 — Kanban per product note + full-screen detail

- Card Kanban kini **per product note** (bukan per work code): menampilkan **product note, product, brand, total qty** (Σ semua work code di dalamnya, termasuk FINISHED/INVOICED). Kolom card = **status tertinggi** dari work code dalam group.
- **Klik card → overlay full screen** (`ProductionMonitoring.tsx`): menampilkan identitas product note (product, brand, total qty), **daftar work code** di dalamnya (warna, size, qty, cutting, jahit, status), dan **2 bubble laporan** — **Laporan Jahit** & **Laporan Finishing** — scoped ke product note (semua work code-nya), satu bubble terbuka dalam satu waktu.
- Drag id = product note; drop card meng-update `prod_status` **semua work code** dalam group. Klik card membuka overlay (tidak bentrok drag).
- Menggantikan kartu per-work-code (yang punya bubble inline) dari commit sebelumnya.
- `npm run build` hijau; lint hanya temuan pre-existing.

### 2026-08-10 — Kanban card report bubbles (Jahit & Finishing)

- Setiap card Kanban kini punya 2 bubble: **Jahit** dan **Finishing** (`src/pages/ProductionMonitoring.tsx`).
- Klik bubble → expand area kecil di dalam card menampilkan laporan per-WO:
  - **Laporan Jahit** (`sewing_records`): PIC penjahit, qty selesai, tanggal, nama bukti (imageName).
  - **Laporan Finishing** (`finishing_records`): qty finishing, tanggal import, source, badge syncStatus (OK/FAILED).
- Hanya satu bubble terbuka dalam satu waktu (keputusan user A); klik bubble aktif menutupnya.
- Klik bubble TIDAK memicu drag (stopPropagation); drag card tetap berfungsi. Baca-saja.
- `finishingRecords` kini dimuat di halaman (fetchAll, ditambah state) — sebelumnya tidak ada.
- `npm run build` hijau.

### 2026-08-09 — ProductionStatus 5-state revision + Kanban 5 columns

- `ProductionStatus` dirombak dari 6 nilai lama menjadi **5**: `NEW, CUTTING, PROGRESS, FINISHED, INVOICED` (`src/types/pipeline.ts` + label/color).
- `deriveStatus` kini menghitung status dari angka produksi `(cuttingTotal, sewingTotal, orderQty)`, bukan dari `prod_status` DB: `cutting<=0→NEW`, `cutting≥1 & jahit=0→CUTTING`, `jahit≥qty & jahit>0→FINISHED`, else `PROGRESS`. **Invoiced** ditentukan dari `invoiceStatus != 'NONE'`.
- Kanban menampilkan 5 kolom (New / Cutting / Progress / Finished / Invoiced); grid diubah dari 7→5 kolom. Drag/drop `validateStatusTransition` disesuaikan.
- Konsumen dirombak: `OrderEntry` (create `NEW`), `ProductionMonitoring` (filter `NEW`), `SewingEntryForm` (dropdown `PROGRESS`/`FINISHED`; auto-transition → `PROGRESS`, → `FINISHED` via auto-invoice), `services/autoInvoice` (`FINISHED`/`INVOICED`), `eligibleWorkOrders`, `InvoicingPage` backfill, `SeedPage` (nilai 5-state).
- Migration `2026-08-09-kanban-5-status-normalize.sql` menormalkan `prod_status` lama → 5-state via Supabase MCP; live data kini semua `FINISHED` (4), tidak ada status lama tersisa.
- `npm run build` hijau. Lint: hanya `no-explicit-any` pre-existing; tidak ada status lama di `src/`.
- Keputusan user: Finished = jahit ≥ qty; sewing pertama → langsung `PROGRESS`.

### 2026-08-07 — Target Jahit: Utang Staf sub-tab + access restriction (Task 5)

- New `src/pages/TargetJahitPage.tsx` with two tabs:
  - **Target** — reuses `targetJahitSvc.fetchAll()` + `viewConfig['target-jahit']` columns via the shared `DataTable`/`Pagination` (`PAGE_SIZE=10`, search). Rows are normalized from live snake_case columns to the camelCase view keys via `TARGET_COLUMN_ALIAS` so the table renders real values (the pre-existing snake/camel cross-boundary issue documented in the sorting spec).
  - **Utang Staf** — summary per penjahit (Nama, Total Gaji, Total Nilai PCS, Utang, Status) using `computeDebt(name)` from `staffDebt.ts`; currency via `formatCurrency`. Names from `registerPenjahitSvc.fetchAll()` (`pic_penjahit`), falling back to distinct `nama` from `target_jahit`.
- Access gating: Utang Staf tab only enabled for `owner`/`finance` (`profile.role`); for `inventory` it renders a disabled tab with note "Hanya owner/finance yang dapat melihat." and `computeDebt` is never invoked.
- `editable={false}` on the Target tab so the shared DataTable does not show dead Edit/Delete buttons (callbacks are no-ops in this read-oriented page).
- Wired route in `src/App.tsx`: `currentView === 'target-jahit'` → `<TargetJahitPage />` (before generic fallback). Generic `case 'target-jahit'` fetch left intact.
- `npm run build` passes clean.

### 2026-08-07 — Target Jahit: Planning, Pricing & Utang subsystem (Tasks 1-4 + services)

New subsystem under the Target Jahit hub (approved design `2026-08-06-target-jahit-planning-pricing-debt`):
- **Data**: tables `planning_produksi`, `target_jahit_detail`, `complain_penalti` (migration `2026-08-06-target-jahit-subsystem.sql`), each with authenticated RLS policies (SELECT/INSERT/UPDATE/DELETE for `authenticated`) — the app runs behind the auth gate; salary/debt restriction is at the service/UI layer. Added **Jasa Pasang Kancing** to the Register PO component list (pricing transparency only; not part of penjahit debt).
- **Services**: `staffDebt.ts` (`computeDebt` = total gaji − Σ(qty_selesai × (harga jahit+obras) per design, since day one; `generateTargetsFromPlanning` idempotent parent+detail insert; `buildPriceMap` latest-PO-per-product), plus CRUD for planning/complain/target-detail.
- **Modules**: added `planning-produksi` (`PlanningProduksiPage`, incl. Generate Target) and `complain-penalti` (input_by from profile) + nav/sidebar icons; deferred minors (input_by overwritten on edit; etc.).
- **Lint note**: `npm run lint` is not clean repo-wide (128 pre-existing problems, e.g. `RegisterPoPage`, `invoicePaymentFiles`, `ProductionMonitoring`). The new pages carry the same `react-hooks/set-state-in-effect` warning pattern as the reference `RegisterPoPage`; left consistent with the codebase idiom rather than refactored.

### 2026-08-05 — Invoicing Table: Total Qty, Nominal/PCS & Work Code

- Added **Total Qty** and **Nominal/PCS** columns to the Invoicing table (`src/pages/InvoicingPage.tsx`), sourced from data already stored on each invoice row at generation (`autoInvoice.ts`): `pcsLinked` (total qty, = work order quantity) and `unitPrice` (= `register_po.total_per_pcs`).
- Added **Work Code** column (after Client). The `invoices` table had no `work_code` column, so this needed a migration (`add_work_code_to_invoices`): `work_code text NOT NULL DEFAULT ''`, backfilled from `work_orders` via the existing `work_order_id` FK. All invoice creation paths now populate it: `autoInvoice` (auto + backfill) and `InvoiceFormModal` (manual) read it from the work order.
- New header order: Bulan, Client, Work Code, Total Qty, Nominal/PCS, Kode Invoice, Total, Status, Action.
- Verified via Supabase MCP: existing invoice row has all fields populated (50 pcs, Rp 35.000, work code `Produksi - Awal | Sheen Pants | White | S`).

### 2026-08-04 — Supabase Auth Login & Selesai Finishing Removal

**Login & Roles**
- Added Supabase Auth; the app now requires authentication to open. Three fixed accounts: `owner`, `finance`, `inventory`. Users type a username, mapped internally to `<username>@konveksi.local` in `src/lib/auth.ts`
- Because that domain is not real, email-based password reset does not work — passwords are changed via the Supabase dashboard
- Roles live in a new `public.profiles` table (`id`, `username`, `display_name`, `role` with a CHECK constraint on the three values), deliberately NOT in `auth.users.raw_user_meta_data`, because users can edit their own metadata via the API and it therefore cannot be an authorization source of truth
- All three roles see every menu — role is identity only and feeds the audit trail; there is no per-role menu filtering. Deliberate product decision: data is single-entry and cannot be edited, only deleted

**RLS**
- Added `authenticated` RLS policies on `work_orders`, `sewing_records`, `cutting_records`, matching the existing `anon` write permissions. These were required, not optional: supabase-js switches from the `anon` role to `authenticated` on login, so without them Production Monitoring and Sewing Entry would silently lose the ability to save
- The `anon` policies were deliberately NOT revoked — pending follow-up (see below)

**Removed**
- The "Role:" dropdown in `App.tsx` (it let anyone become any role with one click, so it was never authorization) and `localStorage['app.currentDisplayName']`. Every audit-trail write now takes its identity from the logged-in session, so the trail is trustworthy for the first time: `cutting_records.input_by`, `sewing_records.input_by`, and `createdBy`/`pulledBy` on production orders and work orders in both Order Entry and Production Monitoring
- `SeedPage` is no longer rendered. Its `clearAll()` deletes every row across 10 tables, and it sat outside the auth gate as its own `viewMode` branch — the `anon` DELETE policy on `cutting_records` means part of that would have succeeded without a login. The branch was unreachable (nothing set `viewMode` to `'seed'`), so this closes a latent hole rather than changing behaviour. `src/pages/SeedPage.tsx` is kept; mount it inside `<AuthGate>` if seeding is needed again
- `AppRole` narrowed from five values to three (`owner | finance | inventory`); `admin` and `spv_konveksi` were unused
- Selesai Finishing module removed; the app's initial view is now Production Monitoring

**References:** `docs/superpowers/specs/2026-08-04-auth-login-and-remove-selesai-finishing-design.md` and `docs/superpowers/plans/2026-08-04-auth-login-and-remove-selesai-finishing.md`

**Pending follow-up / known gaps**
- `anon` policies on `work_orders`, `sewing_records`, `cutting_records` still grant write access WITHOUT login. Revoking them is the correct hardening but needs a path-by-path check first
- `invoices`, `invoice_payments`, `invoice_payment_files`, `register_po`, `register_po_components` have RLS enabled but NO policies at all — fully locked from the client. Pre-existing, not caused by this work
- Most master tables have read-only permissions
- No browser automation exists in this environment. Confirmed by hand: logging in as `owner` works and the dashboard opens. Also proven: `npm run build` clean, all three accounts return an access token from the real `/auth/v1/token` endpoint, and an authenticated INSERT+DELETE on `cutting_records` succeeded. Still unverified: F5 preserves the session (`createClient` takes no options, so `persistSession` defaults to `true` — likely fine but unproven), the wrong-password error message, and logout returning to the login screen
- Known minor gaps from the final review, not fixed: the collapsed sidebar hides the logout button; `AppRole` is a cast rather than a runtime-validated value (safe only while `profiles_role_check` and the union stay in sync); `fetchProfile` runs twice on mount (`getSession` plus the `SIGNED_IN` event); there is no error boundary; a network failure during login shows "password salah" rather than a connection error
- Orphaned modules deliberately left in place: `selesai-jahit`, `production-data`, `register-jahit`, `daftar-libur`, `register-penjahit`

### 2026-07-25 — Cost-Aware Delegation Policy Design
- Approved a risk-based delegation policy that prefers cheaper capable models for bounded, objectively verifiable subtasks without reducing quality
- Implemented the policy in `CLAUDE.md` under `Delegation and Model Cost` so it applies operationally in future sessions
- Reserved architecture, ambiguous product decisions, database/security-sensitive work, high-risk business logic, cross-module integration, and final verification for the main model
- Required capability-based model selection, escalation, precise briefs, objective verification, and avoidance of duplicate work or unnecessary agents
- Explicitly established that delegated output is evidence rather than authority and that quality takes priority over cost
- Kept the detailed rationale and acceptance criteria in `docs/superpowers/specs/2026-07-25-cost-aware-delegation-design.md`

### 2026-07-25 — Parallel Development Checkpoint Preparation
- Prepared the repository state as a shared checkpoint for separate Production Monitoring and Target Jahit worktree sessions
- Added Git ignore protections for local environment files, the temporary Supabase connectivity probe, and Claude Code worktree directories
- Kept project source, Supabase migrations, implementation plans/specs, and MCP configuration eligible for the checkpoint commit

### 2026-07-25 — TypeScript Build Fixes
- Verified the live Supabase schema through the scoped Supabase MCP: `register_po` has `total_per_pcs` but no `rate_manpower` column
- Removed the stale `RegisterPoRow.rateManpower` read while keeping the invoice form's editable local manpower input
- Added the missing `register-po` entry to the exhaustive TopBar module-color map
- Corrected Register PO composite-type imports to use the service that defines them and restored the missing invoice payment type import
- Kept `InvoiceRow.billingType` domain-typed through filtering/actions and removed unused legacy display/action bridge code
- Removed unused Order Entry imports/helper code
- `npm run build` passes successfully (TypeScript + Vite)

### 2026-07-25 — Claude Code MCP Rules
- Strengthened `CLAUDE.md` with mandatory Supabase MCP usage for database schema, query, and migration work; database tasks now fail closed when the MCP is unavailable or unauthorized
- Made shadcn MCP mandatory for browsing and installing new standard UI components; custom components require a documented application-specific reason
- Added SaaS dashboard design direction so landing-page-specific skills or styling rules are not applied to operational dashboard modules by default
- Completed a repository-wide search for `tasteskill` and close variants; no installed skill or project reference was found, so no skill, landing-page source, or `.superpowers` artifact was deleted

### 2026-07-25 — shadcn MCP for Claude Code
- Initialized the shadcn MCP server for Claude Code in `.mcp.json`
- Added `shadcn` as a development dependency so the MCP server can run from the project
- Used Corepack's pnpm because a standalone `pnpm` shim was not available on `PATH`

### 2026-07-23 — Target Jahit Table & Columns
- Created migration `supabase/migrations/2026-07-23-target-jahit.sql` with full column set:
  `bulan_tahun, nama, posisi, salary, total_hari_kerja, hari_kerja_hari_ini, sisa_hari, target_daily, target_ngebut_hari, target_monthly, realisasi_monthly, sisa_target_monthly, progress_monthly, status_final, target_cost_posisi, realisasi_cost_posisi, target_accum, realisasi_accum, selisih_accum, target_ngebut_hari_akumulasi, progress_accum, status_final_akumulasi`
- Updated `viewConfig['target-jahit']` columns in `src/data/mockData.ts` to match all 22 fields with proper labels, widths, and format badges
- Note: Supabase anon key expired — migration needs manual apply via SQL Editor

### 2026-07-17 — Register PO Page & Complete Flow Wiring

**Register PO Page** (`src/pages/RegisterPoPage.tsx`):
- New page with table listing all Register PO entries (PO, Rate Manpower, Total/PCS, Created)
- Create/Edit modal with 7 komponen biaya: **Potong, Jahit, Obras, Finishing, Operational, Material Basic, Margin**
- Rate Manpower + semua komponen = **Total/PCS** (ditampilkan real-time)
- Edit mode: load existing components, update & recalculate
- Delete with confirmation
- Only shows PULLED POs that don't have a Register PO yet

**Flow Wiring:**
- `OrderEntry.tsx` → Pull sekarang set `productionOrderId` di Work Order (link ke PO)
- `App.tsx` → route `register-po` menampilkan `RegisterPoPage`
- `Sidebar.tsx` → tambah icon `ClipboardList` untuk Register PO
- `productionOrders.ts` → tambah `fetchProductionOrdersWaitingRegisterPo()` untuk POs PULLED tanpa Register PO

**Auto Invoice on FINISHING_COMPLETE:**
- `SewingEntryForm.tsx` → panggil `transitionToFinishingComplete()` saat sewing selesai = cutting = qty order
- Auto-invoice menggunakan data dari Register PO (totalPerPcs, rateManpower, components)

**Full Flow:** Pull Order → Register PO → RAW DATA → Cutting → Sewing → Finished → Auto Invoice ✅

### 2026-07-17 — Invoicing Module Schema Sync Fix
- Fixed `InvoiceFormModal.tsx`: removed `pcsManual`/`rateManpower`/`computePcsBalance` references, now uses `createInvoiceAuto` + `pcsLinked` (WO quantity) + auto derive billing type from quantity, loads `register_po` data for unit price & rate manpower defaults
- Fixed `InvoiceImage.tsx`: removed `pcsBalanceStatus` draft banner and `rateManpower` row (fields dropped from DB in migration 2026-07-13), replaced `pcsManual` with `pcsLinked`
- Updated `viewConfig['invoicing']` columns: removed `pcsManual`, `pcsBalanceStatus`, `rateManpower`; kept `pcsLinked`, `unitPrice`, `rateOperational`, `totalIncomeManpower`, `totalIncomeOperational`
- InvoicingPage now maps `billingType` to human-readable labels (Mass Production / Sample Production)
- Full `npx tsc --noEmit` passes clean

### 2026-07-11 — Invoice Eligibility Robust
- `fetchEligibleWorkOrders` now fetches all WO in any pre-INVOICED status, joins cutting + sewing totals, and uses `deriveStatus` to filter Finished ones
- This makes the dropdown work even when DB `prod_status` is stale (e.g. still says `SEWING_IN_PROGRESS` while actual cutting/sewing totals mean it's Finished)

### 2026-07-11 — Invoice Dropdown Label
- Invoice Form's Work Order dropdown options now show "Finished" status label so users see why each WO is eligible

### 2026-07-11 — Invoice Eligibility + WO Status Sync
- Extracted `deriveStatus` and `validateStatusTransition` to `src/lib/productionStatus.ts` for reuse across pages
- `eligibleWorkOrders.ts` already filters `prod_status = 'FINISHING_COMPLETE'` — correct
- `updateWorkOrderInvoiceStatus` now also sets `prod_status = 'INVOICED'` when invoice is created/paid, so WO moves from Finished column to Invoiced column in Kanban
- `ProductionMonitoring` decoratedWO now uses shared helper

### 2026-07-11 — FINISHING_IN_PROGRESS Trigger Logic Fix
- Trigger for `FINISHING_IN_PROGRESS` corrected: when sewing total = cutting total AND cutting total > qty order (e.g. qty=50, cutting=80, jahit=80)
- `FINISHING_COMPLETE` only when sewing = cutting = qty order
- `deriveStatus()` and `SewingEntryForm` auto-transition updated to match

### 2026-07-11 — Finishing In Progress Status Reintroduced
- `FINISHING_IN_PROGRESS` re-added to `ProductionStatus` enum between `SEWING_IN_PROGRESS` and `FINISHING_COMPLETE`
- New flow: `SEWING_IN_PROGRESS` → `FINISHING_IN_PROGRESS` (when sewing total = cutting total, but qty order still short) → `FINISHING_COMPLETE` (when sewing = cutting = qty order)
- `deriveStatus()` updated to differentiate: equal totals under qty order = `FINISHING_IN_PROGRESS`, equal totals ≥ qty order = `FINISHING_COMPLETE`
- Kanban now shows 6 columns (was 5)

### 2026-07-11 — Production Monitoring Polish
- `deriveStatus()` helper computes production status from cutting/sewing totals — even if DB `prod_status` is stale, UI shows correct status (e.g. cutting 100, sewing 10 → `SEWING_IN_PROGRESS`)
- Raw Data tab now has new "Sisa" column = `cutting - sewing` (red until 0, green when balance)
- Kanban fixed: only one `INVOICED` column (was duplicated outside the status loop)
- Cutting and Sewing log tabs now filter by derived status instead of raw `prod_status`

### 2026-07-11 — Production Status Refactor
- `ProductionStatus` enum reduced to 5 values: `CUTTING_PENDING`, `CUTTING_COMPLETE`, `SEWING_IN_PROGRESS`, `FINISHING_COMPLETE`, `INVOICED`. Removed `SEWING_COMPLETE` and `FINISHING_IN_PROGRESS` intermediate steps per user request — finished flow now goes Cutting Pending → Cutting Complete → Sewing In Progress → Finished (when qty cutting = qty sewing = qty order)
- `STATUS_ORDER` and `validateStatusTransition` in `ProductionMonitoring.tsx` updated to match new flow
- `SewingEntryForm` auto-transition now:
  - First sewing entry → `SEWING_IN_PROGRESS`
  - Sewing total + cutting total = qty → `FINISHING_COMPLETE`
- `INVOICED` added as the terminal production status (synced from invoice module)

### 2026-07-11 — Production Monitoring Quick Fixes
- `formatDate` in `src/data/pipelineData.ts` now robust to ISO timestamps from Supabase (no more Invalid Date in Cutting Riwayat)
- Cutting `inputBy` now reads current logged-in display name from `localStorage` instead of hardcoded `'Budi (Gudang)'`
- `SewingEntryForm` work order selector now includes both `CUTTING_COMPLETE` and `SEWING_IN_PROGRESS` Work Orders; empty state text changed to "Work orders tidak ditemukan"
- Role switcher in `App.tsx` writes the selected user's display name to `localStorage` so other pages can read it

### 2026-07-10 — Invoicing Module Implementation Complete
- All 17 implementation tasks executed per `docs/superpowers/plans/2026-07-10-invoicing-module.md`
- Files added: services (invoices, invoicePayments, invoicePaymentFiles, eligibleWorkOrders), lib helpers (monthYear, invoiceCode, invoiceCompute, downloadInvoicePng), modals (InvoiceFormModal, PaymentModal), InvoiceImage template, InvoicingPage
- App route wired in `App.tsx`; `viewConfig['invoicing']` populated with 15 columns
- `npx tsc -b --noEmit` passes; dev server live at `http://localhost:3001/`
- **Manual action required**: apply `supabase/migrations/2026-07-10-invoicing.sql` in Supabase SQL Editor to create the three tables + Storage bucket before UI walkthrough

### 2026-07-10 — Invoicing Module Plan (Task 17)
- Wired `invoicing` route in `App.tsx` — removed "coming soon" toast, added `InvoicingPage` route branch

### 2026-07-10 — Invoicing Module Plan (Task 16)
- Added `src/pages/InvoicingPage.tsx` — Main invoice list with search, refresh, Create/Payment/Download actions, and off-screen InvoiceImage instances for PNG export

### 2026-07-10 — Invoicing Module Plan (Task 15)
- Added `src/lib/downloadInvoicePng.ts` — PNG export helper using `html-to-image`

### 2026-07-10 — Invoicing Module Plan (Task 14)
- Added `src/components/Invoice/InvoiceImage.tsx` — formal client invoice template (off-screen)

### 2026-07-10 — Invoicing Module Plan (Task 13)
- Added `src/components/Modals/PaymentModal.tsx` — Cash/Termin payment detail modal with file uploads

### 2026-07-10 — Invoicing Module Plan (Task 12)
- Added `src/components/Modals/InvoiceFormModal.tsx` — Create invoice modal with WO picker, billing type, manual PCS, unit price, invoice date, rate manpower

### 2026-07-10 — Invoicing Module Plan (Task 11)
- Replaced stub `viewConfig['invoicing']` with full 15-column definition (`editable: true`)

### 2026-07-10 — Invoicing Module Plan (Task 10)
- Added `src/services/eligibleWorkOrders.ts` — FINISHING_COMPLETE WOs without an existing invoice

### 2026-07-10 — Invoicing Module Plan (Task 9)
- Added `src/services/invoicePaymentFiles.ts` — Storage upload helpers + DB records

### 2026-07-10 — Invoicing Module Plan (Task 8)
- Added `src/services/invoicePayments.ts` (replaced legacy `payments.ts`)

### 2026-07-10 — Invoicing Module Plan (Task 7)
- Rewrote `src/services/invoices.ts` — CRUD for `invoices` table + WO invoice status sync

### 2026-07-10 — Invoicing Module Plan (Task 6)
- Added `InvoiceRow`, `InvoicePaymentRow`, `InvoicePaymentFileRow` interfaces to `src/types/pipeline.ts`

### 2026-07-10 — Invoicing Module Plan (Task 5)
- Added `src/lib/invoiceCompute.ts` — pure financial & status computation helpers

### 2026-07-10 — Invoicing Module Plan (Task 4)
- Added `src/lib/invoiceCode.ts` — client-code map, invoice-code builder, file-name sanitizer

### 2026-07-10 — Invoicing Module Plan (Task 3)
- Added `src/lib/monthYear.ts` — Indonesian month-year formatter used for invoice `bulan tahun`

### 2026-07-10 — Invoicing Module Plan (Task 2)
- Installed `html-to-image` dependency for PNG export of formal client invoice image

### 2026-07-10 — Invoicing Module Plan (Task 1)
- Wrote SQL migration for `invoices`, `invoice_payments`, `invoice_payment_files`, and Storage bucket `invoice-payment-proofs` at `supabase/migrations/2026-07-10-invoicing.sql`

### 2026-07-10 — Invoicing Module Design
- Wrote approved design spec for Finance → Invoicing module at `docs/superpowers/specs/2026-07-10-invoicing-module-design.md`
- Defined one-invoice-per-Work-Order flow, invoice code format `INV/{type}/{client}/{DDMMYY}/{sequence}`, PCS manual vs linked balance rules, Cash/Termin payment modal, Supabase tables/storage, and PNG invoice download requirements
- Implementation plan and code changes are still pending user review of the spec

### 2026-07-07 — Kanban View Implementation
- Added "Kanban" tab (4th tab) to Production Monitoring
- Implemented 7-column grid layout: Cutting Pending, Cutting Complete, Sewing In Progress, Sewing Complete, Finishing In Progress, Finished, Invoiced
- KanbanCard component with WO ID, brand, product, quantity, status badge
- Hover animations (lift + scale + shadow)
- Empty state per column
- Search integration across tabs (searchQuery shared)
- Responsive: horizontal scroll on smaller screens, columns maintain 340px width
- Invoiced column: separate column for FINISHING_COMPLETE + invoiceStatus !== 'NONE'

### 2026-06-22 — 5-Phase Pipeline Revamp (Design Phase)
- Spec written for full pipeline rearchitecture
- TypeScript types defined: ProductionOrder, WorkOrder, CuttingRecord, SewingRecord, FinishingRecord, Invoice, Payment, AppUser, AuditLog
- Two-axis status system: productionStatus (6 values) + invoiceStatus (5 values)
- Role-based access control matrix (admin, inventory, spv_konveksi, finance)
- Mock data migrated: 8 production orders, 9 work orders, 5 cutting records, 10 sewing records

### Prior Work
- Production Monitoring page with RAW DATA, Cutting Log, Sewing Log tabs
- Sewing Entry Form with image upload and auto-status
- Order Entry with create/pull/cancel workflow
- All data modules with mock data
- Full shadcn/ui component library (50+ components)
