# Target Jahit: Planning, Pricing, dan Perhitungan Utang — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun sistem Target Jahit hidup: planning produk per staf yang auto-meng-generate target bulanan, harga per desain dari Register PO (+ komponen Jasa Pasang Kancing), perhitungan utang staf, dan pencatatan complain/penalti — dengan pembatasan hak akses (gaji/utang khusus owner/finance).

**Architecture:** `target_jahit` menjadi hub. `planning_produksi` meng-umpan draf `target_jahit` (parent) + `target_jahit_detail` (child per produk). `complain_penalti` mengurangi nilai bersih. Harga per desain diambil dari `register_po_components` (komponen Jahit+Obras untuk nilai penjahit).

**Tech Stack:** React 19 + TypeScript + Vite, TailwindCSS + shadcn/ui (New York/slate), Supabase (Postgres + Auth). Database diakses lewat Supabase MCP.

## Global Constraints

- **Live Supabase schema dianggap kebenaran.** Selalu inspeksi lewat Supabase MCP sebelum migration. Nama kolom baru: snake_case.
- **Database ops wajib lewat Supabase MCP** (CLAUDE.md).
- **Jasa Pasang Kancing** ditambahkan sebagai komponen Register PO. **TIDAK** masuk hitungan utang penjahit (utang memakai harga Jahit + Obras saja).
- **Nilai per pcs untuk utang** = harga `Jahit` + harga `Obras` untuk desain itu.
- **Hak akses:** data produksi (pcs selesai, desain, planning, harga) terlihat owner/finance/inventory. Target bulanan/cost, gaji, dan utang **khusus owner/finance**.
- Posisi yang dihitung target/utang versi 1: **hanya Penjahit** (jahit+obras 1 orang = `pic_penjahit`).
- Jalur harga per desain: `sewing_records.work_order_id` → `work_orders` → `source_order_id` (production order) → `register_po` → `register_po_components` (komponen `Jahit`, `Obras`).
- Modules baru: `planning-produksi`, `complain-penalti`; `target-jahit` (hub, sudah ada). Sidebar 3 menu.
- `ModuleId` union + `viewConfig` + `mockData` `Record<ModuleId,…>` harus tetap exhaustive.
- Tidak ada tabel harga baru; harga per desain dari Register PO.

---

## Task 1 — Migration: tabel baru + komponen Jasa Pasang Kancing

**Files:**
- Create: `supabase/migrations/2026-08-06-target-jahit-subsystem.sql`
- Modify: `src/pages/RegisterPoPage.tsx` (komponen biaya default), `src/data/mockData.ts` (definisi kolom Register PO bila ada hardcode)

**Interfaces:**
- Produces: tabel `planning_produksi`, `target_jahit_detail`, `complain_penalti`; komponen Jasa Pasang Kancing di `register_po_components`. Service layer (Task 2) membaca tabel ini.

**Catatan:** kolom live `target_jahit` bernama `bulanTahun` (camelCase) — inkonsistensi existing; tabel baru memakai snake_case konsisten.

- [ ] **Step 1 — Inspeksi live schema via Supabase MCP.** Gunakan `list_tables` untuk memastikan kolom/constraint `target_jahit`, `register_po_components`, `sewing_records`, `work_orders`. Catat konvensi nama kolom live.
- [ ] **Step 2 — Tulis migration** `supabase/migrations/2026-08-06-target-jahit-subsystem.sql`:

```sql
-- planning_produksi: rencana per staf per produk untuk periode target
CREATE TABLE IF NOT EXISTS planning_produksi (
  id            BIGSERIAL PRIMARY KEY,
  nama_penjahit TEXT    NOT NULL,
  product       TEXT    NOT NULL,
  warna         TEXT,
  qty           INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  bulan_target  TEXT    NOT NULL,                     -- format "2026-08"
  status        TEXT    NOT NULL DEFAULT 'draft',     -- draft | final
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_bulan_target ON planning_produksi(bulan_target);

-- target_jahit_detail: realisasi per desain per orang per bulan (child)
CREATE TABLE IF NOT EXISTS target_jahit_detail (
  id              BIGSERIAL PRIMARY KEY,
  target_jahit_id INTEGER NOT NULL,
  product         TEXT    NOT NULL,
  warna           TEXT,
  qty_target      INTEGER NOT NULL DEFAULT 0,
  qty_realisasi   INTEGER NOT NULL DEFAULT 0,
  harga_jahit     NUMERIC NOT NULL DEFAULT 0,
  harga_obras     NUMERIC NOT NULL DEFAULT 0,
  FOREIGN KEY (target_jahit_id) REFERENCES target_jahit(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tjd_target ON target_jahit_detail(target_jahit_id);

-- complain_penalti: pencatatan complain + potongan + poin
CREATE TABLE IF NOT EXISTS complain_penalti (
  id               BIGSERIAL PRIMARY KEY,
  tanggal          DATE    NOT NULL,
  product          TEXT    NOT NULL,
  warna            TEXT,
  pcs              INTEGER NOT NULL DEFAULT 1,
  posisi           TEXT    NOT NULL,       -- jahit | obras | finishing | kancing
  pic              TEXT,                   -- penjahit terkait
  detail_complain  TEXT,
  potongan_per_pcs NUMERIC NOT NULL DEFAULT 0,
  poin             INTEGER NOT NULL DEFAULT 0,
  bukti_url        TEXT,
  input_by         TEXT,                   -- customer service (display name)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_pic ON complain_penalti(pic);
```

  Constraint FK `complain_penalti.pic` **tidak** di-set ke `register_penjahit` (tabel itu boleh kosong / nama bebas).

