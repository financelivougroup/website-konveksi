import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichTargetRows } from '../src/lib/targetCompute.ts';
import type { TargetJahitRow } from '../src/services/targetJahit.ts';

function row(over: Partial<TargetJahitRow> = {}): TargetJahitRow {
  return {
    id: 1,
    bulan_tahun: '2026-07',
    nama: 'Ayu',
    posisi: 'Penjahit',
    total_hari_kerja: 0,
    hari_kerja_hari_ini: 0,
    sisa_hari: 0,
    target_daily: 0,
    target_ngebut_hari: 0,
    target_monthly: 0,
    realisasi_monthly: 0,
    sisa_target_monthly: 0,
    progress_monthly: 0,
    status_final: null,
    target_cost_posisi: 0,
    realisasi_cost_posisi: 0,
    target_accum: 0,
    realisasi_accum: 0,
    selisih_accum: 0,
    target_ngebut_hari_akumulasi: 0,
    progress_accum: 0,
    status_final_akumulasi: null,
    benefit_per_pcs: null,
    ...over,
  };
}

// 2026-07 sudah lewat, sehingga status final bersifat definitif.
const TODAY = new Date('2026-09-06T00:00:00');

test('akumulasi target dan realisasi dihitung dalam Rupiah', () => {
  const result = enrichTargetRows(
    [
      row({ id: 1, bulan_tahun: '2026-07', target_cost_posisi: 1_500_000 }),
      row({ id: 2, bulan_tahun: '2026-08', target_cost_posisi: 1_000_000 }),
    ],
    [],
    new Map(),
    {},
    [],
    [],
    TODAY,
  );

  assert.equal(result[0].targetCostAccum, 1_500_000);
  assert.equal(result[1].targetCostAccum, 2_500_000);
});

test('selisih cost akumulasi negatif berarti masih kurang', () => {
  const result = enrichTargetRows(
    [row({ id: 1, bulan_tahun: '2026-07', target_cost_posisi: 1_000_000 })],
    [],
    new Map(),
    {},
    [],
    [],
    TODAY,
  );

  // realisasi 0 -> selisih = -1.000.000
  assert.equal(result[0].selisihCostAccum, -1_000_000);
  assert.equal(result[0].progressCostAccum, 0);
});

test('sisa uang akumulasi tidak pernah negatif', () => {
  const result = enrichTargetRows(
    [row({ id: 1, bulan_tahun: '2026-07', target_cost_posisi: 1_000_000 })],
    [],
    new Map(),
    {},
    [],
    [],
    TODAY,
  );

  assert.equal(result[0].sisaUangAccum, 1_000_000);
  assert.equal(result[0].sisaUangMonthly, 1_000_000);
});

test('akumulasi terpisah per penjahit', () => {
  const result = enrichTargetRows(
    [
      row({ id: 1, nama: 'Ayu', bulan_tahun: '2026-07', target_cost_posisi: 1_000_000 }),
      row({ id: 2, nama: 'Budi', bulan_tahun: '2026-07', target_cost_posisi: 2_000_000 }),
      row({ id: 3, nama: 'Ayu', bulan_tahun: '2026-08', target_cost_posisi: 500_000 }),
    ],
    [],
    new Map(),
    {},
    [],
    [],
    TODAY,
  );

  const ayu = result.filter((r) => r.nama === 'Ayu');
  const budi = result.find((r) => r.nama === 'Budi');
  assert.equal(ayu[1].targetCostAccum, 1_500_000);
  assert.equal(budi?.targetCostAccum, 2_000_000);
});

test('Target Ngebut harian tetap dihitung dalam pcs', () => {
  const result = enrichTargetRows(
    [
      row({
        id: 1,
        bulan_tahun: '2026-09',
        target_monthly: 300,
        // sisa_hari tidak dibaca dari row; dihitung dari tanggal hari ini.
      }),
    ],
    [],
    new Map(),
    {},
    [],
    [],
    TODAY,
  );

  // Bulan berjalan: sisa hari > 0, sehingga target ngebut harian terisi.
  assert.ok(result[0].targetNgebutHari > 0);
});
