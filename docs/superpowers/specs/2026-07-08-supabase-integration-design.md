# Design: Supabase Integration — Website Konveksi

**Date**: 2026-07-08
**Status**: Approved for Implementation
**Supabase Project**: Already provisioned (URL + anon key available)

---

## 1. Goals

### Problem

All data is currently stored in-memory as mock arrays (`src/data/mockData.ts`, `src/data/pipelineData.ts`). Mutations modify arrays directly — data is lost on page refresh. No persistence, no multi-user support, no future-proofing.

### Goal

Replace all mock data with Supabase-backed persistence:

1. Install and configure Supabase client (`@supabase/supabase-js`)
2. Create 15 SQL tables mirroring the existing data schema
3. Build a service layer (`src/services/`) — one file per table, clean CRUD functions
4. Refactor all components to fetch from Supabase instead of importing mock arrays
5. Add drag-and-drop to the Kanban board with strict status validation
6. Provide a seed page (`/seed`) to populate initial data
7. Keep `viewConfig` (column definitions) as static config — those are NOT database rows

### Non-goals

- Supabase Auth / Row Level Security (handled later in Phase B of pipeline revamp)
- Real-time subscriptions (poll or refetch on mutation for now)
- PDF invoice generation
- Email delivery

---

## 2. Approach: Hybrid + Full Migration

### Chosen Approach

- **Supabase client with auth hooks ready** — client configured, `supabase.auth` available, but no login page or RLS yet. Mock role switcher remains.
- **All 15 tables created** — pipeline (6) + master data (6) + auxiliary (2) + table views (variable). Complete clean break from mock data.
- **Manual prefix IDs** — `PO-001`, `WO-001`, `CR-001`, etc., matching current mock data convention. ID generation via `generateId(prefix, existingIds)` utility.
- **Seed via app page** — a `/seed` route that inserts all current mock data through the service layer. Re-runnable for dev reset.

---

## 3. Architecture

### 3.1 File Structure

```
src/
├── lib/
│   ├── supabase.ts              # NEW — Supabase client singleton
│   └── utils.ts                 # MODIFIED — add generateId()
├── services/                    # NEW — data access layer
│   ├── productionOrders.ts
│   ├── workOrders.ts
│   ├── cuttingRecords.ts
│   ├── sewingRecords.ts
│   ├── finishingRecords.ts
│   ├── invoices.ts
│   ├── payments.ts
│   ├── auditLogs.ts
│   ├── masterProducts.ts
│   ├── rawMonitoring.ts
│   ├── masterImports.ts
│   ├── targetJahit.ts
│   ├── registerPenjahit.ts
│   └── daftarLibur.ts
├── pages/
│   ├── SeedPage.tsx             # NEW — seed data page
│   ├── ProductionMonitoring.tsx  # MODIFIED — service calls + DnD
│   ├── SewingEntryForm.tsx       # MODIFIED — service calls
│   └── OrderEntry.tsx            # MODIFIED — service calls
├── data/
│   ├── mockData.ts              # MODIFIED — keep viewConfig only
│   └── pipelineData.ts          # MODIFIED — keep helpers, remove data arrays
├── App.tsx                      # MODIFIED — async data loading
└── .env                         # NEW — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

### 3.2 Supabase Client (`src/lib/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

Environment variables in `.env`:
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Already in `.gitignore`: `*.local` pattern covers `.env`.

### 3.3 Service Layer Pattern

Every service file follows this pattern:

```typescript
// src/services/workOrders.ts
import { supabase } from '@/lib/supabase';
import type { WorkOrder } from '@/types/pipeline';
import { generateId } from '@/lib/utils';

export async function fetchAll(): Promise<{ data: WorkOrder[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function fetchById(id: string): Promise<{ data: WorkOrder | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('*')
    .eq('id', id)
    .single();
  return { data, error };
}

export async function updateStatus(id: string, prodStatus: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('work_orders')
    .update({ prod_status: prodStatus })
    .eq('id', id);
  return { error };
}

// ... etc for all CRUD operations
```

