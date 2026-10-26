// Static HTML preview built from the REAL card component (SSR), no browser and no DB.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const out = path.resolve('.scratch/log-cards-visual');
mkdirSync(out, { recursive: true });
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: `
      import { renderToStaticMarkup } from 'react-dom/server';
      import { LaporanKpiCards } from './src/components/Laporan/LaporanKpiCards';
      const summary = { totalQty: 165, produkCount: 3, workOrderCount: 4, picCount: 2, buktiCount: 1 };
      const metrics = { target: 328, percent: 50.3, remaining: 163, extra: 0, average: 15, workdays: 11,
        from: '2026-10-01', to: '2026-10-21', excludedDates: 0, missingPeople: 0, cumulative: false };
      export function render(kind, m) {
        return renderToStaticMarkup(<LaporanKpiCards kind={kind} summary={summary} picLabel="Penjahit" logMetrics={m} />);
      }
    `,
  },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.resolve('src') },
  define: { 'import.meta.env': '{}' },
  loader: { '.css': 'empty' },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  plugins: [{
    name: 'no-db', setup(b) {
      b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase={};' }));
    },
  }],
  logLevel: 'error',
});
const { pathToFileURL } = await import('node:url');
const tmp = path.join(out, 'render.mjs');
writeFileSync(tmp, bundle.outputFiles[0].text);
const mod = await import(pathToFileURL(tmp).href);
const cards = [
  ['jahit', { target: 328, percent: 50.3, remaining: 163, extra: 0, average: 15 }],
  ['kancing', { target: 100, percent: 148, remaining: 0, extra: 48, average: 9 }],
  ['finishing', { target: 0, percent: null, remaining: null, extra: null, average: 0 }],
].map(([kind, m]) => `<section><h2>${kind}</h2>${mod.render(kind, { ...m, workdays: 11, from: '2026-10-01', to: '2026-10-21', excludedDates: 0, missingPeople: 0, cumulative: false })}</section>`).join('');
writeFileSync(path.join(out, 'index.html'), `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Log cards</title><link rel="stylesheet" href="style.css"></head><body class="bg-background p-6 text-foreground space-y-8"><h1 class="text-sm font-semibold">Preview kartu log (komponen asli, SSR)</h1>${cards}</body></html>`);
console.log(out);