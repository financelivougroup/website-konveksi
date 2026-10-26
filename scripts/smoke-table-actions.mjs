// Actual invoice page and DataTable interaction fixture; no live Auth/DB or downloads.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
const output=path.resolve('.scratch/table-actions');mkdirSync(output,{recursive:true});
await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import{createRoot}from'react-dom/client';
import{InvoicingPage}from'./src/pages/InvoicingPage';import{DataTable}from'./src/components/Table/DataTable';
function Fixture(){const[version,setVersion]=React.useState(0);const rows=[{id:1,name:'First'},{id:2,name:'Second'}];
return <><section id="shared-fixture"><DataTable key={version} variant="plain" columns={[{key:'name',label:'Name',width:'160px'}]} data={rows} rowActions={row=><button type="button" onClick={()=>{window.actionCalls.push(row.id);}}>Edit selected {row.id}</button>} footer={<tr><td>Totals</td></tr>}/><button onClick={()=>setVersion(v=>v+1)}>Reset fixture</button></section><InvoicingPage/></>;}
window.actionCalls=[];window.downloadCalls=[];createRoot(document.getElementById('root')).render(<Fixture/>);
`},outfile:path.join(output,'app.js'),bundle:true,format:'esm',platform:'browser',jsx:'automatic',alias:{'@':path.resolve('src')},define:{'import.meta.env':'{}','process.env.NODE_ENV':'"development"'},plugins:[{name:'no-live-io',setup(b){
 b.onResolve({filter:/^@\/contexts\/AuthContext$/},()=>({path:'auth',namespace:'fixture'}));
 b.onResolve({filter:/^@\/services\//},args=>({path:args.path,namespace:'fixture'}));
 b.onResolve({filter:/^@\/components\/Modals\/PaymentModal$/},()=>({path:'modal',namespace:'fixture'}));
 b.onResolve({filter:/^@\/components\/Invoice\/InvoiceImage$/},()=>({path:'image',namespace:'fixture'}));
 b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'db',namespace:'fixture'}));
 b.onResolve({filter:/^@\/lib\/downloadInvoicePng$/},()=>({path:'download',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path:name})=>{
 if(name==='auth')return{contents:"export const useAuth=()=>({profile:{role:new URLSearchParams(location.search).get('role')||'finance',displayName:'Fixture'}});"};
 if(name==='db')return{contents:"export const supabase=new Proxy({},{get(){throw new Error('Unexpected database access')}})"};
 if(name==='download')return{contents:"export async function downloadInvoicePng(element,name){window.downloadCalls.push({name,id:element.dataset.invoiceId});}"};
 if(name==='image')return{loader:'tsx',resolveDir:process.cwd(),contents:"export function InvoiceImage({invoice,elementRef}){return <div hidden ref={elementRef} data-invoice-id={invoice.id}/>;}"};
 if(name==='modal')return{loader:'tsx',resolveDir:process.cwd(),contents:"export function PaymentModal({open,invoice,onClose}){return open?<div role='dialog' aria-label='Payment fixture'><p>{invoice.invoiceCode}</p><button type='button' onClick={onClose}>Close payment</button></div>:null;}"};
 if(name.endsWith('/invoices'))return{contents:`export async function fetchAllInvoices(){return {data:[{id:'inv-1',workOrderId:'wo-1',workCode:'PO/TEST/001',invoiceCode:'INV/TEST/001',clientProductionCode:'CLIENT-B-00',monthYear:'2026-10',clientName:'Fixture Client',pcsLinked:10,unitPrice:1000,totalAmount:10000,financeValidation:'Collect Payment',createdAt:'2026-10-01',billingType:'Production',autoCreated:true},{id:'inv-2',workOrderId:'wo-2',workCode:'PO/TEST/002',invoiceCode:'INV/TEST/002',monthYear:'2026-10',clientName:'Fixture Client',pcsLinked:20,unitPrice:1000,totalAmount:20000,financeValidation:'Collect Payment',createdAt:'2026-10-02',billingType:'Production',autoCreated:true}],error:null}};`};
 if(name.endsWith('/invoicePayments'))return{contents:"export async function fetchPaymentsByInvoiceIds(){return {data:[],error:new URLSearchParams(location.search).has('payment-error')?new Error('fixture missing payments'):null}}"};
 if(name.endsWith('/workOrders'))return{contents:"export async function fetchByIds(){return {data:[],error:null}}"};
 if(name.endsWith('/autoInvoice'))return{contents:"export async function backfillMissingInvoices(){throw new Error('Unexpected write')}"};
 if(name.endsWith('/permanentDeletion'))return{contents:"export const preview=async()=>{throw new Error('Unexpected delete')};export const execute=preview;export const retryCleanup=preview;export const fetchPendingCleanup=preview;"};
 throw new Error('Missing IO fixture '+name);
 });
}}]});
const css=await postcss([tailwindcss(),autoprefixer()]).process(readFileSync('src/index.css','utf8'),{from:path.resolve('src/index.css')});writeFileSync(path.join(output,'style.css'),css.css);
const server=http.createServer((req,res)=>{const file=req.url.split('?')[0]==='/app.js'?'app.js':req.url.split('?')[0]==='/style.css'?'style.css':null;if(file){res.setHeader('Content-Type',file.endsWith('js')?'text/javascript':'text/css');res.end(readFileSync(path.join(output,file)));}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Table action fixture</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');}});
await new Promise(resolve=>server.listen(4198,'127.0.0.1',resolve));
const owned=[];const exited=new Set();function start(cmd,args){const p=spawn(cmd,args,{stdio:'inherit'});owned.push(p);p.on('exit',()=>exited.add(p));return p;}
try{
 const profile=mkdtempSync(path.join(tmpdir(),'konveksi-table-actions-'));
 const chrome=start(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9248','--remote-debugging-address=127.0.0.1', '--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--disable-sync','--disable-gpu','--renderer-process-limit=1','about:blank']);
 let ready=false;for(let i=0;i<100;i++){if(exited.has(chrome))throw new Error('Browser exited');try{if((await fetch('http://127.0.0.1:9248/json',{signal:AbortSignal.timeout(500)})).ok){ready=true;break;}}catch{/* wait for disposable browser */}await new Promise(r=>setTimeout(r,250));}if(!ready)throw new Error('CDP timeout');
 const check=start(process.execPath,['scripts/check-table-actions-browser.mjs']);process.exitCode=await new Promise((resolve,reject)=>{check.once('exit',resolve);check.once('error',reject);});
}finally{server.close();for(const p of owned.reverse()){if(exited.has(p))continue;if(process.platform==='win32')await new Promise(resolve=>{const s=spawn('taskkill',['/PID',String(p.pid),'/T','/F'],{stdio:'ignore'});s.once('exit',resolve);s.once('error',resolve);});else p.kill('SIGTERM');}console.log('Closed owned table-action browser/server.');}
