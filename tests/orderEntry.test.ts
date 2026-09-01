import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyOrderPriceComponents,
  hasDuplicateVariations,
  isOrderPriceComplete,
  mergeOrderPriceComponents,
  normalizeProductionCode,
  totalOrderPrice,
  totalOrderQuantity,
  variationCombinationKey,
} from '../src/lib/orderEntry.ts';

test('normalizes a production code for case-insensitive uniqueness', () => {
  assert.equal(normalizeProductionCode('  B-24-A  '), 'b-24-a');
});

test('detects duplicate color-size combinations after trimming and case folding', () => {
  assert.equal(hasDuplicateVariations([
    { color: 'Navy', size: ' M ' },
    { color: ' navy ', size: 'm' },
  ]), true);
  assert.equal(variationCombinationKey({ color: 'Navy', size: 'M' }), 'navy::m');
});

test('does not treat a different size as a duplicate variation', () => {
  assert.equal(hasDuplicateVariations([
    { color: 'Navy', size: 'M' },
    { color: 'Navy', size: 'L' },
  ]), false);
});

test('aggregates quantity across all variations', () => {
  assert.equal(totalOrderQuantity([
    { quantity: 12 },
    { quantity: 8 },
    { quantity: 5 },
  ]), 25);
});

test('creates the eight fixed price components and permits zero-valued components', () => {
  const components = emptyOrderPriceComponents();
  assert.equal(components.length, 8);

  components[0].value = 5_000;
  assert.equal(isOrderPriceComplete(components), true);
  assert.equal(totalOrderPrice(components), 5_000);
});

test('marks an all-zero or missing-key price set incomplete', () => {
  const components = emptyOrderPriceComponents();
  assert.equal(isOrderPriceComplete(components), false);
  assert.equal(isOrderPriceComplete(components.slice(0, 7)), false);
});

test('merges saved values into the canonical component order', () => {
  const merged = mergeOrderPriceComponents([
    { key: 'margin', label: 'Margin', value: 2_500, sortOrder: 0 },
    { key: 'jahit', label: 'Jahit lama', value: 4_000, sortOrder: 1 },
  ]);

  assert.equal(merged.length, 8);
  assert.equal(merged[1].key, 'jahit');
  assert.equal(merged[1].label, 'Jahit');
  assert.equal(merged[1].value, 4_000);
  assert.equal(merged[6].key, 'margin');
  assert.equal(merged[6].value, 2_500);
});
