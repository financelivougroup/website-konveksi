import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Worker CORS config covers both local hostnames and the deployed app without wildcards', () => {
  const config = readFileSync(new URL('../worker/wrangler.toml', import.meta.url), 'utf8');
  const origins = config.match(/^ALLOWED_ORIGINS\s*=\s*"([^"]*)"/m)?.[1].split(',');
  assert.ok(origins, 'Explicit Worker origins must be configured');
  for (const origin of [
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'https://konveksi.livougroup.com',
  ]) assert.ok(origins.includes(origin), `Missing upload origin: ${origin}`);
  assert.equal(origins.includes('*'), false);
  assert.ok(origins.every(origin => new URL(origin).origin === origin));
});
