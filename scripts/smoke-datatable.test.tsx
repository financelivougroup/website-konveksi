/**
 * SSR smoke test for the rebuilt ReUI-based DataTable.
 *
 * This renders the real component tree (DataTable + ReUI data-grid + TanStack
 * v9) to HTML and asserts the structural contract the App depends on:
 *   - the select checkbox is the FIRST header/body cell
 *   - the action column is LAST
 *   - conditional row colours and the 4 row heights land on <tr>
 *   - badge / currency / percent formatting survives
 *   - the pagination footer renders
 *
 * Run via scripts/smoke-datatable.mjs (esbuild bundle + node).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataTable } from '../src/components/Table/DataTable';
import { T_TH } from '../src/lib/tableStyles';

const columns = [
  { key: 'clientName', label: 'Client', width: '160px', _originalIndex: 0 },
  { key: 'unitPrice', label: 'Harga', width: '120px', align: 'right', format: 'currency', _originalIndex: 1 },
  { key: 'progressMonthly', label: 'Progress', width: '100px', format: 'percent', _originalIndex: 2 },
  { key: 'statusFinal', label: 'Status', width: '120px', badge: true, _originalIndex: 3 },
  {
    key: 'notes', label: 'Catatan', width: '140px', _originalIndex: 4,
    _note: 'Keterangan tambahan dari operator',
    _source: { columnKey: 'notes', sourceIcon: 'cloud', sourceLabel: 'Sync dari Supabase' },
  },
];

const data = [
  { id: 1, clientName: 'PT Alpha', unitPrice: 125000, progressMonthly: 80, statusFinal: 'Selesai', notes: 'ok' },
  { id: 2, clientName: 'CV Beta', unitPrice: 90000, progressMonthly: 40, statusFinal: 'Proses', notes: 'hold' },
];

const condColors = [
  { field: 'statusFinal', operator: 'equals', value: 'Proses', color: 'yellow' },
];

const noop = () => {};

/** Every prop except the per-render ones (data / page / totalCount). */
const baseProps = {
  columns,
  rowHeight: 'medium' as const,
  condColors,
  editable: true,
  sorts: [{ field: 'clientName', dir: 'asc' }],
  onToggleRow: noop,
  onToggleAll: noop,
  onViewDetail: noop,
  onEditDetail: noop,
  onDeleteRow: noop,
  onResizeColumn: noop,
  onReorderColumn: noop,
  onRenameColumn: noop,
  onUpdateNote: noop,
  onSortColumn: noop,
  onGroupColumn: noop,
  onSetSource: noop,
  pageSize: 10,
  onPageChange: noop,
  onPageSizeChange: noop,
};

const html = renderToStaticMarkup(
  createElement(DataTable, {
    ...baseProps,
    data,
    selectedRows: new Set([1]),
    totalCount: 12,
    page: 1,
  }),
);

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

// `DUMP_HTML=<path>` writes the rendered markup for manual inspection.
if (process.env.DUMP_HTML) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.DUMP_HTML, html, 'utf8');
}

// --- structure ---------------------------------------------------------------
check('renders a <table>', html.includes('<table'));
check('renders thead + tbody', html.includes('<thead') && html.includes('<tbody'));

