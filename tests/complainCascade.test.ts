import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClientVariants,
  buildComplainOptions,
  clientCodeChoices,
  clientCodeOptionsOf,
  konveksiCodeFor,
  legacyKonveksiCode,
  productOptionsOf,
  resolveLegacyCode,
  sizeChoicesFor,
  warnaChoicesFor,
  warnaOptionsOf,
  type ComplainOptionRow,
} from '../src/lib/complainCascade.ts';

// Bentuk data di bawah disalin dari hasil query Supabase MCP terhadap data live,
// supaya tidak mengarang: satu Kode Produksi Client menaungi BEBERAPA size.
const LIVE_ROWS: ComplainOptionRow[] = [
  {
    product: 'Gena Pants',
    warna: 'Black',
    client_production_code: 'PDFF_LVU-PNT-01_B-00_PRDN',
    product_note: 'PO/001-LVU/09/2026/002',
    source_order_id: 'PO-9fdfe041',
  },
  {
    product: 'Gena Pants',
    warna: 'Black',
    client_production_code: 'PDFF_LVU-PNT-01_B-00_PRDN',
    product_note: 'PO/001-LVU/09/2026/002',
    source_order_id: 'PO-9fdfe041',
  },
  {
    product: 'Gena Pants',
    warna: 'Ivory',
    client_production_code: 'PDFF_LVU-PNT-01_B-00_PRDN',
    product_note: 'PO/001-LVU/09/2026/002',
    source_order_id: 'PO-9fdfe041',
  },
  {
    product: 'Gena Pants',
    warna: 'Ivory',
    client_production_code: 'PDFF_LVU-PNT-01_B-00_PRDN',
    product_note: 'PO/001-LVU/09/2026/002',
    source_order_id: 'PO-9fdfe041',
  },
  {
    product: 'Odette Shirt',
    warna: 'Champagne',
    client_production_code: 'PDFF_CSC-TOP-02_B-01_PRDN',
    product_note: 'PO/002-CSC/09/2026/005',
    source_order_id: 'PO-0cb91687',
  },
  {
    product: 'Odette Shirt',
    warna: 'Ivory',
    client_production_code: 'PDFF_CSC-TOP-02_B-01_PRDN',
    product_note: 'PO/002-CSC/09/2026/005',
    source_order_id: 'PO-0cb91687',
  },
];

const options = buildComplainOptions(LIVE_ROWS);

// ===== buildComplainOptions =====

test('work order diruntuhkan per produk+warna+kode client, bukan per work order', () => {
  // 6 work order live → 4 pilihan (Gena Pants Black, Gena Pants Ivory,
  // Odette Shirt Champagne, Odette Shirt Ivory).
  assert.equal(options.length, 4);
});

test('empat work order satu kode client menjadi dua pilihan, satu per warna', () => {
  const gena = options.filter((o) => o.product === 'Gena Pants');
  assert.equal(gena.length, 2);
  assert.deepEqual(
    gena.map((o) => o.warna),
    ['Black', 'Ivory'],
  );
  // Keduanya tetap menunjuk kode konveksi yang sama.
  assert.equal(gena[0].productionCode, 'PO/001-LVU/09/2026/002');
  assert.equal(gena[1].productionCode, 'PO/001-LVU/09/2026/002');
});

test('baris tanpa salah satu kode dibuang, bukan ditampilkan setengah kosong', () => {
  assert.deepEqual(
    buildComplainOptions([
      { product: 'A', warna: 'B', client_production_code: null, product_note: 'PO/1' },
      { product: 'A', warna: 'B', client_production_code: 'PDFF_A', product_note: null },
      { product: '', warna: 'B', client_production_code: 'PDFF_A', product_note: 'PO/1' },
      { product: 'A', warna: 'B', client_production_code: '  ', product_note: '  ' },
    ]),
    [],
  );
});

test('baris lengkap tetap lolos dan spasinya dirapikan', () => {
  const [option] = buildComplainOptions([
    {
      product: '  Gena Pants  ',
      warna: ' Black ',
      client_production_code: ' PDFF_LVU-PNT-01_B-00_PRDN ',
      product_note: ' PO/001-LVU/09/2026/002 ',
      source_order_id: 'PO-9fdfe041',
    },
  ]);
  assert.equal(option.product, 'Gena Pants');
  assert.equal(option.warna, 'Black');
  assert.equal(option.clientCode, 'PDFF_LVU-PNT-01_B-00_PRDN');
  assert.equal(option.productionCode, 'PO/001-LVU/09/2026/002');
});

