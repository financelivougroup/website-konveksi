import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_ENTRY_SELECTION, changeEntryVariant, entryVariantOptions, filterEntryWorkOrders, selectEntryWorkOrder } from '../src/lib/productionEntryOptions.ts';

const orders = [
  { id: 'a', warna: 'Black', size: 'S' },
  { id: 'b', warna: 'Black', size: 'M' },
  { id: 'c', warna: 'White', size: 'L' },
  { id: 'd', warna: 'Black', size: 'S' },
  { id: 'legacy', warna: '', size: '' },
];

test('variant options are unique and omit empty legacy values', () => {
  assert.deepEqual(entryVariantOptions(orders, 'warna'), [
    { value: 'Black', label: 'Black' }, { value: 'White', label: 'White' },
  ]);
  assert.deepEqual(entryVariantOptions([], 'size'), []);
});

test('WO selection fills both variant dimensions', () => {
  assert.deepEqual(selectEntryWorkOrder(orders, 'a'), { woId: 'a', colour: 'Black', size: 'S' });
  assert.deepEqual(selectEntryWorkOrder(orders, ''), EMPTY_ENTRY_SELECTION);
  assert.deepEqual(selectEntryWorkOrder(orders, 'missing'), EMPTY_ENTRY_SELECTION);
});

test('colour change clears incompatible size and WO without choosing replacement', () => {
  assert.deepEqual(changeEntryVariant(orders, selectEntryWorkOrder(orders, 'a'), 'colour', 'White'), {
    woId: '', colour: 'White', size: '',
  });
});

test('size change clears incompatible WO and preserves colour', () => {
  assert.deepEqual(changeEntryVariant(orders, selectEntryWorkOrder(orders, 'a'), 'size', 'M'), {
    woId: '', colour: 'Black', size: 'M',
  });
});

test('resetting variant filter preserves compatible WO', () => {
  const selected = selectEntryWorkOrder(orders, 'a');
  assert.deepEqual(changeEntryVariant(orders, selected, 'colour', ''), { ...selected, colour: '' });
  assert.deepEqual(changeEntryVariant(orders, selected, 'size', ''), { ...selected, size: '' });
});

test('multiple matching WOs stay explicit choices', () => {
  assert.deepEqual(filterEntryWorkOrders(orders, 'Black', 'S').map((wo) => wo.id), ['a', 'd']);
  const selection = changeEntryVariant(orders, EMPTY_ENTRY_SELECTION, 'colour', 'Black');
  assert.equal(changeEntryVariant(orders, selection, 'size', 'S').woId, '');
});

test('unmatched combinations return no candidates', () => {
  assert.deepEqual(filterEntryWorkOrders(orders, 'White', 'M'), []);
  assert.deepEqual(entryVariantOptions(filterEntryWorkOrders(orders, 'White', ''), 'size'), [{ value: 'L', label: 'L' }]);
});

test('legacy empty dimensions remain selectable through all filters', () => {
  assert.equal(filterEntryWorkOrders(orders, '', '').length, orders.length);
  assert.deepEqual(selectEntryWorkOrder(orders, 'legacy'), { woId: 'legacy', colour: '', size: '' });
  assert.equal(changeEntryVariant(orders, selectEntryWorkOrder(orders, 'legacy'), 'colour', 'Black').woId, '');
});

test('colour change retains a size supported by the new colour but clears old WO', () => {
  const extended = [...orders, { id: 'e', warna: 'White', size: 'S' }];
  assert.deepEqual(changeEntryVariant(extended, selectEntryWorkOrder(extended, 'a'), 'colour', 'White'), {
    woId: '', colour: 'White', size: 'S',
  });
});
