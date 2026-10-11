import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupPlanningForGeneration,
  isGeneratablePlanningRow,
  type PlanningGenerationRow,
} from '../src/lib/targetGeneration.ts';

// Permintaan user (verbatim):
//   "buat planning produksi harusnya cara generatenya itu dengan cara: klik
//    checkboxnya baru generate. jadi meskipun di bulan yg sama dan nama
//    penjahitnya sama, ga masalah"
//
// lalu dikoreksi:
//   "sorry buat target jahit. harusnya ga kebuat row baru. tapi jumlah targetnya
//    aja yg nambah"
//
// Aturan yang berlaku (koreksi terakhir):
//   1. Yang diproses hanya baris yang dipilih, dikelompokkan per (penjahit, bulan)
//      dari baris itu SENDIRI — bukan satu bulan yang dipilih di toolbar.
//   2. Satu penjahit = SATU baris target per bulan. Generate berikutnya MENAMBAH
//      jumlahnya, bukan membuat baris target baru. Karena itu qty baris-baris
//      dalam satu kelompok dijumlahkan menjadi satu angka.

function row(over: Partial<PlanningGenerationRow> = {}): PlanningGenerationRow {
  return {
    id: 1,
    namaPenjahit: 'Suwati',
    productNote: 'PO/001-LVU/09/2026/002',
    product: 'Odette Shirt',
    warna: 'Ivory',
    qty: 40,
    bulanTarget: '2026-09',
    ...over,
  };
}

test('baris satu penjahit + satu bulan menjadi satu kelompok', () => {
  const groups = groupPlanningForGeneration([
    row({ id: 1, qty: 40 }),
    row({ id: 2, product: 'Gena Pants', qty: 60 }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].namaPenjahit, 'Suwati');
  assert.equal(groups[0].bulanTarget, '2026-09');
  assert.equal(groups[0].totalQty, 100);
  assert.equal(groups[0].rows.length, 2);
});

test('qty satu kelompok dijumlahkan — jadi satu angka yang ditambahkan ke target', () => {
  // Inilah "jumlah targetnya aja yg nambah": satu baris target per penjahit+bulan,
  // qty-nya bertambah. Dua baris planning tidak boleh menjadi dua baris target.
  const groups = groupPlanningForGeneration([
    row({ id: 1, qty: 80, bulanTarget: '2026-09' }),
    row({ id: 2, qty: 40, bulanTarget: '2026-09' }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].totalQty, 120);
});

test('bulan berbeda dipisah walau penjahitnya sama', () => {
  const groups = groupPlanningForGeneration([
    row({ id: 1, bulanTarget: '2026-09', qty: 40 }),
    row({ id: 2, bulanTarget: '2026-10', qty: 50 }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.bulanTarget),
    ['2026-09', '2026-10'],
  );
  assert.equal(groups[0].totalQty, 40);
  assert.equal(groups[1].totalQty, 50);
});

test('penjahit berbeda dipisah walau bulannya sama', () => {
  const groups = groupPlanningForGeneration([
    row({ id: 1, namaPenjahit: 'Suwati' }),
    row({ id: 2, namaPenjahit: 'Sidik Faisal' }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.namaPenjahit),
    ['Suwati', 'Sidik Faisal'],
  );
});

test('urutan kemunculan dipertahankan (hasil deterministik)', () => {
  const groups = groupPlanningForGeneration([
    row({ id: 1, namaPenjahit: 'Suwati', bulanTarget: '2026-10' }),
    row({ id: 2, namaPenjahit: 'Sidik Faisal', bulanTarget: '2026-09' }),
    row({ id: 3, namaPenjahit: 'Suwati', bulanTarget: '2026-09' }),
  ]);
  assert.deepEqual(
    groups.map((g) => `${g.namaPenjahit}@${g.bulanTarget}`),
    ['Suwati@2026-10', 'Sidik Faisal@2026-09', 'Suwati@2026-09'],
  );
});

test('nama penjahit yang mengandung pemisah tidak menabrak kelompok lain', () => {
  // Nama bebas diketik, jadi pemisahnya harus karakter yang tidak mungkin muncul
  // di nama orang maupun di 'YYYY-MM'.
  const groups = groupPlanningForGeneration([
    row({ id: 1, namaPenjahit: 'Suwati', bulanTarget: '2026-09' }),
    row({ id: 2, namaPenjahit: 'Suwati\u00002026-09', bulanTarget: '2026-10' }),
  ]);
  assert.equal(groups.length, 2);
});

test('qty tidak valid dihitung 0, bukan NaN', () => {
  const groups = groupPlanningForGeneration([
    row({ id: 1, qty: Number.NaN }),
    row({ id: 2, qty: 30 }),
  ]);
  assert.equal(groups[0].totalQty, 30);
  assert.equal(Number.isNaN(groups[0].totalQty), false);
});

test('daftar kosong menghasilkan nol kelompok', () => {
  assert.deepEqual(groupPlanningForGeneration([]), []);
});

test('baris tanpa nama atau bulan dianggap tidak bisa digenerate', () => {
  assert.equal(isGeneratablePlanningRow(row()), true);
  assert.equal(isGeneratablePlanningRow(row({ namaPenjahit: '' })), false);
  assert.equal(isGeneratablePlanningRow(row({ namaPenjahit: '   ' })), false);
  assert.equal(isGeneratablePlanningRow(row({ bulanTarget: '' })), false);
  assert.equal(isGeneratablePlanningRow(row({ bulanTarget: '  ' })), false);
});

test('baris tidak lengkap disaring sebelum dikelompokkan', () => {
  const rows = [
    row({ id: 1 }),
    row({ id: 2, namaPenjahit: '' }),
    row({ id: 3, bulanTarget: '' }),
  ].filter(isGeneratablePlanningRow);
  const groups = groupPlanningForGeneration(rows);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].rows.map((r) => r.id), [1]);
});
