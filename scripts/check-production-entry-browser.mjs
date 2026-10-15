// Isolated smoke harness; never points at the live application or writes to Supabase.
// Compile fixture CSS: npx tailwindcss -i src/index.css -o .scratch/production-entry-preview/style.css
// Start node scripts/smoke-production-entry.mjs and a dedicated Chrome with
// --headless=new --remote-debugging-port=9235 --user-data-dir=<isolated scratch profile>.
// Then run this script. Screenshots remain in the ignored .scratch directory.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const targets = await (await fetch('http://127.0.0.1:9235/json')).json();
const target = targets.find((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id) { const p = pending.get(msg.id); pending.delete(msg.id); if (msg.error) p.reject(msg.error); else p.resolve(msg.result); }
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ': ' + JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
}
async function until(expression) {
  return evaluate(`(async()=>{for(let i=0;i<80;i++){if(${expression})return true;await new Promise(r=>setTimeout(r,50))}throw new Error('condition timeout')})()`);
}
async function setQty(stage, qty) {
  await evaluate(`(()=>{const el=document.getElementById('${stage}-qty');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'${qty}');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function pic(stage) {
  await evaluate(`document.getElementById('${stage}-pic-trigger').scrollIntoView({block:'center'})`);
  await click(`#${stage}-pic-trigger`);
  await until(`document.querySelector('[role="option"]')`);
  const point = await evaluate(`(()=>{const r=Array.from(document.querySelectorAll('[role="option"]')).find(el=>!el.textContent.startsWith('Pilih ')).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
await send('Page.enable');
await send('Page.bringToFront');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
for (const stage of ['sewing', 'kancing', 'finishing']) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: `http://127.0.0.1:4179/?stage=${stage}` });
  await until(`document.querySelector('[aria-roledescription="slide"] button')`);
  assert.equal(await evaluate(`document.getElementById('${stage}-qty').checkVisibility()`), false);
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `${stage} mobile overflow`);
  await click('[aria-roledescription="slide"] button');
  await until(`document.getElementById('${stage}-qty').checkVisibility()`);
  assert.equal(await evaluate(`document.getElementById('${stage}-pic-trigger').checkVisibility()`), false);
  await setQty(stage, '250');
  await until(`document.getElementById('${stage}-pic-trigger').checkVisibility()`);
  await pic(stage);
  await until(`document.getElementById('${stage}-image-upload').closest('[hidden]')===null`);
  const qty = await evaluate(`document.getElementById('${stage}-qty').value`);
  assert.equal(qty, '250');
  await evaluate(`(()=>{const el=document.getElementById('${stage}-orders-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'no-result');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await until(`document.body.textContent.includes('Tidak ada hasil pencarian')`);
  assert.equal(await evaluate(`document.getElementById('${stage}-qty').value`), '250', 'search must retain entry');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Hapus filter').click()`);
  await until(`document.querySelectorAll('[aria-roledescription="slide"]').length===7`);
  await setQty(stage, '0');
  await until(`!document.getElementById('${stage}-pic-trigger').checkVisibility()`);
  assert.equal(await evaluate(`document.getElementById('${stage}-image-upload').disabled`), true);
  await setQty(stage, '12');
  await until(`document.getElementById('${stage}-pic-trigger').checkVisibility()`);
  await evaluate(`document.querySelectorAll('[aria-roledescription="slide"] button')[1].click()`);
  await until(`document.getElementById('${stage}-qty').value===''`);
  await setQty(stage, '30');
  await until(`document.getElementById('${stage}-pic-trigger').checkVisibility()`);
  await pic(stage);
  await until(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Simpan Entry' && b.checkVisibility()&&!b.disabled)`);
  await evaluate(`window.entryFixture.setFailNext(true);Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Simpan Entry').click()`);
  await until(`document.body.textContent.includes('Entry belum tersimpan')`);
  assert.equal(await evaluate('window.entryFixture.syncCalls.length'), 0);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Simpan Entry').click()`);
  await until(`document.body.textContent.includes('Entry berhasil disimpan')`);
  const calls = await evaluate('window.entryFixture.calls');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].stage, stage);
  assert.equal(calls[1].input.workOrderId, 'wo-1');
  assert.equal(calls[1].input.imageName, '');
  assert.equal(calls[1].input[stage==='sewing'?'qtySelesai':stage==='kancing'?'qtyKancing':'qtyFinishing'], 30);
  assert.equal(await evaluate('window.entryFixture.syncCalls.length'), 1);
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${stage} 320px overflow`);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(`.scratch/production-entry-preview/${stage}-mobile.png`, Buffer.from(shot.data, 'base64'));
  console.log(`PASS ${stage}: progressive fields, search retention, WO reset, invalid qty, optional photo, failure/retry payload and 390/320px overflow`);
}
// Additional real-browser checks against the same public form/service boundaries.
for (const stage of ['sewing', 'kancing', 'finishing']) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: `http://127.0.0.1:4179/?stage=${stage}` });
  await until(`document.querySelector('[aria-roledescription="slide"] button')`);
  await evaluate(`Array.from(document.querySelectorAll('[role="group"] button')).find(b=>b.textContent==='Aluna Top').click()`);
  await until(`document.querySelectorAll('[aria-roledescription="slide"]').length===2`);
  assert.equal(await evaluate(`document.getElementById('${stage}-qty').checkVisibility()`), false, 'recommendations filter without selection');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Hapus filter').click()`);
  await until(`document.querySelectorAll('[aria-roledescription="slide"]').length===7`);
  await click('[aria-label="Lihat work order berikutnya"]');
  await until(`document.body.textContent.includes('Posisi 2 dari')`);
  assert.equal(await evaluate(`document.getElementById('${stage}-qty').checkVisibility()`), false, 'navigation must not select');
  await click('[aria-label="Lihat work order sebelumnya"]');
  await until(`document.body.textContent.includes('Posisi 1 dari')`);
  const touch = await evaluate(`(()=>{const r=document.querySelector('[aria-roledescription="slide"] button').getBoundingClientRect();return {x:Math.min(r.right-20,330),y:r.top+80}})()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
  for (let dx=30; dx<=240; dx+=30) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touch.x-dx, y: touch.y }] });
    await evaluate('new Promise(r=>setTimeout(r,20))');
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await until(`!document.body.textContent.includes('Posisi 1 dari')`);
  assert.equal(await evaluate(`document.getElementById('${stage}-qty').checkVisibility()`), false, 'swipe must not select');
  // Test keyboard independently: Embla intentionally suppresses the trailing click after a drag.
  await send('Page.navigate', { url: `http://127.0.0.1:4179/?stage=${stage}` });
  await until(`document.querySelector('[aria-roledescription="slide"] button')`);
  await evaluate(`document.querySelector('[aria-roledescription="slide"] button').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await until(`document.querySelector('[aria-roledescription="slide"] button').getAttribute('aria-pressed')==='true'`);
  await evaluate(`document.querySelectorAll('[aria-roledescription="slide"] button')[1].focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await until(`document.getElementById('${stage}-qty').checkVisibility()`);
  await setQty(stage, '20');
  await pic(stage);
  await until(`!document.getElementById('${stage}-image-upload').disabled`);
  await evaluate(`(()=>{const c=document.createElement('canvas');c.width=2;c.height=2;return new Promise(resolve=>c.toBlob(blob=>{const dt=new DataTransfer();dt.items.add(new File([blob],'fixture-evidence.png',{type:'image/png'}));const input=document.getElementById('${stage}-image-upload');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));resolve(true)},'image/png'))})()`);
  await until(`document.body.textContent.includes('fixture-evidence.png')`);
  await click('[aria-label="Perbesar bukti barang"]');
  await until(`document.querySelector('[role="dialog"]')`);
  await setQty(stage, '0');
  await until(`!document.querySelector('[role="dialog"]')`);
  await setQty(stage, '20');
  await until(`!document.getElementById('${stage}-image-upload').disabled`);
  // Closing a preview must not discard the selected file.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await until(`!document.querySelector('[role="dialog"]')`);
  assert.equal(await evaluate(`document.body.textContent.includes('fixture-evidence.png')`), true);
  await click(`#${stage}-tanggal`);
  await until(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Kemarin')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Kemarin').click()`);
  const reportDate = await evaluate(`document.getElementById('${stage}-tanggal').textContent`);
  await evaluate(`document.querySelectorAll('[aria-roledescription="slide"] button')[0].click()`);
  await until(`document.getElementById('${stage}-qty').value===''`);
  await setQty(stage, '21');
  await pic(stage);
  await until(`!document.getElementById('${stage}-image-upload').disabled`);
  assert.equal(await evaluate(`document.body.textContent.includes('fixture-evidence.png')`), true, 'WO change retains file');
  assert.equal(await evaluate(`document.getElementById('${stage}-tanggal').textContent`), reportDate, 'WO change retains backdate');
  await evaluate(`(()=>{const el=document.getElementById('${stage}-orders-search');el.scrollIntoView({block:'center'});el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Aluna');el.dispatchEvent(new Event('input',{bubbles:true}));el.setSelectionRange(5,5)})()`);
  await until(`document.querySelectorAll('[aria-roledescription="slide"]').length===2`);
  const position = await evaluate(`document.querySelector('[aria-roledescription="carousel"] [role="status"]').textContent`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  assert.equal(await evaluate(`document.getElementById('${stage}-orders-search').selectionStart`), 4, 'search arrow edits caret');
  assert.equal(await evaluate(`document.querySelector('[aria-roledescription="carousel"] [role="status"]').textContent`), position, 'input arrows must not navigate carousel');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Hapus filter').click();window.scrollTo(0,0)`);
  await until(`document.querySelectorAll('[aria-roledescription="slide"]').length===7`);
  for (const width of [390, 1024]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width===390 });
    await evaluate('new Promise(r=>setTimeout(r,100))');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(`.scratch/production-entry-preview/${stage}-${width}.png`, Buffer.from(shot.data, 'base64'));
  }
  console.log(`PASS ${stage}: touch swipe, arrows without auto-selection, Enter selection, search caret, file/preview gates, retained file/backdate and desktop layout`);
}
for (const stage of ['sewing', 'kancing', 'finishing']) {
  for (const mode of ['empty', 'loading', 'error', 'long']) {
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:4179/?stage=${stage}&mode=${mode}` });
    if (mode === 'loading') await until(`document.getElementById('${stage}-orders')?.getAttribute('aria-busy')==='true'`);
    if (mode === 'error') {
      await until(`document.body.textContent.includes('Work order gagal dimuat')`);
      assert.equal(await evaluate('window.entryFixture.fetchCalls.length'), stage === 'sewing' ? 3 : 2, 'first-load failure count');
      assert.equal(await evaluate(`window.entryFixture.fetchCalls.includes('workOrders')`), false, 'WO injected while records fetch');
      assert.equal(await evaluate(`document.querySelector('[aria-roledescription="slide"] button')===null`), true);
      await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Coba lagi').click()`);
    }
    if (mode === 'long') {
      await until(`document.querySelector('[aria-roledescription="slide"] button')`);
      await click('[aria-roledescription="slide"] button');
      await until(`document.getElementById('${stage}-qty').checkVisibility()`);
    } else {
      await until(`document.body.textContent.includes('Tidak ada WO yang tersedia')`);
    }
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${stage} ${mode} overflow`);
  }
  console.log(`PASS ${stage}: empty/loading/error retry and unbroken long identities at 320px`);
}
// Exact ids, not counts alone: eligibility must be scoped per WO, never shared production code.
const expectedEligibleIds = {
  sewing: ['champagne', 'partial', 'qty-zero'],
  kancing: ['ivory', 'partial', 'qty-zero', 'latest-cut-equal'],
  finishing: ['ivory', 'partial', 'qty-zero'],
};
const ownService = { sewing: 'sewingRecords', kancing: 'kancingRecords', finishing: 'finishingRecords' };
const upstreamService = { sewing: 'cuttingRecords', kancing: 'sewingRecords', finishing: 'kancingRecords' };
async function displayedIds() {
  return evaluate(`Array.from(document.querySelectorAll('[aria-roledescription="slide"] button')).map(button=>{
    const code=Array.from(button.querySelectorAll('span')).map(s=>s.textContent).find(text=>text.startsWith('WO: '))?.slice(4);
    const wo=window.entryFixture.orders.find(order=>order.workCode===code);
    if(!wo)throw new Error('unmapped card '+code);return wo.id;
  })`);
}
async function searchOrders(stage, query) {
  await evaluate(`(()=>{const el=document.getElementById('${stage}-orders-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(query)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
for (const stage of ['sewing', 'kancing', 'finishing']) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: `http://127.0.0.1:4179/?stage=${stage}&mode=eligibility` });
  await until(`document.querySelector('[aria-roledescription="slide"] button')`);
  assert.deepEqual(await displayedIds(), expectedEligibleIds[stage], `${stage}: adjacent-stage eligible ids`);
  assert.equal(await evaluate(`window.entryFixture.fetchCalls.some(name=>name!=='registerPenjahit')`), false, 'injected record collections must not fetch');
  assert.equal(await evaluate(`document.getElementById('${stage}-qty').checkVisibility()`), false, 'eligibility must not auto-select');
  // Same product/code returns only the stage's eligible variants; search cannot resurrect excluded WOs.
  await searchOrders(stage, 'PO/002-TEST/10/2026/ELIG');
  await until(`document.getElementById('${stage}-orders-search').value==='PO/002-TEST/10/2026/ELIG'`);
  assert.deepEqual(await displayedIds(), expectedEligibleIds[stage]);
  for (const id of ['ivory', 'champagne', 'equal', 'no-upstream', 'latest-cut-equal', 'zero-output', 'over-own']) {
    await searchOrders(stage, `ELIG-${id}`);
    if (expectedEligibleIds[stage].includes(id)) {
      await until(`document.querySelectorAll('[aria-roledescription="slide"]').length===1 && document.querySelector('[aria-roledescription="slide"] button').textContent.includes('WO: ELIG-${id}')`);
      assert.deepEqual(await displayedIds(), [id]);
    } else {
      await until(`document.body.textContent.includes('Tidak ada hasil pencarian')`);
      assert.deepEqual(await displayedIds(), [], `${stage}: search must exclude ${id}`);
    }
  }
  await searchOrders(stage, 'ELIG-qty-zero');
  await until(`document.querySelectorAll('[aria-roledescription="slide"]').length===1`);
  assert.deepEqual(await displayedIds(), ['qty-zero'], 'POS qty0 must not block adjacent-stage output');
  await click('[aria-roledescription="slide"] button');
  await until(`document.getElementById('${stage}-qty').checkVisibility()`);
  assert.equal(await evaluate(`document.body.textContent.includes('Belum dari POS')`), true);
  assert.equal(await evaluate('window.entryFixture.calls.length'), 0, 'eligibility checks must not submit');
  console.log(`PASS ${stage}: exact eligible ids, same-code WO isolation, summed logs, latest cutting snapshot, equal/over-own/no-upstream/zero-output exclusion and qty0`);

  await send('Page.navigate', { url: `http://127.0.0.1:4179/?stage=${stage}&mode=failed-upstream` });
  await until(`document.body.textContent.includes('Work order gagal dimuat')`);
  assert.deepEqual(await displayedIds(), [], 'failed upstream must expose no selectable WOs');
  assert.equal(await evaluate(`document.getElementById('${stage}-qty').checkVisibility()`), false);
  assert.equal(await evaluate('window.entryFixture.calls.length'), 0);
  const initialFetches = await evaluate('window.entryFixture.fetchCalls');
  assert.equal(initialFetches.length, stage === 'sewing' ? 3 : 2);
  assert.equal(initialFetches.includes('workOrders'), false, 'WO collection is injected');
  assert.equal(initialFetches.filter(name=>name===upstreamService[stage]).length, 1);
  assert.equal(initialFetches.filter(name=>name===ownService[stage]).length, 1);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Coba lagi').click()`);
  await until(`document.querySelector('[aria-roledescription="slide"] button')`);
  assert.deepEqual(await displayedIds(), expectedEligibleIds[stage], `${stage}: upstream-only retry restores real eligibility`);
  const retryFetches = await evaluate('window.entryFixture.fetchCalls');
  assert.equal(retryFetches.filter(name=>name===upstreamService[stage]).length, 2);
  assert.equal(retryFetches.filter(name=>name===ownService[stage]).length, 2);
  assert.equal(retryFetches.filter(name=>name==='registerPenjahit').length, stage === 'sewing' ? 1 : 0);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  console.log(`PASS ${stage}: upstream-only service failure, no selection/submission, retry loads both record sources`);
}
ws.close();
