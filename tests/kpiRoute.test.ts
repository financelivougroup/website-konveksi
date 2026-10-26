import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alamatMasuk,
  normalisasiJalur,
  orangDariJalur,
  tentukanRute,
  type RuteScope,
} from '../src/lib/kpiRoute.ts';

/**
 * Tes aturan rute dashboard Kinerja Produksi.
 *
 * Fokusnya BUKAN "apakah React menampilkan halaman yang benar", melainkan
 * "apakah penjahit bisa diarahkan ke data orang lain". Yang kedua bisa
 * dibuktikan di sini; yang pertama butuh browser.
 */

const OWNER: RuteScope = { orangId: null, bisaTim: true, punyaAkses: true };
const PENJAHIT_7: RuteScope = { orangId: 7, bisaTim: false, punyaAkses: true };
const FINISHING_8: RuteScope = { orangId: 8, bisaTim: false, punyaAkses: true };
const TANPA_AKSES: RuteScope = { orangId: null, bisaTim: false, punyaAkses: false };

// ===========================================================================
// Normalisasi & pembacaan alamat
// ===========================================================================

test('normalisasi membuang garis miring di ujung', () => {
  assert.equal(normalisasiJalur('/laporan/team/'), '/laporan/team');
  assert.equal(normalisasiJalur('/laporan/team///'), '/laporan/team');
});

test('normalisasi menjaga akar tetap satu garis miring', () => {
  assert.equal(normalisasiJalur('/'), '/');
  assert.equal(normalisasiJalur(''), '/');
  assert.equal(normalisasiJalur('///'), '/');
});

test('normalisasi membuang query dan hash', () => {
  assert.equal(normalisasiJalur('/laporan/orang/7?tab=harian'), '/laporan/orang/7');
  assert.equal(normalisasiJalur('/laporan/team#ringkasan'), '/laporan/team');
});

test('orangDariJalur hanya menerima angka positif', () => {
  assert.equal(orangDariJalur('/laporan/orang/7'), 7);
  assert.equal(orangDariJalur('/laporan/orang/7/'), 7);
  assert.equal(orangDariJalur('/laporan/orang/0'), null);
  assert.equal(orangDariJalur('/laporan/orang/-3'), null);
  assert.equal(orangDariJalur('/laporan/orang/abc'), null);
  assert.equal(orangDariJalur('/laporan/orang/7/x'), null);
  assert.equal(orangDariJalur('/laporan/team'), null);
});

// ===========================================================================
// owner / finance
// ===========================================================================

test('owner diarahkan dari /laporan ke halaman tim', () => {
  assert.deepEqual(tentukanRute('/laporan', OWNER), { jenis: 'alihkan', ke: '/laporan/team' });
});

test('owner melihat halaman tim di /laporan/team', () => {
  assert.deepEqual(tentukanRute('/laporan/team', OWNER), { jenis: 'tim' });
});

test('owner boleh membuka halaman orang mana pun', () => {
  assert.deepEqual(tentukanRute('/laporan/orang/7', OWNER), { jenis: 'orang', orangId: 7 });
  assert.deepEqual(tentukanRute('/laporan/orang/8', OWNER), { jenis: 'orang', orangId: 8 });
  assert.deepEqual(tentukanRute('/laporan/orang/999', OWNER), { jenis: 'orang', orangId: 999 });
});

test('owner pada alamat tak dikenal dikembalikan ke tim, bukan halaman kosong', () => {
  assert.deepEqual(tentukanRute('/laporan/xyz', OWNER), { jenis: 'alihkan', ke: '/laporan/team' });
});

// ===========================================================================
// penjahit / finishing — inti pembatasan
// ===========================================================================

test('penjahit diarahkan dari /laporan ke alamat dirinya sendiri', () => {
  assert.deepEqual(tentukanRute('/laporan', PENJAHIT_7), {
    jenis: 'alihkan',
    ke: '/laporan/orang/7',
  });
});

test('penjahit TIDAK mendapat halaman tim walau mengetik /laporan/team', () => {
  assert.deepEqual(tentukanRute('/laporan/team', PENJAHIT_7), {
    jenis: 'alihkan',
    ke: '/laporan/orang/7',
  });
});

test('penjahit yang mengetik id orang lain tetap diarahkan ke dirinya sendiri', () => {
  // Inilah kasus yang dijaga: id di URL tidak pernah dipercaya.
  assert.deepEqual(tentukanRute('/laporan/orang/8', PENJAHIT_7), {
    jenis: 'alihkan',
    ke: '/laporan/orang/7',
  });
  assert.deepEqual(tentukanRute('/laporan/orang/1', PENJAHIT_7), {
    jenis: 'alihkan',
    ke: '/laporan/orang/7',
  });
});

test('penjahit pada alamat dirinya sendiri dilayani tanpa pengalihan', () => {
  assert.deepEqual(tentukanRute('/laporan/orang/7', PENJAHIT_7), { jenis: 'orang', orangId: 7 });
});

test('finishing mengikuti aturan yang sama dengan penjahit', () => {
  assert.deepEqual(tentukanRute('/laporan/orang/7', FINISHING_8), {
    jenis: 'alihkan',
    ke: '/laporan/orang/8',
  });
  assert.deepEqual(tentukanRute('/laporan/orang/8', FINISHING_8), { jenis: 'orang', orangId: 8 });
});

test('alamat aneh milik penjahit tetap jatuh ke dirinya sendiri', () => {
  assert.deepEqual(tentukanRute('/laporan/xyz', PENJAHIT_7), {
    jenis: 'alihkan',
    ke: '/laporan/orang/7',
  });
  assert.deepEqual(tentukanRute('/laporan/orang/abc', PENJAHIT_7), {
    jenis: 'alihkan',
    ke: '/laporan/orang/7',
  });
});

// ===========================================================================
// akun tanpa akses
// ===========================================================================

test('akun tanpa orang_id tidak diarahkan ke halaman tim', () => {
  assert.deepEqual(tentukanRute('/laporan/team', TANPA_AKSES), { jenis: 'tanpa-akses' });
});

test('akun tanpa orang_id tidak diarahkan ke halaman orang', () => {
  assert.deepEqual(tentukanRute('/laporan/orang/7', TANPA_AKSES), { jenis: 'tanpa-akses' });
  assert.deepEqual(tentukanRute('/laporan', TANPA_AKSES), { jenis: 'tanpa-akses' });
});

test('punyaAkses false menang atas bisaTim true', () => {
  // Tidak boleh terjadi di database, tetapi kalau terjadi, hasilnya harus
  // menolak — bukan membuka halaman tim.
  assert.deepEqual(
    tentukanRute('/laporan/team', { orangId: null, bisaTim: true, punyaAkses: false }),
    { jenis: 'tanpa-akses' },
  );
});

test('bisaTim false dengan orangId null dianggap tanpa akses', () => {
  assert.deepEqual(
    tentukanRute('/laporan/orang/7', { orangId: null, bisaTim: false, punyaAkses: true }),
    { jenis: 'tanpa-akses' },
  );
});

// ===========================================================================
// titik masuk
// ===========================================================================

test('alamat masuk selalu /laporan, bukan /laporan/team', () => {
  // Kalau titik masuk langsung /laporan/team, penjahit akan sempat melihat
  // kerangka halaman tim sebelum dialihkan.
  assert.equal(alamatMasuk(), '/laporan');
});
