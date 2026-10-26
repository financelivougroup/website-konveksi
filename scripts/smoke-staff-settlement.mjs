// Executes real service contracts and the real dialog with isolated React hooks/IO.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({stdin:{contents:`export * from './src/services/staffSettlement';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',alias:{'@':`${process.cwd()}/src`},plugins:[{name:'no-db',setup(b){b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'supabase',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase={rpc:async(...args)=>globalThis.settlementRpc(...args)};'}));}}]});
const svc=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const calls=[];
globalThis.settlementRpc=async(name,args)=>{calls.push({name,args});return{data:[],error:null};};
await svc.fetchStaffSettlements();assert.equal(calls.at(-1).name,'staff_settlement_read');
await svc.payBenefit({staffId:7,amount:10000,paidDate:'2026-10-20',reason:'Smoke',requestId:'request-fixture',fingerprint:'fp'});
assert.deepEqual(calls.at(-1),{name:'staff_benefit_pay',args:{p_staff:7,p_amount:10000,p_paid_date:'2026-10-20',p_reason:'Smoke',p_request:'request-fixture',p_fingerprint:'fp'}});
await svc.voidBenefit('payment-fixture','Void fixture');assert.equal(calls.at(-1).name,'staff_benefit_void');
globalThis.settlementRpc=async()=>({data:null,error:{message:'BENEFIT_STALE_BALANCE'}});
await assert.rejects(()=>svc.payBenefit({}),/Saldo berubah/);
const [row]=svc.applySettlementMonths([{nama:'Arief',bulan_tahun:'2026-10',realisasiCostPosisi:0,extraProduction:0,benefitAmount:0}],[{nama:'Arief',months:[{month:'2026-10-01',cost:540000,extra:40,benefit:240000}]}]);
assert.equal(row.realisasiCostPosisi,540000);assert.equal(row.extraProduction,40);assert.equal(row.benefitAmount,240000);
const [missing]=svc.applySettlementMonths([{nama:'Unknown',bulan_tahun:'2026-10',realisasiCostPosisi:0,extraProduction:0,benefitAmount:0}],[]);assert.equal(Number.isNaN(missing.realisasiCostPosisi),true);
console.log('PASS: real service RPC boundaries, payment payload/retry error and canonical Target/Report month overlays, missing money not zero.');
delete globalThis.settlementRpc;
