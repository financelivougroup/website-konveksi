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
