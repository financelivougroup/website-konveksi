// Geometry regression for the actual App/sidebar shell served by smoke-root-layout.mjs.
// Requires a disposable Chrome CDP instance; does not use a logged-in browser/profile.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const debuggerPort = Number(process.env.ROOT_LAYOUT_CDP_PORT || 9247);
const origin = 'http://127.0.0.1:4197';
const output = '.scratch/root-layout-preview';
mkdirSync(output, { recursive: true });
const tabs = await (await fetch(`http://127.0.0.1:${debuggerPort}/json`)).json();
const tab = tabs.find(t => t.type === 'page');
assert.ok(tab, 'A disposable Chrome page must be available.');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0;
const pending = new Map();
const runtimeErrors = [];
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
  pending.set(id, { resolve, reject, timer });
  ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function ready() {
  await evaluate(`(async()=>{for(let i=0;i<150;i++){if(document.querySelector('[data-layout-fixture]')&&document.querySelector('[data-sidebar="sidebar"]')){await new Promise(r=>setTimeout(r,350));return true;}await new Promise(r=>setTimeout(r,30));}throw new Error('Root fixture did not mount')})()`);
}
const measure = `(()=>{
  const visible=document.querySelector('[data-sidebar="sidebar"]');
  const panel=visible.parentElement;
  const reserve=panel.parentElement;
  const main=reserve.parentElement.querySelector(':scope > main');
  const content=document.querySelector('[data-layout-fixture]');
  const rect=n=>{const r=n.getBoundingClientRect();const s=getComputedStyle(n);return {left:r.left,right:r.right,width:r.width,minWidth:s.minWidth,flexShrink:s.flexShrink,overflowX:s.overflowX};};
  const table=document.querySelector('[data-wide-table] table');
  let scroller=table?.parentElement;
  while(scroller&&scroller!==main&&!(['auto','scroll'].includes(getComputedStyle(scroller).overflowX)&&scroller.scrollWidth>scroller.clientWidth+1))scroller=scroller.parentElement;
  const internal=!!scroller&&scroller!==main;
  if(internal)scroller.scrollLeft=100;
  const header=table?.querySelector('th');const ink=header?getComputedStyle(header):null;
  return {state:reserve.dataset.state,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,documentClient:document.documentElement.clientWidth,windowScrollX:scrollX,panel:rect(panel),reserve:rect(reserve),main:rect(main),content:rect(content),header:ink?{weight:ink.fontWeight,color:ink.color,size:ink.fontSize}:null,scroller:internal?{left:scroller.scrollLeft,client:scroller.clientWidth,scroll:scroller.scrollWidth}:null};
})()`;
const results = [];
const failures = [];
try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['https://*'] });
  for (const width of [1280, 1440, 1920]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const content of ['narrow', 'wide']) {
      await send('Page.navigate', { url: `${origin}/?content=${content}` });
      await ready();
      const probe = process.env.ROOT_LAYOUT_PROBE || '';
      if (probe) await evaluate(`(()=>{const main=document.querySelector('main');const reserve=main.previousElementSibling;const shared=main.querySelector('[data-layout-fixture]').parentElement;const probe=${JSON.stringify(probe)};if(probe==='reserve')reserve.style.flexShrink='0';if(probe==='inset'||probe==='both')main.style.minWidth='0';if(probe==='wrapper'||probe==='both')shared.style.minWidth='0';})()`);
      for (const expected of ['expanded', 'collapsed', 'expanded']) {
        if (expected !== (await evaluate(measure)).state) {
          await evaluate(`document.querySelector('button[title="Kecilkan / perbesar sidebar"]').click()`);
          await evaluate('new Promise(r=>setTimeout(r,350))');
        }
        const result = { width, scenario: content, expected, ...await evaluate(measure) };
        results.push(result);
        const checks = {
          state: result.state === expected,
          headerTypography: result.header?.weight === '600' && result.header?.color === 'rgb(51, 65, 85)' && result.header?.size === '12px',
          reservedWidth: Math.abs(result.reserve.width - result.panel.width) <= 1,
          noOverlap: result.main.left >= result.panel.right - 1 && result.content.left >= result.panel.right - 1,
          fitsViewport: result.main.right <= width + 1 && result.content.right <= width + 1,
          noBodyOverflow: result.documentWidth <= result.documentClient + 1 && result.windowScrollX === 0,
          internalTableScroll: content !== 'wide' || !!result.scroller && result.scroller.left > 0,
        };
        for (const [check, passed] of Object.entries(checks)) if (!passed) failures.push({ width, content, state: expected, check });
        if (content === 'wide') {
          const screenshot = await send('Page.captureScreenshot', { captureBeyondViewport: false });
          writeFileSync(`${output}/${width}-${expected}-${results.length}.png`, Buffer.from(screenshot.data, 'base64'));
        }
      }
    }
  }
  writeFileSync(`${output}/geometry${process.env.ROOT_LAYOUT_PROBE ? '-' + process.env.ROOT_LAYOUT_PROBE : ''}.json`, JSON.stringify({ scope: 'Actual root shell; page bodies mocked, not all real-page coverage', probe: process.env.ROOT_LAYOUT_PROBE || null, results, failures, runtimeErrors }, null, 2));
  console.log(JSON.stringify({ measurements: results.length, failures, runtimeErrors }, null, 2));
  assert.deepEqual(runtimeErrors, [], 'Root fixture runtime errors');
  assert.deepEqual(failures, [], 'Root sidebar geometry regression');
  console.log('Root layout geometry: PASS');
} finally {
  ws.close();
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('CDP closed')); }
  pending.clear();
}
