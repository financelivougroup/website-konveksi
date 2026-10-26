// Screenshot the static SSR preview of the real cards (no app server, no DB).
import { writeFileSync } from 'node:fs';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve('.scratch/log-cards-visual');
const server = http.createServer((req, res) => {
  const file = req.url === '/style.css' ? 'style.css' : 'index.html';
  res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(readFileSync(path.join(dir, file)));
});
await new Promise((r) => server.listen(4197, '127.0.0.1', r));

const tabs = await (await fetch('http://127.0.0.1:9257/json')).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pending = new Map();
ws.onmessage = ({ data }) => { const m = JSON.parse(data); if (m.id) { pending.get(m.id)?.(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:4197/' });
await evaluate(`(async()=>{for(let i=0;i<80;i++){if(document.querySelector('svg text'))return;await new Promise(r=>setTimeout(r,50));}throw new Error('timeout');})()`);
const info = await evaluate(`(()=>{const svg=document.querySelector('svg');const t=document.querySelector('svg text');const arc=document.querySelectorAll('svg path')[1];const cs=getComputedStyle(t);const stop=getComputedStyle(document.querySelector('stop'));const box=document.querySelector('[data-slot]')||document.querySelector('.grid > div');return{width:svg.getBoundingClientRect().width,height:svg.getBoundingClientRect().height,text:t.textContent,fontSize:cs.fontSize,fontWeight:cs.fontWeight,fill:cs.fill,stopColor:stop.stopColor,arcStroke:getComputedStyle(arc).strokeWidth,cardHeight:box.getBoundingClientRect().height};})()`);
await send('Page.captureScreenshot', { captureBeyondViewport: true }).then((r) => writeFileSync('.scratch/log-cards-visual/desktop.png', Buffer.from(r.data, 'base64')));
console.log(JSON.stringify(info));
ws.close(); server.close();