- [ ] **Step 3 — Tambah komponen "Jasa Pasang Kancing"** ke `DEFAULT_COMPONENTS` di `src/pages/RegisterPoPage.tsx` (daftar default, baris ~24-32):
  ```ts
  { localId: crypto.randomUUID(), key: 'jasa_pasang_kancing', label: 'Jasa Pasang Kancing', value: '' },
  ```
  Loop render komponen di modal sudah generik (`components.map`, `RegisterPoPage.tsx:266`), jadi komponen baru otomatis tampil.
- [ ] **Step 4 — Update `viewConfig['register-po']`** di `src/data/mockData.ts` bila daftar komponen dihardcode di definisi kolom; tambahkan entry bila ada.
- [ ] **Step 5 — Terapkan migration** via Supabase MCP `apply_migration` (panduan MCP). Verifikasi `list_tables` + `SELECT count(*)` per tabel baru.
- [ ] **Step 6 — Build & commit**
  ```bash
  git add supabase/migrations/2026-08-06-target-jahit-subsystem.sql src/pages/RegisterPoPage.tsx src/data/mockData.ts
  git commit -m "feat: planning_produksi, target_jahit_detail, complain_penalti + jasa pasang kancing component"
  ```

**Test:** `npm run build`.

---

## Task 2 — Service layer: planning, complain, target detail, utang

**Files:**
- Create: `src/services/planningProduksi.ts`, `src/services/complainPenalti.ts`, `src/services/targetJahitDetail.ts`, `src/services/staffDebt.ts`
- Modify: `src/services/targetJahit.ts`

**Interfaces:**
- Consumes: tabel Task 1; `src/services/registerPo.ts` (`RegisterPoRow`); `src/services/sewingRecords.ts`.
- Produces: `PlanningProduksiRow` + CRUD; `ComplainPenaltiRow` + CRUD; `TargetJahitDetailRow` + query; `computeDebt(staffName)`; `generateTargetsFromPlanning(bulanTarget)`.

- [ ] **Step 1 — `planningProduksi.ts`**: `PlanningProduksiRow` (`id`, `nama_penjahit`, `product`, `warna`, `qty`, `bulan_target`, `status`), `list(bulanTarget?)`, `create`, `update`, `remove`.
- [ ] **Step 2 — `complainPenalti.ts`**: `ComplainPenaltiRow`, `list()`, `create`, `update`, `remove`.
- [ ] **Step 3 — `targetJahitDetail.ts`**: `TargetJahitDetailRow`, `listByTargetId`, `upsertBatch`, `removeByTarget`.
- [ ] **Step 4 — `staffDebt.ts`**: `computeDebt(staffName)`:
  - Ambil semua baris `target_jahit` orang itu → `totalGaji = Σ salary`.
  - Bangun hash harga `product → { jahit, obras }` dari semua `register_po_components` (filter key `jahit`, `obras`).
  - `totalNilai = Σ( qty_selesai × (harga_jahit + harga_obras) )` dari `sewing_records` milik orang itu (via work_code / work_order → production order → register_po).
  - Return `{ totalGaji, totalNilai, utang: totalGaji - totalNilai, status }` (`'Utang'` bila utang > 0, `'Tidak Utang'` bila ≤ 0).
- [ ] **Step 5 — `generateTargetsFromPlanning(bulanTarget)`** di `targetJahit.ts`:
  - Group planning per nama; `target_monthly` = total qty; `target_cost_posisi` = Σ(pcs × (jahit+obras)); tulis `target_jahit_detail` per produk; buat baris parent `target_jahit` (draf).
  - **Idempoten:** jika parent utk (bulan, nama) sudah ada, lewati.
- [ ] **Step 6 — Build.** `npm run build`. Pastikan tidak ada `noUnusedLocals` violation.

**Test:** `npm run build`.

**Catatan akses:** `computeDebt` dipanggil dari UI hanya untuk owner/finance (Task 5), bukan cek role di service.

---

## Task 3 — View config & ModuleId

**Files:**
- Modify: `src/types/index.ts` (`ModuleId`), `src/data/mockData.ts` (`viewConfig`, `navGroups`)

**Interfaces:** Produces: module id `'planning-produksi'`, `'complain-penalti'` yang dipakai render (Task 4) dan view config.

- [ ] **Step 1 — `src/types/index.ts`** tambah ke union `ModuleId`:
  ```ts
  | 'planning-produksi'
  | 'complain-penalti'
  ```
