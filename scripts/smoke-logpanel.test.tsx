/**
 * SSR smoke test for the log-tab panels (Sewing / Kancing / Finishing).
 *
 * Guards the 2026-09-28 layout change:
 *   - the "KODE PRODUKSI" / "SELURUH KODE PRODUKSI" / "Semua" labels are gone
 *   - the search box now sits INSIDE the slicer row (next to "Semua penjahit")
 *   - the search box and the Entry button survive an empty scope
 *
 * Rendered with react-dom/server so it runs under plain node.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { LogDashboardPanel } from '@/components/Production/LogDashboardPanel';
import { KodeProduksiList } from '@/components/Production/KodeProduksiList';
import { EMPTY_FILTERS, type LaporanRow } from '@/lib/laporanCompute';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean) {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
  }
}

const rows: LaporanRow[] = [
  { tanggal: '2026-09-01', produk: 'Kemeja', warna: 'Putih', size: 'M', qty: 10, pic: 'Budi', bukti: '' },
];

const base = {
  kind: 'jahit' as const,
  filters: EMPTY_FILTERS,
  onFiltersChange: () => {},
  group: null,
  searchQuery: '',
  onSearchChange: () => {},
};

const entry = <button>Entry Jahitan Baru</button>;

// ---------- 1. Labels are gone ----------
const withRows = renderToStaticMarkup(
  <LogDashboardPanel {...base} scopedRows={rows} actions={entry} />,
);
check('scope label "SELURUH KODE PRODUKSI" is gone', !withRows.includes('SELURUH KODE PRODUKSI'));
check('scope label "Kode Produksi Terpilih" is gone', !withRows.includes('Kode Produksi Terpilih'));
check('standalone "Semua" scope text is gone', !/>Semua<\/p>/.test(withRows));

const list = renderToStaticMarkup(
  <KodeProduksiList entries={[]} selected={null} onSelect={() => {}} totalRows={0} totalQty={0} />,
);
check('left panel "KODE PRODUKSI" header is gone', !/Kode Produksi<\/span>/.test(list));
check('left panel still renders its "Semua" row', list.includes('>Semua<'));

// ---------- 2. Search box lives in the slicer row ----------
check('search box is rendered', withRows.includes('Cari kode / produk / PIC...'));
check('PIC slicer is rendered', withRows.includes('Semua penjahit'));
check('month slicer is rendered', withRows.includes('Semua bulan'));

const picIdx = withRows.indexOf('Semua penjahit');
const searchIdx = withRows.indexOf('Cari kode / produk / PIC...');
check('search box follows the PIC slicer (same row, to its right)', picIdx >= 0 && searchIdx > picIdx);

/**
 * Slice out the element that owns the toolbar class, starting at the last such
 * class before the PIC slicer. Character distance is NOT a valid proxy here:
 * AppSelect renders a full Radix trigger plus an inline SVG chevron, so the
 * raw gap between the two labels runs past 1000 chars even when they are
 * adjacent siblings. Walking the div depth is the honest check.
 */
function toolbarOf(html: string, marker: string): string {
  const cls = 'flex flex-wrap items-center gap-2';
  const start = html.lastIndexOf(cls, html.indexOf(marker));
  if (start < 0) return '';
  let i = html.lastIndexOf('<div', start);
  let depth = 0;
  while (i >= 0 && i < html.length) {
    if (html.startsWith('<div', i)) depth++;
    else if (html.startsWith('</div>', i)) {
      depth--;
      if (depth === 0) return html.slice(html.lastIndexOf('<div', start), i);
    }
    i = html.indexOf('<', i + 1);
  }
  return '';
}

const toolbar = toolbarOf(withRows, 'Semua penjahit');
check('toolbar element was located', toolbar.length > 0);
check('PIC slicer is inside the toolbar', toolbar.includes('Semua penjahit'));
check('search box is inside the SAME toolbar element', toolbar.includes('Cari kode / produk / PIC...'));
check('search box comes after the PIC slicer in that toolbar',
  toolbar.indexOf('Semua penjahit') < toolbar.indexOf('Cari kode / produk / PIC...'));
check('toolbar holds the page action too', toolbar.includes('Entry Jahitan Baru'));

check('Entry action is rendered', withRows.includes('Entry Jahitan Baru'));
// The "{N} baris · {N} work order" summary that used to sit beside the Entry
// button was removed on 2026-09-29 — the KPI cards above already show the same
// numbers. Assert it stays gone.
check('row-count summary text is gone', !/\d+ baris · \d+ work order/.test(withRows));
check('no stray "work order" text in the toolbar', !toolbar.includes('work order'));

// ---------- 3. Search + Entry survive an empty scope ----------
const empty = renderToStaticMarkup(
  <LogDashboardPanel {...base} scopedRows={[]} actions={entry} />,
);
check('empty scope: search box still rendered', empty.includes('Cari kode / produk / PIC...'));
check('empty scope: Entry button still rendered', empty.includes('Entry Jahitan Baru'));
check('empty scope: empty message still rendered', empty.includes('Belum ada catatan'));

// ---------- 4. Search is wired, not a dead box ----------
// SSR cannot fire onChange, so this asserts the control is genuinely driven by
// `searchQuery` (a hardcoded box would render empty here) and that the input is
// the one carrying the search affordance.
const wired = renderToStaticMarkup(
  <LogDashboardPanel {...base} scopedRows={rows} searchQuery="abc" />,
);
check('search box reflects the controlled value', wired.includes('value="abc"'));
check('search input is a controlled text input',
  /<input[^>]*type="text"[^>]*value="abc"/.test(wired));

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail > 0) process.exit(1);
