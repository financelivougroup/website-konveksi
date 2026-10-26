// Real Settings page handlers with isolated hooks/UI/service boundaries. No DB or Chrome.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const output=await build({stdin:{contents:`export {KpiSettingsPage} from './src/components/KPI/KpiSettingsPage';export * from 'settings-state';`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',external:['react/jsx-runtime'],alias:{'@':`${process.cwd()}/src`},plugins:[{name:'settings-boundaries',setup(b){
 b.onResolve({filter:/^(react|react-router|settings-state|@\/contexts\/AuthContext|@\/components\/.*|@\/services\/kpiSettings|@\/services\/kpiProduksi)$/},({path})=>({path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>{
 if(path==='settings-state')return{loader:'ts',contents:`
 export let hooks=[],cursor=0,effects=[],deps=[],cleanups=[],role='owner',writes=[],pending=[];export let fail=null;export let reads=0;
 export const sample={baselines:[{order_id:'PO-1',components:[{key:'jahit',value:10}]}],versions:[],months:[],holidays:[{id:3,tanggal:'2026-10-02',keterangan:'Fixture'}],costs:[],targets:[{id:7,nama:'Fixture',posisi:'Penjahit',target_monthly:100}],audit:[]};
 export function reset(r='owner'){hooks=[];cursor=0;effects=[];deps=[];cleanups=[];writes=[];pending=[];role=r;fail=null;reads=0;}
 export function begin(){cursor=0;effects=[];}
 export function useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return[hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v];}
 export function useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((x,j)=>!Object.is(x,deps[i][j]))){effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});deps[i]=next;}}
 export function flush(){for(const e of effects)e();effects=[];}
 export function setFailure(e){fail=e;}
 export function fetchSettings(month){reads++;return new Promise((resolve,reject)=>pending.push({resolve:()=>resolve({...sample,months:sample.months.filter(m=>m.bulan.startsWith(month))}),reject}));}
 export function complete(){const p=pending.splice(0);for(const r of p)r.resolve();}
 export async function write(op,args){writes.push({op,args});if(fail)throw fail;}
 `};
 if(path==='react')return{contents:`export {useState,useEffect} from 'settings-state';`};
 if(path==='react-router')return{contents:`export const Link='Link';export const useLocation=()=>({search:''});`};
 if(path==='@/contexts/AuthContext')return{contents:`import {role} from 'settings-state';export const useAuth=()=>({profile:{role}});`};
 if(path==='@/services/kpiProduksi')return{contents:`export const bulanBerjalan=()=> '2026-10';export const fetchOrangList=async()=>({data:[{orangId:7,nama:'Fixture',divisi:'penjahit',aktif:true}],error:null});`};
 if(path==='@/services/kpiSettings')return{contents:`import {fetchSettings,write} from 'settings-state';export const fetchKpiSettings=fetchSettings;export const saveKpiSetting=(...a)=>write('setting',a);export const saveKpiPrice=(...a)=>write('price',a);export const setKpiMonth=(...a)=>write('month',a);export const fetchKpiAudit=async()=>({rows:[],more:false});`};
 const names=path.endsWith('/button')?['Button']:path.endsWith('/input')?['Input']:path.endsWith('/label')?['Label']:path.endsWith('/textarea')?['Textarea']:path.endsWith('/tabs')?['Tabs','TabsList','TabsTrigger','TabsContent']:path.endsWith('/card')?['Card','CardHeader','CardTitle','CardContent']:path.endsWith('/dialog')?['Dialog','DialogContent','DialogHeader','DialogTitle','DialogDescription','DialogFooter']:path.endsWith('/badge')?['Badge']:path.endsWith('/DataTable')?['DataTable']:path.endsWith('/KaryawanTab')?['KaryawanTab']:path.endsWith('/PermanentDeleteDialog')?['PermanentDeleteDialog']:['AppSelect'];
 return{contents:names.map(n=>`export const ${n}='${n}';`).join('\n')};
 });
}}]});
const mod=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))).toString('base64')}`);
function elements(n){if(!n||typeof n!=='object')return[];if(Array.isArray(n))return n.flatMap(elements);return[n,...elements(n.props?.children)];}
const render=()=>{mod.begin();const t=mod.KpiSettingsPage();mod.flush();return t;};
const button=(t,text)=>elements(t).find(n=>n.type==='Button'&&n.props.children===text);
const find=(t,id)=>elements(t).find(n=>n.props?.id===id);
const tick=()=>new Promise(r=>setImmediate(r));
mod.reset();let tree=render();
find(tree,'setting-reason').props.onChange({target:{value:'Fixture close'}});
assert.equal(button(render(),'Finalkan bulan').props.disabled,true);
mod.complete();await tick();tree=render();assert.equal(button(tree,'Finalkan bulan').props.disabled,false);
button(tree,'Finalkan bulan').props.onClick();tree=render();button(tree,'Konfirmasi').props.onClick();await tick();
assert.deepEqual(mod.writes[0],{op:'month',args:['2026-10',true,'Fixture close']});
tree=render();assert.equal(button(tree,'Finalkan bulan').props.disabled,true,'refresh must disable stale close');
mod.sample.months=[{bulan:'2026-10-01',status:'final'}];mod.complete();await tick();tree=render();assert.equal(button(tree,'Finalkan bulan').props.disabled,true);assert.equal(button(tree,'Buka kunci').props.disabled,false);
button(tree,'Buka kunci').props.onClick();tree=render();mod.setFailure(new Error('Fixture forbidden'));button(tree,'Konfirmasi').props.onClick();await tick();tree=render();assert.ok(elements(tree).some(n=>n.props?.role==='alert'));assert.equal(mod.writes.length,2);
// Reload preserves role controls: finance sees close, never unlock.
mod.reset('finance');mod.sample.months=[];tree=render();mod.complete();await tick();tree=render();assert.equal(button(tree,'Buka kunci'),undefined);
// Target editing uses existing employee/goal rather than creating a second master.
const targets=elements(tree).find(n=>n.type==='DataTable'&&n.props.data===mod.sample.targets);const edit=targets.props.rowActions(mod.sample.targets[0]);edit.props.onClick();tree=render();
assert.equal(elements(tree).find(n=>n.type==='AppSelect'&&n.props.label==='Karyawan').props.value,'7');
find(tree,'setting-reason').props.onChange({target:{value:'Fixture target'}});tree=render();button(tree,'Simpan target').props.onClick();await tick();assert.deepEqual(mod.writes.at(-1),{op:'setting',args:['target',{orangId:7,bulan:'2026-10-01',value:100},'Fixture target']});
mod.complete();await tick();tree=render();find(tree,'setting-month').props.onChange({target:{value:'2026-09'}});tree=render();assert.equal(button(tree,'Finalkan bulan').props.disabled,true);assert.ok(elements(tree).some(n=>n.type==='Badge'&&n.props.children==='Memuat status…'));
// Delete uses existing preview/confirmation component rather than raw table deletion.
mod.complete();await tick();tree=render();const holidays=elements(tree).find(n=>n.type==='DataTable'&&n.props.data===mod.sample.holidays);const actions=holidays.props.rowActions(mod.sample.holidays[0]);button(actions,'Hapus').props.onClick();tree=render();assert.equal(elements(tree).find(n=>n.type==='PermanentDeleteDialog').props.module,'daftar_libur');
console.log('PASS: real Settings handlers enforce loaded-state/reason checks, refresh drops stale status, role unlock controls, target existing edit, explicit error state, and shared holiday deletion flow.');
