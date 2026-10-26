// Real upload service with isolated Auth/network boundaries; never writes R2 or DB.
import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { build } from 'esbuild';
const result=await build({stdin:{contents:"export {uploadToR2} from './src/services/r2Storage';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',alias:{'@':`${process.cwd()}/src`},define:{'import.meta.env.VITE_R2_SIGN_ENDPOINT':'"http://127.0.0.1:8787"','import.meta.env.VITE_R2_PUBLIC_BASE':'""'},plugins:[{name:'auth-fixture',setup(b){b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase={auth:{getSession:async()=>({data:{session:globalThis.r2UploadSession}})}};'}));}}]});
const {uploadToR2}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;delete globalThis.r2UploadSession;});
const input=()=>({logicalBucket:'product-photos',path:'fixture/photo.png',file:new File(['fixture'],'photo.png',{type:'image/png'})});
test('network/CORS rejection becomes a returned photo error rather than stranding the caller',async()=>{
  globalThis.r2UploadSession={access_token:'fixture-token'};
  globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
  const r=await uploadToR2(input());
  assert.ok(r.error instanceof Error);assert.match(r.error.message,/Failed to fetch/);
});
test('expired session becomes a returned error and never starts upload',async()=>{
  globalThis.r2UploadSession=null;let called=false;
  globalThis.fetch=async()=>{called=true;throw new Error('Unexpected network');};
  const r=await uploadToR2(input());assert.ok(r.error instanceof Error);assert.match(r.error.message,/Sesi/);assert.equal(called,false);
});
test('successful binary upload retains metadata and verified session header',async()=>{
  globalThis.r2UploadSession={access_token:'fixture-token'};
  globalThis.fetch=async(url,init)=>{assert.equal(url,'http://127.0.0.1:8787/sign/upload');assert.equal(init.method,'POST');assert.equal(init.headers.Authorization,'Bearer fixture-token');assert.equal(init.headers['x-r2-path'],'fixture/photo.png');assert.ok(init.body instanceof File);return new Response(null,{status:204});};
  assert.equal((await uploadToR2(input())).error,null);
});
test('HTTP errors preserve Worker error message',async()=>{
  globalThis.r2UploadSession={access_token:'fixture-token'};
  globalThis.fetch=async()=>Response.json({error:{message:'Unggah ditolak fixture'}},{status:403});
  assert.equal((await uploadToR2(input())).error?.message,'Unggah ditolak fixture');
});
