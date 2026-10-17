import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.ts';
import type { Env } from '../worker/src/env.ts';

type TestGlobals = typeof globalThis & {
  workerTestVerify: (token: string, options: unknown) => Promise<unknown>;
  workerTestR2: (url: string, options: RequestInit) => Promise<Response>;
  workerTestSign: (url: string, options: unknown) => Promise<{ url: string }>;
};
const globals = globalThis as TestGlobals;
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const userId = '10000000-0000-4000-8000-000000000001';
const jobId = '20000000-0000-4000-8000-000000000001';
const job2 = '20000000-0000-4000-8000-000000000002';
const leaseToken = '30000000-0000-4000-8000-000000000001';
const env: Env = {
  SUPABASE_URL: 'https://supabase.example.test', SUPABASE_SERVICE_ROLE_KEY: 'server-key-test-only',
  R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET: 'test',
  SIGN_EXPIRY_SECONDS: '900', ALLOWED_ORIGINS: 'https://dashboard.example.test',
};
const file = (path: string, backend: 'r2' | 'supabase' = 'r2') => ({ bucket: 'product-photos', path, backend });
const manifest = (files = [file('canonical/photo.jpg')]) => [{ id: jobId, leaseToken, files }];
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function setup() {
  const calls: Array<{ url: string; options: RequestInit; body: Record<string, unknown> }> = [];
  const r2: string[] = [];
  const signs: string[] = [];
  let rpcHandler = (name: string): Response => name === 'permanent_delete_claim_cleanup' ? json(manifest()) : json(true);
  let r2Handler: (url: string) => Promise<Response> = async () => new Response(null, { status: 204 });
  globals.workerTestVerify = async (token, options) => {
    assert.equal(token, 'valid-session');
    assert.deepEqual(options, { issuer: `${env.SUPABASE_URL}/auth/v1`, audience: 'authenticated' });
    return { payload: { sub: userId, role: 'staff' } };
  };
  globals.workerTestR2 = async (url, options) => { assert.equal(options.method, 'DELETE'); r2.push(url); return r2Handler(url); };
  globals.workerTestSign = async (url) => { signs.push(url); return { url }; };
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    assert.ok(url.startsWith(`${env.SUPABASE_URL}/`), 'Only configured Supabase origin may be fetched');
    const headers = new Headers(options.headers);
    assert.equal(headers.get('apikey'), env.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(headers.get('Authorization'), `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body as string);
    calls.push({ url, options, body });
    if (url.includes('/rest/v1/rpc/')) return rpcHandler(url.split('/').at(-1)!);
    return json([]);
  };
  return { calls, r2, signs, setRpc: (handler: typeof rpcHandler) => { rpcHandler = handler; }, setR2: (handler: typeof r2Handler) => { r2Handler = handler; } };
}
function request(route: string, body: unknown, bindings = env, token = 'valid-session') {
  return worker.fetch(new Request(`https://worker.example.test${route}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://dashboard.example.test', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), bindings);
}

test('cleanup uses verified JWT identity and server manifest, never caller role', async () => {
  const h = setup();
  const res = await request('/cleanup', { jobIds: [jobId] });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://dashboard.example.test');
  assert.deepEqual(await res.json(), { completed: [jobId], pending: [], errors: [] });
  assert.deepEqual(h.calls[0].body, { p_job_ids: [jobId], p_user_id: userId });
  assert.deepEqual(h.r2, ['https://test.r2.cloudflarestorage.com/test/product-photos/canonical/photo.jpg']);
  assert.deepEqual(h.calls[1].body, { p_job_id: jobId, p_lease_token: leaseToken, p_deleted_files: [file('canonical/photo.jpg')], p_error: null });
});

test('cleanup rejects spoofed path, user, role and backend input before RPC/storage', async () => {
  const h = setup();
  for (const extra of [{ paths: ['other.jpg'] }, { userId }, { role: 'owner' }, { backend: 'supabase' }, { files: [file('other')] }]) {
    assert.equal((await request('/cleanup', { jobIds: [jobId], ...extra })).status, 400);
  }
  assert.equal(h.calls.length, 0); assert.equal(h.r2.length, 0);
});

test('cleanup bounds empty, malformed, oversized and non-UUID jobs', async () => {
  const h = setup();
  for (const body of [{ jobIds: [] }, {}, { jobIds: ['not-an-id'] }, { jobIds: Array(51).fill(jobId) }, [], null, { jobIds: [jobId], padding: 'x'.repeat(40_000) }]) {
    assert.equal((await request('/cleanup', body)).status, 400);
  }
  const malformed = await worker.fetch(new Request('https://worker.example.test/cleanup', { method: 'POST', headers: { Authorization: 'Bearer valid-session' }, body: '{' }), env);
  assert.equal(malformed.status, 400); assert.equal(h.calls.length, 0);
});

test('cleanup deduplicates IDs but rejects more than 50 raw IDs', async () => {
  const h = setup();
  assert.equal((await request('/cleanup', { jobIds: [jobId, jobId.toUpperCase(), jobId] })).status, 200);
  assert.deepEqual(h.calls[0].body.p_job_ids, [jobId]);
});

test('denied claim produces no object mutation or acknowledgement', async () => {
  const h = setup(); h.setRpc(() => json({ secret: env.SUPABASE_SERVICE_ROLE_KEY }, 403));
  const res = await request('/cleanup', { jobIds: [jobId] });
  assert.equal(res.status, 403); assert.equal(h.r2.length, 0); assert.equal(h.calls.length, 1);
  assert.ok(!(await res.text()).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});

test('failed claim has no ack and never reports success', async () => {
  const h = setup(); h.setRpc(() => json('private upstream error', 500));
  const res = await request('/cleanup', { jobIds: [jobId] });
  assert.equal(res.status, 502); assert.equal(h.r2.length, 0); assert.equal(h.calls.length, 1);
});

test('entire server manifest is validated before any deletion', async () => {
  const h = setup();
  for (const invalid of [
    [{ id: job2, leaseToken, files: [file('good')] }],
    manifest([file('../bad')]), manifest([file('folder/%2e%2e/bad')]), manifest([file('photo?delete=x')]),
    manifest([{ ...file('good'), bucket: 'unknown' }]), manifest([{ ...file('good'), backend: 'external' }]),
    [...manifest(), { id: jobId, leaseToken, files: [] }],
    [{ id: jobId, leaseToken: '', files: [] }],
    [{ id: jobId, leaseToken, files: [file('good'), file('/bad')] }],
  ]) {
    h.setRpc(() => json(invalid));
    assert.equal((await request('/cleanup', { jobIds: [jobId] })).status, 502);
  }
  assert.equal(h.r2.length, 0); assert.ok(h.calls.every((call) => call.url.endsWith('permanent_delete_claim_cleanup')));
});

test('R2 cleanup preserves exact spaces and unicode in server manifest paths', async () => {
  const h = setup(); const path = 'folder/foto é .jpg ';
  h.setRpc((name) => name === 'permanent_delete_claim_cleanup' ? json(manifest([file(path)])) : json(true));
  assert.equal((await request('/cleanup', { jobIds: [jobId] })).status, 200);
  assert.equal(h.r2[0], 'https://test.r2.cloudflarestorage.com/test/product-photos/folder/foto%20%C3%A9%20.jpg%20');
  assert.deepEqual(h.calls.at(-1)!.body.p_deleted_files, [file(path)]);
});

test('partial failure acknowledges only deleted descriptors, including legacy files', async () => {
  const h = setup();
  const files = [file('good.jpg'), file('failed.jpg'), file('legacy.jpg', 'supabase')];
  h.setRpc((name) => name === 'permanent_delete_claim_cleanup' ? json(manifest(files)) : json(true));
  h.setR2(async (url) => { if (url.includes('failed')) throw new Error(`secret ${env.SUPABASE_SERVICE_ROLE_KEY}`); return new Response(null, { status: 204 }); });
  const res = await request('/cleanup', { jobIds: [jobId] });
  const result = await res.json() as { completed: string[]; pending: string[]; errors: unknown[] };
  assert.deepEqual(result.completed, []); assert.deepEqual(result.pending, [jobId]); assert.equal(result.errors.length, 1);
  assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SERVICE_ROLE_KEY));
  const legacy = h.calls.find((call) => call.url.includes('/storage/'))!;
  assert.equal(legacy.url, `${env.SUPABASE_URL}/storage/v1/object/product-photos`);
  assert.deepEqual(legacy.body, { prefixes: ['legacy.jpg'] });
  const ack = h.calls.at(-1)!;
  assert.deepEqual(ack.body.p_deleted_files, [files[0], files[2]]); assert.equal(typeof ack.body.p_error, 'string');
});

test('missing objects on both backends are successful and acknowledged', async () => {
  const h = setup(); const files = [file('missing.jpg'), file('legacy-missing.jpg', 'supabase')];
  h.setRpc((name) => name === 'permanent_delete_claim_cleanup' ? json(manifest(files)) : json(true));
  h.setR2(async () => new Response(null, { status: 404 }));
  const underlying = globalThis.fetch;
  globalThis.fetch = async (input, options) => String(input).includes('/storage/') ? new Response(null, { status: 404 }) : underlying(input, options);
  assert.deepEqual(await (await request('/cleanup', { jobIds: [jobId] })).json(), { completed: [jobId], pending: [], errors: [] });
  assert.deepEqual(h.calls.at(-1)!.body.p_deleted_files, files);
});

test('123-file job uses sequential chunks <=50 and a single final lease acknowledgement', async () => {
  const h = setup(); const files = Array.from({ length: 123 }, (_, i) => file(`photo-${i}.jpg`));
  h.setRpc((name) => name === 'permanent_delete_claim_cleanup' ? json(manifest(files)) : json(true));
  let active = 0; let maxActive = 0;
  h.setR2(async () => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setImmediate(resolve)); active--;
    assert.equal(h.calls.length, 1, 'Lease ack must not occur during storage deletes');
    return new Response(null, { status: 204 });
  });
  assert.deepEqual(await (await request('/cleanup', { jobIds: [jobId] })).json(), { completed: [jobId], pending: [], errors: [] });
  assert.equal(h.r2.length, 123); assert.equal(maxActive, 50); assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1].body.p_deleted_files, files);
});

