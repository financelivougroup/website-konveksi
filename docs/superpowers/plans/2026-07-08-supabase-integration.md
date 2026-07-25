# Supabase Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all mock data with Supabase-backed persistence across 15 tables, build service layer, add Kanban drag-and-drop with strict status validation, and provide a seed page.

**Architecture:** Service layer pattern — one file per table in `src/services/` exporting typed async CRUD functions. Components fetch via `useEffect` + `useState`. Kanban drag-and-drop via `@dnd-kit/core` with optimistic updates and rollback.

**Tech Stack:** React 19.2, TypeScript, Supabase JS v2, @dnd-kit/core, Tailwind CSS, shadcn/ui

## Global Constraints

- All 15 tables already created in Supabase (verified ✅)
- Supabase client singleton at `src/lib/supabase.ts` (already created ✅)
- `.env` configured with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (already done ✅)
- `@supabase/supabase-js` installed (already done ✅)
- Manual prefix IDs: `PO-001`, `WO-001`, `CR-001`, `SR-001`, `FR-001`, `INV-001`, `PAY-001`
- Service functions return `{ data, error }` tuple
- Components handle loading/error states
- Optimistic updates with rollback for mutations
- `viewConfig` stays as static config in `mockData.ts` — NOT a database table
- Existing helpers (`generateWorkCode`, `computeCutVsUpload`, `getSewingTotal`, etc.) stay in `lib/utils.ts` and `pipelineData.ts`
- Must pass `npm run build` with no TypeScript errors at each checkpoint

---

### Task 1: Add `generateId` to `src/lib/utils.ts`
**Files:** Modify: `src/lib/utils.ts`
- [ ] Import supabase client
- [ ] Add `generateId(prefix, tableName, idColumn?)` async function
- [ ] Verify it compiles

### Task 2: Create pipeline service files (6 files)
**Files:** Create: `src/services/productionOrders.ts`, `workOrders.ts`, `cuttingRecords.ts`, `sewingRecords.ts`, `finishingRecords.ts`, `invoices.ts`
- [ ] Each exports typed CRUD functions
- [ ] Pattern: `fetchAll`, `fetchById`, `create`, `update`, `remove`

### Task 3: Create master data service files (7 files)
**Files:** Create: `src/services/masterProducts.ts`, `rawMonitoring.ts`, `masterImports.ts`, `targetJahit.ts`, `registerPenjahit.ts`, `daftarLibur.ts`, `payments.ts`, `auditLogs.ts`
- [ ] Read-only for most master tables
- [ ] targetJahit, daftarLibur have full CRUD

### Task 4: Create SeedPage
**Files:** Create: `src/pages/SeedPage.tsx`, Modify: `src/App.tsx` (add route)
- [ ] Seed button that inserts all mock data via service layer
- [ ] Progress messages per table
- [ ] Clear + re-seed capability

### Task 5: Refactor App.tsx to use services
**Files:** Modify: `src/App.tsx`
- [ ] Replace `mockData[effectiveModule]` with service fetch
- [ ] Add loading/error states
- [ ] Wire CRUD through services
- [ ] Views/settings stay local (viewConfig still static)

### Task 6: Refactor ProductionMonitoring.tsx
**Files:** Modify: `src/pages/ProductionMonitoring.tsx`
- [ ] Replace mockWorkOrders → workOrders service fetch
- [ ] Replace mockCuttingRecords.push → cuttingRecords.create
- [ ] Replace mockSewingRecords.push → sewingRecords.create
- [ ] Wire pull order → productionOrders + workOrders services

### Task 7: Install @dnd-kit + Add Kanban DnD
**Files:** Install: `@dnd-kit/core`, Modify: `src/pages/ProductionMonitoring.tsx`
- [ ] Wrap Kanban columns in DndContext
- [ ] Make cards draggable, columns droppable
- [ ] Add strict validation rules
- [ ] Optimistic update + rollback

### Task 8: Refactor SewingEntryForm + OrderEntry + DetailPanel
**Files:** Modify: `src/pages/SewingEntryForm.tsx`, `src/pages/OrderEntry.tsx`, `src/components/Panel/DetailPanel.tsx`
- [ ] Replace all mock mutations with service calls
- [ ] DetailPanel: wire save/delete to correct services per moduleId

### Task 9: Clean mock data files
**Files:** Modify: `src/data/mockData.ts`, `src/data/pipelineData.ts`
- [ ] Remove all mock data arrays
- [ ] Keep viewConfig, helpers, penjahitList, bulanList, supabaseWorkCodes

### Task 10: Build verification + update project.md
- [ ] Run `npm run build`, fix any TS errors
- [ ] Update `project.md` Latest Progress section

---
