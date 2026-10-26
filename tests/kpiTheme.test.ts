import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css=readFileSync(new URL('../src/index.css',import.meta.url),'utf8');
const dark=css.match(/\.dark\s*\{([\s\S]*?)\n {2}\}/)![1];
const token=(name:string)=>dark.match(new RegExp('--'+name+':\\s*([^;]+)'))![1].trim();
test('Dark canvas, cards and popovers have distinct surface levels',()=>{
 assert.notEqual(token('background'),token('card'));
 assert.notEqual(token('card'),token('popover'));
});
test('Dark surfaces retain accessible normal and muted text contrast',()=>{
 const rgb=(hsl:string)=>{const[h,s,l]=hsl.split(/\s+/).map(v=>parseFloat(v));const a=s/100*Math.min(l/100,1-l/100);return [0,8,4].map(n=>{const k=(n+h/30)%12;const c=l/100-a*Math.max(-1,Math.min(k-3,9-k,1));return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});};
 const lum=(s:string)=>{const[r,g,b]=rgb(s);return .2126*r+.7152*g+.0722*b;};
 for(const surface of ['background','card','popover'])for(const ink of ['foreground','muted-foreground']){
 const a=lum(token(surface)),b=lum(token(ink));assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${ink} on ${surface}`);
 }
});
test('Shared grid uses softer semibold light headers and supplies dark counterparts',()=>{
 const table=readFileSync(new URL('../src/components/Table/DataTable.tsx',import.meta.url),'utf8');
 assert.ok(table.includes('[&>th]:text-slate-700 dark:[&>th]:text-foreground'));
 assert.ok(table.includes('[&>th]:font-semibold'));
 assert.ok(!table.includes('[&>th]:font-bold'));
 assert.ok(!table.includes("'whitespace-nowrap text-slate-700'"));
 assert.ok(!table.includes("headerSticky: 'sticky top-0 z-40 bg-white'"));
});
test('Soft danger badge does not use on-solid foreground for light surface',()=>{
 const badge=readFileSync(new URL('../src/components/reui/badge.tsx',import.meta.url),'utf8');
 const variant=badge.match(/"destructive-light":\s*"([^"]+)"/)![1];
 assert.ok(!variant.includes('text-destructive-foreground'));
 assert.ok(variant.includes('dark:text-red-300'));
});