test('ack false, HTTP failure, or network failure leaves job pending with sanitized error', async () => {
  for (const mode of ['false', 'http', 'network']) {
    const h = setup();
    h.setRpc((name) => {
      if (name === 'permanent_delete_claim_cleanup') return json(manifest());
      if (mode === 'network') throw new Error(env.SUPABASE_SERVICE_ROLE_KEY);
      return mode === 'http' ? json(env.SUPABASE_SERVICE_ROLE_KEY, 500) : json(false);
    });
    const result = await (await request('/cleanup', { jobIds: [jobId] })).json() as { completed: string[]; pending: string[]; errors: unknown[] };
    assert.deepEqual(result.completed, []); assert.deepEqual(result.pending, [jobId]); assert.equal(result.errors.length, 1);
    assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SERVICE_ROLE_KEY));
  }
});

test('absent manifests stay pending; authoritative empty job still requires ack', async () => {
  const h = setup(); h.setRpc((name) => name === 'permanent_delete_claim_cleanup' ? json(manifest([])) : json(true));
  assert.deepEqual(await (await request('/cleanup', { jobIds: [jobId, job2] })).json(), { completed: [jobId], pending: [job2], errors: [] });
  assert.equal(h.r2.length, 0); assert.equal(h.calls.length, 2);
});

