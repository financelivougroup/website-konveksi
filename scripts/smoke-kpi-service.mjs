// Bundle the real service with an isolated PostgREST boundary; never connects to a database.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({
  stdin: { contents: `export * from './src/services/kpiProduksi'; export { calls, failures, reset } from 'kpi-test-state';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', alias: { '@': `${process.cwd()}/src` },
  plugins: [{ name: 'isolated-kpi-service', setup(b) {
    b.onResolve({ filter: /^(?:@\/lib\/supabase|kpi-test-state)$/ }, ({ path }) => ({ path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => path === 'kpi-test-state' ? { contents: `
      export const calls=[]; export const failures={};
      export function reset(){calls.length=0;for(const k of Object.keys(failures))delete failures[k];}
      export function read(name) {
        if(failures[name])return {data:null,error:{message:'fixture failure '+name}};
        const data={
          kpi_produksi_orang:[{tanggal:'2026-10-02',divisi:'penjahit',orang_id:7,orang_nama:'Jahit',pcs:115,work_order_id:'WO-1'}],
          kpi_upah_pribadi:[{bulan:'2026-10',pcs_total:115,pcs_bertarif:115,estimasi:1495000,entry_tanpa_tarif:0,pcs_tanpa_tarif:0}],
          kpi_riwayat_pribadi:[{entry_id:'SR-2',tanggal:'2026-10-02',divisi:'penjahit',pcs:5},{entry_id:'SR-1',tanggal:'2026-10-02',divisi:'penjahit',pcs:4}],
          kpi_tarif_entries:[{tanggal:'2026-10-02',divisi:'penjahit',orang_id:7,orang_nama:'Jahit',pcs:115,work_order_id:'WO-1',tarif:13000,provenance:'baseline_unverified'},{tanggal:'2026-10-02',divisi:'finishing',orang_id:8,orang_nama:'Finisher',pcs:25,work_order_id:'WO-1',tarif:0,provenance:'dated'}],
          kpi_produksi_harian:[{tanggal:'2026-10-02',divisi:'penjahit',orang_id:7,orang_nama:'Jahit',pcs:115,work_order_id:'WO-1'},{tanggal:'2026-10-02',divisi:'finishing',orang_id:8,orang_nama:'Finisher',pcs:25,work_order_id:'WO-1'}],
          kpi_target_bulanan:[{target_id:1,bulan:'2026-10-01',orang_id:7,nama:'Jahit',divisi:'penjahit',target_pcs:164},{target_id:2,bulan:'2026-10-01',orang_id:8,nama:'Finisher',divisi:'finishing',target_pcs:100}],
          kpi_orang_list:[{orang_id:7,nama:'Jahit',divisi:'penjahit',aktif:true},{orang_id:8,nama:'Finisher',divisi:'finishing',aktif:true}],
          kpi_hari_libur:[],bulan_status:[],
          target_biaya:[{bulan:'2026-10-01',divisi:'total',target_per_pcs:16000},{bulan:'2026-09-01',divisi:'total',target_per_pcs:15000}],
          work_orders:[{id:'WO-1',source_order_id:'PO-1'}],production_order_prices:[{id:'PRICE-1',production_order_id:'PO-1'}],
          production_order_price_components:[{order_price_id:'PRICE-1',component_key:'jahit',amount_per_piece:10000},{order_price_id:'PRICE-1',component_key:'obras',amount_per_piece:3000},{order_price_id:'PRICE-1',component_key:'finishing',amount_per_piece:0}],
        }[name]||[];
        return {data,error:null};
      }
    `, loader: 'ts' } : { contents: `
      import {calls,read} from 'kpi-test-state';
      const query=(name)=>{calls.push(name);let offset=0,end=Infinity;const q={select:()=>q,in:()=>q,gte:()=>q,lte:()=>q,order:()=>q,range:(a,b)=>{offset=a;end=b;return q;},then:(r,j)=>{const res=read(name);return Promise.resolve({...res,data:res.data?res.data.slice(offset,end+1):null}).then(r,j);}};return q;};
      export const supabase={rpc:(name)=>query(name),from:(name)=>query(name)};
    `, loader:'ts' });
  } }],
});
const svc = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
let r=await svc.fetchPeriodeData({dari:'2026-10-01',sampai:'2026-10-31',orangId:7,bolehLihatBiaya:false});
assert.equal(r.error,null);
assert.equal(r.data.entries.every(e=>e.tarif===null),true);
assert.equal(svc.calls.some(c=>['target_biaya','work_orders','production_order_prices','production_order_price_components'].includes(c)),false);
assert.equal(r.data.targets.length,1);
assert.ok(svc.calls.includes('kpi_produksi_orang'));
let wage=await svc.fetchUpahPribadi('2026-10-01','2026-10-31',7);assert.equal(wage.data[0].estimasi,1495000);
let history=await svc.fetchRiwayatPribadi('2026-10-01','2026-10-31',7,null,1);assert.equal(history.data.length,1);assert.equal(history.next.entryId,'SR-2');
assert.equal(svc.calls.some(c=>['target_biaya','production_order_prices'].includes(c)),false);
svc.reset();
r=await svc.fetchPeriodeData({dari:'2026-09-01',sampai:'2026-10-31',orangId:null,bolehLihatBiaya:true});
assert.equal(r.error,null);assert.equal(r.data.entries[0].tarif,13000);assert.equal(r.data.entries[1].tarif,0);
assert.equal(r.data.legacyRateCount,1);
assert.equal(svc.calls.some(c=>['work_orders','production_order_prices','production_order_price_components'].includes(c)),false);
assert.equal(r.data.targetBiaya.get('total'),16000);
assert.equal(r.data.targetBiayaPerBulan.get('2026-09').get('total'),15000);
assert.equal(r.data.targetPerBulan.get('2026-10'),164);
assert.equal(r.data.targetPerBulanPerDivisi.get('2026-10').get('finishing'),100);
for (const source of ['target_biaya','kpi_orang_list','bulan_status','kpi_tarif_entries','kpi_hari_libur']) {
  svc.reset();svc.failures[source]=true;
  try { const res=await svc.fetchPeriodeData({dari:'2026-10-01',sampai:'2026-10-31',bolehLihatBiaya:true}); assert.ok(res.error,source); }
  catch(e){ assert.match(e.message,/fixture failure/); }
}
console.log('PASS: real KPI service role-cost exclusion, target scopes, chronological cost maps, zero rates, and error propagation.');