test('tanpa baris, hasilnya kosong', () => {
  assert.deepEqual(buildComplainOptions([]), []);
});

// ===== opsi cascade =====

test('produk unik dalam urutan kemunculannya', () => {
  assert.deepEqual(productOptionsOf(options), ['Gena Pants', 'Odette Shirt']);
});

test('warna mengikuti produk terpilih', () => {
  assert.deepEqual(warnaOptionsOf(options, 'Gena Pants'), ['Black', 'Ivory']);
  assert.deepEqual(warnaOptionsOf(options, 'Odette Shirt'), ['Champagne', 'Ivory']);
  assert.deepEqual(warnaOptionsOf(options, 'Produk Tidak Ada'), []);
});

test('kode client mengikuti produk + warna, dan hasilnya tunggal', () => {
  // Tunggal inilah yang membuat form bisa mengisi kode konveksi otomatis.
  assert.deepEqual(clientCodeOptionsOf(options, 'Gena Pants', 'Black'), [
    'PDFF_LVU-PNT-01_B-00_PRDN',
  ]);
  assert.deepEqual(clientCodeOptionsOf(options, 'Odette Shirt', 'Ivory'), [
    'PDFF_CSC-TOP-02_B-01_PRDN',
  ]);
  // Produk cocok tetapi warnanya tidak ada → tidak ada pilihan.
  assert.deepEqual(clientCodeOptionsOf(options, 'Gena Pants', 'Hijau'), []);
});

// ===== konveksiCodeFor =====

test('kode konveksi ditemukan dari kode client', () => {
  assert.equal(
    konveksiCodeFor(options, 'PDFF_LVU-PNT-01_B-00_PRDN'),
    'PO/001-LVU/09/2026/002',
  );
  assert.equal(
    konveksiCodeFor(options, 'PDFF_CSC-TOP-02_B-01_PRDN'),
    'PO/002-CSC/09/2026/005',
  );
});

test('kode client kosong atau tidak dikenal menghasilkan null, bukan string kosong', () => {
  assert.equal(konveksiCodeFor(options, ''), null);
  assert.equal(konveksiCodeFor(options, null), null);
  assert.equal(konveksiCodeFor(options, undefined), null);
  assert.equal(konveksiCodeFor(options, 'PDFF_TIDAK_ADA'), null);
});

// ===== clientCodeChoices (dipakai Planning Produksi) =====

test('kode client di-dedup per kode, bukan per produk+warna', () => {
  // 4 pilihan cascade (product+warna+client) menyusut jadi 2 kode client:
  // satu kode menaungi beberapa warna dan produk.
  const choices = clientCodeChoices(options);
  assert.equal(choices.length, 2);
  assert.deepEqual(
    choices.map((c) => c.value),
    ['PDFF_LVU-PNT-01_B-00_PRDN', 'PDFF_CSC-TOP-02_B-01_PRDN'],
  );
});

test('label pilihan memuat produknya supaya user tahu ini produksi apa', () => {
  const [gena, odette] = clientCodeChoices(options);
  assert.equal(gena.label, 'PDFF_LVU-PNT-01_B-00_PRDN — Gena Pants');
  assert.equal(odette.label, 'PDFF_CSC-TOP-02_B-01_PRDN — Odette Shirt');
});

test('kode konveksi pasangannya ikut dibawa di tiap pilihan', () => {
  const choices = clientCodeChoices(options);
  assert.equal(choices[0].productionCode, 'PO/001-LVU/09/2026/002');
  assert.equal(choices[1].productionCode, 'PO/002-CSC/09/2026/005');
});

test('satu kode menaungi beberapa produk: keduanya dirangkum di label', () => {
  const choices = clientCodeChoices(
    buildComplainOptions([
      { product: 'Gena Pants', warna: 'Black', client_production_code: 'PDFF_X', product_note: 'PO/1' },
      { product: 'Odette Shirt', warna: 'Ivory', client_production_code: 'PDFF_X', product_note: 'PO/1' },
    ]),
  );
  assert.equal(choices.length, 1);
  assert.equal(choices[0].label, 'PDFF_X — Gena Pants, Odette Shirt');
});

test('produk yang sama tidak diulang di label', () => {
  const choices = clientCodeChoices(
    buildComplainOptions([
      { product: 'Gena Pants', warna: 'Black', client_production_code: 'PDFF_X', product_note: 'PO/1' },
      { product: 'Gena Pants', warna: 'Ivory', client_production_code: 'PDFF_X', product_note: 'PO/1' },
    ]),
  );
  assert.equal(choices[0].label, 'PDFF_X — Gena Pants');
});