**Rules:**
- Each function is pure — no state mutation
- Returns `{ data, error }` tuple (Supabase pattern)
- Components handle `loading` state, `useEffect` for initial fetch
- All functions are `async`
- Type-safe: parameters and return values use existing TypeScript interfaces

### 3.4 ID Generation Utility

```typescript
// In src/lib/utils.ts
export async function generateId(
  prefix: string,
  tableName: string,
  idColumn: string = 'id'
): Promise<string> {
  const { data } = await supabase
    .from(tableName)
    .select(idColumn)
    .order(idColumn, { ascending: false })
    .limit(1);

  if (!data || data.length === 0) {
    return `${prefix}-001`;
  }

  const lastId = data[0][idColumn] as string;
  const numPart = lastId.replace(`${prefix}-`, '');
  const nextNum = parseInt(numPart, 10) + 1;
  return `${prefix}-${String(nextNum).padStart(3, '0')}`;
}
```

---

## 4. SQL Table Schema

### 4.1 Pipeline Tables

#### `production_orders`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `text` | PRIMARY KEY | Format: `PO-001` |
| `work_code` | `text` | NOT NULL | Generated work code |
| `product_note` | `text` | | B-00, B-01, etc. |
| `product` | `text` | NOT NULL | Product name |
| `information_variation` | `text` | | Colour + Size string |
| `warna` | `text` | | Color |
| `size` | `text` | | Size |
| `brand` | `text` | | Cassca / Livou |
| `quantity` | `integer` | NOT NULL DEFAULT 0 | Order quantity |
| `status` | `text` | NOT NULL DEFAULT 'PLANNING' | PLANNING / PULLED / CANCELLED |
| `created_by` | `text` | | User who created |
| `created_at` | `timestamptz` | DEFAULT NOW() | |
| `pulled_at` | `timestamptz` | | When pulled to Konveksi |
| `pulled_by` | `text` | | User who pulled |

#### `work_orders`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `text` | PRIMARY KEY | Format: `WO-001` |
| `work_code` | `text` | NOT NULL | |
| `source_order_id` | `text` | REFERENCES production_orders(id) | FK to parent order |
| `product_note` | `text` | | |
| `product_note_full` | `text` | | PDFF_ formatted |
| `product` | `text` | NOT NULL | |
| `product_id` | `text` | | SKU |
| `variation_id` | `text` | | |
| `information_variation` | `text` | | |
| `warna` | `text` | | |
| `size` | `text` | | |
| `brand` | `text` | | |
| `quantity` | `integer` | NOT NULL DEFAULT 0 | |
| `prod_status` | `text` | NOT NULL DEFAULT 'CUTTING_PENDING' | Production status |
| `invoice_status` | `text` | NOT NULL DEFAULT 'NONE' | Invoice status |
| `created_by` | `text` | | |
| `created_at` | `timestamptz` | DEFAULT NOW() | |
| `pulled_at` | `timestamptz` | | |

**prod_status values:** `CUTTING_PENDING`, `CUTTING_COMPLETE`, `SEWING_IN_PROGRESS`, `SEWING_COMPLETE`, `FINISHING_IN_PROGRESS`, `FINISHING_COMPLETE`

**invoice_status values:** `NONE`, `WAITING_INVOICE`, `INVOICED`, `PARTIAL_PAID`, `PAID`

#### `cutting_records`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `text` | PRIMARY KEY | Format: `CR-001` |
| `work_order_id` | `text` | NOT NULL, REFERENCES work_orders(id) | FK |
| `total_cutting` | `integer` | NOT NULL | |
| `sisa_cutting` | `integer` | DEFAULT 0 | total_cutting - quantity |
| `input_by` | `text` | | User who input |
| `input_at` | `timestamptz` | DEFAULT NOW() | |
| `locked` | `boolean` | DEFAULT true | Always locked after create |

**Constraint:** One cutting_record per work_order (enforced at app level, unique index optional).

