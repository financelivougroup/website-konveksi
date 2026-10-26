import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const pages=await(await fetch('http://127.0.0.1:9248/json')).json();const ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});let seq=0;const pending=new Map();const errors=[];
ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(condition){await evaluate(`(async()=>{for(let i=0;i<150;i++){if(${condition})return;await new Promise(r=>setTimeout(r,30));}throw new Error('Condition timeout: '+${JSON.stringify(condition)});})()`);}
async function open(query=''){await send('Page.navigate',{url:'http://127.0.0.1:4198/'+query});await until(`document.querySelectorAll('main tbody tr').length===2`);}
async function click(expression){await evaluate(`(${expression}).click()`);}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*']});await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
 await open('?role=finance');
 assert.equal(await evaluate(`!!document.querySelector('[data-col-id="__actions"]')`),false);
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('th')].map(n=>n.textContent.trim()).filter(t=>/^(Action|Actions|Aksi)$/.test(t))`),[]);
 assert.equal(await evaluate(`document.querySelector('#shared-fixture [role="toolbar"]')===null`),true);
 await click(`document.querySelector('#shared-fixture tbody [role="checkbox"]')`);
 await until(`document.querySelector('#shared-fixture [role="toolbar"]')?.textContent.includes('Edit selected 1')`);
 await click(`[...document.querySelectorAll('#shared-fixture button')].find(n=>n.textContent==='Edit selected 1')`);
 assert.deepEqual(await evaluate('window.actionCalls'),[1]);
 await click(`document.querySelectorAll('#shared-fixture tbody [role="checkbox"]')[1]`);
 await until(`document.querySelector('#shared-fixture [role="toolbar"]')?.textContent.includes('2 baris')`);
 assert.equal(await evaluate(`document.querySelector('#shared-fixture [role="toolbar"]').textContent.includes('Edit selected')`),false);
 await click(`[...document.querySelectorAll('#shared-fixture button')].find(n=>n.textContent==='Bersihkan pilihan')`);
 await until(`document.querySelector('#shared-fixture [role="toolbar"]')===null`);
 assert.equal(await evaluate(`document.querySelector('#shared-fixture tfoot tr').children.length`),2);
 // Checkbox selection does not open payment, but exposes download for that invoice.
 await click(`document.querySelector('main tbody [role="checkbox"]')`);
 await until(`document.querySelector('[aria-label="Invoice terpilih"]')`);
 assert.equal(await evaluate(`document.querySelector('[role="dialog"]')===null`),true);
 await click(`[...document.querySelectorAll('[aria-label="Invoice terpilih"] button')].find(n=>n.textContent.includes('Download Gambar'))`);
 await until('window.downloadCalls.length===1');
 assert.equal(await evaluate('window.downloadCalls[0].id'),'inv-1');
 await click(`document.querySelector('main tbody tr')`);
 await until(`document.querySelector('[aria-label="Payment fixture"]')?.textContent.includes('INV/TEST/001')`);
 await click(`[...document.querySelectorAll('button')].find(n=>n.textContent==='Close payment')`);
 await click(`document.querySelectorAll('main tbody [role="checkbox"]')[1]`);
 await until(`document.querySelectorAll('[aria-label="Invoice terpilih"] button').length===4`);
 assert.equal(await evaluate(`[...document.querySelectorAll('[aria-label="Invoice terpilih"] button')].filter(n=>n.textContent.includes('Download Gambar')).length`),2);
 await send('Page.captureScreenshot',{captureBeyondViewport:true}).then(s=>writeFileSync('.scratch/table-actions/finance.png',Buffer.from(s.data,'base64')));
 await open('?role=staff');
 await click(`document.querySelector('main tbody [role="checkbox"]')`);await until(`document.querySelector('[aria-label="Invoice terpilih"]')`);
 assert.equal(await evaluate(`document.querySelector('[aria-label="Invoice terpilih"]').textContent.includes('Delete')`),false);
 assert.equal(await evaluate(`document.querySelector('[aria-label="Invoice terpilih"]').textContent.includes('Download Gambar')`),true);
 await open('?role=finance&payment-error=1');await click(`document.querySelector('main tbody [role="checkbox"]')`);await until(`document.querySelector('[aria-label="Invoice terpilih"]')`);
 assert.equal(await evaluate(`[...document.querySelectorAll('[aria-label="Invoice terpilih"] button')].find(n=>n.textContent.includes('Download Gambar')).disabled`),true);
 assert.equal(await evaluate('window.downloadCalls.length'),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: actual shared selection toolbar, no Action column, internal clear/multiple selection/footer; invoice row payment, checkbox download without payment, multi-invoice choices, role and incomplete-payment guards.');
}finally{ws.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP closed'));}pending.clear();}
