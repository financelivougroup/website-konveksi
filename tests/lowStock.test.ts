import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOW_STOCK_THRESHOLD,
  buildLowStock,
  filterLowStockRows,
  lowStockClients,
  stockIdentityKey,
  stockLevel,
} from '../src/lib/lowStock.ts';
import type {
  LowStockSnapshot,
  StockFinishing,
  StockIdentity,
  StockProductionOrder,
  StockRecord,
  StockVariation,
  LowStockRow,
  StockWorkOrder,
} from '../src/types/lowStock.ts';

const identity: StockIdentity = { brand: 'Acme', productId: 'P-1', product: 'Shirt', color: 'Blue', size: 'M' };

const stock = (overrides: Partial<StockRecord> = {}): StockRecord =>
  ({
    ...identity, id: 1, availableQuantity: 20,
    statusStockFinal: null, sisaCutting: null, source: null, supplier: null, receivedAt: null,
    ...overrides,
  });
const order = (overrides: Partial<StockProductionOrder> = {}): StockProductionOrder =>
  ({ id: 'o1', status: 'DRAFT', brand: identity.brand, productId: identity.productId, product: identity.product, ...overrides });
const variation = (overrides: Partial<StockVariation> = {}): StockVariation =>
  ({ id: 'v1', orderId: 'o1', color: identity.color!, size: identity.size!, quantity: 100, ...overrides });
const wo = (overrides: Partial<StockWorkOrder> = {}): StockWorkOrder =>
  ({ ...identity, id: 'w1', orderId: 'o1', variationId: 'v1', quantity: 100, ...overrides });
const finishing = (overrides: Partial<StockFinishing> = {}): StockFinishing =>
  ({ id: 'f1', workOrderId: 'w1', quantity: 40, ...overrides });
const snapshot = (overrides: Partial<LowStockSnapshot> = {}): LowStockSnapshot =>
  ({ stocks: [], orders: [], variations: [], workOrders: [], finishing: [], ...overrides });

// ===== Batas low stock =====

test('stok <50 memakai batas eksklusif: 0 dan negatif ikut, 50 tidak', () => {
  const quantities = [0, 49, 50, 51, null, -7];
  const result = buildLowStock(snapshot({
    stocks: quantities.map((availableQuantity, index) => stock({ id: index, size: `S${index}`, availableQuantity })),
  }));

  assert.equal(LOW_STOCK_THRESHOLD, 50);
  assert.deepEqual(result.waitingProduction.map((row) => row.availableQuantity), [-7, 0, 49]);
  // 50 dan 51 aman; null bukan 0 sehingga tidak boleh diklaim low stock.
  assert.deepEqual(result.inProduction, []);
  assert.deepEqual(result.issues, []);
});

test('stok kosong tidak dipalsukan menjadi nol', () => {
  const result = buildLowStock(snapshot({ stocks: [stock({ availableQuantity: null })] }));

  assert.deepEqual(result.waitingProduction, []);
  assert.deepEqual(result.issues, []);
});

test('snapshot kosong menghasilkan hasil kosong tanpa error', () => {
  assert.deepEqual(buildLowStock(snapshot()), {
    inProduction: [], waitingProduction: [], issues: [],
    summary: { totalSku: 0, out: 0, low: 0, unknown: 0, inProduction: 0 },
  });
});

test('ringkasan: habis, rendah, dan belum ada data dihitung terpisah', () => {
  const result = buildLowStock(snapshot({
    stocks: [
      stock({ id: 1, size: 'S', availableQuantity: 0 }),
      stock({ id: 2, size: 'M', availableQuantity: -7 }),
      stock({ id: 3, size: 'L', availableQuantity: 49 }),
      stock({ id: 4, size: 'XL', availableQuantity: 50 }),
      stock({ id: 5, size: 'XXL', availableQuantity: null }),
    ],
    orders: [order({ status: 'PULLED' })],
    workOrders: [wo({ id: 'w1', quantity: 100 })],
    variations: [variation({ color: 'Blue', size: 'M' })],
  }));

  // Total SKU = 5 variasi stok unik; produksi menempel ke salah satunya (M).
  assert.deepEqual(result.summary, { totalSku: 5, out: 2, low: 1, unknown: 1, inProduction: 1 });
});

