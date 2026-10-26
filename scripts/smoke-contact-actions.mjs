// Exercises each tab's actual action-row JSX without Auth/DB or a browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

for (const [file, label] of [['KaryawanTab','Karyawan'],['ClientTab','Client'],['VendorTab','Vendor']]) {
  const path = `src/components/Contact/${file}.tsx`;
  const source = readFileSync(path, 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let header;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'div'
      && node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(ast) === 'tabs')) {
      const text = node.getText(ast);
      if (text.includes('Refresh') && text.includes('Tambah')) header = text;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(header, `${label}: tab navigation and actions must share the same row`);
  const js = ts.transpileModule(`exports.row=()=>(${header})`, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText;
  let refreshed=0, created=0;
  const bindings = {
    React: {createElement}, tabs:createElement('nav', {'aria-label':'Pilih master data Contact'}, 'Karyawan / Client / Vendor'),
    refresh:()=>{refreshed++;}, openCreate:()=>{created++;},
    setEditTarget:()=>{}, setDialogOpen:()=>{created++;}, canManage:true,
    RefreshCw:()=>null, Plus:()=>null,
  };
  const result={};
  new Function(...Object.keys(bindings),'exports',js)(...Object.values(bindings),result);
  const row=result.row();
  assert.ok(row.props.className.includes('items-center') && row.props.className.includes('justify-between'));
  const children=row.props.children.filter(child=>child&&typeof child==='object');
  assert.equal(children[0].type, 'nav');
  const buttons=children[1].props.children.flat().filter(child=>child&&child.type==='button');
  assert.equal(buttons.length,2);
  buttons[0].props.onClick(); buttons[1].props.onClick();
  assert.equal(refreshed,1); assert.equal(created,1);
  const html=renderToStaticMarkup(row);
  assert.ok(html.includes(`Tambah ${label}`));
  assert.equal((html.match(/<nav\b/g)||[]).length,1);
  assert.match(source, /Loading [^<]+/);
  console.log(`${label}: tabs left, actions right, refresh/create callbacks preserved — PASS`);
}