// The select column must be the very first <th> and first <td> of each row.
const firstTh = html.match(/<thead[^>]*>[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>/);
const firstThCell = firstTh ? firstTh[1].match(/<th[\s\S]*?<\/th>/)?.[0] ?? '' : '';
check(
  'select checkbox is the FIRST header cell',
  /type="checkbox"|role="checkbox"|data-slot="checkbox"/.test(firstThCell),
  firstThCell.slice(0, 120),
);

const firstBodyRow = html.match(/<tbody[^>]*>\s*<tr[^>]*>([\s\S]*?)<\/tr>/);
const firstTdCell = firstBodyRow ? firstBodyRow[1].match(/<td[\s\S]*?<\/td>/)?.[0] ?? '' : '';
check(
  'select checkbox is the FIRST body cell',
  /type="checkbox"|role="checkbox"|data-slot="checkbox"/.test(firstTdCell),
  firstTdCell.slice(0, 120),
);

// Action column must be last: its buttons live in the final <td>.
const lastTd = html.match(/<td[^>]*>(?:(?!<\/td>)[\s\S])*title="Delete"[\s\S]*?<\/td>/);
check('action column (Delete button) is present', !!lastTd);

// Partial selection must read as "some", not "all": Radix reports mixed and the
// project Checkbox swaps the tick for a dash.
check(
  'partial selection renders an indeterminate checkbox',
  /aria-checked="mixed"/.test(firstThCell),
);
check(
  'indeterminate checkbox shows the dash glyph, not a full tick',
  /lucide-minus/.test(firstThCell),
);

// --- content / formatting ----------------------------------------------------
check('currency formatted as Rp', html.includes('Rp 125.000'), '');
check('percent rendered with %', html.includes('80%'), '');
check('badge cell rendered', html.includes('Selesai') && html.includes('rounded-full'));

// --- custom features ---------------------------------------------------------
check('conditional row colour class applied (yellow → amber)', html.includes('bg-amber-50'), '');
check('selected row tint applied', html.includes('bg-slate-50/60'), '');
check('column note renders the sticky-note tooltip icon', /lucide-sticky-note/.test(html), '');
check(
  'source indicator icon rendered for the annotated column',
  /lucide-cloud\b/.test(html),
);
check('row-height class (medium → py-1.5) applied', html.includes('py-1.5'), '');
check('drag-to-reorder grip handle present', /lucide-grip-vertical/.test(html));
check('sort indicator rendered for sorted column', /lucide-arrow-(up|down|up-down)/.test(html) || html.includes('aria-sort'), '');

// --- pagination --------------------------------------------------------------
check('pagination footer rendered', html.includes('data-grid-pagination') || /Rows per page/i.test(html));
check('pagination info shows record range', /1\s*-\s*10\s*of\s*12/.test(html), '');

// Page 2 is the double-slice regression guard. The App slices `processedData`
// into a 10-row page and passes it in, so the table must NOT slice again at
// offset 10 (that would yield zero rows). `manualPagination` is what prevents
// it; this asserts the rendered page, not the option.
const page2Data = [
  { id: 11, clientName: 'PT Gamma', unitPrice: 50000, progressMonthly: 10, statusFinal: 'Selesai', notes: 'a' },
  { id: 12, clientName: 'CV Delta', unitPrice: 70000, progressMonthly: 20, statusFinal: 'Selesai', notes: 'b' },
];

const htmlPage2 = renderToStaticMarkup(
  createElement(DataTable, {
    ...baseProps,
    data: page2Data,
    selectedRows: new Set<number>(),
    totalCount: 12,
    page: 2,
  }),
);

const page2Body = htmlPage2.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
const page2RowCount = (page2Body.match(/<tr\b/g) ?? []).length;

check(
  'page 2 renders its rows (no double-slice)',
  page2RowCount === 2,
  `expected 2 body rows, got ${page2RowCount}`,
);
check(
  'page 2 shows the page-2 records',
  page2Body.includes('PT Gamma') && page2Body.includes('CV Delta'),
);
check('page 2 is not the empty state', !/No Data Available/i.test(htmlPage2));
check('page 2 pagination info shows 11 - 12 of 12', /11\s*-\s*12\s*of\s*12/.test(htmlPage2), '');

// --- plain variant (per-page tables) -----------------------------------------
//
// The plain variant is what the page tables migrate onto. It must render bare
// headers, no selection column unless asked, no built-in View/Edit/Delete, and
// no pagination footer — while still honouring custom cells and row actions.

const plainColumns = [
  { key: 'picPenjahit', label: 'Nama Karyawan', width: '180px' },
  { key: 'posisi', label: 'Posisi', width: '120px' },
  {
    key: 'status', label: 'Status', width: '100px',
    render: (row) => `STATUS:${String(row.status)}`,
  },
];

const plainData = [
  { id: 1, picPenjahit: 'Budi', posisi: 'Leader', status: 'Aktif' },
  { id: 2, picPenjahit: 'Siti', posisi: 'Operator', status: 'Cuti' },
];

const plainHtml = renderToStaticMarkup(
  createElement(DataTable, {
    variant: 'plain',
    columns: plainColumns,
    data: plainData,
    rowActions: (row) => `ACTION:${String(row.id)}`,
    actionsLabel: 'Aksi',
    onRowClick: noop,
  }),
);

check('plain: renders a table', plainHtml.includes('<table'));
check('plain: header shows the column label', plainHtml.includes('Nama Karyawan'));
check('plain: header shows the actions label', plainHtml.includes('Aksi'));
check('plain: custom cell renderer output is used', plainHtml.includes('STATUS:Aktif'));
check('plain: custom row actions are used', plainHtml.includes('ACTION:1') && plainHtml.includes('ACTION:2'));
check('plain: row click makes the row interactive', /cursor-pointer/.test(plainHtml));
check(
  'plain: no selection column when selectedRows is omitted',
  !/Select all/i.test(plainHtml) && !/data-col-id="__select"/.test(plainHtml),
);
check(
  'plain: no built-in View/Edit/Delete action buttons',
  !/title="View"/.test(plainHtml) && !/title="Delete"/.test(plainHtml),
);

// A plain table that supplies NO rowActions must not grow an Actions column at
// all. This is the regression that a page migration is most likely to ship: the
// table looks fine, but the caller's per-row controls are silently gone (or,
// worse, an empty Actions header appears with nothing under it).
const plainNoActionsHtml = renderToStaticMarkup(
  createElement(DataTable, {
    variant: 'plain',
    columns: plainColumns,
    data: plainData,
  }),
);
check(
  'plain without rowActions: no Actions header is rendered',
  !/>Actions</.test(plainNoActionsHtml) && !plainNoActionsHtml.includes('Aksi'),
);
check(
  'plain with rowActions: the actions label is rendered',
  plainHtml.includes('Aksi'),
);
check(
  'plain: no pagination footer',
  !/Rows per page/i.test(plainHtml) && !/data-grid-pagination/.test(plainHtml),
);
check(
  'plain: no header drag grip',
  !/lucide-grip-vertical/.test(plainHtml),
);
check(
  'plain: renders every supplied row (not a 10-row first page)',
  (plainHtml.match(/<tr\b/g) ?? []).length >= 2,
);

// Plain + selection: the checkbox column appears and is still leftmost.
const plainSelHtml = renderToStaticMarkup(
  createElement(DataTable, {
    variant: 'plain',
    columns: plainColumns,
    data: plainData,
    selectedRows: new Set([1]),
    onToggleRow: noop,
  }),
);
const plainFirstTh = plainSelHtml.match(/<thead[^>]*>[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>/)?.[1] ?? '';
const plainFirstThCell = plainFirstTh.match(/<th[\s\S]*?<\/th>/)?.[0] ?? '';
check(
  'plain + selection: checkbox is the first header cell',
  /role="checkbox"|type="checkbox"/.test(plainFirstThCell),
  plainFirstThCell.slice(0, 120),
);

// Hide/show-columns is a page-level feature that must survive the migration:
// a hidden key must drop its header AND its cells, not just its header.
const hiddenHtml = renderToStaticMarkup(
  createElement(DataTable, {
    variant: 'plain',
    columns: plainColumns,
    data: plainData,
    hiddenColumns: new Set(['posisi']),
  }),
);
check('plain + hiddenColumns: visible headers still render', hiddenHtml.includes('Nama Karyawan'));
check('plain + hiddenColumns: hidden column header is dropped', !hiddenHtml.includes('Posisi'));
check('plain + hiddenColumns: hidden column cells are dropped', !hiddenHtml.includes('Leader'));

// String ids (Invoicing selects invoices by UUID). The grid keys rows by
// string, so a numeric-only assumption would corrupt the selection contract.
const uuidData = [
  { id: 'inv-1111-aaaa', nama: 'INV-001' },
  { id: 'inv-2222-bbbb', nama: 'INV-002' },
];
const uuidHtml = renderToStaticMarkup(
  createElement(DataTable, {
    variant: 'plain',
    columns: [{ key: 'nama', label: 'Nama', width: '120px' }],
    data: uuidData,
    selectedRows: new Set(['inv-1111-aaaa']),
    onToggleRow: noop,
  }),
);
const uuidBody = uuidHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
check('string ids: both rows render', uuidHtml.includes('INV-001') && uuidHtml.includes('INV-002'));
check(
  'string ids: the selected row is marked selected',
  /data-state="selected"/.test(uuidBody),
);
check(
  'string ids: only one row is selected',
  (uuidBody.match(/data-state="selected"/g) ?? []).length === 1,
);

// Plain + pagination: Invoicing and Expense both pass a pre-sliced page with
// `totalCount` + `onPageChange`. The plain variant must render the footer and
// must not slice the page a second time (the same hazard as the app variant).
const plainPagedHtml = renderToStaticMarkup(
  createElement(DataTable, {
    variant: 'plain',
    columns: [{ key: 'nama', label: 'Nama', width: '120px' }],
    data: [
      { id: 21, nama: 'INV-021' },
      { id: 22, nama: 'INV-022' },
    ],
    totalCount: 22,
    page: 3,
    pageSize: 10,
    onPageChange: noop,
  }),
);
const plainPagedBody = plainPagedHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
check(
  'plain + pagination: renders the footer',
  /Rows per page/i.test(plainPagedHtml) || plainPagedHtml.includes('data-grid-pagination'),
);
check(
  'plain + pagination: renders the supplied page (no double-slice)',
  (plainPagedBody.match(/<tr\b/g) ?? []).length === 2,
  `expected 2 body rows, got ${(plainPagedBody.match(/<tr\b/g) ?? []).length}`,
);
check(
  'plain + pagination: range reflects the page, not the row count',
  /21\s*-\s*22\s*of\s*22/.test(plainPagedHtml),
  '',
);

// Every migrated page supplies its own empty message, so the plain variant must
// render it (not the built-in illustration) when there are no rows.
const plainEmptyHtml = renderToStaticMarkup(
  createElement(DataTable, {
    variant: 'plain',
    columns: plainColumns,
    data: [],
    emptyMessage: <div>Belum ada karyawan terdaftar</div>,
  }),
);
check('plain: custom empty message is rendered', plainEmptyHtml.includes('Belum ada karyawan terdaftar'));
check('plain: built-in empty illustration is not used', !/No Data Available/i.test(plainEmptyHtml));

// --- selection column spacing -------------------------------------------------
//
// The select cell holds a single 16px control, so the grid's normal `px-3` on
// BOTH sides leaves 12px of dead space after the box before the next column's
// own padding even starts (measured at 24px from the checkbox edge to the
// neighbouring text). `pe-0` drops the trailing half, and `w-0` keeps the
// column from absorbing spare width under `table-auto` — without it the column
// measured 150px in a 2-column table against 40px on a 23-column one.
const selSpacingHtml = renderToStaticMarkup(
  createElement(DataTable, {
    variant: 'plain',
    columns: plainColumns,
    data: plainData,
    selectedRows: new Set([1]),
    onToggleRow: noop,
  }),
);
const selTh = selSpacingHtml.match(/<th[^>]*data-col-id="__select"[^>]*>/)?.[0] ?? '';
check(
  'select column: the header cell drops its trailing padding',
  /pe-0/.test(selTh),
  selTh.slice(0, 200),
);
check(
  'select column: the header cell is not left free to absorb spare width',
  /w-0/.test(selTh),
  selTh.slice(0, 200),
);


//
// The separator between body rows is painted as an inset shadow on the cells,
// NOT as a `border-b`. With `border-separate` + `border-box` a cell's own bottom
// border is deducted from its pinned height only while the content fits; the
// moment the content is taller than the pin the border is added outside it, and
// every row carrying a separator measures 1px taller than the last row, which
// has none. That is the "row heights are not all the same" complaint showing up
// inside a single table, so the shape of the fix is part of the contract:
// a shadow (no layout height) on every row but the last.
const sepHtml = renderToStaticMarkup(
  createElement(DataTable, {
    variant: 'plain',
    columns: plainColumns,
    data: plainData,
  }),
);
const sepBody = sepHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
// `renderToStaticMarkup` escapes the class attribute, so the selector's `&` and
// `>` arrive as `&amp;` / `&gt;`.
const SEP_CLASS = '[&amp;:not(:last-child)&gt;td]:shadow-[inset_0_-1px_0_0_hsl(var(--border))]';
const sepBodyRows = sepBody.match(/<tr\b[\s\S]*?(?=<tr\b|$)/g) ?? [];
check(
  'separator: painted as an inset shadow, never a bottom border',
  !/border-b/.test(sepBody) && sepBody.includes(SEP_CLASS),
);
// The class carries a `:not(:last-child)` guard, so it sits on every row in the
// markup and the browser decides which one paints. That the last row really has
// no line, and a row followed by an expanded panel still does, is CSS behaviour
// — it was verified against the live DOM, not asserted here.
check(
  'separator: the guard is part of the class on every data row',
  sepBodyRows.length === 2 && sepBodyRows.every((r) => r.includes(SEP_CLASS)),
  `${sepBodyRows.filter((r) => r.includes(SEP_CLASS)).length}/${sepBodyRows.length} rows carry it`,
);

// --- expandedRow / isRowExpanded ---------------------------------------------
//
// Target Jahit's "Belum Jahit" tab renders a nested detail table under an opened
// group. The page owns the expansion state (its key is the grouping key, not the
// row id), so the grid only asks `isRowExpanded` and renders `expandedRow` for
// the rows it names — it must not add a row of its own for the closed ones.
const expandHtml = renderToStaticMarkup(
  createElement(DataTable, {
    variant: 'plain',
    columns: plainColumns,
    data: plainData,
    isRowExpanded: (row) => row.id === 1,
    expandedRow: (row) => `DETAIL:${String(row.id)}`,
  }),
);
check('expandedRow: the opened row renders its panel', expandHtml.includes('DETAIL:1'));
check('expandedRow: a closed row renders no panel', !expandHtml.includes('DETAIL:2'));
check(
  'expandedRow: the row above the panel keeps its separator',
  /DETAIL:1/.test(expandHtml) && expandHtml.includes(SEP_CLASS),
);
check(
  'expandedRow: the panel spans every column',
  // React emits the attribute as `colSpan`; the value must cover all visible
  // cells so the panel is not confined to the first column.
  new RegExp(`colSpan="${plainColumns.length}"`).test(expandHtml),
  (expandHtml.match(/colSpan="\d+"/) ?? ['(none)'])[0],
);

// --- footer ------------------------------------------------------------------
//
// LogTable's total row is a <tfoot>. The caller supplies the whole <tr> because
// only it knows which columns carry a total.
const footHtml = renderToStaticMarkup(
  createElement(DataTable, {
    variant: 'plain',
    columns: plainColumns,
    data: plainData,
    footer: <tr><td>TOTAL</td><td>99</td></tr>,
  }),
);
check('footer: renders a <tfoot>', /<tfoot[\s\S]*?<\/tfoot>/.test(footHtml));
check('footer: the supplied row is used verbatim', footHtml.includes('TOTAL') && footHtml.includes('99'));
check('footer: no footer means no <tfoot>', !/<tfoot/.test(sepHtml));

// --- app-variant header: the label leads the cell ----------------------------
//
// The app variant is the one grid whose first column is not the checkbox: the
// master-data views put an ID column there. Its header used to open with the
// drag grip and then the source indicator, which pushed the label 30px off the
// cell's left edge — measured 48px from the checkbox, against 12px in every
// page table and 12px in this grid's own body cells. The label now leads, with
// the grip and the indicator trailing it, so the header sits on the same 12px
// inset as everything else. That ordering is the contract this asserts.
const appHeadHtml = renderToStaticMarkup(
  createElement(DataTable, {
    ...baseProps,
    data,
    selectedRows: new Set([1]),
    totalCount: 12,
    page: 1,
  }),
);
const appFirstDataTh =
  appHeadHtml.match(/<th[^>]*data-col-id="clientName"[^>]*>([\s\S]*?)<\/th>/)?.[1] ?? '';
check(
  'app header: the first data header renders',
  appFirstDataTh.includes('Client'),
  appFirstDataTh.slice(0, 200),
);
check(
  'app header: the label comes before the drag grip',
  appFirstDataTh.indexOf('Client') > -1 &&
    appFirstDataTh.indexOf('Client') < appFirstDataTh.indexOf('Drag to reorder'),
  appFirstDataTh.slice(0, 260),
);
check(
  'app header: the grip is still present (reorder not dropped)',
  /Drag to reorder/.test(appFirstDataTh),
);
check(
  'app header: the source indicator is still present',
  /lucide-cloud\b/.test(appFirstDataTh),
);
check(
  'app header: the grip yields room to the resize handle',
  // The resize handle is an absolutely positioned 20px strip at the cell's end
  // edge; without the margin the grip loses its right side to it.
  /me-4/.test(appFirstDataTh),
  appFirstDataTh.slice(0, 260),
);

// --- header colour + weight --------------------------------------------------
// The header label must read as solid black and bold, at exactly the size it
// already had. These assert on the class list of the header ROW, which is where
// `headerRowClass` lands — the `<th>` itself carries ReUI's own base classes, and
// the `[&>th]:` rules reach it by descendant selector instead.
const headRowClass = (html: string) =>
  // `renderToStaticMarkup` escapes the class attribute, so `[&>th]:` arrives as
  // `[&amp;&gt;th]:`. Decode before matching, otherwise every assertion here
  // fails on markup that is actually correct.
  (html.match(/<tr[^>]*class="([^"]*group\/head[^"]*)"[^>]*>/)?.[1] ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"');

const appHeadRow = headRowClass(appHeadHtml);
check('header style: the app header row carries its class list', appHeadRow.length > 0, appHeadRow);
check(
  'header style: the app header is bold',
  /\[&>th\]:font-bold/.test(appHeadRow),
  appHeadRow,
);
check(
  // Literal `text-black` (#000), not the `text-foreground` token: the token is
  // `hsl(240 10% 3.9%)` — rgb(9, 9, 11), a blue-tinted near-black that reads as
  // dark grey at header size. The user asked for "hitam pekat".
  'header style: the app header is solid black',
  /\[&>th\]:text-black/.test(appHeadRow) && !/\[&>th\]:text-foreground/.test(appHeadRow),
  appHeadRow,
);
check(
  'header style: the app header no longer uses the muted grey',
  !/text-slate-400/.test(appHeadRow) && !/\[&>th\]:text-muted-foreground/.test(appHeadRow),
  appHeadRow,
);
check(
  // "sizenya tetap sama ya, gada yang berubah" — the size, the uppercase
  // transform and the tracking are exactly what they were before.
  'header style: the app header keeps its 11px uppercase tracking-wider size',
  /\[&>th\]:text-\[11px\]/.test(appHeadRow) &&
    /\[&>th\]:uppercase/.test(appHeadRow) &&
    /\[&>th\]:tracking-wider/.test(appHeadRow),
  appHeadRow,
);

const plainHeadHtml = renderToStaticMarkup(
  createElement(DataTable, { ...baseProps, data, variant: 'plain' }),
);
const plainHeadRow = headRowClass(plainHeadHtml);
check(
  'header style: the plain header is bold and solid black at 12px',
  /\[&>th\]:font-bold/.test(plainHeadRow) &&
    /\[&>th\]:text-black/.test(plainHeadRow) &&
    !/\[&>th\]:text-foreground/.test(plainHeadRow) &&
    /\[&>th\]:text-\[12px\]/.test(plainHeadRow),
  plainHeadRow,
);
check(
  'header style: the plain header no longer uses the muted grey',
  !/\[&>th\]:text-muted-foreground/.test(plainHeadRow),
  plainHeadRow,
);
check(
  // Load-bearing: `[&>th]:` is a DIRECT-child selector. If the header cells were
  // ever wrapped in another element the whole colour/weight mechanism would
  // silently stop applying, and no other check here would notice.
  'header style: the styled row holds its <th> cells as direct children',
  /<tr[^>]*group\/head[^>]*>\s*<th\b/.test(appHeadHtml),
  (appHeadHtml.match(/<tr[^>]*group\/head[^>]*>[\s\S]{0,120}/)?.[0] ?? '').slice(0, 200),
);

// The second header system: `T_TH` in src/lib/tableStyles.ts styles the <th> of
// the page tables that never moved onto this grid (ProfitLoss, OrderEntryDialog,
// TargetJahitReportPage, StockMonitoringPage). It has to hold the same black +
// bold contract, or those pages would drift back to grey on the next edit.
check(
  'header style: T_TH is bold and solid black at 12px',
  /font-bold/.test(T_TH) && /text-black/.test(T_TH) && /text-\[12px\]/.test(T_TH),
  T_TH,
);
check(
  'header style: T_TH no longer uses the muted grey or the blue-tinted token',
  !/text-muted-foreground/.test(T_TH) && !/text-foreground/.test(T_TH),
  T_TH,
);

// --- freeze columns ----------------------------------------------------------
//
// The freeze setting is the one feature that runs the grid through a code path
// nothing else in this project has ever exercised: `columnsPinnable` +
// `columnPinning` + `table-fixed`. It also has a trap that is invisible in a
// screenshot — `getHeaderGroups()` HOISTS pinned columns to the front, so a
// header list sliced by position silently shifts every header one cell to the
// right of its own body column. These checks pin down the contract:
//   - the checkbox is STILL the first header/body cell when columns are frozen
//     (the select column is pinned along with the data columns)
//   - the header order still matches the body order
//   - pinned cells actually carry the sticky/pinning styles, and the table
//     really is `table-fixed` (the offsets are declared sizes, so an auto-layout
//     table would let a column render wider than its declared size and slide
//     under its frozen neighbour)
//   - the freeze-off table is untouched: no pinning style, still `table-auto`

const frozenHtml = renderToStaticMarkup(
  createElement(DataTable, {
    variant: 'plain',
    columns: plainColumns,
    data: plainData,
    selectedRows: new Set([1]),
    onToggleRow: noop,
    frozenColumns: new Set(['picPenjahit', 'posisi']),
  }),
);

const frozenThead = frozenHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/)?.[1] ?? '';
const frozenFirstThCell = frozenThead.match(/<th[\s\S]*?<\/th>/)?.[0] ?? '';
check(
  'freeze: checkbox is STILL the first header cell',
  /role="checkbox"|type="checkbox"/.test(frozenFirstThCell),
  frozenFirstThCell.slice(0, 160),
);

const frozenFirstBodyRow = frozenHtml.match(/<tbody[^>]*>\s*<tr[^>]*>([\s\S]*?)<\/tr>/)?.[1] ?? '';
const frozenFirstTdCell = frozenFirstBodyRow.match(/<td[\s\S]*?<\/td>/)?.[0] ?? '';
check(
  'freeze: checkbox is STILL the first body cell',
  /role="checkbox"|type="checkbox"/.test(frozenFirstTdCell),
  frozenFirstTdCell.slice(0, 160),
);

// Header/body alignment. `data-col-id` only exists on <th> (the grid puts it
// there for the resize handle), so the body is read from its text instead: the
// frozen columns' values must lead the unfrozen one's, in the same order the
// headers do. Before the id-based header lookup this failed — `getHeaderGroups()`
// hoists pinned columns, so a positionally-sliced header list put `status` first
// and every label sat one column to the right of its own data.
const headerOrder = (frozenThead.match(/data-col-id="([^"]+)"/g) ?? []).map((m) =>
  m.slice('data-col-id="'.length, -1),
);
check(
  'freeze: the select column leads the header order',
  headerOrder[0] === '__select',
  headerOrder.join(' | '),
);
check(
  'freeze: the frozen columns come before the unfrozen one in the header',
  headerOrder.indexOf('picPenjahit') > -1 &&
    headerOrder.indexOf('picPenjahit') < headerOrder.indexOf('status') &&
    headerOrder.indexOf('posisi') < headerOrder.indexOf('status'),
  headerOrder.join(' | '),
);
// Body values, in DOM order: Budi (picPenjahit), Leader (posisi), STATUS:Aktif
// (status). The frozen pair must still lead.
const budiAt = frozenFirstBodyRow.indexOf('Budi');
const leaderAt = frozenFirstBodyRow.indexOf('Leader');
const statusAt = frozenFirstBodyRow.indexOf('STATUS:Aktif');
check(
  'freeze: header order matches body order',
  budiAt > -1 && budiAt < leaderAt && leaderAt < statusAt,
  `Budi@${budiAt} Leader@${leaderAt} STATUS@${statusAt}`,
);

// The pinning styles themselves. `data-pinned="start"` is the grid's own marker;
// the sticky offset is the part that makes the freeze real. Offsets are the
// running sum of DECLARED sizes — select 28px, then picPenjahit (180px), so
// posisi starts at 208.
const thById = (id: string) =>
  frozenThead.match(new RegExp(`<th[^>]*data-col-id="${id}"[^>]*>`))?.[0] ?? '';
check(
  'freeze: the select header cell sticks at 0',
  /data-pinned="start"/.test(thById('__select')) &&
    /position:sticky/.test(thById('__select')) &&
    /inset-inline-start:0px/.test(thById('__select')),
  thById('__select').slice(0, 220),
);
check(
  'freeze: the first frozen data column is offset past the select column',
  /data-pinned="start"/.test(thById('picPenjahit')) &&
    /position:sticky/.test(thById('picPenjahit')) &&
    /inset-inline-start:28px/.test(thById('picPenjahit')),
  thById('picPenjahit').slice(0, 220),
);
check(
  'freeze: the second frozen column is offset by the first one’s declared width',
  /inset-inline-start:208px/.test(thById('posisi')),
  thById('posisi').slice(0, 220),
);
check(
  'freeze: the unfrozen column is not pinned',
  !/data-pinned="start"/.test(thById('status')),
  thById('status').slice(0, 220),
);
check(
  'freeze: the table switches to table-fixed',
  /table-fixed/.test(frozenHtml) && !/table-auto/.test(frozenHtml),
);
// The body half of the same contract. This is the regression the smoke test
// caught: the dnd-sortable wrapper spread a bare `position: relative` over the
// pinned cell's `position: sticky`, so headers stayed frozen while their body
// cells scrolled away underneath.
const pinnedBodyCells = frozenFirstBodyRow.match(/<td[^>]*data-pinned="start"[^>]*>/g) ?? [];
check(
  'freeze: every frozen body cell is sticky, not merely marked',
  pinnedBodyCells.length >= 3 && pinnedBodyCells.every((c) => /position:sticky/.test(c)),
  `${pinnedBodyCells.filter((c) => /position:sticky/.test(c)).length}/${pinnedBodyCells.length} sticky`,
);
check(
  'freeze: the frozen body cells stack above the scrolling columns',
  pinnedBodyCells.every((c) => /z-index:30/.test(c)),
  pinnedBodyCells.map((c) => (c.match(/z-index:\d+/) ?? ['none'])[0]).join(' '),
);

// The freeze-off table must be byte-for-byte the layout it always was.
check(
  'freeze off: no pinning styles and still table-auto',
  !/data-pinned="start"/.test(plainSelHtml) &&
    /table-auto/.test(plainSelHtml) &&
    !/table-fixed/.test(plainSelHtml),
);
// A dnd-sortable body cell with nothing frozen must keep its own offset, or the
// drag transform would be relative to the wrong box.
check(
  'freeze off: body cells keep their drag-positioning offset',
  /position:relative/.test(plainSelHtml),
);

// `headerFrozen={false}` is the header toggle. The grid applies stickiness to
// the cell, so the header row must lose its sticky class entirely.
const noHeaderStickyHtml = renderToStaticMarkup(
  createElement(DataTable, {
    variant: 'plain',
    columns: plainColumns,
    data: plainData,
    headerFrozen: false,
  }),
);
check(
  'header freeze off: the header row is not sticky',
  !/sticky top-0/.test(noHeaderStickyHtml),
);
check(
  'header freeze on (default): the header row is sticky',
  /sticky top-0/.test(plainSelHtml),
);

// --- report ------------------------------------------------------------------
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass || !r.detail ? '' : `\n        ${r.detail}`}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