test('tingkat stok tidak pernah menyamakan "belum ada data" dengan nol', () => {
  const level = (availableQuantity: number | null, stockState: LowStockRow['stockState'] = 'known') =>
    stockLevel({ ...identity, key: 'k', availableQuantity, stockState, orderCount: 0, orderQuantity: 0, remainingFinishing: 0, stages: [] });

  assert.equal(level(null, 'missing'), 'unknown');
  assert.equal(level(null, 'ambiguous'), 'unknown');
  assert.equal(level(20, 'ambiguous'), 'unknown');
  assert.equal(level(0), 'out');
  assert.equal(level(-7), 'out');
  assert.equal(level(1), 'low');
  assert.equal(level(49), 'low');
  assert.equal(level(50), 'ok');
  assert.equal(level(51), 'ok');
});

// ===== Identitas variasi =====

test('identitas dinormalkan huruf dan spasi, dan tidak memakai nama produk', () => {
  assert.equal(stockIdentityKey(identity), '["acme","p-1","blue","m"]');
  assert.equal(
    stockIdentityKey({ ...identity, brand: ' ACME ', product: 'Nama Berbeda', color: ' blue ', size: 'm' }),
    stockIdentityKey(identity),
  );
  // Nama produk berbeda dengan ID sama tetap identitas yang sama.
  assert.equal(stockIdentityKey({ ...identity, product: 'Lain' }), stockIdentityKey(identity));
});

test('identitas tidak lengkap menghasilkan null, bukan wildcard', () => {
  for (const field of ['brand', 'productId', 'color', 'size'] as const) {
    assert.equal(stockIdentityKey({ ...identity, [field]: '  ' }), null, `spasi pada ${field}`);
    assert.equal(stockIdentityKey({ ...identity, [field]: null }), null, `null pada ${field}`);
  }
});

test('kunci identitas tidak bisa bertabrakan lewat delimiter', () => {
  assert.notEqual(
    stockIdentityKey({ ...identity, brand: 'a|b', productId: 'c' }),
    stockIdentityKey({ ...identity, brand: 'a', productId: 'b|c' }),
  );
});

test('client, Product ID, warna, dan size yang berbeda tidak saling cocok', () => {
  const base = snapshot({ stocks: [stock({ availableQuantity: 10 })], orders: [order()], variations: [variation()] });
  const result = buildLowStock(base);

  assert.equal(result.inProduction.length, 1);
  assert.equal(result.waitingProduction.length, 0);

  for (const field of ['brand', 'productId', 'color', 'size'] as const) {
    const changed = buildLowStock(snapshot({
      stocks: [stock({ availableQuantity: 10, [field]: 'Diubah' })],
      orders: [order()],
      variations: [variation()],
    }));
    assert.equal(changed.inProduction[0].stockState, 'missing', `${field} ikut tercocok`);
    assert.equal(changed.waitingProduction.length, 1, `${field} tidak terpisah`);
  }
});

// ===== Section 1: Draft =====

test('variasi Draft qty positif masuk produksi dan menggabungkan order sejenis', () => {
  const result = buildLowStock(snapshot({
    stocks: [stock({ availableQuantity: 200 })],
    orders: [order(), order({ id: 'o2' }), order({ id: 'cancelled', status: 'CANCELLED' })],
    variations: [
      variation(),
      variation({ id: 'v2', orderId: 'o2', quantity: 20 }),
      variation({ id: 'v3', quantity: 0 }),
      variation({ id: 'vc', orderId: 'cancelled' }),
    ],
  }));

  assert.equal(result.inProduction.length, 1);
  const [row] = result.inProduction;
  assert.equal(row.orderCount, 2);
  assert.equal(row.orderQuantity, 120);
  // Draft belum masuk finishing, jadi belum ada sisa finishing.
  assert.equal(row.remainingFinishing, 0);
  assert.deepEqual(row.stages, ['Draft']);
  assert.equal(row.availableQuantity, 200);
  assert.equal(row.stockState, 'known');
  assert.deepEqual(result.waitingProduction, []);
  assert.deepEqual(result.issues, []);
});

test('qty Draft tidak dobel-hitung sebagai sisa finishing', () => {
  const result = buildLowStock(snapshot({ orders: [order()], variations: [variation({ quantity: 75 })] }));

  assert.deepEqual(
    result.inProduction.map((row) => [row.orderQuantity, row.remainingFinishing]),
    [[75, 0]],
  );
});

