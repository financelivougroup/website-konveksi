import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_ENTRY_SELECTION, changeEntryVariant, entryVariantOptions, filterEntryWorkOrders, selectEntryWorkOrder, searchEntryWorkOrders, entryProductSuggestions, isEntryQuantityValid, entryQuantitiesByWorkOrder, eligibleEntryWorkOrders } from '../src/lib/productionEntryOptions.ts';

test('sewing eligibility follows remaining cutting per variation, not code or persisted status', () => {
  const variants = [
    { id: 'ivory', productNote: 'PO/same', productionStatus: 'PROGRESS', quantity: 80 },
    { id: 'champagne', productNote: 'PO/same', productionStatus: 'NEW', quantity: 32 },
    { id: 'unknown-qty', productNote: 'PO/zero', productionStatus: 'INVOICED', quantity: 0 },
    { id: 'no-cut', productionStatus: 'PROGRESS', quantity: 100 },
  ];
  const cutting = entryQuantitiesByWorkOrder([
    { workOrderId: 'ivory', qty: 80 }, { workOrderId: 'champagne', qty: 32 },
    { workOrderId: 'unknown-qty', qty: 40 },
  ], (r) => r.qty, 'first');
  const sewn = entryQuantitiesByWorkOrder([
    { workOrderId: 'ivory', qty: 30 }, { workOrderId: 'ivory', qty: 50 },
  ], (r) => r.qty);
  assert.deepEqual(eligibleEntryWorkOrders(variants, cutting, sewn).map((wo) => wo.id), ['champagne', 'unknown-qty']);
});

test('downstream entries use only their adjacent-stage balance and allow a first partial report', () => {
  const variants = [{ id: 'ivory' }, { id: 'champagne' }, { id: 'partial' }, { id: 'over' }];
  const sewing = entryQuantitiesByWorkOrder([
    { workOrderId: 'ivory', qty: 80 }, { workOrderId: 'partial', qty: 12 }, { workOrderId: 'over', qty: 10 },
  ], (r) => r.qty);
  const kancing = entryQuantitiesByWorkOrder([
    { workOrderId: 'ivory', qty: 20 }, { workOrderId: 'ivory', qty: 30 }, { workOrderId: 'over', qty: 11 },
  ], (r) => r.qty);
  const finishing = entryQuantitiesByWorkOrder([{ workOrderId: 'over', qty: 11 }], (r) => r.qty);
  assert.deepEqual(eligibleEntryWorkOrders(variants, sewing, kancing).map((w) => w.id), ['ivory', 'partial']);
  assert.deepEqual(eligibleEntryWorkOrders(variants, kancing, finishing).map((w) => w.id), ['ivory']);
  assert.deepEqual(eligibleEntryWorkOrders(variants, new Map(), new Map()), []);
});

test('cutting totals use the first latest-first record, not the sum of snapshots', () => {
  const records = [{ workOrderId: 'a', qty: 20 }, { workOrderId: 'a', qty: 80 }, { workOrderId: 'b', qty: 0 }];
  const totals = entryQuantitiesByWorkOrder(records, (r) => r.qty, 'first');
  assert.equal(totals.get('a'), 20);
  assert.equal(totals.get('b'), 0);
  assert.deepEqual(eligibleEntryWorkOrders([{ id: 'a' }], totals, new Map([['a', 20]])), []);
  assert.deepEqual([...entryQuantitiesByWorkOrder([], (r: { workOrderId: string; qty: number }) => r.qty)], []);
});

test('stage completion is independent of order quantity and every persisted status', () => {
  const variants = ['NEW', 'PROGRESS', 'FINISHED', 'INVOICED'].flatMap((productionStatus) => [
    { id: `${productionStatus}-remaining`, productionStatus, quantity: 0, productNote: 'PO/same' },
    { id: `${productionStatus}-equal`, productionStatus, quantity: 100, productNote: 'PO/same' },
    { id: `${productionStatus}-over`, productionStatus, quantity: 100, productNote: 'PO/same' },
  ]);
  const upstream = new Map(variants.map((wo) => [wo.id, 12]));
  const own = new Map(variants.map((wo) => [wo.id, wo.id.endsWith('-remaining') ? 0 : wo.id.endsWith('-equal') ? 12 : 13]));
  assert.deepEqual(eligibleEntryWorkOrders(variants, upstream, own).map((wo) => wo.id), [
    'NEW-remaining', 'PROGRESS-remaining', 'FINISHED-remaining', 'INVOICED-remaining',
  ]);
});

test('card search matches production identities without collapsing matching variations', () => {
  const cards = [
    { id: 'a', product: 'Aluna Top', productNote: 'PO/001', clientProductionCode: 'CLIENT-AL', workCode: 'WORK-A', warna: 'Black', size: 'M' },
    { id: 'b', product: 'Aluna Top', productNote: 'PO/002', warna: 'Ivory', size: 'XL' },
    { id: 'legacy', product: 'Legacy', warna: '', size: '' },
  ];
  assert.deepEqual(searchEntryWorkOrders(cards, '  ALUNA  ').map((wo) => wo.id), ['a', 'b']);
  for (const query of ['po/001', 'client-al', 'work-a', 'black', ' m ']) {
    assert.deepEqual(searchEntryWorkOrders(cards, query).map((wo) => wo.id), ['a']);
  }
  assert.equal(searchEntryWorkOrders(cards, '').length, 3);
  assert.deepEqual(searchEntryWorkOrders(cards, 'missing'), []);
});

test('product recommendations are unique names, never automatic work-order selections', () => {
  assert.deepEqual(entryProductSuggestions([
    { id: 'a', product: 'Aluna Top' }, { id: 'b', product: 'Aluna Top' },
    { id: 'c', product: 'Gena Pants' }, { id: 'legacy', product: '' },
  ]), ['Aluna Top', 'Gena Pants']);
});

test('progressive quantity gate accepts only positive finite integers without an order cap', () => {
  for (const value of ['', ' ', '0', '-1', '1.5', 'NaN', 'Infinity', '1e999']) {
    assert.equal(isEntryQuantityValid(value), false, value);
  }
  assert.equal(isEntryQuantityValid('1'), true);
  assert.equal(isEntryQuantityValid(' 250 '), true);
});

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
