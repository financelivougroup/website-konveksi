# Target Jahit Type-Aware Multi-Column Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 22 Target Jahit columns sort reliably through the existing toolbar and header controls, with stable type-aware multi-sort before pagination.

**Architecture:** Add a pure `sortTableRows` helper that resolves Target Jahit's camelCase UI fields to snake_case row properties and compares values according to column metadata. `App.tsx` will replace its inline comparator with the helper and reset pagination whenever sort rules change, while preserving the existing per-view sort state and row selection.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, existing `ColumnDef`, `SortRule`, and `ModuleId` types.

## Global Constraints

- Sorting is client-side only; do not inspect or change Supabase schema, migrations, queries, services, RLS, or persistent data.
- Do not add dependencies, test frameworks, UI components, routes, modals, or shadcn registry items.
- Preserve the existing `SortModal`, `DataTable` header actions, sort indicators, per-view session state, and toast feedback.
- Cover all 22 Target Jahit aliases exactly as listed in `docs/superpowers/specs/2026-07-27-target-jahit-sorting-design.md`.
- Exact row keys take precedence; Target Jahit aliases are fallback resolution only.
- Treat only `null`, `undefined`, and trimmed empty strings as empty; numeric zero is populated.
- Empty values remain below populated values in both ascending and descending order.
- Numeric columns are those with `align: 'right'`, `format: 'currency'`, or `format: 'percent'`; finite numeric strings compare numerically and unparseable populated values fall back to text comparison.
- `bulanTahun` recognizes the 12 Indonesian month names case-insensitively in `<month> <four-digit year>` form; invalid populated values fall back to text comparison.
- Text comparison is locale-aware and case-insensitive with numeric collation.
- Sort rules execute in array order; equal or unusable rules fall through, and complete ties preserve input order.
- The helper returns a new array and must not mutate its input.
- Changing sort rules through either the modal or a header action resets pagination to page 1 without clearing `selectedRows`.
- Preserve direct-key sorting behavior for non-Target-Jahit modules.
- Run `npm run build` and `npm run lint`; report unrelated pre-existing lint failures separately and never hide them.
- Do not commit, push, or alter the two pre-existing untracked design specs unless the user explicitly requests it.

---

## File Map

- Create `src/lib/tableSort.ts`: pure value resolution, typed comparison, empty ordering, and stable multi-sort orchestration.
- Modify `src/App.tsx`: call the helper before pagination and reset pagination from both sorting entry points.
- Modify `project.md`: record completed Target Jahit sorting behavior and exact verification results after implementation passes review.
- Do not modify `src/components/Modals/SortModal.tsx`, `src/components/Table/DataTable.tsx`, `src/types/index.ts`, `src/data/mockData.ts`, services, or database files unless a concrete compile error proves a targeted change is necessary; report that blocker before expanding scope.

### Task 1: Pure Type-Aware Sorting Helper

**Files:**
- Create: `src/lib/tableSort.ts`

**Interfaces:**
- Consumes: `ColumnDef`, `SortRule`, and `ModuleId` from `@/types`.
- Produces:

```ts
export function sortTableRows<T extends Record<string, unknown>>(
  rows: T[],
  sorts: SortRule[],
  columns: ColumnDef[],
  moduleId: ModuleId,
): T[];
```

- [ ] **Step 1: Define the Target Jahit alias map and resolver**

Create this exact alias map from the approved spec:

```ts
const TARGET_JAHIT_FIELD_ALIASES: Record<string, string> = {
  bulanTahun: 'bulan_tahun',
  nama: 'nama',
  posisi: 'posisi',
  salary: 'salary',
  totalHariKerja: 'total_hari_kerja',
  hariKerjaHariIni: 'hari_kerja_hari_ini',
  sisaHari: 'sisa_hari',
  targetDaily: 'target_daily',
  targetNgebutHari: 'target_ngebut_hari',
  targetMonthly: 'target_monthly',
  realisasiMonthly: 'realisasi_monthly',
  sisaTargetMonthly: 'sisa_target_monthly',
  progressMonthly: 'progress_monthly',
  statusFinal: 'status_final',
  targetCostPosisi: 'target_cost_posisi',
  realisasiCostPosisi: 'realisasi_cost_posisi',
  targetAccum: 'target_accum',
  realisasiAccum: 'realisasi_accum',
  selisihAccum: 'selisih_accum',
  targetNgebutHariAkumulasi: 'target_ngebut_hari_akumulasi',
  progressAccum: 'progress_accum',
  statusFinalAkumulasi: 'status_final_akumulasi',
};
```

Resolve values by checking `Object.prototype.hasOwnProperty.call(row, field)` first, then the alias only when `moduleId === 'target-jahit'`; unresolved fields return `undefined`.

```ts
function resolveRowValue(
  row: Record<string, unknown>,
  field: string,
  moduleId: ModuleId,
): unknown {
  if (Object.prototype.hasOwnProperty.call(row, field)) return row[field];
  if (moduleId === 'target-jahit') {
    const alias = TARGET_JAHIT_FIELD_ALIASES[field];
    if (alias && Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  return undefined;
}
```

- [ ] **Step 2: Implement empty, numeric, month/year, and text comparison primitives**

