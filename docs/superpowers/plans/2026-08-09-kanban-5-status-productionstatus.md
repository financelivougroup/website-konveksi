# Kanban/ProductionStatus 5-Status Revision — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mengganti `ProductionStatus` 6 nilai lama menjadi 5 nilai (`NEW, CUTTING, PROGRESS, FINISHED, INVOICED`), menormalkan data existing, dan menampilkan Kanban 5 kolom.

**Architecture:** `types/pipeline.ts` mendefinisikan enum baru + `productionStatusLabel/Color`. `lib/productionStatus.ts` menghitung status dari angka (cutting/sewing/qty) + `invoiceStatus`. Semua konsumen (pages/services) diubah ke 5 nilai baru.

**Tech Stack:** React 19 + TS + Vite, Supabase (Postgres + Auth), Tailwind/shadcn.

## Global Constraints

- **`deriveStatus` baru signature**: `(cuttingTotal, sewingTotal, orderQty) => ProductionStatus`, memakai:
  - `cuttingTotal <= 0` → `'NEW'`
  - `sewingTotal <= 0` → `'CUTTING'`
  - `sewingTotal >= orderQty && sewingTotal > 0` → `'FINISHED'`
  - else → `'PROGRESS'`
- **Invoiced** ditentukan dari `invoiceStatus != 'NONE'` (penentu utama). `productionStatus` `'INVOICED'` tetap disinkron oleh `updateWorkOrderInvoiceStatus`.
- **5 nilai enum**: `'NEW' | 'CUTTING' | 'PROGRESS' | 'FINISHED' | 'INVOICED'`.
- Label Indonesia-friendly (New, Cutting, Progress, Finished, Invoiced).
- DB ops via Supabase MCP; migration menormalkan data existing.
- Semua konsumen ikut diubah — tidak ada sisa string `CUTTING_PENDING`, `SEWING_IN_PROGRESS`, `FINISHING_*` di `src/`.

---

## Task 1 — Types + lib productionStatus + label/color

**Files:**
- Modify: `src/types/pipeline.ts`, `src/lib/productionStatus.ts`

**Interfaces:**
- Produces: enum baru, `STATUS_ORDER` baru (5), `deriveStatus(cutting, sewing, qty)`, `validateStatusTransition` menyesuaikan, `productionStatusLabel`/`Color` 5 nilai.

- [ ] **Step 1 — `src/types/pipeline.ts`**: ganti `ProductionStatus` union dan `productionStatusLabel/Color` jadi 5 nilai `NEW/CUTTING/PROGRESS/FINISHED/INVOICED` (label New/Cutting/Progress/Finished/Invoiced; warna pakai palet slate existing, mapping terpisah).
- [ ] **Step 2 — `lib/productionStatus.ts`**: `STATUS_ORDER` = 5 nilai; `deriveStatus(cuttingTotal, sewingTotal, orderQty)` per Global Constraints; `validateStatusTransition` sesuaikan (hapus cek `FINISHING_*`).
- [ ] **Step 3 — Commit** setelah build hijau.

**Test:** `npm run build`.

---

## Task 2 — Migration data existing

**Files:**
- Modify: `supabase/migrations/2026-08-09-kanban-5-status-normalize.sql` (create), via Supabase MCP `apply_migration`.

**Interfaces:** Menormalkan `work_orders.prod_status` nilai lama → baru.

- [ ] **Step 1 — Inspect live** `work_orders.prod_status` distinct (MCP) — salah satu sudah `FINISHED` (2), `FINISHING_COMPLETE` (2).
- [ ] **Step 2 — Migration:**
  ```sql
  UPDATE public.work_orders SET prod_status='CUTTING' WHERE prod_status='CUTTING_COMPLETE';
  UPDATE public.work_orders SET prod_status='NEW'     WHERE prod_status='CUTTING_PENDING';
  UPDATE public.work_orders SET prod_status='PROGRESS' WHERE prod_status IN ('SEWING_IN_PROGRESS','FINISHING_IN_PROGRESS');
  UPDATE public.work_orders SET prod_status='FINISHED' WHERE prod_status='FINISHING_COMPLETE';
  ```
  (Opsional: seed SeedPage nilai 5 baru di Task 4.)
