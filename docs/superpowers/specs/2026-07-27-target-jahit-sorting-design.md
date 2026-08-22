# Target Jahit Type-Aware Multi-Column Sorting Design

**Date:** 2026-07-27  
**Status:** Approved design; pending written-spec review

## Context

The Target Jahit module renders through the shared `DataTable` and already exposes two sorting entry points:

- the toolbar `Sort` button opens the shared multi-sort modal;
- each table header menu exposes ascending and descending actions.

The active sort rules are stored per view in `ViewTabSettings.sorts` and applied in `App.tsx` before pagination. However, the current comparator compares raw values generically, treats falsy values such as numeric zero as empty, and does not account for Target Jahit's UI column keys being camelCase while its Supabase row fields are snake_case. As a result, sorting can appear available while failing to order Target Jahit records correctly.

This feature will make sorting reliable for all 22 Target Jahit columns without redesigning the shared table or changing the Target Jahit database schema and CRUD boundary.

## Goals

1. Support stable multi-column sorting for Target Jahit.
2. Allow every one of the 22 configured Target Jahit columns to be sorted.
3. Compare numeric, currency, percentage, month/year, text, and status values according to their data type.
4. Resolve Target Jahit's camelCase UI column keys to its snake_case row fields.
5. Keep null, undefined, and empty-string values at the bottom in both ascending and descending directions.
6. Preserve existing toolbar modal and table-header sorting entry points.
7. Reset pagination to page 1 after the active sorting changes.
8. Preserve row selection when sorting changes.
9. Keep sort state for the current browser session using the existing per-view state mechanism.

## Non-Goals

- Persisting sort rules to `localStorage`, Supabase, or another durable store.
- Adding a database column, index, function, policy, migration, or server-side sort endpoint.
- Normalizing the full Target Jahit CRUD boundary from snake_case to camelCase.
- Redesigning `SortModal`, `DataTable`, view tabs, pagination, filters, or grouping.
- Changing sorting behavior for unrelated modules unless the shared helper preserves their existing behavior by design.
- Adding a new UI component or shadcn dependency.

## Current Architecture

- `src/App.tsx` owns table processing: search, filters, date range, sorting, and pagination.
- `src/components/Modals/SortModal.tsx` edits an ordered list of `SortRule` objects.
- `src/components/Table/DataTable.tsx` shows sort indicators and exposes header-menu sort actions.
- `src/types/index.ts` defines `ColumnDef`, `SortRule`, and `ViewTabSettings`.
- `src/data/mockData.ts` defines the 22 Target Jahit columns using camelCase keys.
- `src/services/targetJahit.ts` fetches Supabase rows whose properties use snake_case.

## Approved Approach

Create a focused, pure, type-aware table sorting helper and call it from the processing pipeline in `App.tsx`.

This approach is preferred over normalizing the entire Target Jahit data boundary because it keeps the change limited to sorting. It is preferred over an inline comparator patch because the comparison rules, field resolution, and stable-sort behavior can be understood and verified independently of React state.

## Sorting Helper Design

The new `src/lib/tableSort.ts` helper module will own the following responsibilities:

1. Resolve a `SortRule.field` to the corresponding row value.
2. Determine the comparison kind from the configured `ColumnDef` and Target Jahit field metadata.
3. Compare two non-empty values using the correct strategy.
4. Keep empty values at the bottom regardless of direction.
5. Apply sort rules in array order, where the first rule has the highest priority.
6. Preserve input order when all active rules compare equal.

The helper remains independent of React state, Supabase, pagination, selection, and toast notifications.

### Target Jahit Field Resolution

Target Jahit column keys are camelCase while fetched row fields are snake_case. The sorting layer will use an explicit Target Jahit alias map covering all 22 fields:

