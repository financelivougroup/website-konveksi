import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyOrderPriceComponents,
  hasDuplicateVariations,
  isAutoProductionCode,
  isOrderPriceComplete,
  mergeOrderPriceComponents,
  normalizeProductionCode,
  productPhotoPath,
  sanitizeProductPhotoName,
  totalOrderPrice,
  totalOrderQuantity,
  variationCombinationKey,
  variationPhotoPath,
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

test('strips characters that are unsafe in a storage object path', () => {
  assert.equal(sanitizeProductPhotoName('foto produk 01.jpg'), 'foto_produk_01.jpg');
  assert.equal(sanitizeProductPhotoName('nama-yang.sudah_aman.JPG'), 'nama-yang.sudah_aman.JPG');
});

test('keeps the file name a single path segment so traversal cannot escape', () => {
  // Slash dan backslash diganti, jadi `..` tidak pernah menjadi segmen
  // mandiri — traversal tidak mungkin meski titiknya dipertahankan.
  const sanitized = sanitizeProductPhotoName('kaos/../..\\lebar.png');
  assert.equal(sanitized, 'kaos_.._.._lebar.png');
  assert.ok(!sanitized.includes('/'), 'nama tidak boleh mengandung pemisah path');
  assert.ok(!sanitized.includes('\\'), 'nama tidak boleh mengandung pemisah path');
});

test('builds a product photo path scoped to the order id', () => {
  assert.equal(
    productPhotoPath('PO-abc123', 'foto produk.jpg', 1_700_000_000_000),
    'PO-abc123/1700000000000-foto_produk.jpg',
  );
});

test('recognises a system-generated production code', () => {
  assert.equal(isAutoProductionCode('PO/001-LVU/09/2026/001'), true);
  assert.equal(isAutoProductionCode('po/001-lvu/09/2026/001'), true);
  assert.equal(isAutoProductionCode('  PO/002-CSC/10/2026/012  '), true);
});

test('leaves legacy client codes alone', () => {
  // Order lama tetap menyimpan kode aslinya; yang membedakan hanyalah awalan.
  assert.equal(isAutoProductionCode('PDFF_LVU-TOP-02_B-00_PRDN'), false);
});

test('treats an empty or missing code as not generated', () => {
  assert.equal(isAutoProductionCode(''), false);
  assert.equal(isAutoProductionCode(null), false);
  assert.equal(isAutoProductionCode(undefined), false);
});

test('builds a variation photo path scoped to both order and variation', () => {
  const path = variationPhotoPath('PO-abc123', 'var-9', 'foto produk.jpg', 1_700_000_000_000);
  assert.equal(path, 'PO-abc123/var-9/1700000000000-foto_produk.jpg');
});

test('keeps two variations from overwriting each other despite an identical file name', () => {
  const shared = { fileName: 'foto.jpg', timestamp: 1_700_000_000_000 };
  const first = variationPhotoPath('PO-1', 'var-a', shared.fileName, shared.timestamp);
  const second = variationPhotoPath('PO-1', 'var-b', shared.fileName, shared.timestamp);
  assert.notEqual(first, second);
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
