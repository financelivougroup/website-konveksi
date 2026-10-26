import test from 'node:test';
import assert from 'node:assert/strict';
import { productionBatchNumber } from '../src/lib/productionBatch.ts';

test('client repeat 00 is batch 1 and repeat 01 is batch 2', () => {
  assert.equal(productionBatchNumber('PDFF_LVU-TOP-02_B-00_PRDN'), 1);
  assert.equal(productionBatchNumber('PDFF_LVU-TOP-02_B-01_PRDN'), 2);
  assert.equal(productionBatchNumber('PDFF_LVU-TOP-02_B-09_PRDN'), 10);
});

test('reads only the B segment, not product or internal production sequence', () => {
  assert.equal(productionBatchNumber('PDFF_LVU-TOP-99_B-02_PRDN'), 3);
  assert.equal(productionBatchNumber('PO/001-LVU/2026/10/002'), null);
  assert.equal(productionBatchNumber('PDFF_LVU-TOP-02_PRDN'), null);
});

test('supports trimmed and lowercase batch segments without guessing malformed codes', () => {
  assert.equal(productionBatchNumber(' pdff_lvu-top-02_b-01_prdn '), 2);
  for (const value of [null, undefined, '', 'B-', 'B--1', 'B-1.5', 'AB-01', 'B-01X', 'B-00_B-01', 'B-9007199254740991']) {
    assert.equal(productionBatchNumber(value), null, String(value));
  }
});
