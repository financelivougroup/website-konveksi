// Real generation service with isolated RPC boundary; no DB/server/browser.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const output=await build({stdin:{contents:`export {generateTargetsFromPlanning} from './src/services/staffDebt';export {calls,setError,setResult,reset} from 'generation-state';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',alias:{'@':`${process.cwd()}/src`},plugins:[{name:'generation-boundaries',setup(b){
 b.onResolve({filter:/^(generation-state|@\/lib\/supabase|@\/services\/expenseEntries|@\/services\/kpiSettings)$/},({path})=>({path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>{
 if(path==='generation-state')return{contents:`export const calls=[];export let error=null;export let result={created:1,merged:0,processedFound:2,skippedNotApproved:0,skippedIncomplete:0,skippedNoSalary:0,missingSalary:[]};export function setError(e){error=e;}export function setResult(r){result=r;}export function reset(){calls.length=0;error=null;}`};
 if(path==='@/lib/supabase')return{contents:`import {calls,error,result} from 'generation-state';export const supabase={from(){throw new Error('Unexpected direct table mutation');},async rpc(name,args){calls.push({name,args});return {data:error?null:result,error};}};`};
 if(path==='@/services/kpiSettings')return{contents:`export function kpiError(e){return e instanceof Error?e:new Error(e.message||'Failed');}`};
 return{contents:`export const fetchSalaries=()=>{throw new Error('Eligibility must be verified on server');};`};
 });
}}]});
const s=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
s.reset();let r=await s.generateTargetsFromPlanning([1,1,2,NaN,-1,1.5]);assert.equal(r.error,null);assert.equal(r.created,1);assert.deepEqual(s.calls,[{name:'kpi_generate_targets',args:{p_ids:[1,2]}}]);
s.reset();r=await s.generateTargetsFromPlanning([]);assert.equal(r.created,0);assert.equal(s.calls.length,0);
r=await s.generateTargetsFromPlanning(Array.from({length:201},(_,i)=>i+1));assert.ok(r.error);assert.equal(s.calls.length,0);
s.reset();s.setError({message:'KPI_MONTH_FINAL'});r=await s.generateTargetsFromPlanning([1]);assert.ok(r.error);assert.equal(r.created,0);assert.equal(r.merged,0);assert.equal(s.calls.length,1);
s.reset();s.setResult({created:1});r=await s.generateTargetsFromPlanning([1]);assert.match(r.error.message,/tidak valid/);assert.equal(r.created,0);
console.log('PASS: Generation uses exactly one RPC, deduplicates valid IDs, rejects excessive/empty selections, and reports atomic failures without successful partial counts.');
