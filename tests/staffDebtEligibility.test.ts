import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterDebtRowsByLatestAccum,
  computeDebtFromRows,
} from '../src/lib/staffDebtEligibility.ts';

test('menampilkan staf hanya ketika selisih cost akumulasi bulan terbarunya masih negatif', () => {
  const debtRows = [
    { nama: 'Ayu', utang: 500_000 },
    { nama: 'Budi', utang: 300_000 },
  ];
  const targets = [
    { nama: 'Ayu', bulan_tahun: '2026-01', selisihCostAccum: -20 },
    { nama: 'Ayu', bulan_tahun: '2026-02', selisihCostAccum: 5 },
    { nama: 'Budi', bulan_tahun: '2026-01', selisihCostAccum: 4 },
    { nama: 'Budi', bulan_tahun: '2026-02', selisihCostAccum: -3 },
  ];

  assert.deepEqual(filterDebtRowsByLatestAccum(debtRows, targets), [
    { nama: 'Budi', utang: 300_000 },
  ]);
});

test('tidak menampilkan staf dengan nominal utang nol walaupun akumulasi masih kurang', () => {
  const debtRows = [{ nama: 'Citra', utang: 0 }];
  const targets = [
    { nama: 'Citra', bulan_tahun: '2026-02', selisihCostAccum: -8 },
  ];

  assert.deepEqual(filterDebtRowsByLatestAccum(debtRows, targets), []);
});

test('tidak menampilkan staf yang belum memiliki snapshot target', () => {
  const debtRows = [{ nama: 'Deni', utang: 250_000 }];

  assert.deepEqual(filterDebtRowsByLatestAccum(debtRows, []), []);
});

// ===== computeDebtFromRows =====

test('utang kumulatif = total target cost - total realisasi cost', () => {
  const rows = [
    { nama: 'Ayu', target_cost_posisi: 1_500_000, realisasiCostPosisi: 900_000 },
    { nama: 'Ayu', target_cost_posisi: 1_000_000, realisasiCostPosisi: 400_000 },
  ];

  assert.deepEqual(computeDebtFromRows(rows), [
    {
      nama: 'Ayu',
      totalTargetCost: 2_500_000,
      totalRealisasiCost: 1_300_000,
      utang: 1_200_000,
    },
  ]);
});

test('staf yang realisasinya melampaui target tidak punya utang', () => {
  const rows = [
    { nama: 'Budi', target_cost_posisi: 1_000_000, realisasiCostPosisi: 1_400_000 },
  ];

  assert.equal(computeDebtFromRows(rows)[0].utang, 0);
});

test('utang bertambah akibat realisasi kosong, bukan dikurangi potongan', () => {
  // Regresi: dulu potongan complain mengurangi utang. Sekarang tidak ada
  // parameter potongan sama sekali pada fungsi ini.
  const rows = [
    { nama: 'Citra', target_cost_posisi: 2_000_000, realisasiCostPosisi: 0 },
  ];

  assert.equal(computeDebtFromRows(rows)[0].utang, 2_000_000);
});

test('setiap staf diakumulasi terpisah', () => {
  const rows = [
    { nama: 'Ayu', target_cost_posisi: 1_000_000, realisasiCostPosisi: 600_000 },
    { nama: 'Budi', target_cost_posisi: 1_000_000, realisasiCostPosisi: 1_000_000 },
    { nama: 'Ayu', target_cost_posisi: 500_000, realisasiCostPosisi: 100_000 },
  ];

  const result = computeDebtFromRows(rows);
  assert.equal(result.length, 2);
  assert.equal(result.find((r) => r.nama === 'Ayu')?.utang, 800_000);
  assert.equal(result.find((r) => r.nama === 'Budi')?.utang, 0);
});

test('baris kosong menghasilkan daftar kosong', () => {
  assert.deepEqual(computeDebtFromRows([]), []);
});
