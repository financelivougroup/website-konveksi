import assert from 'node:assert/strict';
import test from 'node:test';
import { filterDebtRowsByLatestAccum } from '../src/lib/staffDebtEligibility.ts';

test('menampilkan staf hanya ketika selisih akumulasi bulan terbarunya masih negatif', () => {
  const debtRows = [
    { nama: 'Ayu', utang: 500_000 },
    { nama: 'Budi', utang: 300_000 },
  ];
  const targets = [
    { nama: 'Ayu', bulan_tahun: '2026-01', selisihAccum: -20 },
    { nama: 'Ayu', bulan_tahun: '2026-02', selisihAccum: 5 },
    { nama: 'Budi', bulan_tahun: '2026-01', selisihAccum: 4 },
    { nama: 'Budi', bulan_tahun: '2026-02', selisihAccum: -3 },
  ];

  assert.deepEqual(filterDebtRowsByLatestAccum(debtRows, targets), [
    { nama: 'Budi', utang: 300_000 },
  ]);
});

test('tidak menampilkan staf dengan nominal utang nol walaupun akumulasi masih kurang', () => {
  const debtRows = [{ nama: 'Citra', utang: 0 }];
  const targets = [
    { nama: 'Citra', bulan_tahun: '2026-02', selisihAccum: -8 },
  ];

  assert.deepEqual(filterDebtRowsByLatestAccum(debtRows, targets), []);
});

test('tidak menampilkan staf yang belum memiliki snapshot target', () => {
  const debtRows = [{ nama: 'Deni', utang: 250_000 }];

  assert.deepEqual(filterDebtRowsByLatestAccum(debtRows, []), []);
});
