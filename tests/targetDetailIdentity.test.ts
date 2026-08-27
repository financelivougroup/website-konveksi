import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateDetailRealizations,
  groupPlannedTargetDetails,
} from '../src/lib/targetDetailIdentity.ts';

test('memisahkan planning dengan Product Note berbeda', () => {
  const grouped = groupPlannedTargetDetails([
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qty: 20 },
    { productNote: 'Produksi 2', product: 'Dress', warna: 'Hitam', qty: 30 },
  ]);

  assert.deepEqual(grouped, [
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qty: 20 },
    { productNote: 'Produksi 2', product: 'Dress', warna: 'Hitam', qty: 30 },
  ]);
});

test('menggabungkan planning dengan tuple identitas yang sama', () => {
  const grouped = groupPlannedTargetDetails([
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qty: 20 },
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qty: 30 },
  ]);

  assert.deepEqual(grouped, [
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qty: 50 },
  ]);
});

const workOrders = new Map([
  ['wo-1', { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam' }],
  ['wo-2', { productNote: 'Produksi 2', product: 'Dress', warna: 'Hitam' }],
  ['wo-3', { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam' }],
]);

const sewing = [
  { workOrderId: 'wo-1', picPenjahit: 'Ayu', qtySelesai: 10, tanggalLaporan: '2026-08-05' },
  { workOrderId: 'wo-2', picPenjahit: 'Ayu', qtySelesai: 7, tanggalLaporan: '2026-08-06' },
  { workOrderId: 'wo-3', picPenjahit: 'Ayu', qtySelesai: 4, tanggalLaporan: '2026-08-07' },
];

test('memisahkan realisasi Product Note berbeda dan mengagregasi tuple yang sama', () => {
  const result = calculateDetailRealizations([
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qtyTarget: 20, hargaJahit: 1000, hargaObras: 500 },
    { productNote: 'Produksi 2', product: 'Dress', warna: 'Hitam', qtyTarget: 20, hargaJahit: 1000, hargaObras: 500 },
  ], sewing, 'Ayu', '2026-08', workOrders);

  assert.deepEqual(result, [
    { qtyRealisasi: 14, nilai: 21_000 },
    { qtyRealisasi: 7, nilai: 10_500 },
  ]);
});

test('detail legacy memakai fallback Product', () => {
  const result = calculateDetailRealizations([
    { productNote: null, product: 'Dress', warna: null, qtyTarget: 40, hargaJahit: 1000, hargaObras: 500 },
  ], sewing, 'Ayu', '2026-08', workOrders);

  assert.deepEqual(result, [{ qtyRealisasi: 21, nilai: 31_500 }]);
});

test('fallback legacy tidak menghitung ulang sewing yang sudah cocok dengan detail ber-Product Note', () => {
  const result = calculateDetailRealizations([
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qtyTarget: 20, hargaJahit: 1000, hargaObras: 500 },
    { productNote: null, product: 'Dress', warna: null, qtyTarget: 20, hargaJahit: 1000, hargaObras: 500 },
  ], sewing, 'Ayu', '2026-08', workOrders);

  assert.deepEqual(result, [
    { qtyRealisasi: 14, nilai: 21_000 },
    { qtyRealisasi: 7, nilai: 10_500 },
  ]);
});

test('alokasi duplicate precise mempertahankan total dan memecahkan seri berdasarkan urutan detail', () => {
  const result = calculateDetailRealizations([
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qtyTarget: 10, hargaJahit: 1000, hargaObras: 500 },
    { productNote: 'Produksi 1', product: 'Dress', warna: 'Hitam', qtyTarget: 10, hargaJahit: 1000, hargaObras: 500 },
  ], [
    { workOrderId: 'wo-1', picPenjahit: 'Ayu', qtySelesai: 1, tanggalLaporan: '2026-08-05' },
  ], 'Ayu', '2026-08', workOrders);

  assert.deepEqual(result, [
    { qtyRealisasi: 1, nilai: 1_500 },
    { qtyRealisasi: 0, nilai: 0 },
  ]);
});

test('alokasi duplicate legacy mempertahankan total dan memecahkan seri berdasarkan urutan detail', () => {
  const result = calculateDetailRealizations([
    { productNote: null, product: 'Dress', warna: null, qtyTarget: 10, hargaJahit: 1000, hargaObras: 500 },
    { productNote: null, product: 'Dress', warna: null, qtyTarget: 10, hargaJahit: 1000, hargaObras: 500 },
  ], [
    { workOrderId: 'wo-1', picPenjahit: 'Ayu', qtySelesai: 1, tanggalLaporan: '2026-08-05' },
  ], 'Ayu', '2026-08', workOrders);

  assert.deepEqual(result, [
    { qtyRealisasi: 1, nilai: 1_500 },
    { qtyRealisasi: 0, nilai: 0 },
  ]);
});