test('produksi tanpa baris stok tetap tampil dengan stok belum ada data', () => {
  const result = buildLowStock(snapshot({ orders: [order()], variations: [variation()] }));

  assert.equal(result.inProduction[0].availableQuantity, null);
  assert.equal(result.inProduction[0].stockState, 'missing');
  assert.deepEqual(result.waitingProduction, []);
});

test('order CANCELLED beserta work order terhubungnya tidak ikut', () => {
  const result = buildLowStock(snapshot({
    orders: [order({ status: 'CANCELLED' })],
    variations: [variation()],
    workOrders: [wo()],
    finishing: [finishing({ quantity: 0 })],
  }));

  assert.deepEqual(result.inProduction, []);
  assert.deepEqual(result.issues, []);
});

// ===== Section 1: eksekusi dan berakhirnya produksi =====

test('order PULLED memakai work order, bukan menjumlah ulang variasi induk', () => {
  const result = buildLowStock(snapshot({
    orders: [order({ status: 'PULLED' })],
    variations: [variation({ quantity: 100 })],
    workOrders: [wo({ quantity: 100 })],
  }));

  const [row] = result.inProduction;
  assert.equal(row.orderCount, 1);
  assert.equal(row.orderQuantity, 100);
  assert.equal(row.remainingFinishing, 100);
  assert.deepEqual(row.stages, ['Dalam Produksi']);
});

test('finishing sebagian mengurangi sisa tanpa mengeluarkan baris dari produksi', () => {
  const result = buildLowStock(snapshot({
    orders: [order({ status: 'PULLED' })],
    workOrders: [wo({ quantity: 100 })],
    finishing: [finishing({ quantity: 40 }), finishing({ id: 'f2', quantity: 10 })],
  }));

  assert.deepEqual(
    result.inProduction.map((row) => [row.orderQuantity, row.remainingFinishing]),
    [[100, 50]],
  );
});

test('finishing penuh mengeluarkan baris dari produksi', () => {
  for (const quantities of [[100], [60, 40], [130]]) {
    const result = buildLowStock(snapshot({
      orders: [order({ status: 'PULLED' })],
      workOrders: [wo({ quantity: 100 })],
      finishing: quantities.map((quantity, index) => finishing({ id: `f${index}`, quantity })),
    }));

    assert.deepEqual(result.inProduction, [], `finishing ${quantities.join('+')} tetap dianggap aktif`);
  }
});

test('status jahit selesai atau invoice tidak menentukan berakhirnya produksi', () => {
  // Sumber dashboard ini hanya finishing: jahitan selesai tanpa finishing
  // tetap aktif, dan produksi baru berakhir setelah finishing menutup qty.
  const result = buildLowStock(snapshot({
    orders: [order({ status: 'PULLED' })],
    workOrders: [wo({ quantity: 200 })],
    finishing: [finishing({ quantity: 199 })],
  }));

  assert.deepEqual(result.inProduction.map((row) => row.remainingFinishing), [1]);
});

test('over-finishing satu work order tidak menutupi kekurangan work order lain', () => {
  const result = buildLowStock(snapshot({
    orders: [order({ id: 'o1', status: 'PULLED' }), order({ id: 'o2', status: 'PULLED' })],
    workOrders: [
      wo({ id: 'w1', orderId: 'o1', quantity: 100 }),
      wo({ id: 'w2', orderId: 'o2', quantity: 100 }),
    ],
    // WO w1 kebanjiran finishing; kekurangan w2 harus tetap terlihat.
    finishing: [finishing({ id: 'f1', workOrderId: 'w1', quantity: 150 })],
  }));

  const [row] = result.inProduction;
  assert.equal(row.remainingFinishing, 100);
  assert.equal(row.orderQuantity, 100);
  // w1 sudah selesai, jadi hanya order o2 yang masih aktif.
  assert.equal(row.orderCount, 1);
});

test('beberapa order aktif untuk satu variasi digabung menjadi satu baris', () => {
  const result = buildLowStock(snapshot({
    orders: [order({ id: 'o1', status: 'PULLED' }), order({ id: 'o2', status: 'PULLED' })],
    workOrders: [
      wo({ id: 'w1', orderId: 'o1', quantity: 100 }),
      wo({ id: 'w2', orderId: 'o2', quantity: 50 }),
    ],
  }));

  assert.equal(result.inProduction.length, 1);
  assert.deepEqual(
    result.inProduction.map((row) => [row.orderCount, row.orderQuantity, row.remainingFinishing]),
    [[2, 150, 150]],
  );
});

