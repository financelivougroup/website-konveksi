import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLIENT_ORDER_FIXTURES,
  searchClientOrders,
  type ClientOrderFixture,
} from '../src/data/clientProductionCodes.ts';

// ===== Pabrik data uji =====
function order(over: Partial<ClientOrderFixture> = {}): ClientOrderFixture {
  return {
    id: 'po-1',
    displayId: 'CMP-1',
    customId: null,
    productNote: 'PDFF_ABC-TOP-01_B-00_PRDN',
    totalQuantity: 10,
    insertedAt: '2026-09-01',
    clientCode: 'ABC',
    ...over,
  };
}

// ===== Kata kunci kosong =====
test('kata kunci kosong mengembalikan seluruh daftar', () => {
  const rows = [order({ id: 'a' }), order({ id: 'b' })];
  assert.equal(searchClientOrders(rows, '').length, 2);
});

test('kata kunci berisi spasi saja diperlakukan kosong', () => {
  const rows = [order({ id: 'a' }), order({ id: 'b' })];
  assert.equal(searchClientOrders(rows, '   ').length, 2);
});

test('daftar kosong mengembalikan daftar kosong, bukan crash', () => {
  assert.deepEqual(searchClientOrders([], 'apapun'), []);
});

// ===== Pencocokan =====
test('cocok pada Product Note', () => {
  const rows = [order({ id: 'a', productNote: 'PDFF_CSC-JKT-11_B-03_PRDN' }), order({ id: 'b' })];
  assert.deepEqual(
    searchClientOrders(rows, 'CSC-JKT').map((r) => r.id),
    ['a'],
  );
});

test('cocok pada nomor order (displayId)', () => {
  const rows = [order({ id: 'a', displayId: 'LVU-8842' }), order({ id: 'b' })];
  assert.deepEqual(
    searchClientOrders(rows, 'LVU-8842').map((r) => r.id),
    ['a'],
  );
});

test('cocok pada customId', () => {
  const rows = [order({ id: 'a', customId: 'LVU-PNT-01' }), order({ id: 'b' })];
  assert.deepEqual(
    searchClientOrders(rows, 'PNT-01').map((r) => r.id),
    ['a'],
  );
});

test('cocok pada kode client', () => {
  const rows = [
    order({ id: 'a', clientCode: 'CSC' }),
    order({ id: 'b', clientCode: 'LVU' }),
  ];
  assert.deepEqual(
    searchClientOrders(rows, 'LVU').map((r) => r.id),
    ['b'],
  );
});

test('customId null tidak membuat pencarian crash dan tidak cocok dengan "null"', () => {
  // Penting: kalau null ikut di-join sebagai teks, mencari "null" akan
  // memunculkan baris yang tidak punya custom id sama sekali.
  const rows = [order({ id: 'a', customId: null })];
  assert.deepEqual(searchClientOrders(rows, 'null'), []);
});

// ===== Tidak peka huruf besar/kecil =====
test('pencarian tidak peka huruf besar/kecil', () => {
  const rows = [order({ id: 'a', productNote: 'PDFF_CSC-JKT-11_B-03_PRDN' })];
  for (const kw of ['pdff_csc', 'PDFF_CSC', 'PdFf_CsC']) {
    assert.deepEqual(
      searchClientOrders(rows, kw).map((r) => r.id),
      ['a'],
      `gagal untuk kata kunci ${kw}`,
    );
  }
});

test('kata kunci tidak cocok mengembalikan daftar kosong', () => {
  assert.deepEqual(searchClientOrders([order()], 'ZZZ-TIDAK-ADA'), []);
});

// ===== Tidak memutasi input =====
test('input tidak dimutasi dan hasilnya array baru', () => {
  const rows = [order({ id: 'a' }), order({ id: 'b' })];
  const before = rows.map((r) => r.id);
  const result = searchClientOrders(rows, '');
  assert.notEqual(result, rows, 'hasil harus array baru, bukan input yang sama');
  result.reverse();
  assert.deepEqual(rows.map((r) => r.id), before, 'urutan input tidak boleh berubah');
});

// ===== Fixture =====
test('fixture tidak kosong dan setiap barisnya punya Product Note', () => {
  assert.ok(CLIENT_ORDER_FIXTURES.length > 0);
  for (const row of CLIENT_ORDER_FIXTURES) {
    assert.ok(row.productNote.trim() !== '', `fixture ${row.id} tanpa Product Note`);
  }
});

test('fixture punya id unik — dipakai sebagai kunci baris', () => {
  const ids = CLIENT_ORDER_FIXTURES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('setiap Product Note fixture bisa ditemukan lewat pencarian persis', () => {
  for (const row of CLIENT_ORDER_FIXTURES) {
    const found = searchClientOrders(CLIENT_ORDER_FIXTURES, row.productNote);
    assert.ok(
      found.some((r) => r.id === row.id),
      `Product Note ${row.productNote} tidak menemukan dirinya sendiri`,
    );
  }
});
