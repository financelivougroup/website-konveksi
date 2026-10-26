import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPersen, formatPcs } from '../src/components/KPI/kpiFormat.ts';

test('formatPersen mempertahankan persen progres tanpa batas atas', () => {
  assert.equal(formatPersen(0.73), '73%');
  assert.equal(formatPersen(1), '100%');
  assert.equal(formatPersen(1.11), '111%');
});

test('formatPersen menampilkan satu desimal untuk progres di bawah sepuluh persen', () => {
  assert.equal(formatPersen(0.073), '7.3%');
});

test('formatPersen menandai angka bukan-finite', () => {
  assert.equal(formatPersen(Number.NaN), '—');
  assert.equal(formatPersen(Number.POSITIVE_INFINITY), '—');
});

test('formatPcs memakai pembulatan dan pemisah ribuan Indonesia', () => {
  assert.equal(formatPcs(1234), '1.234');
  assert.equal(formatPcs(12.7), '13');
  assert.equal(formatPcs(Number.NaN), '0');
});
