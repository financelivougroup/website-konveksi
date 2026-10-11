import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMonthAggregates,
  buildPenjahitAggregates,
  buildPenjahitMonthRows,
  bulanReportOptions,
  formatRupiahRingkas,
  penjahitReportOptions,
  summarizeReport,
  targetJahitReportToCsv,
} from '../src/lib/targetJahitReport.ts';
import type { EnrichedTargetRow } from '../src/lib/targetCompute.ts';

/** Baris enriched minimal — hanya field yang dipakai agregasi laporan. */
function row(over: Partial<EnrichedTargetRow> & { nama: string; bulan_tahun: string }): EnrichedTargetRow {
  return {
    id: 1,
    posisi: 'Penjahit',
    target_monthly: 0,
    realisasiMonthly: 0,
    target_cost_posisi: 0,
    realisasiCostPosisi: 0,
    benefitAmount: 0,
    statusFinal: 'Berjalan',
    statusFinalAkumulasi: 'Berjalan',
    ...over,
  } as EnrichedTargetRow;
}

// ===== summarizeReport =====

test('KPI menjumlahkan target dan realisasi lintas penjahit', () => {
  const rows = [
    row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 200, realisasiMonthly: 50 }),
    row({ nama: 'Suwati', bulan_tahun: '2026-07', target_monthly: 200, realisasiMonthly: 100 }),
  ];
  const kpi = summarizeReport(rows, false);
  assert.equal(kpi.totalTarget, 400);
  assert.equal(kpi.totalRealisasi, 150);
  assert.equal(kpi.totalKurang, 250);
  assert.equal(kpi.pencapaian, 150 / 400);
  assert.equal(kpi.penjahitCount, 2);
  assert.equal(kpi.bulanCount, 1);
  assert.equal(kpi.baris, 2);
});

test('KPI tidak membagi nol saat seluruh target kosong', () => {
  const rows = [row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 0, realisasiMonthly: 0 })];
  const kpi = summarizeReport(rows, false);
  assert.equal(kpi.pencapaian, 0);
  assert.ok(Number.isFinite(kpi.pencapaian));
  assert.equal(kpi.totalKurang, 0);
});

test('realisasi melebihi target memberi kurang 0 dan pencapaian di atas 100%', () => {
  const rows = [row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 100, realisasiMonthly: 250 })];
  const kpi = summarizeReport(rows, false);
  assert.equal(kpi.totalKurang, 0, 'kelebihan tidak boleh jadi kurang negatif');
  assert.equal(kpi.pencapaian, 2.5);
});

test('includeCost=false tidak pernah menghitung sisa uang', () => {
  const rows = [
    row({
      nama: 'Sidik',
      bulan_tahun: '2026-07',
      target_monthly: 200,
      target_cost_posisi: 1_500_000,
      realisasiCostPosisi: 500_000,
    }),
  ];
  assert.equal(summarizeReport(rows, false).sisaUang, 0, 'inventory tidak boleh melihat angka biaya');
  assert.equal(summarizeReport(rows, true).sisaUang, 1_000_000);
});

test('sisa uang tidak negatif saat realisasi cost melebihi target cost', () => {
  const rows = [row({ nama: 'Sidik', bulan_tahun: '2026-07', target_cost_posisi: 100, realisasiCostPosisi: 400 })];
  assert.equal(summarizeReport(rows, true).sisaUang, 0);
});

test('KPI menghitung penjahit unik, bukan jumlah baris', () => {
  const rows = [
    row({ nama: 'Sidik', bulan_tahun: '2026-06', target_monthly: 100 }),
    row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 100 }),
  ];
  const kpi = summarizeReport(rows, false);
  assert.equal(kpi.penjahitCount, 1);
  assert.equal(kpi.bulanCount, 2);
  assert.equal(kpi.baris, 2);
});

// ===== buildMonthAggregates =====

