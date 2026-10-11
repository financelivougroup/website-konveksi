import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesPoJump, poCodeFromWorkCode } from '../src/lib/poJump.ts';
import type { PoJump } from '../src/types/index.ts';

// Data uji memakai nomor PO yang benar-benar ada di database live, supaya
// bentuknya (format `PO/001-LVU/09/2026/002`) tidak mengarang.
const jump: PoJump = { orderId: 'PO-9fdfe041', code: 'PO/001-LVU/09/2026/002' };

// ===== matchesPoJump =====

test('tanpa lompatan, semua baris lolos', () => {
  assert.equal(matchesPoJump(null, { orderId: 'PO-lain', code: 'PO/999' }), true);
  assert.equal(matchesPoJump(undefined, { orderId: null, code: null }), true);
});

test('cocok lewat kunci relasi (orderId)', () => {
  assert.equal(
    matchesPoJump(jump, { orderId: 'PO-9fdfe041', code: null }),
    true,
    'baris tanpa nomor PO tetap cocok bila relasinya benar',
  );
});

test('cocok lewat cadangan nomor PO saat relasinya kosong', () => {
  // Kasus nyata: invoice lama ber-`production_order_id` NULL, jadi satu-satunya
  // jalan menemukannya adalah nomor PO di work_code.
  assert.equal(
    matchesPoJump(jump, { orderId: null, code: 'PO/001-LVU/09/2026/002' }),
    true,
  );
});

test('baris milik order lain tidak ikut lolos', () => {
  assert.equal(
    matchesPoJump(jump, { orderId: 'PO-0cb91687', code: 'PO/002-CSC/09/2026/005' }),
    false,
  );
});

test('orderId diperiksa lebih dulu, sehingga nomor PO yang kebetulan sama tidak menipu', () => {
  // Relasi yang benar menang walau `code` baris ini menunjuk nomor lain.
  assert.equal(
    matchesPoJump(jump, { orderId: 'PO-9fdfe041', code: 'PO/001-LVU/09/2026/001' }),
    true,
  );
  // Sebaliknya: `code` cocok tetapi relasinya milik order LAIN → tidak lolos.
  // Inilah alasan urutan pemeriksaan tidak boleh dibalik.
  assert.equal(
    matchesPoJump(jump, { orderId: 'PO-a77b8af1', code: 'PO/001-LVU/09/2026/002' }),
    false,
  );
});

test('perbandingan nomor PO mengabaikan spasi pinggir dan besar-kecil huruf', () => {
  assert.equal(matchesPoJump(jump, { orderId: null, code: '  po/001-lvu/09/2026/002  ' }), true);
});

test('lompatan tanpa nomor PO tidak cocok dengan baris ber-nomor apa pun', () => {
  const tanpaKode: PoJump = { orderId: 'PO-tidak-ada', code: null };
  assert.equal(matchesPoJump(tanpaKode, { orderId: 'PO-lain', code: 'PO/apa pun' }), false);
});

test('baris dengan relasi dan nomor kosong tidak lolos', () => {
  assert.equal(matchesPoJump(jump, { orderId: null, code: null }), false);
  assert.equal(matchesPoJump(jump, { orderId: '', code: '' }), false);
});

// ===== poCodeFromWorkCode =====

test('mengambil nomor PO sebagai segmen pertama work_code', () => {
  assert.equal(
    poCodeFromWorkCode('PO/001-LVU/09/2026/002 | Gena Pants | Ivory | XL'),
    'PO/001-LVU/09/2026/002',
  );
});

test('work_code yang hanya berisi nomor PO dikembalikan utuh', () => {
  assert.equal(poCodeFromWorkCode('PO/001-LVU/09/2026/002'), 'PO/001-LVU/09/2026/002');
});

test('work_code kosong menghasilkan null, bukan string kosong', () => {
  assert.equal(poCodeFromWorkCode(null), null);
  assert.equal(poCodeFromWorkCode(undefined), null);
  assert.equal(poCodeFromWorkCode(''), null);
  assert.equal(poCodeFromWorkCode('   '), null);
});

test('nomor PO dari work_code bisa dipakai mencocokkan lewat cadangan', () => {
  // Rantai lengkap seperti di InvoicingPage: work_code → nomor PO → cocok.
  const code = poCodeFromWorkCode('PO/001-LVU/09/2026/002 | Odette Shirt | Ivory | S');
  assert.equal(matchesPoJump(jump, { orderId: null, code }), true);
});

test('work_code milik PO lain tidak cocok', () => {
  const code = poCodeFromWorkCode('PO/002-CSC/09/2026/005 | Odette Shirt | Champagne | M');
  assert.equal(matchesPoJump(jump, { orderId: null, code }), false);
});