test('both delete routes fail closed when service secret is missing', async () => {
  const h = setup(); const bindings = { ...env, SUPABASE_SERVICE_ROLE_KEY: '' };
  for (const [route, body] of [['/cleanup', { jobIds: [jobId] }], ['/sign/delete', { logicalBucket: 'product-photos', paths: ['safe.jpg'] }]] as const) {
    const res = await request(route, body, bindings); assert.equal(res.status, 503);
    assert.ok((await res.text()).includes('SUPABASE_SERVICE_ROLE_KEY'));
  }
  assert.equal(h.r2.length, 0); assert.equal(h.calls.length, 0);
});

test('ordinary deletion requires boolean DB authorization before any delete', async () => {
  const h = setup();
  for (const denied of [false, null, 'true', { allowed: true }]) {
    h.setRpc(() => json(denied));
    assert.equal((await request('/sign/delete', { logicalBucket: 'invoice-payment-proofs', paths: ['evidence.jpg'], userId: job2, role: 'owner' })).status, 403);
  }
  assert.equal(h.r2.length, 0);
  assert.deepEqual(h.calls[0].body, { p_user_id: userId, p_bucket: 'invoice-payment-proofs', p_paths: ['evidence.jpg'] });
  h.setRpc(() => json(true));
  const res = await request('/sign/delete', { logicalBucket: 'product-photos', paths: ['unused.jpg'] });
  assert.deepEqual(await res.json(), { deleted: 1, errors: [] }); assert.equal(h.r2.length, 1);
});