test('agregasi bulan digabung lintas penjahit dan diurut menaik', () => {
  const rows = [
    row({ nama: 'Suwati', bulan_tahun: '2026-08', target_monthly: 100, realisasiMonthly: 40 }),
    row({ nama: 'Sidik', bulan_tahun: '2026-06', target_monthly: 200, realisasiMonthly: 10 }),
    row({ nama: 'Suwati', bulan_tahun: '2026-08', target_monthly: 50, realisasiMonthly: 5 }),
  ];
  const agg = buildMonthAggregates(rows);
  assert.deepEqual(agg.map((a) => a.bulan), ['2026-06', '2026-08'], 'urut menaik');
  const agustus = agg[1];
  assert.equal(agustus.target, 150);
  assert.equal(agustus.realisasi, 45);
  assert.equal(agustus.kurang, 105);
  assert.equal(agustus.penjahitCount, 1, 'Agustus hanya berisi Suwati (dua baris)');
  assert.equal(agustus.label, 'Agustus 2026');
});

test('agregasi bulan menyertakan biaya saat includeCost=true', () => {
  const rows = [
    row({
      nama: 'Sidik',
      bulan_tahun: '2026-07',
      target_cost_posisi: 1_500_000,
      realisasiCostPosisi: 400_000,
    }),
    row({
      nama: 'Suwati',
      bulan_tahun: '2026-07',
      target_cost_posisi: 1_100_000,
      realisasiCostPosisi: 100_000,
    }),
  ];
  const dengan = buildMonthAggregates(rows, true)[0];
  assert.equal(dengan.targetCost, 2_600_000);
  assert.equal(dengan.realisasiCost, 500_000);
});

test('agregasi bulan tidak menghitung biaya saat includeCost=false', () => {
  const rows = [
    row({ nama: 'Sidik', bulan_tahun: '2026-07', target_cost_posisi: 1_500_000, realisasiCostPosisi: 400_000 }),
  ];
  const tanpa = buildMonthAggregates(rows)[0];
  assert.equal(tanpa.targetCost, 0, 'inventory tidak boleh melihat angka biaya');
  assert.equal(tanpa.realisasiCost, 0);
});

// ===== Kumulatif bulanan =====

test('akumulasi menumpuk urut bulan menaik, bukan urut kedatangan baris', () => {
  // Sengaja diberi urutan terbalik: akumulasi harus mengikuti waktu, bukan urutan input.
  const rows = [
    row({ nama: 'Sidik', bulan_tahun: '2026-08', target_monthly: 100, realisasiMonthly: 30 }),
    row({ nama: 'Sidik', bulan_tahun: '2026-06', target_monthly: 200, realisasiMonthly: 50 }),
    row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 100, realisasiMonthly: 20 }),
  ];
  const agg = buildMonthAggregates(rows);
  assert.deepEqual(agg.map((m) => m.bulan), ['2026-06', '2026-07', '2026-08']);
  assert.deepEqual(agg.map((m) => m.targetAccum), [200, 300, 400]);
  assert.deepEqual(agg.map((m) => m.realisasiAccum), [50, 70, 100]);
});

test('kurang akumulasi = target kumulatif minus realisasi kumulatif, tidak negatif', () => {
  const rows = [
    row({ nama: 'Sidik', bulan_tahun: '2026-06', target_monthly: 100, realisasiMonthly: 40 }),
    row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 100, realisasiMonthly: 300 }),
  ];
  const agg = buildMonthAggregates(rows);
  assert.equal(agg[0].kurangAccum, 60);
  assert.equal(agg[1].kurangAccum, 0, 'realisasi akumulasi melebihi target -> 0, bukan negatif');
  assert.equal(agg[1].pencapaianAccum, 340 / 200);
});

test('akumulasi biaya menumpuk dan tetap 0 untuk role tanpa biaya', () => {
  const rows = [
    row({ nama: 'Sidik', bulan_tahun: '2026-06', target_cost_posisi: 1_000_000, realisasiCostPosisi: 200_000 }),
    row({ nama: 'Suwati', bulan_tahun: '2026-07', target_cost_posisi: 500_000, realisasiCostPosisi: 100_000 }),
  ];
  const dengan = buildMonthAggregates(rows, true);
  assert.deepEqual(dengan.map((m) => m.targetCostAccum), [1_000_000, 1_500_000]);
  assert.deepEqual(dengan.map((m) => m.realisasiCostAccum), [200_000, 300_000]);

  const tanpa = buildMonthAggregates(rows);
  assert.deepEqual(tanpa.map((m) => m.targetCostAccum), [0, 0], 'inventory tidak menghitung biaya');
});

