import assert from 'node:assert/strict';
import test from 'node:test';
import { LAST_PAGE, LOG_PAGE_SIZE, clampPage, paginate, totalPages } from '../src/lib/pagination.ts';

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test('totalPages: nol baris tetap satu halaman', () => {
  assert.equal(totalPages(0), 1);
  assert.equal(totalPages(1), 1);
  assert.equal(totalPages(10), 1);
  assert.equal(totalPages(11), 2);
  assert.equal(totalPages(25), 3);
});

test('totalPages: pageSize nol atau negatif tidak menghasilkan Infinity', () => {
  assert.equal(totalPages(10, 0), 1);
  assert.equal(totalPages(10, -5), 1);
});

test('clampPage: halaman di luar jangkauan ditarik ke halaman terakhir', () => {
  // 25 baris / 10 per halaman = 3 halaman.
  assert.equal(clampPage(1, 25), 1);
  assert.equal(clampPage(3, 25), 3);
  assert.equal(clampPage(9, 25), 3);
});

test('clampPage: hasil pencarian menyusut tidak lagi menghasilkan halaman kosong', () => {
  // Sedang di halaman 5 dari 60 baris, lalu search menyisakan 4 baris.
  assert.equal(clampPage(5, 4), 1);
  assert.deepEqual(paginate(rows(4), 5), [1, 2, 3, 4]);
});

test('clampPage: data kosong selalu halaman 1', () => {
  assert.equal(clampPage(7, 0), 1);
  assert.deepEqual(paginate([], 7), []);
});

test('clampPage: nilai tidak valid jatuh ke halaman 1', () => {
  assert.equal(clampPage(0, 25), 1);
  assert.equal(clampPage(-3, 25), 1);
  assert.equal(clampPage(Number.NaN, 25), 1);
  assert.equal(clampPage(Number.POSITIVE_INFINITY, 25), 1);
});

test('clampPage: nomor halaman pecahan dibulatkan turun', () => {
  assert.equal(clampPage(2.7, 25), 2);
});

test('paginate: irisan per halaman tidak tumpang tindih', () => {
  const data = rows(25);
  assert.deepEqual(paginate(data, 1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(paginate(data, 2), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.deepEqual(paginate(data, 3), [21, 22, 23, 24, 25]);
});

test('paginate: irisan terakhir tidak melampaui jumlah baris', () => {
  assert.equal(paginate(rows(25), 3).length, 5);
  assert.equal(paginate(rows(20), 2).length, 10);
  // 20 baris cuma punya 2 halaman; halaman 3 di-clamp jadi 2 (isi penuh),
  // bukan irisan kosong — itu sebabnya tabel tidak pernah tampil kosong.
  assert.deepEqual(paginate(rows(20), 3), paginate(rows(20), 2));
});

test('paginate: ukuran halaman bisa diubah', () => {
  assert.deepEqual(paginate(rows(5), 1, 2), [1, 2]);
  assert.deepEqual(paginate(rows(5), 3, 2), [5]);
});

test('LOG_PAGE_SIZE dipakai sebagai default', () => {
  assert.equal(paginate(rows(15), 1).length, LOG_PAGE_SIZE);
  assert.equal(paginate(rows(15), 2).length, 5);
});

// ===== LAST_PAGE =====
//
// Dipakai halaman yang urutannya kronologis (Expense): baris yang baru disimpan
// ada di PALING BAWAH, jadi setelah menyimpan halaman harus mendarat di halaman
// terakhir. Nilainya sengaja berupa angka besar, bukan hasil `totalPages`,
// karena pemanggilnya baru memuat ulang data — jumlah baris di tangannya masih
// yang lama.

test('LAST_PAGE selalu ditarik ke halaman terakhir', () => {
  assert.equal(clampPage(LAST_PAGE, 25), 3);
  assert.equal(clampPage(LAST_PAGE, 11), 2);
  assert.equal(clampPage(LAST_PAGE, 10), 1);
});

test('LAST_PAGE tetap benar walau jumlah baris belum diketahui', () => {
  // Inilah alasan nilainya angka besar: satu baris pertama pun tetap sah.
  assert.equal(clampPage(LAST_PAGE, 1), 1);
  assert.equal(clampPage(LAST_PAGE, 0), 1);
});

test('LAST_PAGE mendarat di irisan yang memuat baris terakhir', () => {
  const data = rows(25);
  const last = paginate(data, LAST_PAGE);
  assert.deepEqual(last, [21, 22, 23, 24, 25]);
  // Baris yang baru ditambahkan di ujung array pasti ikut terlihat.
  const withNew = [...data, 26];
  assert.equal(paginate(withNew, LAST_PAGE).includes(26), true);
});

test('LAST_PAGE bukan Infinity — clampPage menolak Infinity sebagai halaman 1', () => {
  // Kenapa tidak pakai `Infinity` sekalian: `clampPage` menganggapnya nilai
  // tidak valid dan mengembalikan 1, yang justru halaman PERTAMA.
  assert.equal(clampPage(Number.POSITIVE_INFINITY, 25), 1);
  assert.notEqual(clampPage(LAST_PAGE, 25), 1);
});
