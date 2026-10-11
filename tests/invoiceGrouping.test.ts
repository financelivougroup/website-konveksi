import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkGroupInvoiceReadiness,
  deriveBillingTypeForGroup,
  invoiceBlockedReason,
  type ProductionCodeVariation,
} from '../src/lib/invoiceGrouping.ts';

// ===== Pabrik data uji =====
function v(status: ProductionCodeVariation['status'], quantity = 100): ProductionCodeVariation {
  return { status, quantity };
}

/** Bentuk data nyata PO/001-LVU/09/2026/002 (Gena Pants): 4 variasi. */
const GENA_PANTS: ProductionCodeVariation[] = [
  v('PROGRESS', 100), // Black M
  v('PROGRESS', 100), // Black XL
  v('PROGRESS', 100), // Ivory M
  v('FINISHED', 100), // Ivory XL
];

// ===== Aturan inti: invoice hanya saat SEMUA variasi selesai =====
// Permintaan user: "invoicing itu akan kebuat otomatis ketika Kode Produksi
// Konveksi sudah status Finished SEMUA."

test('3 PROGRESS + 1 FINISHED → BELUM siap (kasus data nyata)', () => {
  // Regresi yang diperbaiki: dulu invoice 100 pcs terbit begitu satu variasi
  // FINISHED, padahal 3 variasi lain masih dikerjakan.
  const r = checkGroupInvoiceReadiness(GENA_PANTS);
  assert.equal(r.ready, false);
  assert.equal(r.pendingCount, 3);
});

test('semua FINISHED → siap, dan totalPcs = jumlah SEMUA variasi', () => {
  const r = checkGroupInvoiceReadiness(GENA_PANTS.map((x) => ({ ...x, status: 'FINISHED' as const })));
  assert.equal(r.ready, true);
  assert.equal(r.totalPcs, 400);
  assert.equal(r.variationCount, 4);
  assert.equal(r.pendingCount, 0);
});

test('satu variasi belum digarap (NEW) menahan invoice', () => {
  const r = checkGroupInvoiceReadiness([v('FINISHED'), v('NEW'), v('FINISHED')]);
  assert.equal(r.ready, false);
  assert.equal(r.pendingCount, 1);
});

test('INVOICED dihitung selesai — kode yang sudah diinvoice tidak dibuat ulang', () => {
  // Kalau INVOICED tidak dihitung selesai, kode yang sudah diinvoice akan
  // dianggap belum selesai dan invoice kedua bisa terbit.
  const r = checkGroupInvoiceReadiness([v('INVOICED'), v('FINISHED')]);
  assert.equal(r.ready, true);
});

test('satu variasi saja yang FINISHED sudah cukup bila hanya ada satu variasi', () => {
  const r = checkGroupInvoiceReadiness([v('FINISHED', 50)]);
  assert.equal(r.ready, true);
  assert.equal(r.totalPcs, 50);
});

// ===== Qty 0: belum diterima dari POS client =====
// Input qty manual sudah dihapus dari Order Entry, jadi setiap order baru
// ber-qty 0 sampai POS client mengisinya. Invoice 0 pcs adalah dokumen tagihan
// yang salah, jadi variasi yang "selesai" tapi ber-qty 0 tidak boleh lolos.

test('semua FINISHED tapi qty 0 → BELUM siap (qty belum dari POS)', () => {
  const r = checkGroupInvoiceReadiness([v('FINISHED', 0), v('FINISHED', 0)]);
  assert.equal(r.ready, false);
  assert.equal(r.totalPcs, 0);
  assert.equal(r.pendingCount, 0, 'yang menahan bukan pekerjaan tertinggal, melainkan qty kosong');
});

test('qty 0 pada satu variasi menahan seluruh grup — bukan invoice sebagian', () => {
  // Bentuk yang salah (dan pernah ditulis): `totalPcs > 0` membuat grup ini
  // lolos dengan totalPcs 100, lalu invoice 100 pcs terbit untuk kode
  // produksi 200 pcs — dan variasi dihitung INVOICED sehingga kekurangannya
  // tidak pernah dibuat ulang.
  const r = checkGroupInvoiceReadiness([v('FINISHED', 100), v('FINISHED', 0)]);
  assert.equal(r.ready, false);
  assert.equal(r.totalPcs, 100);
  assert.equal(r.missingQtyCount, 1);
  assert.equal(r.pendingCount, 0);
});

test('qty negatif tidak dianggap siap', () => {
  const r = checkGroupInvoiceReadiness([v('FINISHED', -5)]);
  assert.equal(r.ready, false);
  assert.equal(r.missingQtyCount, 1);
});