#### `sewing_records`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `text` | PRIMARY KEY | Format: `SR-001` |
| `work_order_id` | `text` | NOT NULL, REFERENCES work_orders(id) | FK |
| `work_code` | `text` | | Denormalized for display |
| `pic_penjahit` | `text` | NOT NULL | Tailor name |
| `qty_selesai` | `integer` | NOT NULL | Partial qty this batch |
| `tgl_laporan` | `date` | NOT NULL | Report date |
| `input_by` | `text` | | User who input |
| `input_at` | `timestamptz` | DEFAULT NOW() | |
| `image_url` | `text` | | Photo URL |
| `image_name` | `text` | | Original filename |

#### `finishing_records`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `text` | PRIMARY KEY | Format: `FR-001` |
| `work_order_id` | `text` | NOT NULL, REFERENCES work_orders(id) | FK |
| `qty_finishing` | `integer` | NOT NULL | Qty in this batch |
| `tgl_import` | `date` | | Import date |
| `synced_at` | `timestamptz` | DEFAULT NOW() | |
| `source` | `text` | DEFAULT 'manual' | pancake-pos / manual |
| `sync_status` | `text` | DEFAULT 'OK' | OK / FAILED |

#### `invoices`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `text` | PRIMARY KEY | Format: `INV-001` |
| `work_order_id` | `text` | NOT NULL, REFERENCES work_orders(id) | FK |
| `work_code` | `text` | | Denormalized |
| `quantity` | `integer` | NOT NULL | |
| `unit_price` | `numeric` | DEFAULT 0 | |
| `amount` | `numeric` | DEFAULT 0 | quantity × unit_price |
| `amount_paid` | `numeric` | DEFAULT 0 | Running total |
| `due_date` | `date` | | |
| `status` | `text` | NOT NULL DEFAULT 'WAITING_INVOICE' | Invoice lifecycle |
| `generated_at` | `timestamptz` | | |
| `sent_at` | `timestamptz` | | |

### 4.2 Master Data Tables

#### `master_products`

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PRIMARY KEY |
| `brand` | `text` | NOT NULL |
| `product_id` | `text` | NOT NULL |
| `product` | `text` | NOT NULL |
| `category` | `text` | |
| `status_product` | `text` | DEFAULT 'Aktif' |
| `warning_stock` | `text` | |

#### `raw_product_monitoring`

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PRIMARY KEY |
| `product_id` | `text` | NOT NULL |
| `product` | `text` | NOT NULL |
| `warna` | `text` | |
| `size` | `text` | |
| `available_quantity` | `integer` | DEFAULT 0 |
| `status_stock_final` | `text` | |
| `sisa_cutting` | `integer` | DEFAULT 0 |
| `prioritas_dalam_proses` | `integer` | |
| `prioritas_tunggu_prdn` | `integer` | |
| `prioritas_tunggu_whlb` | `integer` | |
| `brand` | `text` | |
| `source` | `text` | |

#### `master_imports`

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PRIMARY KEY |
| `supplier` | `text` | NOT NULL |
| `note` | `text` | |
| `source_product` | `text` | |
| `product_id` | `text` | |
| `kode_produksi` | `text` | |
| `status` | `text` | DEFAULT 'Diterima' |
| `received_at` | `date` | |

#### `target_jahit`

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PRIMARY KEY |
| `bulan_tahun` | `text` | NOT NULL |
| `nama` | `text` | NOT NULL |
| `posisi` | `text` | |
| `salary` | `numeric` | DEFAULT 0 |
| `total_hari_kerja` | `integer` | DEFAULT 0 |
| `hari_kerja_hari_ini` | `integer` | DEFAULT 0 |
| `sisa_hari` | `integer` | DEFAULT 0 |
| `target_daily` | `numeric` | DEFAULT 0 |
| `target_ngebut_hari` | `numeric` | DEFAULT 0 |
| `target_monthly` | `numeric` | DEFAULT 0 |
| `realisasi_monthly` | `numeric` | DEFAULT 0 |
| `sisa_target_monthly` | `numeric` | DEFAULT 0 |
| `progress_monthly` | `numeric` | DEFAULT 0 |
| `status_final` | `text` | |
| *(Extended columns for accumulated targets)* | | |
| `target_cost_posisi` | `numeric` | DEFAULT 0 |
| `realisasi_cost_posisi` | `numeric` | DEFAULT 0 |
| `target_accum` | `numeric` | DEFAULT 0 |
| `realisasi_accum` | `numeric` | DEFAULT 0 |
| `selisih_accum` | `numeric` | DEFAULT 0 |
| `target_ngebut_hari_akumulasi` | `numeric` | DEFAULT 0 |
| `progress_accum` | `numeric` | DEFAULT 0 |
| `status_final_akumulasi` | `text` | |

