import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSewingBacklog,
  calculateMonthlyRemainingMoney,
} from '../src/lib/sewingBacklog.ts';

function wo(over: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    workCode: 'WC-1',
    sourceOrderId: 'po-1',
    productNote: 'Produksi 1',
    product: 'Dress',
    productId: '',
    variationId: '',
    informationVariation: '',
    warna: 'Hitam',
    size: 'M',
    brand: '',
    quantity: 100,
    productionStatus: 'PROGRESS' as const,
    invoiceStatus: 'NONE' as const,
    createdBy: '',
    createdAt: '',
    ...over,
  };
}

function sw(workOrderId: string, qtySelesai: number, pic = 'Ayu', tgl = '2026-08-05') {
  return {
    id: `${workOrderId}-${qtySelesai}-${pic}-${tgl}`,
    workOrderId,
    workCode: 'WC',
    picPenjahit: pic,
    qtySelesai,
    tanggalLaporan: tgl,
    inputBy: '',
    inputAt: '',
  };
}

const rates = new Map([
  ['po-1', { jahit: 1000, obras: 500, total: 1500 }],
  ['po-2', { jahit: 2000, obras: 0, total: 2000 }],
]);

test('Work Order aktif dihitung dari Qty Order dikurangi seluruh sewing lintas penjahit dan bulan', () => {
  const result = buildSewingBacklog([
    wo(),
  ], [
    sw('wo-1', 10, 'Ayu', '2026-08-05'),
    sw('wo-1', 20, 'Budi', '2026-09-05'),
  ], rates);

  assert.equal(result.length, 1);
  assert.equal(result[0].workOrders[0].qtyJahit, 30);
  assert.equal(result[0].workOrders[0].totalBelumJahit, 70);
});

test('Work Order yang sudah selesai tidak masuk backlog', () => {
  const result = buildSewingBacklog([wo()], [sw('wo-1', 100)], rates);
  assert.deepEqual(result, []);
});

test('sewing melebihi Qty Order dijepit ke nol dan tidak tampil', () => {
  const result = buildSewingBacklog([wo()], [sw('wo-1', 150)], rates);
  assert.deepEqual(result, []);
});

test('Sisa Uang bulanan adalah max(0, targetCostPosisi - realisasiCostPosisi)', () => {
  assert.equal(calculateMonthlyRemainingMoney(5_000_000, 3_500_000), 1_500_000);
  assert.equal(calculateMonthlyRemainingMoney(5_000_000, 6_000_000), 0);
});

test('Work Order dengan Product Note sama digabung menjadi satu grup', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1', quantity: 100 }),
    wo({ id: 'wo-2', workCode: 'WC-2', quantity: 50 }),
  ], [sw('wo-1', 10), sw('wo-2', 5)], rates);

  assert.equal(result.length, 1);
  assert.equal(result[0].productNote, 'Produksi 1');
  assert.equal(result[0].totalQtyOrder, 150);
  assert.equal(result[0].totalQtyJahit, 15);
  assert.equal(result[0].totalBelumJahit, 135);
});

test('Product Note kosong dengan source order berbeda tidak tercampur', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1', productNote: '', sourceOrderId: 'po-1' }),
    wo({ id: 'wo-2', productNote: '', sourceOrderId: 'po-2', workCode: 'WC-2' }),
  ], [sw('wo-1', 10), sw('wo-2', 20)], rates);

  assert.equal(result.length, 2);
  assert.equal(result[0].productNote, null);
  assert.equal(result[1].productNote, null);
});

test('Product seragam diringkas sebagai nama dan product berbeda menjadi Bervariasi', () => {
  const uniform = buildSewingBacklog([
    wo({ id: 'wo-1', product: 'Dress' }),
    wo({ id: 'wo-2', product: 'Dress', workCode: 'WC-2' }),
  ], [sw('wo-1', 10), sw('wo-2', 20)], rates);
  assert.equal(uniform[0].productLabel, 'Dress');

  const varied = buildSewingBacklog([
    wo({ id: 'wo-1', product: 'Dress' }),
    wo({ id: 'wo-2', product: 'Kemeja', workCode: 'WC-2' }),
  ], [sw('wo-1', 10), sw('wo-2', 20)], rates);
  assert.equal(varied[0].productLabel, 'Bervariasi');
});

