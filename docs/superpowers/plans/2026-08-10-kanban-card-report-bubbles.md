# Kanban Card Report Bubbles — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Setiap card Kanban menampilkan 2 bubble (Jahit & Finishing) yang membuka expand laporan per-WO, satu dalam satu waktu.

**Architecture:** Semua di `src/pages/ProductionMonitoring.tsx` (satu file). Tambah state finishing records + openBubble, ubah `KanbanCard` render.

## Global Constraints

- Hanya satu bubble terbuka pada satu waktu (user decision A).
- Data dari `sewing_records` / `finishing_records` per `work_order_id`.
- Klik bubble TIDAK boleh memicu drag (stopPropagation).
- Baca-saja (tidak menambah/edit record dari card).

---

## Task 1 — Card bubbles + expand

**Files:** Modify `src/pages/ProductionMonitoring.tsx`

- [ ] **Step 1 — Data:** tambah state `finishingRecords` + `fetchAll` (via `finishingRecordSvc`) di `useEffect` load, ikut `decoratedWO` dep (atau render). SewingRecords sudah ada.
- [ ] **Step 2 — `KanbanCard`:** tambah props `sewingList`, `finishingList`, `openBubble`, `onToggleBubble` (atau state lokal di card + callback). Render 2 tombol bubble (ikon). Klik: `onClick` dengan `e.stopPropagation()`.
- [ ] **Step 3 — Expand view:** saat `openBubble==='sewing'` render list SewingRecord (pic, qty, tanggal, imageName); saat `'finishing'` render list FinishingRecord (qty, tanggalImport, source, syncStatus badge). Terurut terbaru, scroll bila banyak.
- [ ] **Step 4 — Toggle:** klik bubble aktif → tutup; klik lain → ganti. Satu pada satu waktu.
- [ ] **Step 5 — Drag:** bubble area & expand tidak meneruskan `listeners` drag (gunakan elemen terpisah, tombol `stopPropagation`; pastikan `useDraggable` listener tetap di body card).
- [ ] **Step 6 — Build** `npm run build` hijau.

**Test:** `npm run build`; manual — klik bubble jahit/finishing, cek expand & toggle, drag masih jalan.

## Notes

- `FinishingRecord` belum punya `pic` (hanya qty/tanggal/source/sync). Tampilkan sesuai field yang ada.
- Gunakan `finishingRecordSvc.fetchByWorkOrder(woId)` untuk lazy atau `fetchAll` untuk state; pilih yang paling bersih.