- [ ] **Step 3 — Apply via MCP, verify no old status remains.**

**Test:** `SELECT prod_status, count(*) ... GROUP BY`.

---

## Task 3 — ProductionMonitoring (Kanban + badge + filter)

**Files:**
- Modify: `src/pages/ProductionMonitoring.tsx`

**Interfaces:** Uses `deriveStatus`, `STATUS_ORDER`, label/color baru.

- [ ] **Step 1 — `deriveStatus` panggilan di decorate** (line ~143) sesuaikan signature baru.
- [ ] **Step 2 — Kanban** `STATUS_ORDER.map(...)` otomatis jadi 5 kolom (New/Cutting/Progress/Finished/Invoiced) karena `STATUS_ORDER` baru; pastikan `productionStatusLabel/Color` baru dipakai.
- [ ] **Step 3 — filter** `cuttingQueueWO`/`cuttingDoneWO`: sesuaikan (mis. `derivedStatus === 'NEW'` vs lainnya).
- [ ] **Step 4 — label/`StatusBadge`** otomatis ikut.

**Test:** `npm run build`; manual: lihat Kanban 5 kolom.

---

## Task 4 — SewingEntryForm + autoInvoice + eligible + OrderEntry + SeedPage + misc

**Files:**
- Modify: `src/pages/SewingEntryForm.tsx`, `src/services/autoInvoice.ts`, `src/services/eligibleWorkOrders.ts`, `src/services/workOrders.ts`, `src/pages/OrderEntry.tsx`, `src/pages/SeedPage.tsx` (dan `InvoicingPage.tsx` bila ada `.in` lama).

**Interfaces:** semua writer/reader pakai 5 nilai baru.

- [ ] **Step 1 — `SewingEntryForm`**: dropdown WO filter jadi `['PROGRESS']`; auto-transition: sewing pertama → `PROGRESS` (call `updateProdStatus(woId, 'PROGRESS')`); saat `sewingTotal + qty == qty` (mencapai qty) → `transitionToFinishingComplete` (yang men-set `FINISHED`).
- [ ] **Step 2 — `autoInvoice`**: idempotency `prod_status IN ('FINISHED','INVOICED')`; write `'FINISHED'` saat transition; backfill `.in(['FINISHED','INVOICED'])`.
- [ ] **Step 3 — `eligibleWorkOrders`**: `.in('prod_status', [...])` — daftar sesuai 5 nilai; `deriveStatus(..., w.prod_status, ...)` signature baru; compare `=== 'FINISHED'`.
- [ ] **Step 4 — `workOrders.ts`** `updateProdStatus` tetap; fetch type mapping (otomatis via type union).
- [ ] **Step 5 — `OrderEntry`**: create WO `productionStatus: 'NEW'`.
- [ ] **Step 6 — `SeedPage`**: nilai seed `prod_status` jadi 5 nilai baru (mis. NEW/CUTTING/PROGRESS/FINISHED/INVOICED), mapping dari 6 lama.
- [ ] **Step 7 — `InvoicingPage`** backfill `.in` pakai `['FINISHED','INVOICED']` bila ada.

**Test:** `npm run build`; grep cek tidak ada `FINISHING_COMPLETE|SEWING_IN_PROGRESS|CUTTING_PENDING` di `src/`.

---

## Task 5 — Final: build, lint, docs, commit

**Files:** `project.md`.

- [ ] **Step 1 — `npm run build`** hijau.
- [ ] **Step 2 — `npm run lint`** (laporkan pre-existing terpisah).
- [ ] **Step 3 — `project.md`** Latest Progress update.
- [ ] **Step 4 — grep** no stale status strings.

**Test:** build + lint + grep.

---

## Notes for implementer/reviewer

- `deriveStatus` tidak lagi menerima `rawStatus`; Invoiced ditentukan dari `invoiceStatus`. Pastikan `ProductionMonitoring` / `eligibleWorkOrders` tidak lagi meneruskan `wo.productionStatus` ke `deriveStatus`.
- Data live hanya `FINISHING_COMPLETE` (2) yang perlu map; sisanya sudah aman.
- Jangan ubah behavior invoice (auto-invoice tetap dipicu pada FINISHED).