| UI column key | Row field |
|---|---|
| `bulanTahun` | `bulan_tahun` |
| `nama` | `nama` |
| `posisi` | `posisi` |
| `salary` | `salary` |
| `totalHariKerja` | `total_hari_kerja` |
| `hariKerjaHariIni` | `hari_kerja_hari_ini` |
| `sisaHari` | `sisa_hari` |
| `targetDaily` | `target_daily` |
| `targetNgebutHari` | `target_ngebut_hari` |
| `targetMonthly` | `target_monthly` |
| `realisasiMonthly` | `realisasi_monthly` |
| `sisaTargetMonthly` | `sisa_target_monthly` |
| `progressMonthly` | `progress_monthly` |
| `statusFinal` | `status_final` |
| `targetCostPosisi` | `target_cost_posisi` |
| `realisasiCostPosisi` | `realisasi_cost_posisi` |
| `targetAccum` | `target_accum` |
| `realisasiAccum` | `realisasi_accum` |
| `selisihAccum` | `selisih_accum` |
| `targetNgebutHariAkumulasi` | `target_ngebut_hari_akumulasi` |
| `progressAccum` | `progress_accum` |
| `statusFinalAkumulasi` | `status_final_akumulasi` |

Resolution order will be:

1. use the exact rule field if it is an own property on the row;
2. for Target Jahit, try the mapped snake_case field;
3. treat an unresolved field as empty.

This allows the helper to preserve existing direct-key behavior for other modules while resolving Target Jahit's data shape explicitly.

### Comparison Types

#### Numeric

Columns marked `align: 'right'`, `format: 'currency'`, or `format: 'percent'` will compare numerically. Numeric strings are converted with `Number` when they represent finite numbers. Numeric zero is a valid value and must never be treated as empty.

If a value in a numeric column cannot be parsed as a finite number, comparison falls back to case-insensitive text comparison rather than throwing or producing an unstable `NaN` result.

#### Month/Year

`bulanTahun` will compare chronologically. The current seeded Target Jahit representation is an Indonesian month name followed by a four-digit year, for example `Juni 2026`. The parser will recognize the 12 Indonesian month names case-insensitively and convert valid values to `year * 12 + monthIndex`.

If either non-empty value does not match `<Indonesian month name> <four-digit year>`, that comparison falls back to text comparison. The table must continue rendering and sorting without an exception.

#### Text and Status

Text, badge, position, name, and status fields use locale-aware, case-insensitive comparison with numeric collation enabled where supported. This produces natural ordering for human-readable labels while keeping behavior deterministic.

### Empty Values

The following values are empty:

- `null`;
- `undefined`;
- `''` after trimming when the value is a string.

Empty values always sort below populated values in both ascending and descending modes. Two empty values compare equal and fall through to the next rule.

### Stable Multi-Sort

Rows are decorated with their original index before sorting. For each pair:

1. evaluate the first rule;
2. if equal, evaluate the next rule;
3. continue until a difference is found;
4. if every rule is equal or unusable, compare original indices.

The helper returns a new array and does not mutate the input array.

## User Interaction

### Toolbar Sort Modal

- The existing toolbar `Sort` action opens `SortModal`.
- Users can add multiple rules.
- Every Target Jahit column is available in the field selector.
- Users can change each rule's direction, remove a rule, or clear all rules.
- Rule order defines priority: the first rule is primary.
- Applying or editing sort rules resets pagination to page 1.

### Header Menu

- Existing `Sort Ascending` and `Sort Descending` actions remain available.
- If the selected column already has a rule, the direction is updated in place so its priority does not change.
- If it does not have a rule, it is appended as the lowest-priority rule.
- A header-menu sort resets pagination to page 1.

### State and Selection

- Sort rules remain scoped to the current view and browser session through the existing `moduleViews` state.
- Browser refresh resets the rules, matching current behavior.
- Sorting and pagination changes do not clear `selectedRows`.
- This preserves the approved Target Jahit bulk-action rule that selection survives sorting.

## Data Flow

The Target Jahit client-side processing order remains:

1. fetch records through `targetJahitSvc.fetchAll()`;
2. run the existing shared computed-field decoration unchanged;
3. apply search;
4. apply filter rules;
5. apply date range;
6. apply the type-aware stable multi-sort helper;
7. paginate the sorted result;
8. render through `DataTable`.