test('Draft dan work order aktif sekaligus menampilkan kedua label', () => {
  const result = buildLowStock(snapshot({
    orders: [order({ id: 'o1', status: 'PULLED' }), order({ id: 'o2', status: 'DRAFT' })],
    variations: [variation({ id: 'v2', orderId: 'o2', quantity: 30 })],
    workOrders: [wo({ id: 'w1', orderId: 'o1', quantity: 60 })],
  }));

  assert.deepEqual(result.inProduction[0].stages, ['Draft', 'Dalam Produksi']);
  assert.deepEqual(
    result.inProduction.map((row) => [row.orderCount, row.orderQuantity, row.remainingFinishing]),
    [[2, 90, 60]],
  );
});

test('work order tanpa parent tetap tampil dari identitasnya sendiri', () => {
  const result = buildLowStock(snapshot({
    workOrders: [wo({ id: 'w9', orderId: null, variationId: null, quantity: 80 })],
  }));

  const [row] = result.inProduction;
  assert.equal(row.key, stockIdentityKey(identity));
  assert.equal(row.orderCount, 1);
  assert.deepEqual(row.stages, ['Dalam Produksi']);
  assert.deepEqual(result.issues, []);
});

test('warna dan size work order yang kosong diambil dari variasi induk, bukan dari order', () => {
  // Order tidak menyimpan warna/size sama sekali; keduanya hanya ada di variasi.
  // Tanpa pewarisan ini, WO warisan lama akan dianggap beridentitas tidak lengkap.
  const result = buildLowStock(snapshot({
    stocks: [stock({ color: 'Ivory', size: 'L', availableQuantity: 12 })],
    orders: [order({ status: 'PULLED' })],
    variations: [variation({ id: 'v1', color: 'Ivory', size: 'L' })],
    workOrders: [wo({ color: null, size: null, variationId: 'v1', quantity: 30 })],
  }));

  const [row] = result.inProduction;
  assert.equal(row.color, 'Ivory');
  assert.equal(row.size, 'L');
  assert.equal(row.key, stockIdentityKey({ ...identity, color: 'Ivory', size: 'L' }));
  // Stoknya ikut tercocok, jadi tidak muncul lagi di section 2.
  assert.equal(row.stockState, 'known');
  assert.equal(row.availableQuantity, 12);
  assert.deepEqual(result.waitingProduction, []);
});

test('qty nol atau tidak terbaca tidak dianggap produksi aktif', () => {
  const result = buildLowStock(snapshot({
    orders: [order()],
    variations: [variation({ quantity: 0 })],
    workOrders: [wo({ quantity: 0 })],
  }));

  assert.deepEqual(result.inProduction, []);
});

test('order PULLED tanpa work order dilaporkan, tidak dianggap selesai', () => {
  const result = buildLowStock(snapshot({
    stocks: [stock({ availableQuantity: 10 })],
    orders: [order({ status: 'PULLED' })],
    variations: [variation({ quantity: 100 })],
  }));

  // Tidak ada work order, jadi tidak ada baris produksi — dan stoknya ditahan
  // dari section 2, karena identitas itu bisa saja sedang diproduksi.
  assert.deepEqual(result.inProduction, []);
  assert.deepEqual(result.waitingProduction, []);
  const issues = result.issues.join(' ');
  assert.match(issues, /PULLED tanpa work order/);
  assert.match(issues, /belum dapat dipastikan/);
});

test('order PULLED yang work order-nya terhubung lewat variasi tidak dilaporkan', () => {
  const result = buildLowStock(snapshot({
    orders: [order({ status: 'PULLED' })],
    variations: [variation({ id: 'v1' })],
    // WO hanya merujuk variasi, tanpa source_order_id.
    workOrders: [wo({ orderId: null, variationId: 'v1', quantity: 100 })],
  }));

  assert.equal(result.inProduction.length, 1);
  assert.deepEqual(result.issues, []);
});

// ===== Kualitas data =====

test('variasi tanpa order induk dilewati dan dilaporkan', () => {
  const result = buildLowStock(snapshot({ variations: [variation({ orderId: 'hilang' })] }));

  assert.deepEqual(result.inProduction, []);
  assert.equal(result.issues.length, 1);
});

