import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

// Real service + dialog handlers, isolated RPC/auth/fetch and hook/primitive boundaries.
// No database, browser, Radix interaction, or storage request is used in these tests.
const bundle = await build({
  stdin: {
    contents: `
      export * as service from './src/services/permanentDeletion';
      export { PermanentDeleteDialog, PermanentDeleteCleanupStatus } from './src/components/Modals/PermanentDeleteDialog';
      export { canPermanentlyDelete } from './src/lib/permissions';
      export * as state from 'deletion-test-state';
    `,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  alias: { '@': `${process.cwd()}/src` },
  external: ['react/jsx-runtime'],
  define: { 'import.meta.env.VITE_R2_SIGN_ENDPOINT': JSON.stringify('https://cleanup.example.test/') },
  plugins: [{
    name: 'permanent-deletion-isolation',
    setup(build) {
      build.onResolve({ filter: /^(react|deletion-test-state|lucide-react|@\/components\/ui\/.*|@\/lib\/supabase)$/ }, args => ({ path: args.path, namespace: 'deletion-test' }))
      build.onLoad({ filter: /.*/, namespace: 'deletion-test' }, ({ path }) => {
        if (path === 'deletion-test-state') return { contents: `
          export let hooks = [], cursor = 0, effects = [], calls = [], fetches = [];
          export let rpcError = null, cleanupFailure = false, token = 'session-token', blocked = [];
          export let malformed = false, previewDelay = null;
          export function configure(options) {
            if ('rpcError' in options) rpcError = options.rpcError;
            if ('cleanupFailure' in options) cleanupFailure = options.cleanupFailure;
            if ('token' in options) token = options.token;
            if ('blocked' in options) blocked = options.blocked;
            if ('malformed' in options) malformed = options.malformed;
            if ('previewDelay' in options) previewDelay = options.previewDelay;
          }
          export function reset() { hooks = []; cursor = 0; effects = []; calls = []; fetches = []; rpcError = null; cleanupFailure = false; token = 'session-token'; blocked = []; malformed = false; previewDelay = null; }
          export function begin() { cursor = 0; }
          export function useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; }
          export function useRef(value) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: value }; return hooks[i]; }
          export function useId() { return 'confirmation'; }
          export function useCallback(callback) { return callback; }
          export function useEffect(callback, deps) {
            const i = cursor++, prior = hooks[i];
            if (!prior || deps.some((dep, index) => dep !== prior.deps[index])) {
              effects.push(() => { prior?.cleanup?.(); hooks[i] = { deps, cleanup: callback() }; });
            }
          }
          export function flush() { const list = effects; effects = []; list.forEach(effect => effect()); }
          export async function rpc(name, payload) {
            calls.push({ name, payload });
            if (rpcError) return { data: null, error: rpcError };
            if (name === 'permanent_delete_preview') {
              if (previewDelay) await previewDelay;
              return { data: { module: payload.p_module, requestedIds: payload.p_ids, roots: [{ id: 'root', label: 'PO/001-TEST' }], counts: { work_orders: 2 }, fingerprint: 'fingerprint-1', blocked }, error: null };
            }
            if (name === 'permanent_delete_pending_cleanup') return { data: [{ id: 'job-1', createdAt: '2026-10-17', remaining: 2 }], error: null };
            return { data: malformed ? {} : { deletedIds: payload.p_ids ?? [payload.p_id], counts: { work_orders: 2 }, cleanupJobIds: ['job-1'], cleanupPending: 1 }, error: null };
          }
          export async function mockFetch(url, init) {
            fetches.push({ url, init });
            if (cleanupFailure) throw new Error('offline');
            return { ok: true, json: async () => ({ completed: ['job-1'], pending: [], errors: [] }) };
          }
        ` }
        if (path === 'react') return { contents: `export { useState, useRef, useId, useCallback, useEffect } from 'deletion-test-state';` }
        if (path === '@/lib/supabase') return { contents: `
          import { rpc, token } from 'deletion-test-state';
          export const supabase = { rpc, auth: { getSession: async () => ({ data: { session: token ? {access_token:token} : null }, error: null }) } };
        ` }
        const names = {
          'lucide-react': ['Loader2'],
          '@/components/ui/button': ['Button'],
          '@/components/ui/input': ['Input'],
          '@/components/ui/label': ['Label'],
          '@/components/ui/alert-dialog': ['AlertDialog', 'AlertDialogContent', 'AlertDialogDescription', 'AlertDialogFooter', 'AlertDialogHeader', 'AlertDialogTitle'],
        }[path]
        return { contents: names.map(name => `export const ${name} = '${name}';`).join('\n') }
      })
    },
  }],
})
const code = bundle.outputFiles[0].text.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
const { service, state, PermanentDeleteDialog, PermanentDeleteCleanupStatus, canPermanentlyDelete } = await import(`data:text/javascript,${encodeURIComponent(code)}`)
const nativeFetch = globalThis.fetch
const tick = () => new Promise(resolve => setImmediate(resolve))
function reset() { state.reset(); globalThis.fetch = state.mockFetch }
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}
function mount(props) {
  return () => {
    state.begin()
    const session = PermanentDeleteDialog(props)
    return session ? session.type(session.props) : null
  }
}
const button = (tree, label) => nodes(tree).find(node => node.type === 'Button' && node.props.children === label)
const destroyButton = tree => nodes(tree).find(node => node.type === 'Button' && node.props.variant === 'destructive')
const input = tree => nodes(tree).find(node => node.type === 'Input')