test('alasan blokir qty 0 menyebut POS, bukan "0 dari 2 variasi"', () => {
  const reason = invoiceBlockedReason(checkGroupInvoiceReadiness([v('FINISHED', 0), v('FINISHED', 0)]));
  assert.ok(reason && reason.includes('POS client'), `dapat: ${reason}`);
  assert.ok(!reason.includes('0 dari'), 'tidak boleh berbunyi "Masih ada 0 dari ... variasi"');
});

test('alasan blokir qty sebagian menyebut berapa variasi yang belum ber-qty', () => {
  const reason = invoiceBlockedReason(
    checkGroupInvoiceReadiness([v('FINISHED', 100), v('FINISHED', 0)]),
  );
  assert.ok(reason && reason.includes('1 dari 2'), `dapat: ${reason}`);
  assert.ok(reason.includes('POS client'), `dapat: ${reason}`);
});

test('alasan blokir tetap soal variasi bila qty sudah lengkap', () => {
  // qty lengkap, ada yang belum selesai → pesannya harus soal pekerjaan,
  // bukan soal POS.
  const reason = invoiceBlockedReason(checkGroupInvoiceReadiness(GENA_PANTS));
  assert.equal(reason, 'Masih ada 3 dari 4 variasi yang belum selesai.');
});

// ===== Kode produksi tanpa variasi =====
// Penting karena keputusan user adalah menghapus invoice lama lalu membiarkan
// yang baru terbit otomatis: `ready` harus berarti "invoice bisa dibuat".

test('tanpa variasi TIDAK siap — bukan "siap dengan 0 pcs"', () => {
  const r = checkGroupInvoiceReadiness([]);
  assert.equal(r.ready, false);
  assert.equal(r.totalPcs, 0);
});

test('alasan blokir tanpa variasi menjelaskan sebabnya, bukan angka menyesatkan', () => {
  const reason = invoiceBlockedReason(checkGroupInvoiceReadiness([]));
  assert.ok(reason && reason.includes('belum punya variasi'), `dapat: ${reason}`);
});

// ===== totalPcs =====
test('totalPcs menjumlah seluruh variasi, termasuk yang belum selesai', () => {
  const r = checkGroupInvoiceReadiness([v('FINISHED', 100), v('NEW', 25), v('PROGRESS', 75)]);
  assert.equal(r.totalPcs, 200);
});

test('qty tidak valid dihitung 0, tidak membuat totalPcs NaN', () => {
  const r = checkGroupInvoiceReadiness([
    v('FINISHED', 100),
    { status: 'FINISHED', quantity: Number.NaN },
  ]);
  assert.equal(r.totalPcs, 100);
  assert.ok(Number.isFinite(r.totalPcs));
});

// ===== Alasan blokir =====
test('alasan blokir menyebut berapa dari berapa variasi yang belum selesai', () => {
  const reason = invoiceBlockedReason(checkGroupInvoiceReadiness(GENA_PANTS));
  assert.equal(reason, 'Masih ada 3 dari 4 variasi yang belum selesai.');
});

test('tidak ada alasan blokir saat sudah siap', () => {
  assert.equal(invoiceBlockedReason(checkGroupInvoiceReadiness([v('FINISHED')])), null);
});

// ===== Jenis tagihan dari TOTAL grup =====
// Dulu dihitung dari qty satu work order, sehingga kode produksi besar bisa
// salah diklasifikasi sebagai Sample Production.

test('jenis tagihan dihitung dari TOTAL grup, bukan per variasi', () => {
  // 4 variasi × 100 pcs = 400 pcs → Mass Production. Kalau dihitung per
  // variasi (100), hasilnya sama; yang membuktikan bedanya ada di tes berikut.
  assert.equal(deriveBillingTypeForGroup(400, 10), 'mass_production');
});

test('kode produksi banyak variasi kecil tetap Mass Production', () => {
  // 10 variasi × 2 pcs = 20 pcs total → Mass Production, padahal TIAP variasi
  // (2 pcs) di bawah ambang 10 dan dulu akan diklasifikasi Sample Production.
  assert.equal(deriveBillingTypeForGroup(20, 10), 'mass_production');
});

test('total tepat di ambang dihitung Sample Production', () => {
  assert.equal(deriveBillingTypeForGroup(10, 10), 'sample_production');
});

test('total di atas ambang dihitung Mass Production', () => {
  assert.equal(deriveBillingTypeForGroup(11, 10), 'mass_production');
});

test('total 0 dihitung Sample Production, bukan crash', () => {
  assert.equal(deriveBillingTypeForGroup(0, 10), 'sample_production');
});

// ===== Tidak memutasi input =====
test('input tidak dimutasi', () => {
  const input = [v('PROGRESS', 100)];
  checkGroupInvoiceReadiness(input);
  assert.equal(input[0].status, 'PROGRESS');
  assert.equal(input[0].quantity, 100);
});