test('satu bulan: akumulasi sama dengan nilai bulan itu', () => {
  const rows = [row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 200, realisasiMonthly: 0 })];
  const m = buildMonthAggregates(rows)[0];
  assert.equal(m.targetAccum, m.target);
  assert.equal(m.realisasiAccum, m.realisasi);
  assert.equal(m.pencapaianAccum, 0);
});

test('agregasi bulan melewati baris tanpa bulan', () => {
  const rows = [
    row({ nama: 'Sidik', bulan_tahun: '', target_monthly: 999 }),
    row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 100 }),
  ];
  const agg = buildMonthAggregates(rows);
  assert.equal(agg.length, 1, 'bulan kosong tidak boleh jadi kategori hantu');
  assert.equal(agg[0].target, 100);
});

// ===== buildPenjahitAggregates =====

test('agregasi penjahit menjumlahkan lintas bulan dan urut alfabet', () => {
  const rows = [
    row({ nama: 'Suwati', bulan_tahun: '2026-06', target_monthly: 100, realisasiMonthly: 100 }),
    row({ nama: 'Suwati', bulan_tahun: '2026-07', target_monthly: 100, realisasiMonthly: 0 }),
    row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 200, realisasiMonthly: 50 }),
  ];
  const agg = buildPenjahitAggregates(rows, false);
  assert.deepEqual(agg.map((a) => a.nama), ['Sidik', 'Suwati'], 'urut alfabet');
  const suwati = agg[1];
  assert.equal(suwati.target, 200);
  assert.equal(suwati.realisasi, 100);
  assert.equal(suwati.pencapaian, 0.5);
});

test('agregasi penjahit mengabaikan baris tanpa nama', () => {
  const rows = [
    row({ nama: '', bulan_tahun: '2026-07', target_monthly: 500 }),
    row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 100 }),
  ];
  const agg = buildPenjahitAggregates(rows, false);
  assert.equal(agg.length, 1);
  assert.equal(agg[0].nama, 'Sidik');
});

test('includeCost=false mengosongkan seluruh kolom biaya penjahit', () => {
  const rows = [
    row({
      nama: 'Sidik',
      bulan_tahun: '2026-07',
      target_monthly: 200,
      target_cost_posisi: 1_500_000,
      realisasiCostPosisi: 500_000,
      benefitAmount: 25_000,
    }),
  ];
  const tanpa = buildPenjahitAggregates(rows, false)[0];
  assert.equal(tanpa.targetCost, 0);
  assert.equal(tanpa.realisasiCost, 0);
  assert.equal(tanpa.sisaUang, 0);

  const dengan = buildPenjahitAggregates(rows, true)[0];
  assert.equal(dengan.targetCost, 1_500_000);
  assert.equal(dengan.realisasiCost, 500_000);
  assert.equal(dengan.sisaUang, 1_000_000);
});

test('benefit amount sudah tidak lagi menjadi bagian agregat penjahit', () => {
  const rows = [row({ nama: 'Sidik', bulan_tahun: '2026-07', benefitAmount: 25_000 })];
  const agg = buildPenjahitAggregates(rows, true)[0];
  assert.ok(!('benefitAmount' in agg), 'kolom benefit sudah dihapus dari laporan');
});

test('posisi diambil dari baris yang punya nilai', () => {
  const rows = [
    row({ nama: 'Sidik', bulan_tahun: '2026-06', posisi: null }),
    row({ nama: 'Sidik', bulan_tahun: '2026-07', posisi: 'Penjahit' }),
  ];
  assert.equal(buildPenjahitAggregates(rows, false)[0].posisi, 'Penjahit');
});

// ===== buildPenjahitMonthRows =====

test('rincian bulanan per penjahit hanya memuat penjahit itu', () => {
  const rows = [
    row({ nama: 'Sidik', bulan_tahun: '2026-06', target_monthly: 100, realisasiMonthly: 30 }),
    row({ nama: 'Suwati', bulan_tahun: '2026-06', target_monthly: 999, realisasiMonthly: 999 }),
    row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 200, realisasiMonthly: 20 }),
  ];
  const out = buildPenjahitMonthRows(rows, 'Sidik');
  assert.deepEqual(out.map((r) => r.bulan), ['2026-06', '2026-07']);
  assert.equal(out[0].target, 100, 'target penjahit lain tidak boleh bocor');
  assert.equal(out[0].kurang, 70);
  assert.equal(out[1].pencapaian, 0.1);
});

