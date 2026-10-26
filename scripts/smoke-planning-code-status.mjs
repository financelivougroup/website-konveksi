// Real Planning/Complain loader with an isolated Supabase query boundary.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({stdin:{contents:"export {fetchProductionCodeData,fetchProductionCodeOptions} from './src/lib/complainHelper';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',alias:{'@':`${process.cwd()}/src`},plugins:[{name:'no-db',setup(b){b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`
const rows=['PROGRESS','FINISHED','INVOICED'].map((status,i)=>({status,product:'Fixture',warna:'Black',size:['S','M','L'][i],client_production_code:['ACTIVE','DONE','BILLED'][i],product_note:'PO/'+i,source_order_id:'order'+i}));
export const supabase={from(table){if(table!=='work_orders')throw new Error('Unexpected table');let filtered=rows;return{select(){return this;},not(column,operator,value){if(column!=='prod_status'||operator!=='in'||value!=='(FINISHED,INVOICED)')throw new Error('Wrong exclusion');filtered=rows.filter(r=>!['FINISHED','INVOICED'].includes(r.status));return this;},then(resolve){return Promise.resolve({data:filtered,error:null}).then(resolve);}};}};
` }));}}]});
const svc=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const planning=await svc.fetchProductionCodeData();
assert.deepEqual(planning.options.map(o=>o.clientCode),['ACTIVE']);
assert.equal(planning.variants.length,1);
const complain=await svc.fetchProductionCodeOptions();
assert.deepEqual(complain.map(o=>o.clientCode),['ACTIVE','DONE','BILLED']);
console.log('PASS: Planning excludes FINISHED/INVOICED from codes and variants; Complain keeps completed production. No database writes.');
