import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeTotal,
  computeTotalPayment,
  parseCount,
  parseOptionalAmount,
  validateAmounts,
} from '../src/lib/expenseTotals.ts';

const amounts = (
  quantity: number,
  unitPrice: number,
  shippingAdmin = 0,
  discountCashback = 0,
) => ({ quantity, unitPrice, shippingAdmin, discountCashback });

// ===== Total =====

test('Total = Jumlah × Harga/Item', () => {
  assert.equal(computeTotal(3, 100_000), 300_000);
});

test('Total dengan satu barang sama dengan harganya', () => {
  assert.equal(computeTotal(1, 45_000), 45_000);
});

test('Total tidak menghasilkan NaN dari angka tidak valid', () => {
  assert.equal(computeTotal(Number.NaN, 1000), 0);
  assert.equal(computeTotal(3, Number.NaN), 0);
  assert.ok(Number.isFinite(computeTotal(Number.NaN, Number.NaN)));
});

test('Total angka besar tidak kehilangan presisi', () => {
  // 1.000 barang × Rp1.000.000 = Rp1.000.000.000 — masih di dalam rentang
  // bilangan bulat aman JavaScript.
  assert.equal(computeTotal(1000, 1_000_000), 1_000_000_000);
});

// ===== Total Payment =====

test('Total Payment = Total + Ongkir/Admin − Discount/Cashback', () => {
  // Kasus yang sama dengan uji di database: 3 × 100000 + 20000 − 5000.
  assert.equal(computeTotalPayment(amounts(3, 100_000, 20_000, 5_000)), 315_000);
});

test('Ongkir menambah dan diskon mengurangi', () => {
  assert.equal(computeTotalPayment(amounts(1, 100_000, 10_000, 0)), 110_000);
  assert.equal(computeTotalPayment(amounts(1, 100_000, 0, 10_000)), 90_000);
});

test('tanpa ongkir dan diskon, Total Payment = Total', () => {
  assert.equal(computeTotalPayment(amounts(2, 50_000)), 100_000);
});

test('nilai tidak valid diperlakukan 0, tidak membuat NaN', () => {
  const result = computeTotalPayment(amounts(2, 50_000, Number.NaN, Number.NaN));
  assert.equal(result, 100_000);
  assert.ok(Number.isFinite(result));
});

// ===== parseCount =====

test('Jumlah menerima bilangan bulat positif', () => {
  assert.equal(parseCount('3'), 3);
  assert.equal(parseCount('1'), 1);
});

test('Jumlah nol dan negatif ditolak', () => {
  // Membeli 0 barang bukan pembelian — ini beda dari nominal, yang nol pun
  // sudah ditolak oleh parseAmount.
  assert.equal(parseCount('0'), null);
  assert.equal(parseCount('-2'), null);
});

test('Jumlah desimal ditolak, bukan dibulatkan', () => {
  assert.equal(parseCount('2.5'), null);
});

test('Jumlah kosong ditolak', () => {
  assert.equal(parseCount(''), null);
  assert.equal(parseCount('   '), null);
});

// ===== parseOptionalAmount =====

test('Ongkir/Discount kosong berarti 0, bukan error', () => {
  // Tidak setiap pembelian ada ongkir atau diskon.
  assert.equal(parseOptionalAmount(''), 0);
  assert.equal(parseOptionalAmount('   '), 0);
});

test('Ongkir/Discount menerima nol eksplisit', () => {
  assert.equal(parseOptionalAmount('0'), 0);
});

test('Ongkir/Discount menerima nilai positif', () => {
  assert.equal(parseOptionalAmount('20000'), 20_000);
});

test('Ongkir/Discount negatif ditolak', () => {
  assert.equal(parseOptionalAmount('-5000'), null);
});

test('Ongkir/Discount desimal ditolak', () => {
  assert.equal(parseOptionalAmount('1500.5'), null);
});

test('Ongkir/Discount bukan angka ditolak', () => {
  assert.equal(parseOptionalAmount('abc'), null);
  assert.equal(parseOptionalAmount('NaN'), null);
});

// ===== validateAmounts =====

test('kombinasi yang wajar tidak menghasilkan peringatan', () => {
  assert.equal(validateAmounts(amounts(3, 100_000, 20_000, 5_000)), null);
});

test('diskon melebihi total + ongkir ditolak, bukan menghasilkan negatif', () => {
  const message = validateAmounts(amounts(1, 1000, 0, 999_999));
  assert.ok(message, 'seharusnya ada pesan');
  assert.match(message, /lebih besar dari nol/);
});

test('diskon tepat sama dengan total ditolak (payment 0)', () => {
  // Payment 0 bukan pembelian — cerminan CHECK di database yang menuntut > 0.
  assert.ok(validateAmounts(amounts(1, 1000, 0, 1000)));
});

test('diskon satu rupiah di bawah total diterima', () => {
  assert.equal(validateAmounts(amounts(1, 1000, 0, 999)), null);
});

test('ongkir menutup diskon besar tetap sah', () => {
  // 1000 + 5000 ongkir − 4000 diskon = 2000 > 0
  assert.equal(validateAmounts(amounts(1, 1000, 5_000, 4_000)), null);
});

test('nilai negatif ditolak dengan pesan sendiri', () => {
  assert.match(String(validateAmounts(amounts(1, 1000, -100, 0))), /tidak boleh negatif/);
});

// ===== Konsistensi dengan rumus database =====

test('hasil sama dengan yang dihitung database untuk kasus uji yang sama', () => {
  // Kasus ini diuji langsung di database lewat Supabase MCP dan menghasilkan
  // total = 300000, total_payment = 315000. Kalau rumus di sini berubah sampai
  // tidak cocok, angka di layar dan angka tersimpan akan berbeda.
  const a = amounts(3, 100_000, 20_000, 5_000);
  assert.equal(computeTotal(a.quantity, a.unitPrice), 300_000);
  assert.equal(computeTotalPayment(a), 315_000);
});
