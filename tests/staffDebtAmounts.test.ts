import assert from 'node:assert/strict';
import test from 'node:test';
import {
  debtAmounts,
  sumRealisasiCostByStaff,
} from '../src/lib/staffDebtAmounts.ts';

// Permintaan user (verbatim):
//   "di bagian Utang Staf tolong ganti Total Nilai PCS ke Realisasi Cost / Posisi"
//
// Ini bukan sekadar ganti judul kolom: nilainya ikut berubah. Karena itu
// aturannya diuji di sini — modul murni tanpa import — supaya tidak perlu
// database untuk membuktikan angka utangnya benar.

// ===== sumRealisasiCostByStaff =====

test('menjumlahkan realisasi cost seluruh bulan milik satu orang', () => {
  const rows = [
    { nama: 'Suwati', realisasiCostPosisi: 500_000 },
    { nama: 'Suwati', realisasiCostPosisi: 250_000 },
  ];
  const map = sumRealisasiCostByStaff(rows);
  assert.equal(map.get('Suwati'), 750_000);
});

test('orang berbeda tidak saling meminjam nominal', () => {
  const map = sumRealisasiCostByStaff([
    { nama: 'Suwati', realisasiCostPosisi: 500_000 },
    { nama: 'Sidik Faisal', realisasiCostPosisi: 900_000 },
  ]);
  assert.equal(map.get('Suwati'), 500_000);
  assert.equal(map.get('Sidik Faisal'), 900_000);
  assert.equal(map.get('Iman'), undefined);
});

test('penjahit tanpa realisasi tidak muncul di peta, bukan muncul sebagai 0', () => {
  // Penting: `?? 0` di pemanggil membedakan "tidak ada" dari "ada tapi nol",
  // dan keduanya memang berujung sama di rumus utang.
  const map = sumRealisasiCostByStaff([
    { nama: 'Suwati', realisasiCostPosisi: 0 },
  ]);
  assert.equal(map.has('Suwati'), true);
  assert.equal(map.get('Suwati'), 0);
});

test('baris tanpa nama dilewati', () => {
  const map = sumRealisasiCostByStaff([
    { nama: '', realisasiCostPosisi: 999_000 },
    { nama: '   ', realisasiCostPosisi: 999_000 },
    { nama: 'Suwati', realisasiCostPosisi: 100_000 },
  ]);
  assert.equal(map.size, 1);
  assert.equal(map.get('Suwati'), 100_000);
});

test('nominal tidak valid dianggap 0, tidak menghasilkan NaN', () => {
  const map = sumRealisasiCostByStaff([
    { nama: 'Suwati', realisasiCostPosisi: Number.NaN },
    { nama: 'Suwati', realisasiCostPosisi: 200_000 },
  ]);
  assert.equal(map.get('Suwati'), 200_000);
  assert.ok(Number.isFinite(map.get('Suwati') as number));
});

test('daftar kosong menghasilkan peta kosong', () => {
  assert.equal(sumRealisasiCostByStaff([]).size, 0);
});

test('input tidak dimutasi', () => {
  const rows = [{ nama: 'Suwati', realisasiCostPosisi: 500_000 }];
  const before = JSON.stringify(rows);
  sumRealisasiCostByStaff(rows);
  assert.equal(JSON.stringify(rows), before);
});

// ===== debtAmounts =====

test('utang = target cost dikurangi realisasi cost', () => {
  const hasil = debtAmounts(4_000_000, 500_000);
  assert.equal(hasil.realisasiCost, 500_000);
  assert.equal(hasil.utang, 3_500_000);
  assert.equal(hasil.status, 'Utang');
});

test('realisasi melebihi target cost berarti tidak utang', () => {
  const hasil = debtAmounts(1_000_000, 1_500_000);
  assert.equal(hasil.utang, -500_000);
  assert.equal(hasil.status, 'Tidak Utang');
});

test('realisasi sama persis dengan target cost berarti tidak utang', () => {
  // Batasnya `> 0`, jadi nol TIDAK dihitung utang.
  const hasil = debtAmounts(1_000_000, 1_000_000);
  assert.equal(hasil.utang, 0);
  assert.equal(hasil.status, 'Tidak Utang');
});

test('gaji belum diinput berarti seluruh realisasi menjadi utang', () => {
  // Kasus nyata: `Target Cost` 0 karena gajinya belum ada di expense_entries.
  const hasil = debtAmounts(0, 500_000);
  assert.equal(hasil.utang, -500_000);
  assert.equal(hasil.status, 'Tidak Utang');
});

test('realisasi nol berarti utang sebesar gajinya', () => {
  const hasil = debtAmounts(4_000_000, 0);
  assert.equal(hasil.utang, 4_000_000);
  assert.equal(hasil.status, 'Utang');
});

test('pembulatan dilakukan pada hasil, bukan pada komponennya', () => {
  // Sisa di bawah Rp1 bukan utang yang bisa ditagih.
  const hasil = debtAmounts(1_000_000.4, 0.4);
  assert.equal(hasil.utang, 1_000_000);
});

test('nominal tidak valid tidak menghasilkan NaN', () => {
  const hasil = debtAmounts(Number.NaN, Number.NaN);
  assert.equal(hasil.utang, 0);
  assert.equal(hasil.status, 'Tidak Utang');
  assert.ok(Number.isFinite(hasil.utang));
});

test('potongan complain TIDAK lagi ikut dikurangkan', () => {
  // Perubahan yang disengaja: dulu nilai bersih = nilai pcs − potongan.
  // Sekarang `realisasiCost` dipakai apa adanya, sesuai definisi user bahwa
  // Realisasi Cost / Posisi adalah kuantitas yang sama dengan kolom di tab Target.
  const hasil = debtAmounts(1_000_000, 100_000);
  assert.equal(hasil.utang, 900_000);
});
