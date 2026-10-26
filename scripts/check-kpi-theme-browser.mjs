import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const targets=await(await fetch(`http://127.0.0.1:${process.env.KPI_BROWSER_PORT||9251}/json`)).json();
const target=targets.find(t=>t.type==='page');if(!target)throw new Error('Theme test browser has no page.');
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map();const runtimeErrors=[];
ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.method==='Runtime.exceptionThrown')runtimeErrors.push(m.params.exceptionDetails.text);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(m.error);else p.resolve(m.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const seq=++id;pending.set(seq,{resolve,reject});ws.send(JSON.stringify({id:seq,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(test){return evaluate(`(async()=>{for(let i=0;i<100;i++){if(${test})return;await new Promise(r=>setTimeout(r,40));}throw new Error('Theme fixture timeout');})()`);}
const click=async text=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw new Error('Missing button');b.click();})()`);
await send('Runtime.enable');await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://127.0.0.1:4191'});
await until('document.querySelector("#theme-table td")');
const read=()=>evaluate(`(()=>{const style=s=>getComputedStyle(document.querySelector(s));return{canvas:style('main').backgroundColor,card:style('#theme-card').backgroundColor,input:style('#theme-input').backgroundColor,header:style('#theme-table th').color,cell:style('#theme-table td').color,text:style('#theme-card').color,badge:style('[data-slot="badge"]').color,gauge:document.querySelector('.recharts-pie .recharts-sector')?.getAttribute('fill'),width:document.documentElement.scrollWidth,viewport:innerWidth};})()`);
await click('Fixture Light');await until('!document.documentElement.classList.contains("dark")');
const light=await read();assert.equal(light.header,'rgb(51, 65, 85)');
await click('Fixture Dark');await until('document.documentElement.classList.contains("dark")');
const dark=await read();assert.notEqual(dark.card,dark.canvas);assert.notEqual(dark.header,'rgb(0, 0, 0)');assert.notEqual(dark.cell,light.cell);assert.notEqual(dark.card,'rgb(255, 255, 255)');assert.notEqual(dark.badge,light.badge);assert.notEqual(dark.gauge,'hsl(var(--primary))');
await send('Page.captureScreenshot',{captureBeyondViewport:true}).then(r=>writeFileSync('.scratch/kpi-theme/dark-desktop.png',Buffer.from(r.data,'base64')));
// Open the actual portalled theme menu through a pointer event.
const point=await evaluate(`(()=>{const b=document.querySelector('button[aria-label="Pilih tema tampilan"]');b.scrollIntoView();const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
await until('document.querySelector("[role=menu]")');
const menu=await evaluate('getComputedStyle(document.querySelector("[role=menu]")).backgroundColor');assert.notEqual(menu,dark.canvas);assert.notEqual(menu,'rgb(255, 255, 255)');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
await send('Page.captureScreenshot').then(r=>writeFileSync('.scratch/kpi-theme/dark-mobile.png',Buffer.from(r.data,'base64')));
await click('Fixture Light');await until('!document.documentElement.classList.contains("dark")');assert.equal((await read()).header,'rgb(51, 65, 85)');
assert.deepEqual(runtimeErrors,[]);
console.log(JSON.stringify({result:'PASS: real compiled CSS separates dark surfaces, table/header/selection colors and danger badge adapt, gauge uses KPI color, portalled menu follows theme, mobile no overflow, light header stays slate-700',light,dark,menu},null,2));
ws.close();
