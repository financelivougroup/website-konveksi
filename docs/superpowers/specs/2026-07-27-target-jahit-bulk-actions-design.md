# Target Jahit Bulk Selection, Export, and Delete Design

**Date:** 2026-07-27  
**Status:** Approved for implementation planning

## Context

The Target Jahit module renders its records through the shared `DataTable` in `App.tsx`. The table already supports selecting individual rows and selecting all rows on the current pagination page. However:

- Select All only covers the current page, not all records matching the active search and filters.
- The shared Export action only displays placeholder toast messages and does not download a file.
- Delete is available per row, but there is no bulk delete action for selected Target Jahit records.

This feature will make selection useful across pagination and provide selected-row CSV export and bulk delete specifically for Target Jahit without changing the behavior of other modules.

## Goals

1. Allow users to select or deselect Target Jahit rows individually.
2. Make the header checkbox select or deselect every row matching the current search, filters, and date range across all pagination pages.
3. Export only selected Target Jahit rows as CSV.
4. Delete selected Target Jahit rows in one confirmed bulk action.
5. Preserve existing per-row actions and avoid behavioral changes in other modules.

## Non-Goals

- XLSX export.
- Exporting records when no rows are selected.
- Selecting records hidden by the active search, filters, or date range.
- Bulk actions for modules other than Target Jahit.
- Redesigning the shared table, pagination, filter, or view-settings systems.
- Adding a new database table, column, policy, function, or migration unless live schema inspection reveals that an existing database constraint prevents the approved operation.

## Current Architecture

- `src/App.tsx` owns table data, processed data, pagination, selection, toolbar callbacks, and Target Jahit service integration.
- `src/components/Table/DataTable.tsx` renders the shared table, per-row selection control, and header selection control.
- `src/components/Layout/Toolbar.tsx` renders shared actions such as Export and Import.
- `src/services/targetJahit.ts` provides Supabase-backed Target Jahit CRUD operations.
- `src/components/ui/checkbox.tsx` and `src/components/ui/alert-dialog.tsx` provide existing shadcn primitives for tri-state selection and destructive-action confirmation.

## UX Design

### Row Selection

- The first column continues to contain a checkbox for each row.
- Selecting or deselecting a row updates the selected ID set without opening the row detail panel.
- Selected rows retain their highlighted background.
- Selection persists when the user changes pagination pages or sorting.

### Select All Scope

The header checkbox applies to all rows in `processedData`, meaning all Target Jahit records that match the current:

- search query;
- filter rules;
- date range;
- active view settings that affect which records are included.

It does not select records excluded by those conditions.

The header checkbox supports three visual states:

- **Unchecked:** none of the current processed rows are selected.
- **Indeterminate:** at least one, but not all, current processed rows are selected.
- **Checked:** all current processed rows are selected.

If the processed result is empty, the control remains unchecked and has no effect.

Selecting all adds every processed row ID to the selected set. Deselecting all removes those processed row IDs while leaving any selected IDs outside the current processed scope untouched until the normal selection reset rules apply. This makes the header action accurately reversible for the currently visible result set.

### Selection Reset Rules

Selection is cleared when the user:

- switches module or combined-view submodule;
- changes the search query;
- changes filter rules;
- changes the date range or applicable date field;
- completes a successful CSV export;
- completes a successful bulk delete.

Selection is not cleared when the user:

- changes pagination page;
- changes sorting;
- cancels the delete dialog;
- encounters an export or delete failure.

After data refresh, selected IDs that no longer exist in the loaded Target Jahit data are pruned.

### Contextual Bulk Actions

Only when the effective module is `target-jahit`, the toolbar receives selection-aware controls:

- a compact label such as `3 row dipilih`;
- `Export (3)`;
- `Delete (3)`.

Export is visible but disabled when no rows are selected. Delete is a destructive red action that is hidden until at least one row is selected. During deletion, destructive controls are disabled and the delete action indicates loading to prevent duplicate requests.

The existing Import control and toolbar behavior for all other modules remain unchanged.

## CSV Export Design

### Export Scope

Export includes exactly the Target Jahit records whose IDs are in the selected set, regardless of which pagination page currently displays them.

### Columns

The exported columns follow the currently displayed Target Jahit columns:

- column order matches the table's active display order;
- only visible columns are included;
- headers use the user-facing labels, including active column renames.

The selection column and row-action controls are not included.

### Serialization

A pure CSV helper will:

- render `null` and `undefined` as empty cells;
- preserve numbers as raw numeric values;
- stringify other values;
- wrap fields containing commas, double quotes, carriage returns, or line feeds in double quotes;
- escape embedded double quotes by doubling them;
- use CRLF row separators for spreadsheet compatibility;
- prepend a UTF-8 BOM so Indonesian names and text open correctly in Microsoft Excel.

### Download

The browser creates a CSV `Blob`, generates an object URL, clicks a temporary download link, and revokes the URL afterward.

File naming convention:

`target-jahit-YYYY-MM-DD.csv`

On success, the app:

1. reports how many records were exported;
2. clears the selection.

If blob creation or download setup fails, the app reports an error and retains the selection.

## Bulk Delete Design

### Confirmation