test('tarif seragam diringkas sebagai nominal', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1' }),
    wo({ id: 'wo-2', workCode: 'WC-2' }),
  ], [sw('wo-1', 10), sw('wo-2', 20)], rates);

  assert.deepEqual(result[0].rate, { kind: 'single', value: 1500 });
});

test('tarif berbeda diringkas sebagai Bervariasi', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1', sourceOrderId: 'po-1' }),
    wo({ id: 'wo-2', sourceOrderId: 'po-2', workCode: 'WC-2' }),
  ], [sw('wo-1', 10), sw('wo-2', 20)], rates);

  assert.deepEqual(result[0].rate, { kind: 'varied' });
});

test('sebagian tarif hilang diringkas sebagai Bervariasi', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1', sourceOrderId: 'po-1' }),
    wo({ id: 'wo-2', sourceOrderId: 'po-unknown', workCode: 'WC-2' }),
  ], [sw('wo-1', 10), sw('wo-2', 20)], rates);

  assert.deepEqual(result[0].rate, { kind: 'varied' });
});

test('semua tarif hilang diringkas sebagai missing', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1', sourceOrderId: 'po-unknown' }),
  ], [sw('wo-1', 10)], rates);

  assert.deepEqual(result[0].rate, { kind: 'missing' });
  assert.equal(result[0].workOrders[0].rate, null);
});

test('grup diurutkan berdasarkan Total Belum Jahit turun lalu Product Note naik', () => {
  const result = buildSewingBacklog([
    wo({ id: 'wo-1', productNote: 'Zeta', quantity: 10 }),
    wo({ id: 'wo-2', productNote: 'Alpha', quantity: 100, workCode: 'WC-2' }),
    wo({ id: 'wo-3', productNote: 'Beta', quantity: 100, workCode: 'WC-3' }),
  ], [], rates);

  assert.deepEqual(
    result.map((g) => g.productNote),
    ['Alpha', 'Beta', 'Zeta'],
  );
});

// ===== Nilai Rupiah backlog =====

test('nilai Work Order = Total Belum Jahit x tarif', () => {
  const result = buildSewingBacklog([wo()], [sw('wo-1', 30)], rates);

  // qty order 100, sudah dijahit 30 -> sisa 70; tarif 1500
  assert.equal(result[0].workOrders[0].totalBelumJahit, 70);
  assert.equal(result[0].workOrders[0].nilaiBacklog, 105_000);
});

test('nilai Work Order null bila tarif tidak tersedia', () => {
  const result = buildSewingBacklog(
    [wo({ id: 'wo-1', sourceOrderId: 'po-unknown' })],
    [sw('wo-1', 10)],
    rates,
  );

  assert.equal(result[0].workOrders[0].nilaiBacklog, null);
  assert.deepEqual(result[0].nilaiBacklog, { kind: 'missing' });
});

test('nilai grup menjumlahkan seluruh Work Order bertarif', () => {
  const result = buildSewingBacklog(
    [
      wo({ id: 'wo-1', quantity: 100 }),
      wo({ id: 'wo-2', quantity: 50, workCode: 'WC-2' }),
    ],
    [],
    rates,
  );

  // 100 x 1500 + 50 x 1500
  assert.deepEqual(result[0].nilaiBacklog, { kind: 'single', value: 225_000 });
});

test('nilai grup Bervariasi bila sebagian Work Order tidak bertarif', () => {
  const result = buildSewingBacklog(
    [
      wo({ id: 'wo-1', quantity: 100 }),
      wo({ id: 'wo-2', quantity: 50, workCode: 'WC-2', sourceOrderId: 'po-unknown' }),
    ],
    [],
    rates,
  );

  assert.deepEqual(result[0].nilaiBacklog, { kind: 'varied' });
});

test('Sisa Uang bulanan = max(0, target cost - realisasi cost)', () => {
  assert.equal(calculateMonthlyRemainingMoney(1_500_000, 900_000), 600_000);
  assert.equal(calculateMonthlyRemainingMoney(1_000_000, 1_400_000), 0);
});