Use these exact empty semantics:

```ts
function isEmpty(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '');
}
```

Create one `Intl.Collator(undefined, { sensitivity: 'base', numeric: true })`. Numeric parsing must accept numbers and trimmed finite numeric strings, but return `null` for non-finite or nonnumeric populated values. Month parsing must map `januari` through `desember` to indices `0` through `11`, require exactly four year digits, and return `year * 12 + monthIndex`; otherwise return `null`.

- [ ] **Step 3: Implement direction-safe value comparison**

Find the configured column with `columns.find((column) => column.key === sort.field)`. Use month/year comparison only for Target Jahit `bulanTahun`; otherwise use numeric comparison when column metadata marks it numeric; otherwise use the collator. If either numeric/month parse fails, compare both populated raw values as text. Handle empties before direction so populated always precedes empty. Apply `desc` only to a populated-value comparison result.

- [ ] **Step 4: Implement stable multi-rule orchestration**

Decorate each row with its original index, sort a copied decorated array, evaluate rules in order, and use original index as the final tie-breaker. With no rules, return `rows.slice()`. Do not mutate `rows`.

```ts
export function sortTableRows<T extends Record<string, unknown>>(
  rows: T[],
  sorts: SortRule[],
  columns: ColumnDef[],
  moduleId: ModuleId,
): T[] {
  if (sorts.length === 0) return rows.slice();

  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      for (const sort of sorts) {
        const compared = compareForRule(left.row, right.row, sort, columns, moduleId);
        if (compared !== 0) return compared;
      }
      return left.index - right.index;
    })
    .map(({ row }) => row);
}
```

- [ ] **Step 5: Verify the isolated helper compiles and lints**

Run:

```bash
npm run build
npm run lint
```

Expected: build exits `0`; lint exits `0`, or any pre-existing failures are listed separately with evidence that `src/lib/tableSort.ts` introduces no new lint error.

- [ ] **Step 6: Self-review against helper acceptance cases**

Inspect the implementation and report concrete evidence for: all 22 aliases; exact-key precedence; zero versus empty; asc/desc empty-last; numeric strings; invalid numeric fallback; chronological Indonesian months; invalid month fallback; rule priority; stable ties; non-mutating return; unknown fields; non-Target-Jahit direct keys.

### Task 2: App Integration, Pagination Reset, and Project Status

**Files:**
- Modify: `src/App.tsx:1-34,319-382,816-829,933-940`
- Modify: `project.md:193` (`Latest Progress` section)

**Interfaces:**
- Consumes: `sortTableRows(rows, sorts, columns, moduleId)` from Task 1.
- Produces: sorted `processedData` before pagination and page-reset behavior for modal/header sorting.

- [ ] **Step 1: Import and apply the helper before pagination**

Add:

```ts
import { sortTableRows } from '@/lib/tableSort';
```

Replace the inline `result.sort(...)` block with:

```ts
result = sortTableRows(result, settings.sorts, config.columns, effectiveModule);
```

Include `config.columns` and `effectiveModule` in the `processedData` memo dependencies. Keep processing order as decoration → search → filters → date range → sorting → pagination.

- [ ] **Step 2: Reset pagination for header sorting without clearing selection**

In `onSortColumn`, preserve the current behavior that updates an existing rule in place or appends a new rule. After `updateSettings(...)`, call `setCurrentPage(1)`. Do not call `setSelectedRows`.

- [ ] **Step 3: Reset pagination for every modal sort edit**

Change `SortModal`'s `onUpdate` callback in `App.tsx` to update sort settings and call `setCurrentPage(1)` for add, direction toggle, field change, remove, and clear-all operations. Preserve `onApply` closing and toast behavior. Do not modify `SortModal.tsx` unless the callback cannot provide this behavior.

- [ ] **Step 4: Run complete static verification**

Run:

```bash
npm run build
npm run lint
```

Expected: build exits `0`; lint exits `0`, or unrelated pre-existing lint failures are reported verbatim and separated from changed-file findings.

- [ ] **Step 5: Perform code-level acceptance inspection**

Verify and report:

1. Every Target Jahit configured key in `viewConfig['target-jahit'].columns` appears in the helper alias map.
2. Sorting still runs before `processedData.slice(...)` pagination.
3. Header direction updates keep the existing rule index; new fields append.
4. Both sort callbacks reset page 1.
5. Neither sort callback clears selection.
6. Sort state remains in existing `moduleViews`/`ViewTabSettings.sorts` session state.
7. Non-Target-Jahit calls receive their effective module and retain direct-key resolution.
8. No database, service, schema, dependency, or UI-component files changed.

- [ ] **Step 6: Update project progress with factual verification results**

Prepend a `### 2026-07-28 — Target Jahit Type-Aware Sorting` entry under `## Latest Progress` describing: pure helper, 22-key alias coverage, numeric/month/text/empty/stable multi-sort semantics, page reset, selection preservation, and exact build/lint outcomes. Do not claim manual browser checks unless they were actually performed.

- [ ] **Step 7: Produce the implementation report without committing**

Report changed files, key decisions, `npm run build` outcome, `npm run lint` outcome, skipped manual checks, and concerns. Do not commit or push.
