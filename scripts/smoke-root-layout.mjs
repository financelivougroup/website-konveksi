// Actual App/sidebar shell; page bodies and IO boundaries are fixtures, never live Auth/DB.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const output = path.resolve('.scratch/root-layout-preview');
mkdirSync(output, { recursive: true });
const pageFixture = `
import React from 'react';
import { DataTable } from '@/components/Table/DataTable';
const wide = new URLSearchParams(location.search).get('content') !== 'narrow';
const columns = Array.from({length: wide ? 18 : 2}, (_, i) => ({key:'c'+i,label:'Column '+i,width:'200px'}));
const rows = Array.from({length:4},(_,i)=>Object.fromEntries([['id',i],...columns.map(c=>[c.key,'Fixture '+i+' / '+c.key])]));
function FixturePage(){return <section data-layout-fixture className="flex min-w-0 flex-1 flex-col px-6 pt-3"><h1 className="mb-3 text-[17px] font-semibold">Root layout fixture</h1><div data-wide-table className="min-w-0 overflow-x-auto"><DataTable variant="plain" columns={columns} data={rows}/></div></section>}
export default FixturePage;
export const Landing=FixturePage, PlanningProduksiPage=FixturePage, ComplainPenaltiPage=FixturePage,
TargetJahitPage=FixturePage,RegisterHargaPage=FixturePage,KategoriBiayaPage=FixturePage,
ExpensePage=FixturePage,ContactPage=FixturePage,LaporanTargetJahitPage=FixturePage,LaporanKinerjaProduksiPage=FixturePage;
`;
if (!process.argv.includes('--serve-only')) {
await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {BrowserRouter} from 'react-router';import App from './src/App';
    createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);
  ` },
  outfile: path.join(output, 'app.js'), bundle: true, format: 'esm', platform: 'browser',
  jsx: 'automatic', alias: { '@': path.resolve('src') },
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'root-layout-boundaries', setup(b) {
    b.onResolve({ filter: /^@\/pages\// }, args => ({ path: args.path, namespace: 'page-fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'page-fixture' }, () => ({ contents: pageFixture, loader: 'tsx', resolveDir: process.cwd() }));
    b.onResolve({ filter: /^@\/components\/Auth\/AuthGate$/ }, () => ({ path: 'gate', namespace: 'root-fixture' }));
    b.onResolve({ filter: /^@\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'root-fixture' }));
    b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: 'database', namespace: 'root-fixture' }));
    b.onResolve({ filter: /^@\/services\// }, () => ({ path: 'services', namespace: 'root-fixture' }));
    b.onResolve({ filter: /^@\/components\/(Modals|Panel)\// }, () => ({ path: 'modals', namespace: 'root-fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'root-fixture' }, ({path: name}) => {
      if (name === 'gate') return { contents: 'export const AuthGate=({children})=>children;' };
      if (name === 'auth') return { contents: `export const useAuth=()=>({profile:{id:'fixture',role:'owner',username:'fixture',displayName:'Layout Fixture',orangId:null},signOut:async()=>{}});` };
      if (name === 'database') return { contents: `export const supabase=new Proxy({},{get(){throw new Error('Unexpected persistent IO in root layout fixture')}});` };
      if (name === 'services') return { contents: `export const fetchAll=async()=>({data:[],error:null});export const create=()=>{throw new Error('Unexpected fixture write')};export const update=create;` };
      return { contents: ['DetailPanel','CustomizeFieldModal','FilterModal','GroupByModal','SortModal','RowHeightModal','ConditionalColorModal','DateRangeModal','AddViewModal','PermanentDeleteDialog','PermanentDeleteCleanupDialog'].map(n=>'export const '+n+'=()=>null;').join('\n') };
    });
  } }],
});
const css = await postcss([tailwindcss(), autoprefixer()]).process(readFileSync('src/index.css', 'utf8'), { from: path.resolve('src/index.css') });
writeFileSync(path.join(output, 'style.css'), css.css);
writeFileSync(path.join(output, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Root layout fixture</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
console.log('Built actual App/sidebar shell fixture (page contents mocked; not full-page coverage).');
}
if (!process.argv.includes('--build-only')) {
  http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const name = pathname === '/app.js' ? 'app.js' : pathname === '/style.css' ? 'style.css' : 'index.html';
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(readFileSync(path.join(output, name)));
  }).listen(4197, '127.0.0.1', () => console.log('Root layout fixture: http://127.0.0.1:4197'));
}