test('penjahit tanpa baris di suatu bulan tidak menghasilkan baris nol palsu', () => {
  const rows = [row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 200 })];
  const out = buildPenjahitMonthRows(rows, 'Iman');
  assert.deepEqual(out, [], 'bulan yang tidak punya target bukan berarti target 0');
});

test('rincian bulanan penjahit punya akumulasi yang menumpuk urut waktu', () => {
  const rows = [
    row({ nama: 'Sidik', bulan_tahun: '2026-08', target_monthly: 100, realisasiMonthly: 30 }),
    row({ nama: 'Sidik', bulan_tahun: '2026-06', target_monthly: 200, realisasiMonthly: 50 }),
    row({ nama: 'Suwati', bulan_tahun: '2026-07', target_monthly: 999, realisasiMonthly: 999 }),
  ];
  const out = buildPenjahitMonthRows(rows, 'Sidik');
  assert.deepEqual(out.map((r) => r.bulan), ['2026-06', '2026-08']);
  assert.deepEqual(out.map((r) => r.targetAccum), [200, 300], 'penjahit lain tidak ikut menumpuk');
  assert.deepEqual(out.map((r) => r.realisasiAccum), [50, 80]);
  assert.equal(out[1].kurangAccum, 220);
});

test('rincian bulanan penjahit memenuhi bentuk bulanan bersama (biaya 0)', () => {
  const rows = [row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 200 })];
  const r = buildPenjahitMonthRows(rows, 'Sidik')[0];
  for (const k of ['target', 'realisasi', 'kurang', 'pencapaian'] as const) {
    assert.equal(typeof r[k], 'number', `${k} harus angka agar bisa dipakai grafik bersama`);
  }
  assert.equal(r.targetCost, 0);
  assert.equal(r.realisasiCostAccum, 0, 'biaya tidak dipecah per bulan di tab Per Penjahit');
});

// ===== Opsi slicer =====

test('opsi bulan terbaru lebih dulu dan berlabel Indonesia', () => {
  const rows = [
    row({ nama: 'Sidik', bulan_tahun: '2026-06' }),
    row({ nama: 'Sidik', bulan_tahun: '2026-08' }),
    row({ nama: 'Suwati', bulan_tahun: '2026-07' }),
  ];
  assert.deepEqual(bulanReportOptions(rows), [
    { value: '2026-08', label: 'Agustus 2026' },
    { value: '2026-07', label: 'Juli 2026' },
    { value: '2026-06', label: 'Juni 2026' },
  ]);
});

test('opsi penjahit urut alfabet, unik, dan menyertakan posisi', () => {
  const rows = [
    row({ nama: 'Suwati', bulan_tahun: '2026-07', posisi: 'Penjahit' }),
    row({ nama: 'Suwati', bulan_tahun: '2026-06', posisi: 'Penjahit' }),
    row({ nama: 'Iman', bulan_tahun: '2026-07', posisi: 'Leader' }),
  ];
  assert.deepEqual(penjahitReportOptions(rows), [
    { value: 'Iman', label: 'Iman · Leader' },
    { value: 'Suwati', label: 'Suwati · Penjahit' },
  ]);
});

test('opsi penjahit tanpa posisi tidak menampilkan pemisah kosong', () => {
  const rows = [row({ nama: 'Iman', bulan_tahun: '2026-07', posisi: null })];
  assert.deepEqual(penjahitReportOptions(rows), [{ value: 'Iman', label: 'Iman' }]);
});

test('opsi dibangun dari seluruh baris sehingga slicer tidak terjebak', () => {
  // Skenario: pengguna sudah memfilter ke Juli; opsi Juni harus tetap ada.
  const semua = [
    row({ nama: 'Sidik', bulan_tahun: '2026-06' }),
    row({ nama: 'Sidik', bulan_tahun: '2026-07' }),
  ];
  const opsi = bulanReportOptions(semua);
  assert.equal(opsi.length, 2, 'opsi tidak boleh dibangun dari hasil filter');
});