test('tanpa opsi, pilihannya kosong', () => {
  assert.deepEqual(clientCodeChoices([]), []);
});

// ===== resolveLegacyCode =====

test('kode client tersimpan dipulihkan apa adanya', () => {
  assert.equal(
    resolveLegacyCode('PDFF_LVU-PNT-01_B-00_PRDN', options),
    'PDFF_LVU-PNT-01_B-00_PRDN',
  );
});

test('kode konveksi tersimpan dipulihkan menjadi kode client', () => {
  assert.equal(resolveLegacyCode('PO/001-LVU/09/2026/002', options), 'PDFF_LVU-PNT-01_B-00_PRDN');
});

test('work_code lama berbentuk gabungan tetap terpetakan ke kode client', () => {
  // Bentuk nyata di database sebelum migrasi 2026-09-22.
  assert.equal(
    resolveLegacyCode('PO/001-LVU/09/2026/002 | Gena Pants | Black | M', options),
    'PDFF_LVU-PNT-01_B-00_PRDN',
  );
});

test('baris warisan tanpa padanan menghasilkan null, sehingga user memilih ulang', () => {
  // Baris live "Produksi - Awal | Sheen Pants | White | S" — work order-nya
  // sudah tidak ada, jadi kode barunya memang tidak bisa dipulihkan.
  assert.equal(resolveLegacyCode('Produksi - Awal | Sheen Pants | White | S', options), null);
  assert.equal(resolveLegacyCode(null, options), null);
  assert.equal(resolveLegacyCode('', options), null);
  assert.equal(resolveLegacyCode('   ', options), null);
});

// ===== legacyKonveksiCode =====

test('kode konveksi cadangan diambil dari segmen pertama work_code lama', () => {
  assert.equal(
    legacyKonveksiCode('Produksi - Awal | Sheen Pants | White | S'),
    'Produksi - Awal',
  );
  assert.equal(legacyKonveksiCode('PO/001-LVU/09/2026/002'), 'PO/001-LVU/09/2026/002');
  assert.equal(legacyKonveksiCode(null), null);
});

// ===== buildClientVariants + warnaChoicesFor/sizeChoicesFor (Planning) =====
//
// Baris di bawah adalah hasil query Supabase MCP terhadap `work_orders` apa
// adanya — termasuk size, yang sengaja TIDAK dibawa `ComplainOptionRow` versi
// Complain. Perhatikan `PDFF_CSC-TOP-02_B-01_PRDN`: Champagne hanya M, Ivory
// hanya S. Itulah alasan size harus mengikuti warna, bukan kode saja.

const LIVE_VARIANT_ROWS: ComplainOptionRow[] = [
  { product: 'Odette Shirt', warna: 'Champagne', size: 'M', client_production_code: 'PDFF_CSC-TOP-02_B-01_PRDN', product_note: 'PO/002-CSC/09/2026/005' },
  { product: 'Odette Shirt', warna: 'Ivory', size: 'S', client_production_code: 'PDFF_CSC-TOP-02_B-01_PRDN', product_note: 'PO/002-CSC/09/2026/005' },
  { product: 'Gena Pants', warna: 'Black', size: 'M', client_production_code: 'PDFF_LVU-PNT-01_B-00_PRDN', product_note: 'PO/001-LVU/09/2026/002' },
  { product: 'Gena Pants', warna: 'Black', size: 'XL', client_production_code: 'PDFF_LVU-PNT-01_B-00_PRDN', product_note: 'PO/001-LVU/09/2026/002' },
  { product: 'Gena Pants', warna: 'Ivory', size: 'M', client_production_code: 'PDFF_LVU-PNT-01_B-00_PRDN', product_note: 'PO/001-LVU/09/2026/002' },
  { product: 'Gena Pants', warna: 'Ivory', size: 'XL', client_production_code: 'PDFF_LVU-PNT-01_B-00_PRDN', product_note: 'PO/001-LVU/09/2026/002' },
];

const variants = buildClientVariants(LIVE_VARIANT_ROWS);

