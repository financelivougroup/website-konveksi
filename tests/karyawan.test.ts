import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activePenjahitNames,
  activeKancingNames,
  activeFinishingNames,
  isActivePenjahit,
  type KaryawanSelectionRow,
} from '../src/lib/karyawan.ts';

// Tiga baris di bawah adalah isi NYATA `register_penjahit` hasil query Supabase
// MCP. Perhatikan: hanya Suwati yang Aktif DAN berposisi Penjahit — itulah satu-
// satunya nama yang boleh muncul di dropdown Penjahit Entry Jahitan.
const LIVE_ROWS: KaryawanSelectionRow[] = [
  { picPenjahit: 'Iman', posisi: 'Leader', status: 'Aktif' },
  { picPenjahit: 'Suwati', posisi: 'Penjahit', status: 'Aktif' },
  { picPenjahit: 'Sidik Faisal', posisi: 'Penjahit', status: 'Non-Aktif' },
];

test('hanya karyawan Aktif berposisi Penjahit yang lolos', () => {
  assert.equal(isActivePenjahit(LIVE_ROWS[0]), false); // Leader walau Aktif
  assert.equal(isActivePenjahit(LIVE_ROWS[1]), true); // Suwati
  assert.equal(isActivePenjahit(LIVE_ROWS[2]), false); // Penjahit tapi Non-Aktif
});

test('daftar nama live hanya berisi Suwati', () => {
  // Inti laporan user: "saat ini harusnya cuma ada Suwati aja".
  assert.deepEqual(activePenjahitNames(LIVE_ROWS), ['Suwati']);
});

test('nama dummy yang dulu hardcoded tidak mungkin lolos', () => {
  // Daftar lama di SewingEntryForm: orang-orang ini tidak ada di
  // register_penjahit sama sekali, jadi tidak boleh muncul.
  const dummy = ['Budi Santoso', 'Ani Wulandari', 'Caca', 'Dedi Kurniawan', 'Eka Prasetya', 'Fitri Handayani'];
  const names = activePenjahitNames(LIVE_ROWS);
  for (const n of dummy) {
    assert.equal(names.includes(n), false, `${n} seharusnya tidak ada`);
  }
});

test('urutan mengikuti baris aslinya, bukan diacak', () => {
  const rows: KaryawanSelectionRow[] = [
    { picPenjahit: 'Zulkifli', posisi: 'Penjahit', status: 'Aktif' },
    { picPenjahit: 'Ahmad', posisi: 'Penjahit', status: 'Aktif' },
  ];
  assert.deepEqual(activePenjahitNames(rows), ['Zulkifli', 'Ahmad']);
});

test('posisi dan status dibandingkan tanpa peduli huruf besar-kecil', () => {
  // Isi kolom diketik bebas di Register Karyawan.
  assert.equal(isActivePenjahit({ picPenjahit: 'A', posisi: 'penjahit', status: 'AKTIF' }), true);
  assert.equal(isActivePenjahit({ picPenjahit: 'A', posisi: 'PENJAHIT', status: 'aktif' }), true);
  assert.equal(isActivePenjahit({ picPenjahit: 'A', posisi: 'Penjahit', status: 'non-aktif' }), false);
});

test('posisi null atau kosong tidak lolos', () => {
  assert.equal(isActivePenjahit({ picPenjahit: 'A', posisi: null, status: 'Aktif' }), false);
  assert.equal(isActivePenjahit({ picPenjahit: 'A', posisi: '', status: 'Aktif' }), false);
  assert.equal(isActivePenjahit({ picPenjahit: 'A', posisi: '   ', status: 'Aktif' }), false);
});

test('posisi serupa tapi bukan Penjahit tetap ditolak', () => {
  // "Penjahitan" atau "Penjahit Leader" bukan nilai kolom yang sah.
  assert.equal(isActivePenjahit({ picPenjahit: 'A', posisi: 'Penjahitan', status: 'Aktif' }), false);
  assert.equal(isActivePenjahit({ picPenjahit: 'A', posisi: 'Leader', status: 'Aktif' }), false);
  assert.equal(isActivePenjahit({ picPenjahit: 'A', posisi: 'Finishing', status: 'Aktif' }), false);
});

const PIC_ROWS: KaryawanSelectionRow[] = [
  { picPenjahit: 'Jahit Aktif', posisi: 'Penjahit', status: 'Aktif' },
  { picPenjahit: 'Finish Aktif', posisi: 'Finishing', status: 'Aktif' },
  { picPenjahit: 'Leader', posisi: 'Leader', status: 'Aktif' },
  { picPenjahit: 'Jahit Nonaktif', posisi: 'Penjahit', status: 'Non-Aktif' },
  { picPenjahit: 'Finish Nonaktif', posisi: 'Finishing', status: 'Non-Aktif' },
  { picPenjahit: 'Tanpa Posisi', posisi: null, status: 'Aktif' },
];

test('PIC Kancing berasal dari Penjahit dan Finishing aktif, bukan Leader/nonaktif', () => {
  assert.deepEqual(activeKancingNames(PIC_ROWS), ['Jahit Aktif', 'Finish Aktif']);
});

test('PIC Finishing hanya berasal dari Finishing aktif', () => {
  assert.deepEqual(activeFinishingNames(PIC_ROWS), ['Finish Aktif']);
  assert.deepEqual(activePenjahitNames(PIC_ROWS), ['Jahit Aktif']);
});

test('PIC baru menerima kapitalisasi berbeda dan daftar kosong', () => {
  const rows = [{ picPenjahit: 'Finisher', posisi: 'FINISHING', status: 'aktif' }];
  assert.deepEqual(activeKancingNames(rows), ['Finisher']);
  assert.deepEqual(activeFinishingNames(rows), ['Finisher']);
  assert.deepEqual(activeKancingNames([]), []);
  assert.deepEqual(activeFinishingNames([]), []);
});

test('tanpa baris, daftarnya kosong', () => {
  assert.deepEqual(activePenjahitNames([]), []);
});

test('baris tanpa nama tidak menghasilkan entri kosong', () => {
  // Penjaga bentuk: nama kosong bukan penjahit yang bisa dipilih.
  const rows: KaryawanSelectionRow[] = [
    { picPenjahit: '', posisi: 'Penjahit', status: 'Aktif' },
    { picPenjahit: 'Suwati', posisi: 'Penjahit', status: 'Aktif' },
  ];
  assert.deepEqual(activePenjahitNames(rows), ['', 'Suwati']);
});
