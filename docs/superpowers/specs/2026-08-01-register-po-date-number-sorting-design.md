# Register PO Date and Number Sorting Design

**Date:** 2026-08-01  
**Status:** Approved design; pending written-spec review

## Context

The Register PO page renders its own fetched data through the shared `DataTable`, then applies search and pagination locally. `DataTable` already exposes ascending and descending actions from each column-header menu and can display the active sort direction. However, `RegisterPoPage` currently passes an empty `sorts` array and a no-op `onSortColumn` callback, so those controls do not change the row order.

The Register PO table has three configured columns:

- `productionOrderId`: a human-readable PO label;
- `totalPerPcs`: a numeric currency amount;
- `createdAt`: an ISO timestamp displayed as `YYYY-MM-DD`.

This feature will activate reliable client-side sorting for these columns without changing the shared table, service layer, or database.

## Goals

1. Enable the existing Register PO table-header sorting actions.
2. Sort `totalPerPcs` numerically in ascending or descending order.
3. Sort `createdAt` chronologically in ascending or descending order.
4. Sort `productionOrderId` as case-insensitive human-readable text so every visible header action is functional.
5. Apply sorting to the complete filtered result before pagination.
6. Reset pagination to page 1 whenever the active sort changes.
7. Show the existing sort-direction indicator on the active column.
8. Keep empty values below populated values in both directions.
9. Preserve the original relative order when compared values are equal.

## Non-Goals

- Multi-column sorting.
- A separate toolbar Sort button or Sort modal.
- Persisting the active sort across page refreshes or browser sessions.
- Server-side sorting or changes to Supabase queries.
- Database schema, migration, index, RLS, function, trigger, or production-data changes.
- Redesigning `DataTable`, pagination, search, or the Register PO modal.
- Adding dependencies, UI components, or shadcn registry items.
- Changing sorting behavior in other modules.

## Approved Approach

Implement one active `SortRule` in `RegisterPoPage` and connect it to the shared `DataTable` header menu. A focused page-local comparator will sort the filtered display rows according to the selected column's known type. The sorted result will then feed the existing pagination calculation.

This approach is preferred because Register PO owns its own search and pagination pipeline instead of using the generic processing pipeline in `App.tsx`. It avoids unnecessary shared-component changes and avoids expanding the task into database-backed sorting.

## User Interaction

1. The user clicks a Register PO column header.
2. The existing header menu opens.
3. The user chooses `Sort Ascending` or `Sort Descending`.
4. That column becomes the only active sort rule.
5. Choosing another column replaces the previous rule.
6. Choosing the opposite direction on the same column updates its direction.
7. The table returns to page 1.
8. The active column displays the existing ascending or descending icon.

There is no explicit clear-sort action in this scope. Fetching or refreshing data preserves the active in-memory rule while the page remains mounted; a full browser refresh resets it with the rest of the page state.

## Data Model and Comparison Rules

The display-row shape remains:

```ts
{
  id: string;
  productionOrderId: string;
  totalPerPcs: number;
  createdAt: string;
  _createdAtTimestamp: number | null;
  _raw: RegisterPoListItem;
}
```

`createdAt` remains the current user-facing `YYYY-MM-DD` string. The page also retains a private parsed timestamp derived from the original ISO value so date ordering does not depend on formatted display text.

### Empty Values

The following values are treated as empty:

- `null`;
- `undefined`;
- a string that is empty after trimming;
- an invalid or absent timestamp for date sorting.

Populated values always appear before empty values in both ascending and descending order. Two empty values compare equal.

### PO ID

`productionOrderId` uses `Intl.Collator` with case-insensitive comparison and numeric collation. This provides deterministic, human-readable ordering for labels that contain work-code numbers, brands, and products.

### Total/PCS

`totalPerPcs` compares finite numeric values directly. Numeric zero is a valid populated value. Any non-finite or missing value is empty and remains below populated rows.

### Created

`createdAt` compares the private timestamp parsed from the original ISO value. Ascending means oldest to newest. Descending means newest to oldest. Invalid or missing timestamps remain below valid dates.

### Stable Ordering

Rows are decorated with their index in the filtered array before sorting. If the selected values compare equal, the original index breaks the tie. The sorting operation returns a new array and does not mutate `displayData` or `filtered`.

## Data Flow

The Register PO client-side processing order becomes:

1. fetch Register PO records through `fetchAllRegisterPo()`;
2. map service items into display rows while retaining `_raw` and the parsed creation timestamp;
3. apply the existing PO-label search;
4. apply the active type-aware sort to the complete filtered result;
5. paginate the sorted result;
6. render the page through `DataTable`;
7. pass the active rule through `sorts` so `DataTable` displays its indicator.