#### `register_penjahit`

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PRIMARY KEY |
| `pic_penjahit` | `text` | NOT NULL |
| `konveksi_team` | `text` | |
| `status` | `text` | DEFAULT 'Aktif' |

#### `daftar_libur`

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PRIMARY KEY |
| `tanggal` | `date` | NOT NULL |
| `hari` | `text` | |
| `keterangan` | `text` | |

### 4.3 Auxiliary Tables

#### `payments`

| Column | Type | Constraints |
|---|---|---|
| `id` | `text` | PRIMARY KEY — Format: `PAY-001` |
| `invoice_id` | `text` | NOT NULL, REFERENCES invoices(id) |
| `amount` | `numeric` | NOT NULL |
| `received_at` | `timestamptz` | DEFAULT NOW() |
| `received_by` | `text` | |
| `method` | `text` | bank-transfer / cash / other |
| `note` | `text` | |

#### `audit_logs`

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PRIMARY KEY |
| `phase` | `text` | NOT NULL |
| `record_id` | `text` | NOT NULL |
| `field` | `text` | NOT NULL |
| `old_value` | `text` | |
| `new_value` | `text` | |
| `changed_by` | `text` | |
| `changed_at` | `timestamptz` | DEFAULT NOW() |
| `reason` | `text` | |

### 4.4 selesai-finishing & selesai-jahit Tables

The `selesai_finishing` and `selesai_jahit` views from `mockData.ts` are computed/aggregated views — they derive from work_orders + cutting_records + sewing_records. We have two options:

**Chosen: Keep as derived data** — no separate tables. The existing `computeCutVsUpload()`, `computeStatusStock()`, `generateWorkCode()` functions compute these fields on-the-fly from pipeline data. This avoids data duplication.

The `selesai_jahit` data maps directly to `sewing_records` joined with `work_orders`.

### 4.5 Complete SQL

The full SQL file will be generated during implementation. Key points:
- All `text` IDs (pipeline tables) use manual prefix format
- All master data tables use `serial` auto-increment IDs
- Foreign keys on `work_order_id` in child tables reference `work_orders(id)`
- All tables use snake_case column names (Supabase convention)
- Timestamps use `timestamptz` for timezone awareness

---

## 5. Kanban Drag-and-Drop

### 5.1 Library

`@dnd-kit/core` — lightweight, React-native, well-maintained.

### 5.2 Implementation

```typescript
// ProductionMonitoring.tsx
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';

// Each column = droppable with id = prod_status value
function KanbanColumn({ status, workOrders, ... }) {
  const { setNodeRef } = useDroppable({ id: status });
  return <div ref={setNodeRef}>...</div>;
}

// Each card = draggable with id = work order id
function KanbanCard({ wo }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: wo.id });
  return <div ref={setNodeRef} {...listeners} {...attributes}>...</div>;
}

// Drag handler with strict validation
function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over) return;

  const woId = active.id as string;
  const newStatus = over.id as string;
  const workOrder = workOrders.find(w => w.id === woId);
  if (!workOrder) return;

  // Strict validation
  const validationError = validateStatusTransition(workOrder.prod_status, newStatus, workOrder);
  if (validationError) {
    showToast(validationError, 'error');
    return;
  }

  // Optimistic update
  setWorkOrders(prev => prev.map(w => w.id === woId ? { ...w, prod_status: newStatus } : w));

  // Persist to Supabase
  updateWorkOrderStatus(woId, newStatus).then(({ error }) => {
    if (error) {
      // Rollback
      setWorkOrders(prev => prev.map(w => w.id === woId ? { ...w, prod_status: workOrder.prod_status } : w));
      showToast('Failed to update status', 'error');
    }
  });
}
```

### 5.3 Validation Rules (Strict)

