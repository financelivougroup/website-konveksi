import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDefaultTableSettings,
  normalizeFrozen,
  parseTableSettings,
  toggleFrozen,
  visibleOrder,
  DEFAULT_TABLE_SETTINGS,
} from '../src/lib/columnFreeze.ts';

/**
 * Aturan freeze kolom. Yang diuji di sini adalah bentuk yang menentukan benar
 * atau tidaknya offset sticky di layar: daftar beku harus SELALU berupa awalan
 * rapat dari kolom yang terlihat.
 *
 * Alasannya ada di komentar `columnFreeze.ts`: TanStack mengangkat kolom yang
 * di-pin ke depan mengikuti urutan `state.columnPinning.start`, jadi daftar yang
 * berlubang bukan cuma soal offset — urutan kolomnya sendiri berubah.
 */

const ORDER = ['kode', 'client', 'produk', 'jahit', 'finishing'];

test('parseTableSettings: bentuk LAMA (array) tetap terbaca sebagai hidden', () => {
  // Bentuk sebelum fitur freeze: array key yang disembunyikan saja. Pengaturan
  // user yang sudah ada tidak boleh hilang karena bentuk penyimpanan berubah.
  const s = parseTableSettings(['posisi', 'status']);
  assert.deepEqual(s.hidden, ['posisi', 'status']);
  assert.deepEqual(s.frozen, []);
  assert.equal(s.headerFrozen, true);
});

test('parseTableSettings: bentuk BARU terbaca utuh', () => {
  const s = parseTableSettings({
    hidden: ['status'],
    frozen: ['kode', 'client'],
    headerFrozen: false,
  });
  assert.deepEqual(s.hidden, ['status']);
  assert.deepEqual(s.frozen, ['kode', 'client']);
  assert.equal(s.headerFrozen, false);
});

test('parseTableSettings: headerFrozen yang hilang berarti true (perilaku lama)', () => {
  // Grid sudah memasang headerSticky sejak dulu, jadi "tidak diatur" = menempel.
  assert.equal(parseTableSettings({ hidden: [], frozen: [] }).headerFrozen, true);
});

test('parseTableSettings: nilai rusak tidak melempar dan jatuh ke default', () => {
  for (const junk of [null, undefined, 0, 'teks', true, [], {}]) {
    const s = parseTableSettings(junk);
    assert.ok(Array.isArray(s.hidden), `hidden harus array untuk ${String(junk)}`);
    assert.ok(Array.isArray(s.frozen), `frozen harus array untuk ${String(junk)}`);
    assert.equal(typeof s.headerFrozen, 'boolean');
  }
});

test('parseTableSettings: anggota non-string di dalam array dibuang', () => {
  // localStorage bisa berisi apa saja kalau disunting tangan atau ditulis versi
  // lama yang berbeda. Key non-string akan membuat perbandingan kolom gagal
  // diam-diam, jadi lebih baik dibuang di perbatasan.
  const s = parseTableSettings({ hidden: ['a', 7, null, 'b'], frozen: [{}] });
  assert.deepEqual(s.hidden, ['a', 'b']);
  assert.deepEqual(s.frozen, []);
});

test('isDefaultTableSettings: header beku saja bukan penyimpangan', () => {
  // Default headerFrozen = true, jadi entri yang hanya berisi itu tidak perlu
  // disimpan — sama seperti perilaku lama yang menghapus entri kosong.
  assert.equal(isDefaultTableSettings(DEFAULT_TABLE_SETTINGS), true);
  assert.equal(
    isDefaultTableSettings({ hidden: [], frozen: [], headerFrozen: false }),
    false,
  );
  assert.equal(
    isDefaultTableSettings({ hidden: ['a'], frozen: [], headerFrozen: true }),
    false,
  );
  assert.equal(
    isDefaultTableSettings({ hidden: [], frozen: ['a'], headerFrozen: true }),
    false,
  );
});

test('visibleOrder: kolom tersembunyi dibuang, urutan lain tetap', () => {
  assert.deepEqual(visibleOrder(ORDER, ['produk']), ['kode', 'client', 'jahit', 'finishing']);
  assert.deepEqual(visibleOrder(ORDER, []), ORDER);
});

test('normalizeFrozen: daftar berlubang dipangkas jadi awalan rapat', () => {
  // `jahit` dibekukan tanpa `produk` di depannya: kalau dibiarkan, TanStack akan
  // mengangkat `jahit` ke paling kiri dan urutan kolom berubah di layar.
  assert.deepEqual(normalizeFrozen(ORDER, [], ['jahit']), []);
  assert.deepEqual(normalizeFrozen(ORDER, [], ['kode', 'jahit']), ['kode']);
  assert.deepEqual(normalizeFrozen(ORDER, [], ['kode', 'client']), ['kode', 'client']);
});