test('varian menyimpan size, tidak seperti opsi Complain yang membuangnya', () => {
  // Enam baris live tetap enam varian (tidak diruntuhkan), dan size-nya utuh.
  assert.equal(variants.length, 6);
  assert.deepEqual(
    variants.filter((v) => v.clientCode === 'PDFF_LVU-PNT-01_B-00_PRDN').map((v) => `${v.warna}/${v.size}`),
    ['Black/M', 'Black/XL', 'Ivory/M', 'Ivory/XL'],
  );
});

test('opsi Complain dari baris yang sama tetap diruntuhkan per produk+warna', () => {
  // Kontras yang disengaja: 6 baris → 4 opsi (size dibuang), sedangkan varian
  // tetap 6. Dua bentuk ini hidup berdampingan dari satu query.
  assert.equal(buildComplainOptions(LIVE_VARIANT_ROWS).length, 4);
});

test('baris tanpa salah satu kode dibuang dari varian', () => {
  assert.deepEqual(
    buildClientVariants([
      { product: 'A', warna: 'B', size: 'M', client_production_code: null, product_note: 'PO/1' },
      { product: 'A', warna: 'B', size: 'M', client_production_code: 'PDFF_A', product_note: null },
      { product: 'A', warna: 'B', size: 'M', client_production_code: '  ', product_note: '  ' },
    ]),
    [],
  );
});

test('baris tanpa warna atau size TETAP menjadi varian', () => {
  // Kalau dibuang, kode client yang work order-nya belum mengisi warna akan
  // hilang dari dropdown padahal kodenya ada.
  const [v] = buildClientVariants([
    { product: 'A', warna: null, size: null, client_production_code: 'PDFF_A', product_note: 'PO/1' },
  ]);
  assert.equal(v.clientCode, 'PDFF_A');
  assert.equal(v.warna, '');
  assert.equal(v.size, '');
});

test('warna mengikuti kode produksi client', () => {
  assert.deepEqual(warnaChoicesFor(variants, 'PDFF_LVU-PNT-01_B-00_PRDN'), ['Black', 'Ivory']);
  assert.deepEqual(warnaChoicesFor(variants, 'PDFF_CSC-TOP-02_B-01_PRDN'), ['Champagne', 'Ivory']);
  assert.deepEqual(warnaChoicesFor(variants, 'PDFF_TIDAK_ADA'), []);
});

test('warna kosong atau kode kosong menghasilkan daftar kosong', () => {
  assert.deepEqual(warnaChoicesFor(variants, ''), []);
  assert.deepEqual(warnaChoicesFor(variants, null), []);
  assert.deepEqual(warnaChoicesFor(variants, undefined), []);
});

test('size mengikuti kode produksi client, dan menyempit saat warna dipilih', () => {
  // Tanpa warna: seluruh size kode itu.
  assert.deepEqual(sizeChoicesFor(variants, 'PDFF_LVU-PNT-01_B-00_PRDN'), ['M', 'XL']);
  // Dengan warna: hanya pasangannya.
  assert.deepEqual(sizeChoicesFor(variants, 'PDFF_LVU-PNT-01_B-00_PRDN', 'Black'), ['M', 'XL']);
  assert.deepEqual(sizeChoicesFor(variants, 'PDFF_LVU-PNT-01_B-00_PRDN', 'Ivory'), ['M', 'XL']);
  // Kode CSC: inilah bukti penyempitan itu perlu — Champagne hanya M, Ivory hanya S.
  assert.deepEqual(sizeChoicesFor(variants, 'PDFF_CSC-TOP-02_B-01_PRDN'), ['M', 'S']);
  assert.deepEqual(sizeChoicesFor(variants, 'PDFF_CSC-TOP-02_B-01_PRDN', 'Champagne'), ['M']);
  assert.deepEqual(sizeChoicesFor(variants, 'PDFF_CSC-TOP-02_B-01_PRDN', 'Ivory'), ['S']);
});

test('size untuk warna yang tidak ada menghasilkan daftar kosong', () => {
  assert.deepEqual(sizeChoicesFor(variants, 'PDFF_LVU-PNT-01_B-00_PRDN', 'Hijau'), []);
  assert.deepEqual(sizeChoicesFor(variants, ''), []);
});

test('size ganda pada warna yang sama hanya muncul sekali', () => {
  const dup = buildClientVariants([
    { product: 'A', warna: 'Black', size: 'M', client_production_code: 'PDFF_A', product_note: 'PO/1' },
    { product: 'A', warna: 'Black', size: 'M', client_production_code: 'PDFF_A', product_note: 'PO/1' },
  ]);
  assert.deepEqual(sizeChoicesFor(dup, 'PDFF_A', 'Black'), ['M']);
});