Sorting applies to the complete processed result before pagination, so page boundaries reflect the sorted order.

## Component and File Changes

### `src/lib/tableSort.ts`

Create a pure sorting helper containing:

- Target Jahit field aliases;
- empty-value detection;
- numeric comparison;
- month/year parsing and comparison;
- locale-aware text comparison;
- stable multi-rule orchestration.

The public interface must accept the rows, active sort rules, column definitions, and enough module context to enable Target Jahit's explicit aliases without coupling the helper to React.

### `src/App.tsx`

- Replace the inline generic `result.sort()` block with the helper.
- Pass the active module and configured columns required by the helper.
- Reset `currentPage` to 1 whenever modal or header sorting changes.
- Preserve the existing rule-update behavior and toast feedback.
- Do not clear selection in sort handlers.

### `src/components/Modals/SortModal.tsx`

No structural redesign is required. Only make a targeted change if implementation verification finds that rule edits cannot trigger the approved page-reset behavior through the `App.tsx` callbacks.

### `src/components/Table/DataTable.tsx`

No structural redesign is required. Existing header sort actions and sort indicators remain in use.

### `src/types/index.ts`

No change is required. The helper will reuse the existing `ColumnDef`, `SortRule`, and `ModuleId` types.

## Error Handling and Edge Cases

- No active sort rules: return rows in their current order.
- Unknown or removed sort field: treat it as empty and continue to later rules.
- All rules unknown: preserve input order.
- Numeric zero: compare as a populated numeric value.
- Numeric string: compare numerically for numeric columns.
- Invalid numeric string in a numeric column: fall back to text comparison.
- Invalid month/year: fall back to text comparison.
- Null, undefined, and empty string: always below populated values.
- Equal primary values: use the next rule.
- Equal values across all rules: preserve original order.
- Ascending and descending: reverse populated-value comparison only; never move empty values above populated values.
- Sorting an empty result: return an empty array without error.
- Changing sorting while on a later page: reset to page 1.
- Changing sorting while rows are selected: retain the selected IDs.

## Verification Strategy

The repository currently has no dedicated automated test script. Implementation verification therefore includes command-level and manual checks.

### Required Commands

1. `npm run build`
2. `npm run lint`

Any unrelated pre-existing lint failures must be reported separately and must not be hidden.

### Manual Checks

Using Target Jahit data with at least two pagination pages where available:

1. Sort `Nama` ascending and descending; verify case-insensitive text order.
2. Sort `Salary` ascending and descending; verify numeric rather than lexical order.
3. Sort `Progress | Monthly`; verify percentages sort numerically.
4. Sort `Bulan Tahun`; verify chronological order.
5. Create a multi-sort such as `Posisi` ascending then `Realisasi | Monthly` descending; verify rule priority.
6. Change the direction of an existing header sort; verify the rule stays at the same priority.
7. Add a new header sort; verify it becomes the last rule.
8. Verify `null`, `undefined`, and empty strings remain at the bottom in both directions.
9. Verify numeric zero is not grouped with empty values.
10. Start on page 2, change sorting, and verify pagination returns to page 1.
11. Select one or more rows, change sorting, and verify selection remains intact.
12. Clear all sort rules and verify the pre-sort processed order is restored.
13. Verify non-Target-Jahit modules still sort through their direct row keys without regression.

## Delegation and Acceptance

Implementation will be delegated to a subagent using the `haiku` model alias, which the local Claude Code configuration routes to Laguna. The delegation brief must restrict edits to the planned files, prohibit database/schema changes, and require build/lint evidence.

The main agent remains responsible for:

- reviewing the resulting diff;
- confirming the Target Jahit alias map covers all 22 columns;
- checking that numeric zero and empty values follow the approved behavior;
- running the applicable build and lint commands;
- checking cross-module sorting compatibility;
- updating `project.md` after the implementation is complete;
- reporting any failed or skipped verification accurately.

The feature is complete only when the approved sorting behavior is implemented, the required verification has been run, and no unresolved regression remains.