Sorting before pagination ensures records are ordered across the full result set rather than only within the current page.

## Component and File Changes

### `src/pages/RegisterPoPage.tsx`

- Add page-local state for one active `SortRule`.
- Preserve the source creation timestamp while constructing display rows.
- Add focused empty, text, numeric, date, and stable-sort logic.
- Insert a sorted memo between `filtered` and `paginated`.
- Change pagination to slice the sorted result.
- Pass the active rule to `DataTable.sorts`.
- Implement `DataTable.onSortColumn` so it replaces the active rule and resets page 1.

The comparator should remain small and local because only three fixed Register PO fields are in scope. It must use an exhaustive field switch so unknown fields preserve the existing filtered order rather than comparing arbitrary properties.

### `src/components/Table/DataTable.tsx`

No change is required. Its existing header menu, callbacks, and sort indicator are reused.

### `src/data/mockData.ts`

No change is required. The existing column metadata already identifies the relevant keys and formatting.

### `src/services/registerPo.ts`

No change is required. Sorting remains client-side and consumes the existing typed `createdAt` and numeric totals.

### `project.md`

After implementation and verification, prepend a factual `2026-08-01` Latest Progress entry describing Register PO date/number sorting and the exact verification outcomes.

## Error Handling and Edge Cases

- No active rule: preserve the filtered data order.
- Unknown field: preserve the filtered data order.
- Empty filtered result: return an empty result without error.
- Numeric zero: sort as a valid number.
- Invalid numeric value: treat as empty.
- Missing or invalid ISO date: treat as empty.
- Equal values: preserve their filtered relative order.
- Ascending and descending: reverse only populated-value comparisons; do not move empty values above populated values.
- Search changes: continue resetting page 1 through the existing search handler.
- Sort changes from a later page: reset page 1.
- Refresh: keep the current in-memory sort while the component remains mounted and apply it to newly fetched rows.
- Edit/delete actions: continue resolving by row ID against the source `items` array and remain unaffected by reordered display rows.

## Verification Strategy

### Required Commands

1. `npm run build`
2. `npm run lint`

Any unrelated pre-existing lint failures must be reported separately and must not be hidden.

### Code-Level Checks

1. `totalPerPcs` compares numbers rather than formatted currency strings.
2. `createdAt` compares timestamps derived from original ISO values.
3. `productionOrderId` uses case-insensitive natural text ordering.
4. Numeric zero is not treated as empty.
5. Empty numeric/date values remain last in both directions.
6. Equal values retain their original relative order.
7. Sorting occurs after search and before pagination.
8. The sort handler resets page 1.
9. `DataTable` receives the active sort rule.
10. No service, database, schema, dependency, or shared UI file changes are introduced.

### Browser Checks

With enough Register PO records to exercise pagination where available:

1. Sort `Total/PCS` ascending and verify low-to-high numeric order.
2. Sort `Total/PCS` descending and verify high-to-low numeric order.
3. Sort `Created` ascending and verify oldest-to-newest order.
4. Sort `Created` descending and verify newest-to-oldest order.
5. Sort `PO ID` in both directions and verify natural text order.
6. Confirm the active header displays the correct direction icon.
7. Start from page 2, change sorting, and verify the table returns to page 1.
8. Apply a search, sort the filtered rows, and verify sorting covers the full filtered result before pagination.
9. Refresh data and verify the active in-memory sort is applied to the refreshed result.

If the available dataset does not contain enough records or edge values to perform a browser check, that check must be reported as skipped rather than claimed as passing.

## Delegation and Acceptance

Implementation must be delegated to a sub-agent using the `haiku` model alias, as explicitly requested by the user. The delegation brief must restrict edits to `src/pages/RegisterPoPage.tsx` and, after successful verification, `project.md`; prohibit database, service, dependency, and shared UI changes; and require build/lint evidence.

The main agent remains responsible for:

- reviewing the resulting diff;
- confirming sorting occurs before pagination;
- inspecting numeric, date, empty-last, and stable-order behavior;
- running independent build and lint verification;
- performing available browser checks;
- checking scope and unrelated working-tree changes;
- updating or validating `project.md`;
- reporting failed or skipped verification accurately.

If the Haiku sub-agent cannot run because its provider is unauthorized or unavailable, implementation must stop and the blocker must be reported. The main agent must not silently substitute another model.

The feature is complete only when the approved behavior is implemented by the Haiku sub-agent, the resulting changes pass main-agent review, applicable verification has run, and no unresolved regression remains.
