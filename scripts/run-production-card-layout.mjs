// Disposable browser runner; mirrors the existing root-layout ownership/cleanup pattern.
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
const output='.scratch/production-entry-preview';mkdirSync(output,{recursive:true});
const css=await postcss([tailwindcss(),autoprefixer()]).process(readFileSync('src/index.css','utf8'),{from:path.resolve('src/index.css')});writeFileSync(`${output}/style.css`,css.css);
const profile=mkdtempSync(path.join(tmpdir(),'konveksi-card-layout-'));const owned=[];const exited=new Set();
function start(cmd,args){const p=spawn(cmd,args,{stdio:'inherit'});owned.push(p);p.on('exit',()=>exited.add(p));return p;}
async function ready(url,p){for(let i=0;i<100;i++){if(exited.has(p))throw new Error('Fixture process exited');try{if((await fetch(url,{signal:AbortSignal.timeout(500)})).ok)return;}catch{/* waiting for server */}await new Promise(r=>setTimeout(r,250));}throw new Error('Ready timeout');}
try{
 const server=start(process.execPath,['--max-old-space-size=256','scripts/smoke-production-entry.mjs']);await ready('http://127.0.0.1:4179/',server);
 const chrome=start(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9235','--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--disable-sync','--disable-gpu','--renderer-process-limit=1','about:blank']);await ready('http://127.0.0.1:9235/json',chrome);
 const check=start(process.execPath,['scripts/check-production-card-layout.mjs']);const code=await new Promise((resolve,reject)=>{check.once('exit',resolve);check.once('error',reject);});process.exitCode=code??1;
}finally{
 for(const p of owned.reverse()){if(exited.has(p))continue;if(process.platform==='win32')await new Promise(resolve=>{const stop=spawn('taskkill',['/PID',String(p.pid),'/T','/F'],{stdio:'ignore'});stop.once('exit',resolve);stop.once('error',resolve);});else p.kill('SIGTERM');}
 console.log('Closed owned production-card fixture/browser processes.');
}