```typescript
const STATUS_ORDER = [
  'CUTTING_PENDING',
  'CUTTING_COMPLETE',
  'SEWING_IN_PROGRESS',
  'SEWING_COMPLETE',
  'FINISHING_IN_PROGRESS',
  'FINISHING_COMPLETE',
];

function validateStatusTransition(from: string, to: string, wo: WorkOrder): string | null {
  if (from === to) return null; // No change

  const fromIdx = STATUS_ORDER.indexOf(from);
  const toIdx = STATUS_ORDER.indexOf(to);

  // Rule 1: Cannot go backward
  if (toIdx < fromIdx) return 'Cannot move backward in status';

  // Rule 2: Cannot skip statuses (must go one step at a time)
  if (toIdx > fromIdx + 1) return 'Cannot skip statuses — move one step at a time';

  // Rule 3: Cutting Complete → Sewing In Progress requires a cutting record
  if (from === 'CUTTING_COMPLETE' && to === 'SEWING_IN_PROGRESS') {
    // Will check after cutting_records service is wired up
  }

  // Rule 4: Sewing In Progress → Sewing Complete requires sewing_total >= quantity
  if (from === 'SEWING_IN_PROGRESS' && to === 'SEWING_COMPLETE') {
    const sewingTotal = getSewingTotal(wo.id);
    if (sewingTotal < wo.quantity) return 'Sewing total must reach order quantity first';
  }

  return null; // Valid transition
}
```

### 5.4 Visual Feedback

