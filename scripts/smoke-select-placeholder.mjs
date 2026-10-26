// Real AppSelect composition with non-portalled Select primitives for menu inspection.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const result = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {AppSelect} from './src/components/AppSelect';
    export const render = props => renderToStaticMarkup(<AppSelect {...props}/>);
  ` },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
  banner: {js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},
  alias: { '@': `${process.cwd()}/src` },
  plugins: [{ name: 'inspect-menu', setup(b) {
    b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'supabase',namespace:'no-db'}));
    b.onLoad({filter:/.*/,namespace:'no-db'},()=>({contents:'export const supabase=new Proxy({},{get(){throw new Error("Unexpected database access")}});'}));
    b.onResolve({filter:/^@\/components\/ui\/select$/},()=>({path:'select',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'tsx',contents:`
      export const Select=({children})=><div>{children}</div>;
      export const SelectTrigger=({children})=><button>{children}</button>;
      export const SelectValue=({placeholder})=><span>{placeholder}</span>;
      export const SelectContent=({children})=><div role="listbox">{children}</div>;
      export const SelectGroup=({children})=><div>{children}</div>;
      export const SelectItem=({children,value})=><div role="option" data-value={value}>{children}</div>;
    `}));
  }}],
});
const out=path.resolve('.scratch/smoke/select-placeholder.mjs');
mkdirSync(path.dirname(out),{recursive:true});
writeFileSync(out,result.outputFiles[0].text);
const {render}=await import(pathToFileURL(out).href);
for (const bare of [true,false]) {
  const props={bare,placeholder:'Pilih Kode Produksi Client',showPlaceholderOption:false,emptyMessage:'No Data',value:'',options:[]};
  const empty=render(props);
  assert.ok(empty.includes('No Data'));
  assert.equal((empty.match(/Pilih Kode Produksi Client/g)||[]).length,1);
  assert.equal(empty.includes('role="option"'),false);
  const populated=render({...props,options:[{value:'CLIENT-1',label:'Kode satu'}]});
  assert.ok(populated.includes('Kode satu'));
  assert.equal(populated.includes('No Data'),false);
  assert.equal(populated.includes('data-value="__app_select_empty__"'),false);
  const legacy=render({...props,showPlaceholderOption:undefined});
  assert.ok(legacy.includes('data-value="__app_select_empty__"'),'default clear option retained elsewhere');
  const saved=render({...props,value:'LEGACY'});
  assert.ok(saved.includes('data-value="LEGACY"'),'saved unlisted value remains selectable');
}
console.log('PASS: real AppSelect hides placeholder menu option only when requested, shows No Data when empty, keeps real/saved choices and existing default in both modes.');
