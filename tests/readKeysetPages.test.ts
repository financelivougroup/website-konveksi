import test from 'node:test';
import assert from 'node:assert/strict';
import { readCompleteSources, readKeysetPages } from '../src/lib/readKeysetPages.ts';

for (const count of [0, 100, 500, 1205]) {
  test(`keyset reads ${count} records despite a smaller API cap`, async () => {
    const all = Array.from({ length: count }, (_, i) => ({ id: i + 1 }));
    let calls = 0;
    const result = await readKeysetPages(async (after) => {
      calls++;
      return all.filter((r) => after === null || r.id > after).slice(0, 100);
    });
    assert.deepEqual(result, all);
    assert.equal(calls, Math.ceil(count / 100) + 1);
  });
}

test('page two failure rejects rather than returning partial rows', async () => {
  await assert.rejects(readKeysetPages(async (after) => {
    if (after !== null) throw new Error('page failed');
    return [{ id: 'a' }];
  }), /page failed/);
});

test('a repeated cursor fails rather than looping forever', async () => {
  await assert.rejects(readKeysetPages(async () => [{ id: 1 }]), /tidak maju/);
});

test('one failed source rejects the complete refresh', async () => {
  await assert.rejects(readCompleteSources({
    stocks: async () => [{ id: 1 }],
    production: async () => { throw new Error('production denied'); },
  }), /production denied/);
});

test('complete reader preserves source keys and values', async () => {
  assert.deepEqual(await readCompleteSources({
    stocks: async () => [0, 49], production: async () => ['Planning'],
  }), { stocks: [0, 49], production: ['Planning'] });
});