// ===== CSV =====

test('CSV per penjahit memuat header, baris, dan TOTAL', () => {
  const rows = [
    row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 200, realisasiMonthly: 50 }),
  ];
  const csv = targetJahitReportToCsv(rows, 'penjahit', false);
  assert.ok(csv.startsWith('﻿'), 'BOM agar Excel membaca UTF-8');
  const lines = csv.split('\r\n');
  assert.ok(lines[0].includes('"Pencapaian"'));
  assert.ok(lines[1].includes('"Sidik"'));
  assert.ok(lines[1].includes('"25.0%"'), 'pencapaian diformat persen');
  assert.ok(lines[lines.length - 1].includes('"TOTAL"'));
});

test('CSV per penjahit menyembunyikan kolom biaya saat includeCost=false', () => {
  const rows = [row({ nama: 'Sidik', bulan_tahun: '2026-07', target_monthly: 200, target_cost_posisi: 100 })];
  assert.ok(!targetJahitReportToCsv(rows, 'penjahit', false).includes('"Sisa Uang"'));
  assert.ok(targetJahitReportToCsv(rows, 'penjahit', true).includes('"Sisa Uang"'));
});

test('CSV tidak lagi memuat kolom Posisi, Bulan, dan Benefit Amount', () => {
  const rows = [
    row({
      nama: 'Sidik',
      bulan_tahun: '2026-07',
      posisi: 'Penjahit',
      target_monthly: 200,
      benefitAmount: 25_000,
    }),
  ];
  const csv = targetJahitReportToCsv(rows, 'penjahit', true);
  assert.ok(!csv.includes('"Posisi"'), 'kolom Posisi dihapus dari permintaan user');
  assert.ok(!csv.includes('"Benefit Amount"'), 'kolom Benefit dihapus dari permintaan user');
  const header = csv.split('\r\n')[0];
  assert.ok(!header.includes('"Bulan"'), 'kolom Bulan dihapus dari tabel penjahit');
});

test('CSV per bulan memakai label bulan dan menghitung total', () => {
  const rows = [
    row({ nama: 'Sidik', bulan_tahun: '2026-06', target_monthly: 100, realisasiMonthly: 10 }),
    row({ nama: 'Suwati', bulan_tahun: '2026-07', target_monthly: 100, realisasiMonthly: 90 }),
  ];
  const csv = targetJahitReportToCsv(rows, 'bulan', false);
  const lines = csv.split('\r\n');
  assert.ok(lines[0].includes('"Bulan"'));
  assert.ok(csv.includes('"Juni 2026"'));
  assert.ok(csv.includes('"Agustus"') === false, 'hanya bulan yang ada datanya');
  const total = lines[lines.length - 1];
  // 100 realisasi dari 200 target = 50%
  assert.ok(total.includes('"50.0%"'), `total harus 50%, dapat: ${total}`);
});

test('CSV meng-escape tanda kutip ganda', () => {
  const rows = [row({ nama: 'Nama "Spesial"', bulan_tahun: '2026-07', target_monthly: 10 })];
  const csv = targetJahitReportToCsv(rows, 'penjahit', false);
  assert.ok(csv.includes('"Nama ""Spesial"""'), 'kutip ganda di-escape agar CSV tidak rusak');
});

// ===== formatRupiahRingkas =====

test('rupiah ringkas memakai satuan jt/rb agar label aksis muat', () => {
  assert.equal(formatRupiahRingkas(26_000_000), '26 jt');
  assert.equal(formatRupiahRingkas(1_500_000), '1,5 jt');
  assert.equal(formatRupiahRingkas(750_000), '750 rb');
  assert.equal(formatRupiahRingkas(1_000_000_000), '1 m');
  assert.equal(formatRupiahRingkas(500), '500');
});

test('rupiah ringkas tidak pernah pecah karena pembulatan aneh', () => {
  assert.equal(formatRupiahRingkas(0), '0');
  assert.equal(formatRupiahRingkas(999), '999');
  assert.equal(formatRupiahRingkas(1_000), '1 rb');
  assert.equal(formatRupiahRingkas(1_999_999), '2 jt', 'dibulatkan ke satu desimal');
});