test.after(() => { globalThis.fetch = nativeFetch })

test('permission is owner/finance only and unknown/missing roles fail closed', () => {
  for (const role of ['owner', 'finance']) assert.equal(canPermanentlyDelete(role), true)
  for (const role of ['inventory', 'supervisor', 'staff', 'admin', '', null, undefined]) assert.equal(canPermanentlyDelete(role), false)
})

test('preview deduplicates immutable selection and sends exact RPC arguments', async () => {
  reset()
  const ids = Object.freeze(['wo-1', 'wo-1', 'wo-2'])
  const result = await service.preview('work_orders', ids)
  assert.equal(result.error, null)
  assert.deepEqual(state.calls, [{ name: 'permanent_delete_preview', payload: { p_module: 'work_orders', p_ids: ['wo-1', 'wo-2'] } }])
  assert.deepEqual(ids, ['wo-1', 'wo-1', 'wo-2'])
  assert.equal(state.fetches.length, 0)
})

test('invalid module/empty IDs/fingerprint never call RPC or cleanup', async () => {
  reset()
  for (const [module, ids] of [['profiles', ['1']], ['work_orders', []], ['work_orders', [' ']]]) {
    assert.ok((await service.preview(module, ids)).error)
  }
  assert.ok((await service.execute('work_orders', ['wo-1'], '')).error)
  assert.equal(state.calls.length, 0)
  assert.equal(state.fetches.length, 0)
})

test('execute sends fingerprint then cleans durable jobs using bearer and job IDs only', async () => {
  reset()
  const result = await service.execute('work_orders', ['wo-1', 'wo-1'], 'fp')
  assert.deepEqual(state.calls[0], { name: 'permanent_delete_execute', payload: { p_module: 'work_orders', p_ids: ['wo-1'], p_fingerprint: 'fp' } })
  assert.equal(state.fetches[0].url, 'https://cleanup.example.test/cleanup')
  assert.equal(state.fetches[0].init.headers.Authorization, 'Bearer session-token')
  assert.deepEqual(JSON.parse(state.fetches[0].init.body), { jobIds: ['job-1'] })
  assert.equal(result.data.cleanupPending, 0)
  assert.equal(result.data.cleanupError, null)
})

test('database failure prevents any cleanup, malformed success is not accepted', async () => {
  reset()
  state.configure({ rpcError: { message: 'DELETE_PREVIEW_STALE' } })
  assert.equal((await service.execute('work_orders', ['wo-1'], 'fp')).error.message, 'DELETE_PREVIEW_STALE')
  assert.equal(state.fetches.length, 0)
  state.configure({ rpcError: null, malformed: true })
  assert.ok((await service.execute('work_orders', ['wo-1'], 'fp')).error)
  assert.equal(state.fetches.length, 0)
})

test('cleanup offline/no session remains nonfatal after committed deletion', async () => {
  for (const options of [{ cleanupFailure: true }, { token: null }]) {
    reset()
    state.configure(options)
    const result = await service.execute('work_orders', ['wo-1'], 'fp')
    assert.equal(result.error, null)
    assert.deepEqual(result.data.deletedIds, ['wo-1'])
    assert.equal(result.data.cleanupPending, 1)
    assert.ok(result.data.cleanupError)
  }
})

test('unacknowledged and failed cleanup jobs remain pending', async () => {
  reset()
  const result = await service.retryCleanup(['job-1', 'unknown', 'job-1'])
  assert.deepEqual(result.data.completed, ['job-1'])
  assert.deepEqual(result.data.pending, ['unknown'])
  assert.deepEqual(JSON.parse(state.fetches[0].init.body), { jobIds: ['job-1', 'unknown'] })
})

test('cleanup batches more than 50 jobs and preserves progress when a batch fails', async () => {
  reset()
  const ids = Array.from({ length: 123 }, (_, i) => `job-${i + 1}`)
  const batches = []
  globalThis.fetch = async (_url, init) => {
    const batch = JSON.parse(init.body).jobIds
    batches.push(batch)
    if (batches.length === 2) throw new Error('offline')
    return { ok: true, json: async () => ({ completed: batch, pending: [], errors: [] }) }
  }
  const result = await service.retryCleanup(ids)
  assert.equal(result.error, null)
  assert.deepEqual(batches.map(batch => batch.length), [50, 50, 23])
  assert.equal(result.data.completed.length, 73)
  assert.deepEqual(result.data.pending, ids.slice(50, 100))
  assert.equal(result.data.errors.length, 50)
})

