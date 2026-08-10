# Kanban per Product Note + Full-Screen Detail — Implementation Plan

> **For agentic workers:** Use subagent-driven-development or executing-plans. Steps `- [ ]`.

**Goal:** Ubah card Kanban dari per-work-code menjadi per-**product note** (menampilkan product note, product, brand, total qty agregat), dengan klik card → overlay full screen berisi identitas + daftar work code + 2 bubble laporan (jahit & finishing).

**Architecture:** Semua di `src/pages/ProductionMonitoring.tsx`. Group `decoratedWO` by `product_note`; card baru; full-screen overlay (pola `ModalShell`, lebar besar); bubble laporan di dalam overlay.

## Global Constraints

- Card per product note: product note, product, brand, **total qty** (Σ semua work code, termasuk FINISHED/INVOICED).
- Kolom card = **status tertinggi** dari work code dalam product note (INVOICED > FINISHED > PROGRESS > CUTTING > NEW).
- Klik card → **overlay full screen**; berisi identitas + daftar work code + 2 bubble laporan (jahit & finishing) untuk product note itu.
- Hanya satu bubble terbuka dalam satu waktu.
- `product_note` tidak pernah null — group langsung tanpa fallback.
- Baca-saja; drag card tetap berfungsi; klik tidak memicu drag.
- Bubble/laporan memakai `sewingRecords` / `finishingRecords` yang sudah dimuat.

---

## Task 1 — Grouping + card per product note

**Files:** Modify `src/pages/ProductionMonitoring.tsx`

- [ ] **Step 1 — Grouping:** buat `useMemo` yang group `decoratedWO` by `product_note` → `KanbanGroup[]` `{ productNote, product, brand, totalQty, status, workOrders }`. `status` = tertinggi menurut `STATUS_ORDER`. `totalQty` = Σ quantity.
- [ ] **Step 2 — Card baru:** ganti `KanbanCard` (yang lama ber-bubble) menjadi card ringkas per group: tampilkan product note (mono, bold), product · brand, `Total qty: <N> pcs`. Tidak ada bubble di card.
- [ ] **Step 3 — Klik card → full screen:** card `onClick` buka overlay; pastikan tidak bentrok dengan `useDraggable` (tombol/body, `activationConstraint`).
- [ ] **Step 4 — KanbanColumn:** render card per group (filter `workOrders` per group tetap pakai `searchQuery` — cocokkan ke product note/product/brand).

## Task 2 — Full-screen overlay + bubble laporan

**Files:** Modify `src/pages/ProductionMonitoring.tsx`

- [ ] **Step 1 — Overlay state:** `selectedNote: KanbanGroup | null`. Klik card → set; ✕ / klik backdrop → null.
- [ ] **Step 2 — Full-screen render:** saat `selectedNote` — overlay besar (pola ModalShell, `width` lebar seperti `min(1100px,96vw)`, `max-h-[90vh]`) berisi:
  - Header: product note + ✕.
  - Identitas: product note, product, brand, total qty, status badge.
  - Daftar work code (tabel): work code, warna/size, qty, status, cutting/jahit.
  - 2 bubble: **Laporan Jahit** & **Laporan Finishing** (toggle, satu pada satu waktu).
- [ ] **Step 3 — Bubble content:** laporan untuk product note = agregat semua work code di dalamnya (filter `sewingRecords`/`finishingRecords` by work_order_id ∈ group). Kolom sama seperti card-bubble sebelumnya (jahit: PIC/qty/tanggal/bukti; finishing: qty/tanggal/source/syncStatus).
- [ ] **Step 4 — Drag-safety:** overlay & bubble `stopPropagation`; tidak meneruskan drag.

## Task 3 — Build + docs

- [ ] **Step 1 — `npm run build`** hijau.
- [ ] **Step 2 — `project.md`** Latest Progress update.

**Test:** build; manual — buka Kanban, lihat card per product note, klik → full screen, buka bubble jahit/finishing.

## Notes

- `ModalShell` sudah tersedia (padding/close). Overlay full screen = pakai pola yang sama tapi `width` besar (atau overlay khusus `fixed inset-0`).
- `KanbanCard` lama (dengan bubble) dihapus/diganti — bubble pindah ke full screen.
