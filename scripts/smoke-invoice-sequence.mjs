import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

// Run: node --test scripts/smoke-invoice-sequence.mjs
// Optional source override lets an isolated worktree test an uncommitted checkout.
// No credentials, emitted bundles, real Supabase client, deletion or storage APIs.
const sourceRoot = resolve(process.env.INVOICE_SEQUENCE_SOURCE_ROOT ?? process.cwd());
const result = await build({
  stdin: {
    contents: `
      export { fetchMaxSequenceNumber } from ${JSON.stringify(`${sourceRoot}/src/services/invoices.ts`)};
      export { ensureInvoiceForProductionOrder } from ${JSON.stringify(`${sourceRoot}/src/services/autoInvoice.ts`)};
      export { state, reset } from 'invoice-sequence-test-state';
    `,
    resolveDir: sourceRoot,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  alias: { '@': `${sourceRoot}/src` },
  plugins: [{
    name: 'isolated-invoice-sequence-boundaries',
    setup(build) {
      const boundaries = /^(invoice-sequence-test-state|@\/lib\/supabase|@\/services\/(orderPricing|registerClient|permanentDeletion|invoicePayments|invoicePaymentFiles))$/;
      build.onResolve({ filter: boundaries }, ({ path }) => ({ path, namespace: 'invoice-sequence-test' }));
      build.onLoad({ filter: /.*/, namespace: 'invoice-sequence-test' }, ({ path }) => {
        if (path === 'invoice-sequence-test-state') return { contents: `
          export const state = {};
          export function reset(data, error = null, mode = 'sequence') {
            Object.assign(state, { response: { data, error }, mode, calls: [], inserts: [] });
          }
          export function forbidden(name) { throw new Error('Unexpected boundary call: ' + name); }
        ` };
        if (path === '@/lib/supabase') return { contents: `
          import { state, forbidden } from 'invoice-sequence-test-state';
          export const supabase = {
            async rpc(...args) {
              state.calls.push({ kind: 'rpc', args });
              if (args.length !== 1 || args[0] !== 'permanent_delete_invoice_sequence') forbidden('rpc');
              return state.response;
            },
            from(table) {
              if (state.mode !== 'auto') forbidden('from:' + table);
              let columns;
              let filter;
              let inserted;
              const query = {
                select(value) { columns = value; return query; },
                eq(key, value) { filter = [key, value]; return query; },
                in(key, value) { filter = [key, value]; return query; },
                limit(value) {
                  if (value !== 1) forbidden('limit');
                  return query;
                },
                insert(payload) {
                  if (table !== 'invoices') forbidden('insert:' + table);
                  inserted = { ...payload };
                  state.inserts.push(inserted);
                  state.calls.push({ kind: 'insert', table });
                  return query;
                },
                async single() {
                  if (!inserted) forbidden('single');
                  return { data: { id: 'invoice-fixture', ...inserted }, error: null };
                },
                then(fulfilled, rejected) {
                  return Promise.resolve().then(() => {
                    state.calls.push({ kind: 'read', table, columns, filter });
                    if (table === 'invoices' && columns === '*' && (
                      (filter?.[0] === 'production_order_id' && filter[1] === 'PO-fixture') ||
                      (filter?.[0] === 'work_order_id' && filter[1]?.[0] === 'WO-fixture')
                    )) return { data: [], error: null };
                    if (table === 'work_orders' && filter?.[0] === 'source_order_id' && filter[1] === 'PO-fixture') {
                      if (columns === 'id') return { data: [{ id: 'WO-fixture' }], error: null };
                      if (columns === 'prod_status, quantity') return {
                        data: [{ prod_status: 'FINISHED', quantity: 25 }], error: null,
                      };
                    }
                    forbidden('query:' + table + ':' + columns);
                  }).then(fulfilled, rejected);
                },
              };
              return query;
            },
          };
        ` };
        // Keep the services under test real; isolate unrelated pricing/client setup.
        if (path === '@/services/orderPricing') return { contents: `
          import { state, forbidden } from 'invoice-sequence-test-state';
          export async function fetchOrderPriceByProductionOrderId(id) {
            if (state.mode !== 'auto' || id !== 'PO-fixture') forbidden('pricing');
            return { id: 'price-fixture', complete: true, totalPerPiece: 40000 };
          }
        ` };
        if (path === '@/services/registerClient') return { contents: `
          import { state, forbidden } from 'invoice-sequence-test-state';
          export async function resolveClientByBrand(brand) {
            if (state.mode !== 'auto' || brand !== 'Fixture Brand') forbidden('client');
            return { data: { kodeClient: '001-TEST', namaClient: 'Fixture Client' }, error: null };
          }
        ` };
        const names = {
          '@/services/permanentDeletion': ['preview', 'execute'],
          '@/services/invoicePayments': ['fetchPaymentsByInvoiceId'],
          '@/services/invoicePaymentFiles': ['fetchFilesByPaymentIds', 'removePaymentProofObjects'],
        }[path];
        return { contents: `import { forbidden } from 'invoice-sequence-test-state';\n` +
          names.map(name => `export function ${name}() { forbidden(${JSON.stringify(name)}); }`).join('\n') };
      });
    },
  }],
});

const { fetchMaxSequenceNumber, ensureInvoiceForProductionOrder, state, reset } =
  await import(`data:text/javascript,${encodeURIComponent(result.outputFiles[0].text)}`);

const expectedRpc = [{ kind: 'rpc', args: ['permanent_delete_invoice_sequence'] }];
const fallbackWo = {
  id: 'WO-fixture',
  brand: 'Fixture Brand',
  productNote: 'PO/001-TEST/2026/10/001',
  clientProductionCode: 'CLIENT-FIXTURE',
};

for (const sequence of [0, 47, 1000]) {
  test(`sequence RPC returns validated numeric high-water mark ${sequence} without scanning invoices`, async () => {
    reset(sequence);
    assert.deepEqual(await fetchMaxSequenceNumber(), { sequence, error: null });
    assert.deepEqual(state.calls, expectedRpc);
  });
}

test('sequence RPC error is returned unchanged rather than treated as an empty history', async () => {
  const rpcError = new Error('sequence unavailable (fixture)');
  reset(999, rpcError);
  const result = await fetchMaxSequenceNumber();
  assert.equal(result.sequence, 0);
  assert.equal(result.error, rpcError);
  assert.deepEqual(state.calls, expectedRpc);
});

const malformedResults = [
  ['null', null], ['undefined', undefined], ['numeric string', '47'],
  ['empty array', []], ['object', { sequence: 47 }], ['negative', -1],
  ['fraction', 1.5], ['NaN', NaN], ['infinity', Infinity],
  ['unsafe integer', Number.MAX_SAFE_INTEGER + 1], ['boolean', false],
];
for (const [label, data] of malformedResults) {
  test(`malformed sequence RPC result (${label}) returns an error, not a usable zero`, async () => {
    reset(data);
    const result = await fetchMaxSequenceNumber();
    assert.equal(result.sequence, 0);
    assert.ok(result.error instanceof Error);
    assert.equal(result.error.message, 'Nomor urut invoice tidak valid.');
    assert.deepEqual(state.calls, expectedRpc);
  });
}

test('auto-invoice uses RPC high-water mark + 1 even when mocked invoice history is empty', async () => {
  reset(801, null, 'auto');
  const invoice = await ensureInvoiceForProductionOrder('PO-fixture', fallbackWo);
  assert.equal(state.inserts.length, 1, 'positive control must reach actual createInvoiceAuto');
  assert.equal(invoice.id, 'invoice-fixture');
  assert.match(invoice.invoiceCode, /^INV\/MP\/001-TEST\/\d{6}\/802$/);
  assert.equal(state.inserts[0].invoice_code, invoice.invoiceCode);
  assert.equal(state.inserts[0].production_order_id, 'PO-fixture');
  assert.equal(state.inserts[0].pcs_linked, 25);
  assert.deepEqual(state.calls.filter(call => call.kind === 'rpc'), expectedRpc);
  assert.ok(state.calls.findIndex(call => call.kind === 'rpc') < state.calls.findIndex(call => call.kind === 'insert'));
});

test('auto-invoice propagates sequence RPC error and never inserts an invoice', async () => {
  const rpcError = new Error('sequence unavailable (fixture)');
  reset(null, rpcError, 'auto');
  await assert.rejects(ensureInvoiceForProductionOrder('PO-fixture', fallbackWo), error => error === rpcError);
  assert.deepEqual(state.calls.filter(call => call.kind === 'rpc'), expectedRpc);
  assert.equal(state.inserts.length, 0);
});

test('auto-invoice rejects malformed sequence and never inserts an invoice numbered 001', async () => {
  reset(null, null, 'auto');
  await assert.rejects(ensureInvoiceForProductionOrder('PO-fixture', fallbackWo), /Nomor urut invoice tidak valid\./);
  assert.deepEqual(state.calls.filter(call => call.kind === 'rpc'), expectedRpc);
  assert.equal(state.inserts.length, 0);
});