- [ ] **Step 2 — `mockData.ts`** tambah `viewConfig['planning-produksi']` dan `viewConfig['complain-penalti']` (kolom sesuai field tabel Task 1).
- [ ] **Step 3 — `navGroups`** tambah 3 menu: **Planning Produksi** (`icon` baru, mis. `ClipboardList`), **Target Jahit** (sudah ada), **Complain & Penalti**. Id item sesuai `ModuleId`.
- [ ] **Step 4 — Build.** Pastikan exhaustive: semua `Record<ModuleId,…>` menerima key baru (compiler akan error kalau tidak).

**Test:** `npm run build`.

---

## Task 4 — Pages & wiring route

**Files:**
- Create: `src/pages/PlanningProduksiPage.tsx`, `src/pages/ComplainPenaltiPage.tsx`
- Modify: `src/App.tsx` (render branch), `src/components/Layout/Sidebar.tsx` (icon map) bila perlu

**Interfaces:** Consumes service Task 2; `useAuth` untuk `input_by` / pembatasan akses.

- [ ] **Step 1 — `PlanningProduksiPage.tsx`** (contoh pola `RegisterPoPage`): tabel `planning_produksi`, form tambah (nama dari `registerPenjahitSvc.fetchAll()`, product, warna, qty, bulan_target), tombol **Generate Target** → `generateTargetsFromPlanning(bulanTarget)`.
- [ ] **Step 2 — `ComplainPenaltiPage.tsx`**: tabel `complain_penalti`, form tambah (tanggal, product, warna, pcs, posisi, pic, detail, potongan, poin, bukti_url) — `input_by` diisi `profile.displayName` dari `useAuth()`.
- [ ] **Step 3 — `App.tsx`** tambah `case` render: `currentView === 'planning-produksi'` → `<PlanningProduksiPage />`, `currentView === 'complain-penalti'` → `<ComplainPenaltiPage />`. Keduanya di dalam branch `AuthGate`.
- [ ] **Step 4 — `Sidebar.tsx`** pastikan icon untuk module baru ada di `iconMap` (tambah kalau perlu).
- [ ] **Step 5 — Build & manual smoke:** buka tiap menu, isi form, lihat data tampil.

**Test:** `npm run build`.

---

## Task 5 — Sub-tab Utang Staf & pembatasan akses

**Files:**
- Create: `src/pages/StaffDebtView.tsx`
- Modify: `src/App.tsx` (sub-tab Target Jahit bila memakai ViewTabs), `src/pages/...` (Target Jahit page bila ada)

**Interfaces:** Consumes `computeDebt`; `useAuth().profile.role`.

- [ ] **Step 1 — `StaffDebtView.tsx`**: tabel per penjahit (nama, total gaji, total nilai pcs, utang, status). Loop semua nama (dari `registerPenjahitSvc` / distinct nama di `target_jahit`), panggil `computeDebt`.
- [ ] **Step 2 — Pembatasan**: hanya render `StaffDebtView` bila `role === 'owner' || role === 'finance'`. Untuk inventory tampilkan keterangan "Hanya owner/finance yang dapat melihat".
- [ ] **Step 3 — Wire sub-tab**: bila Target Jahit memakai mekanisme tab (mis. `ViewTabs`), tambah sub-tab "Utang Staf"; untuk inventory sub-tab ini disembunyikan/disable.
- [ ] **Step 4 — Build.**

**Test:** `npm run build`. Manual: login owner/finance lihat utang; login inventory tidak melihat.

---

## Task 6 — Integrasi end-to-end, lint, docs

**Files:**
- Modify: `src/App.tsx` (bila perlu), `project.md`

**Interfaces:** Konsolidasi; memastikan lint & docs.

- [ ] **Step 1** — Uji end-to-end di browser: buat planning → generate target → lihat `target_jahit_detail` → tambah complain → pastikan potongan memengaruhi nilai bersih.
- [ ] **Step 2** — Cek akses: login owner/finance lihat utang; login inventory tidak melihat.
- [ ] **Step 3** — `npm run lint`; laporkan pre-existing failure terpisah.
- [ ] **Step 4** — Update `project.md` (Latest Progress).

**Test:** `npm run build`, `npm run lint`, manual.

---

## Global note untuk reviewer / implementer

- `target_jahit.id` BIGSERIAL → `target_jahit_detail.target_jahit_id` juga INTEGER/BIGINT; pastikan cocok.
- Mapping harga per desain: gunakan helper terpusat di `staffDebt.ts` agar tidak duplikasi.
- Tambahan `ModuleId` memaksa `viewConfig`/`mockData`/switch `App.tsx` menerima key baru — compiler memastikan exhaustive.
- `register_po_components` existing jangan dihapus; komponen Jasa Pasang Kancing hanya ditambah.
- Data `sewing_records` saat ini 7 baris; gunakan untuk tes realisasi & utang. `register_penjahit` kosong — planning perlu nama bebas atau seed minimal untuk uji manual.