test('attachment deletion rejects malformed success before cleanup and preserves committed cleanup warning', async () => {
  reset()
  state.configure({ malformed: true })
  assert.ok((await service.removeAttachment('complain_files', 'proof-1')).error)
  assert.equal(state.fetches.length, 0)
  state.configure({ malformed: false, cleanupFailure: true })
  const result = await service.removeAttachment('complain_files', 'proof-1')
  assert.equal(result.error, null)
  assert.ok(result.cleanupError)
  assert.deepEqual(state.calls[1], { name: 'permanent_delete_attachment', payload: { p_module: 'complain_files', p_id: 'proof-1' } })
})

test('pending cleanup fetch is a parameterless RPC', async () => {
  reset()
  const result = await service.fetchPendingCleanup()
  assert.equal(result.data[0].remaining, 2)
  assert.deepEqual(state.calls, [{ name: 'permanent_delete_pending_cleanup', payload: undefined }])
})

test('dialog does not execute on mount, snapshots module/selection, and enforces exact typed confirmation', async () => {
  reset()
  let deleted, closed
  const props = { open: true, module: 'work_orders', ids: ['wo-1'], onOpenChange: value => { closed = value }, onDeleted: value => { deleted = value } }
  const render = mount(props)
  assert.equal(destroyButton(render()).props.disabled, true)
  state.flush(); await tick()
  assert.equal(state.calls.length, 1)
  props.ids = ['wo-2']; props.module = 'invoices'
  input(render()).props.onChange({ target: { value: 'hapus' } })
  assert.equal(destroyButton(render()).props.disabled, true)
  destroyButton(render()).props.onClick(); await tick()
  assert.equal(state.calls.length, 1)
  input(render()).props.onChange({ target: { value: 'HAPUS' } })
  const action = destroyButton(render())
  assert.equal(action.props.disabled, false)
  action.props.onClick(); action.props.onClick(); await tick()
  assert.equal(state.calls.filter(call => call.name === 'permanent_delete_execute').length, 1)
  assert.deepEqual(state.calls[1].payload.p_ids, ['wo-1'])
  assert.equal(state.calls[1].payload.p_module, 'work_orders')
  assert.equal(closed, false)
  assert.deepEqual(deleted.deletedIds, ['wo-1'])
})

test('blocked preview cannot execute even with HAPUS', async () => {
  reset(); state.configure({ blocked: ['Data terkait tidak mendukung penghapusan.'] })
  const render = mount({ open: true, module: 'work_orders', ids: ['wo-1'], onOpenChange() {}, onDeleted() { assert.fail() } })
  render(); state.flush(); await tick()
  input(render()).props.onChange({ target: { value: 'HAPUS' } })
  assert.equal(destroyButton(render()).props.disabled, true)
  destroyButton(render()).props.onClick(); await tick()
  assert.equal(state.calls.length, 1)
})

test('stale execute keeps error open, clears confirmation, and requires a new preview', async () => {
  reset()
  let closed = false
  const render = mount({ open: true, module: 'work_orders', ids: ['wo-1'], onOpenChange() { closed = true }, onDeleted() { assert.fail() } })
  render(); state.flush(); await tick()
  input(render()).props.onChange({ target: { value: 'HAPUS' } })
  state.configure({ rpcError: { message: 'DELETE_PREVIEW_STALE' } })
  destroyButton(render()).props.onClick(); await tick()
  assert.equal(closed, false)
  assert.equal(input(render()), undefined)
  assert.equal(destroyButton(render()).props.disabled, true)
  assert.ok(nodes(render()).some(node => node.props?.role === 'alert' && node.props.children.includes('DELETE_PREVIEW_STALE')))
  state.configure({ rpcError: null })
  button(render(), 'Muat ulang pratinjau').props.onClick(); await tick()
  assert.equal(input(render()).props.value, '')
  assert.equal(destroyButton(render()).props.disabled, true)
})

test('dialog success callback carries cleanup warning and still closes', async () => {
  reset(); state.configure({ cleanupFailure: true })
  let result, closed
  const render = mount({ open: true, module: 'work_orders', ids: ['wo-1'], onOpenChange(value) { closed = value }, onDeleted(value) { result = value } })
  render(); state.flush(); await tick()
  input(render()).props.onChange({ target: { value: 'HAPUS' } })
  destroyButton(render()).props.onClick(); await tick()
  assert.equal(closed, false)
  assert.equal(result.cleanupPending, 1)
  assert.ok(result.cleanupError)
})

test('cleanup status loads and retries jobs without current selected rows', async () => {
  reset()
  const render = () => { state.begin(); return PermanentDeleteCleanupStatus({}) }
  render(); state.flush(); await tick()
  button(render(), 'Coba bersihkan lampiran').props.onClick(); await tick()
  assert.equal(state.calls[0].name, 'permanent_delete_pending_cleanup')
  assert.deepEqual(JSON.parse(state.fetches[0].init.body), { jobIds: ['job-1'] })
  assert.equal(state.calls.filter(call => call.name === 'permanent_delete_execute').length, 0)
})