test('normalizeFrozen: kolom tersembunyi dibuang dari daftar beku', () => {
  // `client` disembunyikan: ia TIDAK boleh tertinggal di daftar beku (kolom
  // beku yang tidak dirender tidak dihitung TanStack, sehingga kolom di
  // sebelahnya memakai offset yang terlalu kecil dan saling menutupi).
  //
  // Awalan tidak putus di situ: kolom terlihat berurutan `kode, produk, jahit,
  // finishing`, dan `produk` memang persis di sebelah kanan `kode` — jadi
  // keduanya tetap awalan yang sah, dan urutan kolom di layar tidak berubah.
  // Yang penting adalah `client` hilang dari hasilnya.
  assert.deepEqual(
    normalizeFrozen(ORDER, ['client'], ['kode', 'client', 'produk']),
    ['kode', 'produk'],
  );
  // Kebalikannya: `produk` dibekukan sementara `kode` (tetangga kirinya yang
  // terlihat) tidak — awalan putus di `kode`, jadi keduanya dilepas. Ini yang
  // menjaga kolom beku tidak pernah melompat ke depan.
  assert.deepEqual(
    normalizeFrozen(ORDER, ['client'], ['client', 'produk']),
    [],
  );
});

test('normalizeFrozen: kolom tersembunyi di depan memutus awalan', () => {
  // `kode` disembunyikan: sekarang kolom terlihat dimulai dari `client`, jadi
  // daftar beku pun harus mulai dari sana.
  assert.deepEqual(normalizeFrozen(ORDER, ['kode'], ['kode', 'client']), ['client']);
});

test('normalizeFrozen: key yang sudah tidak ada di tabel dibuang', () => {
  assert.deepEqual(normalizeFrozen(ORDER, [], ['kode', 'kolom-lama']), ['kode']);
});

test('normalizeFrozen: tanpa urutan kolom, daftar dibiarkan apa adanya', () => {
  // Tabel yang tidak memberi urutan kolom tidak punya cara menormalkan; kalau
  // dipaksa, daftarnya hanya akan kosong dan pengaturan user ikut hilang.
  assert.deepEqual(normalizeFrozen([], [], ['a', 'b']), ['a', 'b']);
});

test('toggleFrozen: membekukan kolom ke-N ikut membekukan kolom di kirinya', () => {
  // Ini yang membuat "centang per kolom" tetap aman: user menandai satu kolom,
  // tetapi himpunan beku selalu berupa awalan, sehingga urutan kolom tidak
  // pernah berubah.
  assert.deepEqual(toggleFrozen(ORDER, [], [], 'kode'), ['kode']);
  assert.deepEqual(toggleFrozen(ORDER, [], [], 'client'), ['kode', 'client']);
  assert.deepEqual(toggleFrozen(ORDER, [], [], 'produk'), ['kode', 'client', 'produk']);
});

test('toggleFrozen: melepas kolom ke-N melepas kolom sesudahnya', () => {
  const all = ['kode', 'client', 'produk'];
  assert.deepEqual(toggleFrozen(ORDER, [], all, 'client'), ['kode']);
  assert.deepEqual(toggleFrozen(ORDER, [], all, 'kode'), []);
});

test('toggleFrozen: kolom tersembunyi tidak bisa dibekukan', () => {
  assert.deepEqual(toggleFrozen(ORDER, ['produk'], [], 'produk'), []);
  // Dan kolom di kanannya pun tidak melompatinya.
  assert.deepEqual(toggleFrozen(ORDER, ['produk'], [], 'jahit'), ['kode', 'client', 'jahit']);
});

test('toggleFrozen: key yang tidak dikenal tidak mengubah apa pun', () => {
  assert.deepEqual(toggleFrozen(ORDER, [], ['kode'], 'tidak-ada'), ['kode']);
});

test('toggleFrozen: hasilnya selalu awalan rapat dari kolom terlihat', () => {
  // Sifat yang paling menentukan: apa pun inputnya, keluaran harus lolos
  // normalizeFrozen tanpa perubahan — kalau tidak, ada keadaan yang bisa
  // membuat kolom melompat.
  const cases: Array<[string[], string[]]> = [
    [[], ['kode']],
    [[], ['produk']],
    [['produk'], ['jahit']],
    [['kode'], ['finishing']],
    [['kode', 'client'], ['produk']],
    [['client'], ['kode']],
  ];
  for (const [hidden, frozen] of cases) {
    for (const key of [...ORDER, 'tidak-ada']) {
      const next = toggleFrozen(ORDER, hidden, frozen, key);
      assert.deepEqual(
        normalizeFrozen(ORDER, hidden, next),
        next,
        `toggleFrozen(${JSON.stringify(hidden)}, ${JSON.stringify(frozen)}, ${key}) tidak rapat`,
      );
    }
  }
});
