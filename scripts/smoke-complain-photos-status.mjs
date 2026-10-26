// Render actual complaint thumbnail maps and Status/Tingkat column callbacks; no IO.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
const cn = (...inputs) => twMerge(clsx(inputs));

const source = readFileSync('src/pages/ComplainPenaltiPage.tsx', 'utf8');
const ast = ts.createSourceFile('Complain.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const maps = {};
const renders = {};
let options;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'STATUS_OPTIONS') options = node.initializer.getText(ast);
  if (ts.isCallExpression(node) && ['existingFiles.map','pendingFiles.map'].includes(node.expression.getText(ast))) maps[node.expression.getText(ast)] = node.getText(ast);
  if (ts.isObjectLiteralExpression(node)) {
    const key = node.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(ast) === 'key');
    if (key && ["'status'", "'tingkat'"].includes(key.initializer.getText(ast))) {
      const render = node.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(ast) === 'render');
      if (render) renders[key.initializer.text] = render.initializer.getText(ast);
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const code = `
const STATUS_OPTIONS=${options};
exports.existing=()=>${maps['existingFiles.map']};
exports.pending=()=>${maps['pendingFiles.map']};
exports.status=${renders.status};exports.tingkat=${renders.tingkat};exports.options=STATUS_OPTIONS;
`;
const plain = tag => ({children,...props}) => createElement(tag, props, children);
const Button = ({asChild,children,...props}) => asChild ? children : createElement('button',props,children);
const primitive = ({children}) => createElement(Fragment,null,children);
const trigger = ({children,...props}) => createElement('button',props,children);
const softBadgeClass = () => 'inline-block px-2.5 py-0.5 rounded-md border text-[11px] font-medium leading-none whitespace-nowrap';
const values = {
  React: {createElement,Fragment}, Button, X: () => null,
  existingFiles:[{id:'proof',fileUrl:'https://example.test/proof.png',fileName:'proof.png'}],
  pendingFiles:[{previewUrl:'blob:pending-proof',file:{name:'pending.png'}}],
  handleRemoveExisting:()=>{},removePending:()=>{},
  COMPLAIN_STATUS:{NEED_PROCEED:'NEED PROCEED',SOLVED:'SOLVED'},
  Select:primitive,SelectTrigger:trigger,SelectValue:()=>null,SelectContent:primitive,SelectItem:plain('option'),
  cn,softBadgeClass,STATUS_BADGE:{},savingStatusId:null,handleStatusChange:()=>{},
  TINGKAT_BADGE:{ringan:'emerald'},TINGKAT_OPTIONS:[{key:'ringan',label:'Ringan'}],EMPTY_CELL:'—',
};
const js=ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS}}).outputText;
const result={};new Function(...Object.keys(values),'exports',js)(...Object.values(values),result);
for(const [kind,url] of [['existing','https://example.test/proof.png'],['pending','blob:pending-proof']]){
  const html=renderToStaticMarkup(result[kind]());
  assert.ok(html.includes(`<a `)&&html.includes(`href="${url}"`)&&html.includes('target="_blank"'),`${kind} thumbnail must open its exact photo URL`);
  assert.ok(html.includes('noopener')&&html.includes('noreferrer'),`${kind} link must isolate opened window`);
  assert.ok(html.includes('Hapus foto')||html.includes('Batalkan foto'),'Delete action remains separate');
}
assert.deepEqual(result.options,[{value:'NEED PROCEED',label:'Need Proceed'},{value:'SOLVED',label:'Solved'}]);
const status=renderToStaticMarkup(result.status({id:1,status:'NEED PROCEED',product:'Mira Top'}));
const tingkat=renderToStaticMarkup(result.tingkat({tingkat:'ringan'}));
assert.ok(!status.includes('h-[19px]'),'Status must not force a height differing from the shared badge');
assert.ok(status.includes('inline-flex')&&tingkat.includes('inline-flex'),'Both cells use centered inline-flex badges');
console.log('Actual complaint UI: persisted/pending photo links, display-only status labels and aligned badge composition — PASS');
