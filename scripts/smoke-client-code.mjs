import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

// Exercise the real dialog handlers with isolated hooks/service boundaries.
// This is not a browser or Radix interaction test and never connects to Supabase.
const result = await build({
  stdin: {
    contents: `
      export { AddClientDialog } from './src/components/Modals/AddClientDialog';
      export { reset, writes, setFailure } from 'client-test-state';
    `,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  external: ['react/jsx-runtime'],
  alias: { '@': `${process.cwd()}/src` },
  plugins: [{
    name: 'isolated-client-boundaries',
    setup(build) {
      build.onResolve({ filter: /^(react|client-test-state|lucide-react|@\/components\/ui\/.*|@\/services\/registerClient)$/ }, (args) => ({ path: args.path, namespace: 'client-test' }));
      build.onLoad({ filter: /.*/, namespace: 'client-test' }, ({ path }) => {
        if (path === 'client-test-state') return { contents: `
          export const writes = [];
          export let failure = null;
          export function setFailure(value) { failure = value; }
          export let hooks = [];
          export let cursor = 0;
          export function reset() { writes.length = 0; hooks = []; cursor = 0; failure = null; }
          export function useState(initial) {
            const index = cursor++;
            if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
            return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; cursor = 0; }];
          }
        ` };
        if (path === 'react') return { contents: `export { useState } from 'client-test-state';` };
        if (path === '@/services/registerClient') return { contents: `
          import { writes, failure } from 'client-test-state';
          export const STATUS_OPTIONS = ['Aktif', 'Non-Aktif'];
          export async function create(payload) { writes.push({op:'create',payload}); return {data:failure ? null : {id:3,...payload},error:failure}; }
          export async function update(id,payload) { writes.push({op:'update',id,payload}); return {error:failure}; }
        ` };
        const names = {
          'lucide-react': ['Loader2'],
          '@/components/ui/button': ['Button'],
          '@/components/ui/input': ['Input'],
          '@/components/ui/label': ['Label'],
          '@/components/ui/dialog': ['Dialog', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle'],
          '@/components/ui/select': ['Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue'],
        }[path];
        return { contents: names.map(name => `export const ${name} = '${name}';`).join('\n') };
      });
    },
  }],
});

// Write-free import retains normal package resolution for React's JSX runtime.
const { AddClientDialog, reset, writes, setFailure } = await import(`data:text/javascript,${encodeURIComponent(result.outputFiles[0].text.replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime'))))}`);

function elements(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}

for (const mode of ['create', 'update']) {
  test(`${mode}: dialog accepts a numbered client code and saves normalized payload`, async () => {
    reset();
    let saved;
    const props = {
      open: true,
      initialName: 'Livou',
      initial: mode === 'update' ? { id: 2, namaClient: 'Cassca', kodeClient: 'CSC', status: 'Non-Aktif', noHp: '123', alamat: 'Bandung' } : null,
      onOpenChange() {},
      onSaved(value) { saved = value; },
    };
    const find = (tree, predicate) => elements(tree).find(predicate);
    const input = find(AddClientDialog(props), node => node.props?.id === 'add-client-kode');
    assert.equal(input.props.maxLength, 10);
    input.props.onChange({ target: { value: mode === 'create' ? '001-lvu' : '002-csc' } });
    const save = find(AddClientDialog(props), node => node.type === 'Button' && node.props.onClick && node.props.variant !== 'outline');
    assert.equal(save.props.disabled, false);
    save.props.onClick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes.length, 1);
    assert.equal(writes[0].op, mode);
    assert.equal(writes[0].payload.kodeClient, mode === 'create' ? '001-LVU' : '002-CSC');
    assert.equal(saved.kodeClient, writes[0].payload.kodeClient);
    if (mode === 'update') {
      assert.equal(writes[0].id, 2);
      assert.equal(writes[0].payload.status, 'Non-Aktif');
      assert.equal(writes[0].payload.noHp, '123');
      assert.equal(writes[0].payload.alamat, 'Bandung');
    }
  });
}

test('invalid client code disables save and its handler cannot write', async () => {
  reset();
  const props = { open: true, initialName: 'Livou', onOpenChange() {} };
  elements(AddClientDialog(props)).find(node => node.props?.id === 'add-client-kode')
    .props.onChange({ target: { value: '001--LVU' } });
  const save = elements(AddClientDialog(props)).find(node => node.type === 'Button' && node.props.variant !== 'outline');
  assert.equal(save.props.disabled, true);
  save.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 0);
});

test('duplicate code error stays visible without reporting a successful save', async () => {
  reset();
  let saved = false;
  const props = {
    open: true,
    initial: { id: 1, namaClient: 'Livou', kodeClient: '001-LVU', status: 'Aktif' },
    onOpenChange() {},
    onSaved() { saved = true; },
  };
  const tree = AddClientDialog(props);
  setFailure(new Error('duplicate key violates register_client_kode_client_key'));
  elements(tree).find(node => node.type === 'Button' && node.props.variant !== 'outline').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved, false);
  assert.ok(elements(AddClientDialog(props)).some(node => node.props?.children === 'Kode client sudah dipakai client lain.'));
});
