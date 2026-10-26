// Actual production forms and shared carousel, service fixtures only; no live Auth/DB.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const output='.scratch/production-entry-preview';
mkdirSync(output,{recursive:true});
const targets=await(await fetch('http://127.0.0.1:9235/json')).json();
const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let seq=0;const pending=new Map();const errors=[];
ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);if(m.error)p.reject(new Error(JSON.stringify(m.error)));else p.resolve(m.result);}};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(condition){return evaluate(`(async()=>{for(let i=0;i<100;i++){if(${condition})return;await new Promise(r=>setTimeout(r,40));}throw new Error('Fixture timeout');})()`);}
const results=[];
try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*']});
 for(const stage of ['sewing','kancing','finishing'])for(const width of [320,390,1280]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<640});
  await send('Page.navigate',{url:`http://127.0.0.1:4179/?stage=${stage}&mode=long`});
  await until(`document.querySelector('[data-production-code="client"]')`);
  const before=await evaluate(`(()=>{const slide=document.querySelector('[aria-roledescription="slide"]');const codes=[...slide.querySelectorAll('[data-production-code]')].map(n=>{const r=document.createRange();r.selectNodeContents(n);const rects=[...r.getClientRects()];n.scrollLeft=n.scrollWidth;return {kind:n.dataset.productionCode,wrap:getComputedStyle(n).whiteSpace,rows:rects.length,scrollLeft:n.scrollLeft,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth};});return {body:document.documentElement.scrollWidth,viewport:innerWidth,text:slide.textContent,codes};})()`);
  assert.ok(before.body<=before.viewport,`${stage} ${width}: body overflow`);
  assert.ok(!before.text.includes('WO:')&&!before.text.includes('WORK-0'));
  assert.equal(before.codes.length,2);
  if(width===1280){
    const sizing=await evaluate(`(()=>{const slide=document.querySelector('[aria-roledescription="slide"]');const viewport=slide.closest('[data-slot="carousel-content"]');return {slide:slide.getBoundingClientRect().width,viewport:viewport.getBoundingClientRect().width};})()`);
    assert.ok(sizing.slide<=sizing.viewport/3+8,'Desktop must fit three cards');
  }
  for(const code of before.codes){assert.equal(code.wrap,'nowrap');assert.equal(code.rows,1);assert.ok(code.scrollLeft>0,'Long code must scroll internally');}
  await evaluate(`document.querySelector('[aria-roledescription="slide"] button').click()`);
  await until(`document.querySelector('[aria-roledescription="slide"] button').getAttribute('aria-pressed')==='true'`);
  assert.ok(await evaluate(`document.getElementById('${stage}-qty').checkVisibility()`));
  const selected=await evaluate(`(()=>{const picker=document.getElementById('${stage}-orders');const notices=[...picker.querySelectorAll('[role="status"]')].filter(n=>!n.classList.contains('sr-only'));return {body:document.documentElement.scrollWidth,viewport:innerWidth,notices:notices.map(n=>n.textContent)};})()`);
  assert.ok(selected.body<=selected.viewport);
  assert.ok(!selected.notices.some(text=>text.includes('Produksi terpilih')||text.includes('WORK-0')),'Selected card must not add a visible summary above carousel');
  results.push({stage,width,codes:before.codes});
  if(stage==='sewing'&&width!==320){const shot=await send('Page.captureScreenshot',{captureBeyondViewport:true});writeFileSync(`${output}/cards-${width}.png`,Buffer.from(shot.data,'base64'));}
 }
 assert.deepEqual(errors,[]);
 writeFileSync(`${output}/card-layout.json`,JSON.stringify({results,errors},null,2));
 console.log('Production carousel: 9 stage/viewport combinations, one-line scrollable codes, no WO text/body overflow, selection intact — PASS');
}finally{ws.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP closed'));}pending.clear();}