test('work order yang order induknya tidak ditemukan tetap tampil dan dilaporkan', () => {
  const result = buildLowStock(snapshot({
    workOrders: [wo({ orderId: 'hilang' }), wo({ id: 'w2', orderId: 'hilang-lagi' })],
  }));

  // Identitas variasinya sama, jadi tetap satu baris — tetapi kedua pekerjaan
  // mandiri itu dihitung terpisah karena tidak ada parent yang bisa dibagi.
  assert.equal(result.inProduction.length, 1);
  assert.equal(result.inProduction[0].orderCount, 2);
  assert.deepEqual(result.inProduction[0].stages, ['Dalam Produksi']);
  assert.match(result.issues.join(' '), /tidak ditemukan/);
  // Work order orphan tetap dapat dicocokkan dengan stoknya.
  assert.equal(result.inProduction[0].stockState, 'missing');
});

test('identitas produksi tidak lengkap tidak digabung dengan varian lain', () => {
  const result = buildLowStock(snapshot({
    stocks: [stock({ availableQuantity: 10 })],
    workOrders: [
      wo({ id: 'w1', color: null, orderId: null }),
      wo({ id: 'w2', color: '  ', orderId: null }),
    ],
  }));

  // Dua work order tanpa warna tetap dua baris terpisah, bukan satu baris gabungan.
  assert.equal(result.inProduction.length, 2);
  assert.deepEqual(result.inProduction.map((row) => row.stockState), ['missing', 'missing']);
  // Stok yang identitasnya lengkap tidak boleh tercocok oleh baris tidak lengkap.
  assert.deepEqual(result.waitingProduction.map((row) => row.availableQuantity), [10]);
});

test('stok ganda dengan identitas sama tidak dijumlahkan dan ditandai ambigu', () => {
  const result = buildLowStock(snapshot({
    stocks: [stock({ id: 1, availableQuantity: 10 }), stock({ id: 2, availableQuantity: 15 })],
    orders: [order()],
    variations: [variation()],
  }));

  const [row] = result.inProduction;
  assert.equal(row.stockState, 'ambiguous');
  assert.equal(row.availableQuantity, null);
  // Stok ganda tidak boleh diklaim sebagai stok <50 di section 2.
  assert.deepEqual(result.waitingProduction, []);
  assert.match(result.issues.join(' '), /stok ganda/);
});

test('baris stok dengan identitas tidak lengkap dilaporkan dan tidak dicocokkan', () => {
  const result = buildLowStock(snapshot({
    stocks: [stock({ color: null, availableQuantity: 5 })],
    orders: [order()],
    variations: [variation()],
  }));

  assert.equal(result.inProduction[0].stockState, 'missing');
  assert.deepEqual(result.waitingProduction, []);
  assert.match(result.issues.join(' '), /identitas tidak lengkap/);
});

test('order berstatus tidak dikenali tidak diklaim belum produksi', () => {
  const result = buildLowStock(snapshot({
    stocks: [stock({ availableQuantity: 5 })],
    orders: [order({ status: 'MENUNGGU_KONFIRMASI' })],
    variations: [variation()],
  }));

  assert.deepEqual(result.inProduction, []);
  assert.deepEqual(result.waitingProduction, []);
  assert.match(result.issues.join(' '), /tidak dikenali/);
});

test('stok produk lain tidak disembunyikan oleh data bermasalah yang tidak terkait', () => {
  const result = buildLowStock(snapshot({
    stocks: [
      stock({ id: 1, availableQuantity: 5 }),
      stock({ id: 2, color: 'Red', availableQuantity: 8 }),
    ],
    orders: [order({ id: 'o1', status: 'ANEH' })],
    variations: [variation({ orderId: 'o1' })],
  }));

  // Hanya identitas yang berpotensi cocok yang ditahan; produk lain tetap tampil.
  assert.deepEqual(result.waitingProduction.map((row) => row.color), ['Red']);
  const issues = result.issues.join(' ');
  assert.match(issues, /tidak dikenali/);
  assert.match(issues, /belum dapat dipastikan/);
});

// ===== Section 2 =====

