// Exercises the actual DataTable selection bridge and Complain page handlers, no DB writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function initializer(file, name, callback = false) {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
      found = callback ? node.initializer.arguments[0].getText(ast) : node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `Missing actual handler ${name}`);
  return found;
}
const page = 'src/pages/ComplainPenaltiPage.tsx';
const toggle = initializer(page, 'handleToggleRow');
const bulkDelete = initializer(page, 'handleBulkDelete');
const bridge = initializer('src/components/Table/DataTable.tsx', 'handleRowSelectionChange', true);
const source = `
let selectedRows = new Set();
const items = [{id:1}, {id:2}], data = items;
let deleteIds = [], open = false;
const canDelete = true;
const setSelectedRows = updater => { selectedRows = updater(selectedRows); };
const setDeleteIds = ids => { deleteIds = ids; };
const setDeleteDialogOpen = value => { open = value; };
const toggleSelection = ${toggle};
const handleBulkDelete = ${bulkDelete};
function select(next) { const effectiveSelection = selectedRows; const rowSelection = Object.fromEntries([...selectedRows].map(id => [String(id),true])); (${bridge})(next); }
select({'1':true}); handleBulkDelete();
exports.single = {ids:deleteIds,open};
select({'1':true,'2':true}); handleBulkDelete();
exports.multiple = {ids:deleteIds,open};
select({'2':true}); handleBulkDelete();
exports.remaining = {ids:deleteIds,open};
`;
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const result = {};
new Function('exports', js)(result);
assert.deepEqual(result.single, {ids:['1'],open:true}, 'Checked numeric complaint ID must reach permanent-delete preview');
assert.deepEqual(result.multiple, {ids:['1','2'],open:true}, 'Select-all must include both complaint IDs');
assert.deepEqual(result.remaining, {ids:['2'],open:true}, 'Unchecking a row must remove it from deletion');
console.log('Complain permanent-delete selection: single, multiple, uncheck — PASS');