test('JWT absent, failed verification, or malformed verified sub cannot call database or storage', async () => {
  const h = setup();
  assert.equal((await request('/cleanup', { jobIds: [jobId] }, env, '')).status, 401);
  for (const verify of [async () => { throw new Error('invalid'); }, async () => ({ payload: { sub: 'spoofed' } })]) {
    globals.workerTestVerify = verify;
    assert.equal((await request('/cleanup', { jobIds: [jobId] })).status, 401);
  }
  assert.equal(h.calls.length, 0); assert.equal(h.r2.length, 0);
});

test('legacy deletion failure is pending and never enters deleted-files acknowledgement', async () => {
  const h = setup(); const files = [file('legacy.jpg', 'supabase')];
  h.setRpc((name) => name === 'permanent_delete_claim_cleanup' ? json(manifest(files)) : json(true));
  const underlying = globalThis.fetch;
  globalThis.fetch = async (input, options) => String(input).includes('/storage/') ? json(env.SUPABASE_SERVICE_ROLE_KEY, 500) : underlying(input, options);
  const result = await (await request('/cleanup', { jobIds: [jobId] })).json() as { completed: string[]; pending: string[]; errors: unknown[] };
  assert.deepEqual(result.completed, []); assert.deepEqual(result.pending, [jobId]); assert.equal(result.errors.length, 1);
  assert.deepEqual(h.calls.at(-1)!.body.p_deleted_files, []);
  assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});

test('one job failure does not prevent independent job acknowledgement', async () => {
  const h = setup();
  h.setRpc((name) => name === 'permanent_delete_claim_cleanup'
    ? json([...manifest([file('failed.jpg')]), { id: job2, leaseToken, files: [file('success.jpg')] }]) : json(true));
  h.setR2(async (url) => new Response(null, { status: url.includes('failed') ? 503 : 204 }));
  const result = await (await request('/cleanup', { jobIds: [jobId, job2] })).json() as { completed: string[]; pending: string[]; errors: Array<{ id: string }> };
  assert.deepEqual(result.completed, [job2]); assert.deepEqual(result.pending, [jobId]); assert.equal(result.errors[0].id, jobId);
  assert.equal(h.calls.length, 3);
});

test('ordinary delete authorization failure cannot bypass to storage', async () => {
  const h = setup(); h.setRpc(() => json('internal failure', 500));
  assert.equal((await request('/sign/delete', { logicalBucket: 'product-photos', paths: ['safe.jpg'] })).status, 502);
  assert.equal(h.r2.length, 0); assert.equal(h.calls.length, 1);
});

test('preflight preserves existing origin policy without authentication or database calls', async () => {
  const h = setup();
  const allowed = await worker.fetch(new Request('https://worker.example.test/cleanup', { method: 'OPTIONS', headers: { Origin: 'https://dashboard.example.test' } }), env);
  assert.equal(allowed.status, 204); assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://dashboard.example.test');
  const denied = await worker.fetch(new Request('https://worker.example.test/cleanup', { method: 'OPTIONS', headers: { Origin: 'https://other.example.test' } }), env);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null); assert.equal(h.calls.length, 0);
});

test('upload and health remain available without delete-only secret', async () => {
  const h = setup();
  const res = await request('/sign/upload', { logicalBucket: 'product-photos', path: 'new.jpg', contentType: 'image/jpeg', size: 123 }, { ...env, SUPABASE_SERVICE_ROLE_KEY: '' });
  assert.equal(res.status, 200); assert.equal(h.signs.length, 1); assert.equal(h.calls.length, 0);
  const health = await worker.fetch(new Request('https://worker.example.test/health'), env);
  assert.equal(health.status, 200);
});