- **While dragging:** card gets opacity-50 + scale-105 + shadow-lg
- **Over valid column:** column header gets ring-2 ring-blue-400
- **Over invalid column:** column header gets ring-2 ring-red-400 (or no highlight for backward moves)
- **Drop rejected:** card snaps back (handled by @dnd-kit, since we don't update state on invalid drop)

---

## 6. Seed Page

### Route & Access

- URL: `/#/seed` or accessed via a button in dev mode
- Simple page with a "Seed Database" button
- Shows progress messages per table
- Idempotent: checks if data exists before inserting (or clears first)

### Flow

```typescript
export default function SeedPage() {
  const [status, setStatus] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  async function seed() {
    setRunning(true);
    setStatus([]);

    // 1. Clear existing data (optional, with confirmation)
    // 2. Insert in dependency order: master data first, then pipeline
    await seedMasterProducts();
    await seedRawMonitoring();
    await seedMasterImports();
    await seedRegisterPenjahit();
    await seedDaftarLibur();
    await seedTargetJahit();
    await seedProductionOrders();
    await seedWorkOrders();
    await seedCuttingRecords();
    await seedSewingRecords();
    // Finishing + Invoices seeded empty for now

    setRunning(false);
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1>Seed Database</h1>
      <button onClick={seed} disabled={running}>Seed</button>
      {status.map((s, i) => <div key={i}>{s}</div>)}
    </div>
  );
}
```

---

## 7. Component Refactoring Plan

### 7.1 Files to Create (New)

| File | Purpose |
|---|---|
| `src/lib/supabase.ts` | Supabase client singleton |
| `src/services/productionOrders.ts` | CRUD for production_orders |
| `src/services/workOrders.ts` | CRUD for work_orders |
| `src/services/cuttingRecords.ts` | CRUD for cutting_records |
| `src/services/sewingRecords.ts` | CRUD for sewing_records |
| `src/services/finishingRecords.ts` | CRUD for finishing_records |
| `src/services/invoices.ts` | CRUD for invoices |
| `src/services/payments.ts` | CRUD for payments |
| `src/services/auditLogs.ts` | CRUD for audit_logs |
| `src/services/masterProducts.ts` | Read for master_products |
| `src/services/rawMonitoring.ts` | Read for raw_product_monitoring |
| `src/services/masterImports.ts` | Read for master_imports |
| `src/services/targetJahit.ts` | CRUD for target_jahit |
| `src/services/registerPenjahit.ts` | Read for register_penjahit |
| `src/services/daftarLibur.ts` | CRUD for daftar_libur |
| `src/pages/SeedPage.tsx` | Database seed page |

### 7.2 Files to Modify

| File | Changes |
|---|---|
| `.env` | Add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY |
| `src/lib/utils.ts` | Add `generateId()` function |
| `src/App.tsx` | Replace `mockData` imports with service calls; add loading/error states; add seed route |
| `src/pages/ProductionMonitoring.tsx` | Replace mock mutations with service calls; add DndContext wrapper; add Kanban drag handlers |
| `src/pages/SewingEntryForm.tsx` | Replace `mockSewingRecords.push()` with `sewingRecords.create()` |
| `src/pages/OrderEntry.tsx` | Replace mock mutations with service calls |
| `src/data/mockData.ts` | Remove all data arrays; keep `viewConfig` + `buildFinishingRow` + helpers only |
| `src/data/pipelineData.ts` | Remove mock data arrays; keep helpers (`getCuttingForWO`, `getSewingTotal`, `formatDate`, `generateWorkCode`, etc.) |
| `src/components/Panel/DetailPanel.tsx` | Replace mock mutations with service calls |
| `src/types/pipeline.ts` | No changes needed (already typed correctly) |

### 7.3 Data Flow Pattern (Every Affected Component)

```typescript
// BEFORE (mock):
import { mockWorkOrders } from '@/data/pipelineData';
const data = mockWorkOrders;
// mutate directly: mockWorkOrders.push(...)

// AFTER (Supabase):
import { fetchAll, create } from '@/services/workOrders';
const [data, setData] = useState<WorkOrder[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetchAll().then(({ data: result, error }) => {
    if (!error && result) setData(result);
    setLoading(false);
  });
}, []);

function handleCreate(input: WorkOrderInput) {
  create(input).then(({ data: result, error }) => {
    if (!error && result) setData(prev => [...prev, result]);
  });
}
```

---

## 8. Error Handling & Loading States

### Loading

Every data-dependent component shows:
- **Skeleton/spinner** during initial fetch (`loading === true`)
- **Empty state** when data is empty (`data.length === 0 && !loading`)
- **Error state** when fetch fails (`error !== null`)

Reuse existing `<Skeleton>` from shadcn/ui (`src/components/ui/skeleton.tsx`).

### Error Handling

- Service functions return `{ data, error }` — components handle errors locally
- Toast notifications for mutation errors (reuse existing `useToast` hook)
- Optimistic updates with rollback on failure (Kanban drag, create, delete)
- Network errors: show "Koneksi gagal — periksa jaringan Anda" toast

### Edge Cases

- **Duplicate IDs:** `generateId()` queries max ID before insert — race condition possible under high concurrency. Acceptable for MVP (single-user).
- **Empty tables:** Services return `[]` when table is empty, not `null`.
- **Deleted referenced rows:** Foreign key constraints prevent deletion of referenced work orders. App handles this with confirmation dialogs.
- **Supabase connection failure:** Client creation throws if env vars missing (caught at startup). Runtime failures caught per-request.

---

## 9. Dependencies to Install

```bash
npm install @supabase/supabase-js @dnd-kit/core @dnd-kit/utilities
```

---

## 10. Success Criteria

- [ ] All 15 tables created in Supabase with correct schema
- [ ] `.env` configured with project URL and anon key
- [ ] `supabase` client singleton created and importable
- [ ] All 14 service files created with typed CRUD functions
- [ ] `App.tsx` fetches data from Supabase instead of mock imports
- [ ] `ProductionMonitoring.tsx` reads/writes via services
- [ ] `SewingEntryForm.tsx` creates sewing records via service
- [ ] `OrderEntry.tsx` creates/pulls/cancels via services
- [ ] `DetailPanel.tsx` saves/deletes via services
- [ ] Kanban board supports drag-and-drop with strict status validation
- [ ] Kanban drag updates `prod_status` in Supabase (optimistic + rollback)
- [ ] Seed page populates all tables with initial data
- [ ] `mockData.ts` still exports `viewConfig` (column definitions intact)
- [ ] `pipelineData.ts` helpers still work (compute functions unchanged)
- [ ] Loading states shown during data fetches
- [ ] Error states handled gracefully with toasts
- [ ] Zero mock data arrays remain (all data from Supabase)
- [ ] `npm run build` passes with no TypeScript errors
