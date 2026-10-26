// Browser fixture for the real KPI router, hooks and shadcn UI. No Supabase connection.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const outdir = path.resolve('.scratch/kpi-preview');
mkdirSync(outdir, { recursive: true });
await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { BrowserRouter, useNavigate } from 'react-router';
      import { ThemeProvider } from 'next-themes';
      import { KpiRouter } from './src/components/KPI/KpiRouter';
      function Fixture() {
        const navigate = useNavigate();
        return <><nav aria-label="Fixture navigation">
          <button onClick={() => navigate('/laporan/team')}>Fixture Team</button>
          <button onClick={() => navigate('/laporan/orang/7')}>Fixture Orang 7</button>
          <button onClick={() => navigate('/laporan/orang/8')}>Fixture Orang 8</button>
        </nav><KpiRouter /></>;
      }
      createRoot(document.getElementById('root')).render(<React.StrictMode><ThemeProvider attribute="class" defaultTheme="light"><BrowserRouter><Fixture /></BrowserRouter></ThemeProvider></React.StrictMode>);
    `,
  },
  bundle: true, outfile: path.join(outdir, 'app.js'), format: 'esm', platform: 'browser',
  jsx: 'automatic', alias: { '@': path.resolve('src') },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
  plugins: [{
    name: 'kpi-service-fixture',
    setup(b) {
      b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: 'supabase-stub', namespace: 'no-db' }));
      b.onLoad({ filter: /.*/, namespace: 'no-db' }, () => ({ contents: 'export const supabase = new Proxy({}, {get(){throw new Error("Unexpected database access in KPI fixture")}});' }));
      b.onResolve({ filter: /^@\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'settings-fixture' }));
      b.onResolve({ filter: /^@\/services\/kpiSettings$/ }, () => ({ path: 'settings', namespace: 'settings-fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'settings-fixture' }, ({path: name}) => ({ loader: 'ts', contents: name === 'auth'
        ? `export const useAuth=()=>({profile:{role:new URLSearchParams(location.search).get('role')||'owner'}});`
        : `
          const delay=ms=>new Promise(r=>setTimeout(r,ms));
          window.fixtureSettingsWrites=[];window.fixtureSettingsReads=0;window.fixtureSettingsFinal=false;
          window.fixtureSettingsFailure=false;window.fixtureSettingsDelay=100;
          export async function fetchKpiSettings(month){
            window.fixtureSettingsReads++;await delay(window.fixtureSettingsDelay);
            return {baselines:[],versions:[],months:window.fixtureSettingsFinal?[{bulan:month+'-01',status:'final'}]:[],
              holidays:[{id:3,tanggal:month+'-02',keterangan:'Libur fixture'}],costs:[],
              targets:[{id:7,nama:'Pekerja Tujuh',posisi:'Penjahit',target_monthly:100}],
              audit:[{id:1,changed_at:'2026-10-20',table_name:'target_jahit',action:'UPDATE',reason:'Alasan fixture',actor:'fixture',before_data:{value:90},after_data:{value:100}}]};
          }
          async function write(op,args){window.fixtureSettingsWrites.push({op,args});await delay(30);if(window.fixtureSettingsFailure)throw new Error('Simpan gagal (fixture)');}
          export const saveKpiSetting=(...a)=>write('setting',a);
          export const saveKpiPrice=(...a)=>write('price',a);
          export async function setKpiMonth(month,final,reason){await write('month',[month,final,reason]);window.fixtureSettingsFinal=final;}
          export const fetchKpiAudit=async()=>({rows:[],more:false});
        ` }));
      b.onResolve({ filter: /(?:^|[\\/])kpiProduksi$/ }, () => ({ path: 'service', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'ts', contents: `
        const params = new URLSearchParams(location.search);
        const role = params.get('role') || 'owner';
        const delay = ms => new Promise(r => setTimeout(r, ms));
        export const bulanBerjalan = () => '2026-10';
        export const awalBulan = ym => ym + '-01';
        export const akhirBulan = ym => ym + (ym.endsWith('09') ? '-30' : '-31');
        export async function fetchOrangList() { return {data:[{orangId:7,nama:'Pekerja Tujuh',divisi:'penjahit',aktif:true}],error:null}; }
        export async function fetchScope() {
          await delay(20);
          return { data: role === 'staff'
            ? { orangId: 7, nama: 'Pekerja Tujuh', divisi: 'penjahit', bisaTim: false, punyaAkses: true }
            : { orangId: null, nama: null, divisi: null, bisaTim: role !== 'inventory', punyaAkses: role !== 'inventory' }, error: null };
        }
        window.fixtureMonthFailure = params.has('month-error');
        export async function fetchLegacyPribadi() { return true; }
        export async function fetchUpahPribadi(dari,sampai,orangId) {
          await delay(30);
          const id = role==='staff'?7:orangId;
          return {data:[{bulan:sampai.slice(0,7),pcsTotal:id===8?25:115,pcsBertarif:id===8?25:115,estimasi:id===8?50000:1495000,entryTanpaTarif:0,pcsTanpaTarif:0}],error:null};
        }
        export async function fetchRiwayatPribadi(dari,sampai,orangId,cursor) {
          await delay(20);
          const id=role==='staff'?7:orangId;
          const rows=Array.from({length:12},(_,i)=>({entryId:'SR-'+String(12-i).padStart(2,'0'),tanggal:sampai.slice(0,7)+'-02',divisi:id===8?'finishing':'penjahit',pcs:i+1}));
          const start=cursor?rows.findIndex(r=>r.entryId===cursor.entryId)+1:0;
          const data=rows.slice(start,start+10);
          return {data,next:start+10<rows.length?data.at(-1):null,error:null};
        }
        export async function fetchBulanTersedia() {
          await delay(30);
          if (window.fixtureMonthFailure) return { data: [], error: new Error('Daftar bulan gagal (fixture)') };
          return { data: ['2026-10','2026-09'], error: null };
        }
        export async function fetchPeriodeData(q) {
          window.fixtureRequests = [...(window.fixtureRequests || []), q];
          await delay(q.dari.startsWith('2026-09') ? 300 : 40);
          const orang = [{ orangId:7,nama:'Pekerja Tujuh',divisi:'penjahit',aktif:true },{ orangId:8,nama:'Pekerja Delapan',divisi:'finishing',aktif:true },{orangId:9,nama:'Pekerja Sembilan',divisi:'penjahit',aktif:true}];
          const month = q.sampai.slice(0,7);
          const months = q.dari.slice(0,7) < month ? [q.dari.slice(0,7),month] : [month];
          const targets = months.flatMap(ym => orang.filter(o => q.orangId == null || o.orangId === q.orangId).map(o => ({targetId:o.orangId,bulan:ym,orangId:o.orangId,nama:o.nama,divisi:o.divisi,targetPcs:o.orangId===8?100:164,statusFinal:null})));
          const entries = months.flatMap(ym => orang.filter(o => q.orangId == null || o.orangId === q.orangId).map(o => ({tanggal:ym+'-02',orangId:o.orangId,orangNama:o.nama,divisi:o.divisi,pcs:ym==='2026-09'?20:o.orangId===8?25:o.orangId===9?50:115,tarif:role==='staff'?null:o.orangId===8?2000:13000})));
          return { data: {
            orang: role === 'staff' ? orang.slice(0,1) : orang,
            entries, targets,
            targetPerOrang:new Map(orang.map(o=>[o.orangId,targets.filter(t=>t.orangId===o.orangId).reduce((s,t)=>s+t.targetPcs,0)])),
            targetPerBulan:new Map(months.map(ym=>[ym,164])),
            targetPerBulanPerDivisi:new Map(months.map(ym=>[ym,new Map([['penjahit',164],['finishing',100]])])),
            targetBiaya:new Map([['total',16000],['penjahit',12000],['finishing',2000],['leader',2000]]),
            targetBiayaPerBulan:new Map(months.map(ym=>[ym,new Map([['total',16000],['penjahit',12000],['finishing',2000],['leader',2000]])])),
            bulanFinal:new Set(),libur:[],
          }, error:null };
        }
      ` }));
    },
  }],
});
writeFileSync(path.join(outdir, 'index.html'), '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KPI fixture</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
if (!process.argv.includes('--build-only')) {
  http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const name = url === '/app.js' ? 'app.js' : url === '/app.css' ? 'app.css' : url === '/style.css' ? 'style.css' : 'index.html';
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    try { res.end(readFileSync(path.join(outdir, name))); } catch { res.statusCode = 404; res.end('Not found'); }
  }).listen(4186, '127.0.0.1', () => console.log('KPI fixture ready on http://127.0.0.1:4186 (no database).'));
}
