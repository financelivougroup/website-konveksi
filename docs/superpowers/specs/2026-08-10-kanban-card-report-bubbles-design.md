# Kanban Card: Laporan Jahit & Finishing Bubbles — Design

**Date:** 2026-08-10
**Status:** Approved (user decision A — only one bubble open at a time)

## Context

Card Kanban di Production Monitoring saat ini hanya menampilkan workCode, brand, product, qty. User ingin tiap card punya 2 "bubble" (tombol ikon) yang membuka laporan **jahit** dan laporan **finishing** untuk work order itu, sebagai **expand di dalam card** (bukan modal). Hanya satu bubble yang terbuka pada satu waktu.

## Goals

1. Setiap card Kanban menampilkan 2 bubble: **Jahit** (laporan jahit) dan **Finishing** (laporan finishing).
2. Klik bubble → area kecil di dalam card meluas menampilkan daftar record terkait WO itu.
3. Hanya satu bubble terbuka dalam satu waktu; klik bubble lain menutup yang pertama.
4. Data bersumber dari `sewing_records` dan `finishing_records` per `work_order_id`.

## Design

### Data

- `sewingRecordSvc.fetchByWorkOrder(woId)` → `SewingRecord[]` (`picPenjahit, qtySelesai, tanggalLaporan, imageName`).
- `finishingRecordSvc.fetchByWorkOrder(woId)` → `FinishingRecord[]` (`qtyFinishing, tanggalImport, source, syncStatus`).
- Di muat per-WO saat bubble ditekan (lazy), atau sudah tersedia di state (`sewingRecords` sudah ada; `finishingRecords` perlu ditambah state + fetch). Keputusan implementasi: **muat dari state yang sudah ada bila ada, lazy-fetch bila kosong** — paling hemat.

### Card Kanban (perubahan)

`KanbanCard` mendapat:
- Dua tombol bubble (ikon lucide, mis. `Scissors`/`FileText` untuk jahit; `PackageCheck`/`ClipboardList` untuk finishing) di area bawah card, kecil, aksen lembut.
- State `openBubble: 'sewing' | 'finishing' | null` di level card (atau parent mengelola — satu waktu hanya satu).
- Saat `openBubble === 'sewing'` → bagian expand menampilkan list sewing records WO itu.
- Saat `openBubble === 'finishing'` → bagian expand menampilkan list finishing records.
- Klik bubble aktif → tutup (toggle).

### Expand view

- **Laporan Jahit:** untuk tiap `SewingRecord`: `picPenjahit`, `qtySelesai` pcs, `tanggalLaporan`, dan `imageName` (kalau ada, tampil sebagai label/ikon bukti). List terurut tanggal terbaru.
- **Laporan Finishing:** untuk tiap `FinishingRecord`: `qtyFinishing` pcs, `tanggalImport`, `source`, badge `syncStatus` (OK/FAILED). List terurut `syncedAt` terbaru.
- Area expand kecil, scroll vertikal bila banyak, gaya konsisten dengan card (rounded, bg slate-50).

### Drag-and-drop consideration

Card saat ini memakai `useDraggable` — bubble klik harus **berhenti propagasi drag** (supaya klik tombol tidak memulai drag). Pakai `onClick` dengan `stopPropagation` + `preventDefault` pada tombol, dan area expand tidak meneruskan `listeners` drag.

## Out of scope

- Modal laporan (dipilih expand).
- Menambah/mengedit record jahit/finishing dari card (baca saja).
- Mengubah kolom Kanban/status.

## Acceptance criteria

- Card Kanban menampilkan 2 bubble; klik membuka/menutup expand masing-masing.
- Hanya satu expand terbuka dalam satu waktu.
- Laporan jahit & finishing menampilkan kolom sesuai design, dari data per-WO.
- Drag card tetap berfungsi; klik bubble tidak memicu drag.
- `npm run build` hijau.
