# Kanban Card per Product Note + Full-Screen Detail — Design

**Date:** 2026-08-10
**Status:** Approved (user decisions: Q1 card content, Q2 highest-status column, Q3 full-screen overlay A, Q4 full-screen content A; product_note never null; total qty includes all work codes)

## Context

Kanban Production Monitoring saat ini menampilkan card per **work code**. User ingin card per **product note** (kode unik 1 produksi 1 jenis produk, bisa menaungi beberapa work code dengan warna/size beda). Card bisa di-klik → **overlay full screen** berisi detail product note + 2 bubble laporan (jahit & finishing) khusus product note itu. Ini menggantikan bubble per-card yang sudah dibuat.

## Goals

1. Card Kanban **per product note**, menampilkan: **product note, product, brand, total qty** (agregat semua work code di dalamnya).
2. Card masuk kolom berdasarkan **status tertinggi** dari work code di dalamnya (A).
3. Klik card → **overlay full screen** (fixed, menutup dashboard, tombol tutup).
4. Full screen menampilkan: identitas product note + **daftar work code di dalamnya** + 2 bubble **laporan jahit** & **laporan finishing** khusus product note itu.
5. Baca-saja; drag card tetap berfungsi; grouping work code by product_note.

## Design

### Data grouping

- Group `decoratedWO` (yang sudah punya `derivedStatus`, `cuttingTotal`, `sewingTotal`) berdasarkan `product_note`.
- **product_note tidak pernah null** (keputusan user) — jadi setiap work order pasti punya product_note; group langsung berdasarkan itu tanpa fallback.
- Total qty card = Σ `quantity` seluruh work code dalam product note (termasuk yang FINISHED/INVOICED — keputusan user).
- Status card = status tertinggi menurut `STATUS_ORDER` (INVOICED > FINISHED > PROGRESS > CUTTING > NEW).

### Card Kanban (per product note)

```
[ product_note ]                    [ status badge ]
product · brand
Total qty: <N> pcs (Σ work code)
```
- Klik card (bukan drag) → buka full screen.
- Tidak ada bubble di card lagi (pindah ke full screen).

### Full-Screen Overlay

- Pakai pola `ModalShell` (fixed inset-0 z-100) dengan `width` lebar (mis. `min(960px, 96vw)`) & `max-h-[90vh]`, atau overlay penuh tanpa batas. User pilih "full layar" — jadi **overlay besar, hampir penuh** (mis. `w-[min(1100px,96vw)] h-[min(80vh,860px)]`), bukan modal kecil.
- Header: product note + tombol ✕.
- Body:
  1. **Identitas**: product note, product, brand, total qty, status card.
  2. **Daftar work code** di dalamnya: tabel ringkas — work code, warna/size, qty, status, cutting/jahit total.
  3. **2 bubble** (Jahit / Finishing) — expand inline di dalam full screen (satu pada satu waktu), menampilkan laporan untuk **product note** itu (agregat semua work code di dalamnya) — sama seperti bubble card sebelumnya, tapi scope-nya product note.
- Drag listeners TIDAK berlaku di overlay (elemen terpisah); bubble klik stopPropagation.

### Laporan scope

- **Laporan Jahit** (product note): Σ semua `SewingRecord` yang work_order_id-nya termasuk work code product note itu. Kolom: PIC, qty, tanggal, bukti.
- **Laporan Finishing** (product note): Σ semua `FinishingRecord` work code product note itu. Kolom: qty, tanggal import, source, syncStatus.
- Data dari `sewingRecords` / `finishingRecords` yang sudah dimuat di state.

## Out of scope

- Mengedit/menambah record dari card/full screen (baca-saja).
- Perubahan kolom/status Kanban.
- Grouping ke dimensi lain (brand, dsb).

## Acceptance criteria

- Card menampilkan product note, product, brand, total qty agregat.
- Kolom card = status tertinggi work code dalam product note.
- Klik card → full-screen overlay dengan identitas + daftar work code + 2 bubble laporan.
- Bubble menampilkan laporan jahit/finishing untuk product note (semua work code).
- Drag card & klik tidak saling ganggu.
- `npm run build` hijau.