test('section 2 berisi stok <50 tanpa produksi aktif, diurutkan dari terkecil', () => {
  const result = buildLowStock(snapshot({
    stocks: [
      stock({ id: 1, size: 'S', availableQuantity: 30 }),
      stock({ id: 2, size: 'M', availableQuantity: 5 }),
      stock({ id: 3, size: 'L', availableQuantity: 50 }),
      stock({ id: 4, size: 'XL', availableQuantity: 10 }),
    ],
  }));

  assert.deepEqual(result.waitingProduction.map((row) => row.availableQuantity), [5, 10, 30]);
  assert.deepEqual(result.waitingProduction.map((row) => row.stockState), ['known', 'known', 'known']);
  assert.deepEqual(result.inProduction, []);
});

test('produksi yang seluruhnya selesai tidak lagi menghalangi section 2', () => {
  const result = buildLowStock(snapshot({
    stocks: [stock({ availableQuantity: 20 })],
    orders: [order({ status: 'PULLED' })],
    workOrders: [wo({ quantity: 100 })],
    finishing: [finishing({ quantity: 100 })],
  }));

  assert.deepEqual(result.inProduction, []);
  assert.deepEqual(
    result.waitingProduction.map((row) => [row.brand, row.productId, row.color, row.size, row.availableQuantity]),
    [['Acme', 'P-1', 'Blue', 'M', 20]],
  );
});

test('stok >=50 dengan produksi aktif tetap tampil di section 1 saja', () => {
  const result = buildLowStock(snapshot({
    stocks: [stock({ availableQuantity: 500 })],
    orders: [order()],
    variations: [variation()],
  }));

  assert.equal(result.inProduction.length, 1);
  assert.deepEqual(result.waitingProduction, []);
});

// ===== Filter dan opsi =====

test('filter pencarian mencakup produk, Product ID, warna, dan size tanpa peduli huruf besar', () => {
  const rows = buildLowStock(snapshot({
    stocks: [
      stock({ id: 1, productId: 'ABC-9', product: 'Kemeja', color: 'Navy', size: 'XL', availableQuantity: 5 }),
      stock({ id: 2, productId: 'ZZZ-1', product: 'Celana', color: 'Hitam', size: 'S', availableQuantity: 7 }),
    ],
  })).waitingProduction;

  const search = (value: string) => filterLowStockRows(rows, { search: value, client: '' }).map((row) => row.productId);
  assert.deepEqual(search('kemeja'), ['ABC-9']);
  assert.deepEqual(search('abc-9'), ['ABC-9']);
  assert.deepEqual(search('navy'), ['ABC-9']);
  assert.deepEqual(search(' xl '), ['ABC-9']);
  assert.deepEqual(search(''), ['ABC-9', 'ZZZ-1']);
  assert.deepEqual(search('tidak-ada'), []);
});

test('filter client tidak peduli huruf besar dan spasi', () => {
  const rows = buildLowStock(snapshot({
    stocks: [
      stock({ id: 1, brand: 'Acme', size: 'S', availableQuantity: 5 }),
      stock({ id: 2, brand: 'Livou', size: 'M', availableQuantity: 7 }),
    ],
  })).waitingProduction;

  assert.deepEqual(filterLowStockRows(rows, { search: '', client: ' acme ' }).map((row) => row.brand), ['Acme']);
  assert.deepEqual(filterLowStockRows(rows, { search: '', client: 'LIVOU' }).map((row) => row.brand), ['Livou']);
  assert.equal(filterLowStockRows(rows, { search: '', client: '' }).length, 2);
});

test('daftar client unik, terurut, dan menyimpan label asli', () => {
  assert.deepEqual(lowStockClients([]), []);
  assert.deepEqual(
    lowStockClients([
      { ...identity, key: 'a', brand: 'acme', availableQuantity: null, stockState: 'missing', orderCount: 0, orderQuantity: 0, remainingFinishing: 0, stages: [] },
      { ...identity, key: 'b', brand: 'Livou', availableQuantity: null, stockState: 'missing', orderCount: 0, orderQuantity: 0, remainingFinishing: 0, stages: [] },
      { ...identity, key: 'c', brand: 'ACME', availableQuantity: null, stockState: 'missing', orderCount: 0, orderQuantity: 0, remainingFinishing: 0, stages: [] },
      { ...identity, key: 'd', brand: null, availableQuantity: null, stockState: 'missing', orderCount: 0, orderQuantity: 0, remainingFinishing: 0, stages: [] },
    ]),
    [{ value: 'acme', label: 'acme' }, { value: 'livou', label: 'Livou' }],
  );
});