Clicking Delete opens the existing shadcn `AlertDialog`. The dialog states:

- how many Target Jahit records will be deleted;
- that the action cannot be undone.

Cancel closes the dialog without changing data or selection.

### Database Operation

`src/services/targetJahit.ts` will expose a `removeMany(ids: number[])` operation. For a non-empty list it performs one Supabase request:

```ts
supabase.from('target_jahit').delete().in('id', ids)
```

The service will safely no-op for an empty list rather than issuing a broad delete.

Because this operation touches persistent data, implementation must first inspect the live `target_jahit` schema and relevant RLS policies using the required Supabase MCP. The implementation must not infer live database permissions only from the local migration or service file.

### Success and Failure

During the request:

- the confirm action is disabled;
- repeated submission is prevented;
- the selection and local data remain unchanged until Supabase confirms success.

On success:

1. close the dialog;
2. refresh Target Jahit data from Supabase;
3. clear selection;
4. show a success toast containing the deleted record count.

On failure:

1. keep the selected IDs;
2. keep local table data unchanged;
3. keep the dialog open and re-enable its confirm action so the user can retry or cancel;
4. show the Supabase error message in an error toast.

Existing per-row delete continues to use its current handler and remains available.

## Component and Interface Changes

### `src/App.tsx`

- Compute selection scope from unpaginated `processedData` rather than `paginatedData`.
- Derive checked and indeterminate header-selection states.
- Reset or prune selection according to the approved rules.
- Implement selected-row CSV export for Target Jahit.
- Own bulk-delete dialog state and loading state.
- Call `targetJahitSvc.removeMany` after confirmation.
- Pass optional bulk-action props to the toolbar and explicit selection-state props to the table.
- Preserve existing behavior for all non-Target-Jahit modules.

### `src/components/Table/DataTable.tsx`

- Keep the existing per-row selection interface.
- Accept explicit header checked and indeterminate props derived by `App.tsx` from the full processed-row selection scope.
- Use the existing shadcn Checkbox primitive for accessible checked, unchecked, and indeterminate states.
- Continue stopping checkbox clicks from opening row detail.

### `src/components/Layout/Toolbar.tsx`

Add optional, backward-compatible props for:

- selected count;
- contextual export label and disabled state;
- contextual delete callback;
- delete disabled/loading state.

When these props are absent, render the toolbar exactly as it works today.

### `src/services/targetJahit.ts`

Add `removeMany(ids: number[])` with one guarded `.delete().in('id', ids)` request.

### CSV Helper

Create a focused pure helper module for CSV formatting and browser-download preparation so `App.tsx` only coordinates selection and feedback. The helper must not know about React state, Supabase, or Target Jahit selection rules.

## Error Handling and Edge Cases

- No selection: Export is disabled; bulk delete cannot be submitted.
- Empty filtered result: Select All is unchecked and does nothing.
- Partial cross-page selection: header checkbox is indeterminate.
- Sorting or paging: selection remains intact.
- Search/filter/date change: selection clears before the user performs actions on a newly scoped result.
- Stale selected ID after refresh: the ID is removed from selection.
- Failed delete: no optimistic local removal and selection remains available for retry.
- Failed export: no selection reset.
- CSV special characters: commas, quotes, and newlines remain valid CSV.
- Numeric values: remain spreadsheet-compatible raw numbers.
- Existing row detail, edit, per-row delete, import, and other modules remain unaffected.

## Verification Strategy

The repository currently has no dedicated automated test script. Implementation verification must therefore include:

1. `npm run build` for TypeScript and production bundling.
2. `npm run lint`, with any unrelated pre-existing failures reported separately rather than hidden.
3. Manual behavior checks:
   - select and deselect one row;
   - select multiple individual rows;
   - Select All across at least two pagination pages;
   - confirm indeterminate state after deselecting one selected row;
   - change pages and sorting without losing selection;
   - change search/filter/date scope and confirm selection resets;
   - export a subset and all filtered results;
   - inspect CSV headers, ordering, UTF-8 text, quotes, commas, newlines, blanks, and numeric values;
   - cancel bulk delete;
   - confirm successful bulk delete and refresh;
   - force or simulate a delete error and confirm data and selection remain;
   - verify existing per-row delete;
   - smoke-test at least one other shared-table module for regressions.

If a lightweight existing test convention is discovered during implementation, pure CSV behavior and selection-state derivation should receive focused automated coverage. Adding a new test framework is not required solely for this feature.

## Acceptance Criteria

- Every Target Jahit row can be selected and deselected independently.
- Select All selects every record matching the active processed result across pagination pages.
- The header checkbox accurately shows unchecked, indeterminate, and checked states.
- Selected records remain selected across pagination and sorting.
- Selection resets on search, filter, date-scope, module, or submodule changes.
- Export is disabled with no selection and exports only selected records as a valid UTF-8 CSV.
- CSV columns and labels match the visible table configuration and order.
- Bulk Delete requires confirmation and sends one guarded Supabase delete request for selected IDs.
- Successful actions clear selection and show accurate success feedback.
- Failed actions retain selection and do not falsely remove local data.
- Existing per-row actions and all other shared-table modules preserve their current behavior.
- Build succeeds, and lint/manual verification results are reported accurately.
