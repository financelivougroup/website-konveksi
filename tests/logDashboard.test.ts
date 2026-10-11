import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LAPORAN_KIND_BY_TAB,
  buildKodeList,
  buildLogRows,
  rowsForGroup,
  scopedLaporanRows,
  sumLogQty,
} from '../src/lib/logDashboard.ts';
import type { KanbanGroup, KanbanWorkOrder } from '../src/lib/kanban.ts';
import type { LaporanRow } from '../src/lib/laporanCompute.ts';

// ===== Pabrik data uji =====

function wo(over: Partial<KanbanWorkOrder> = {}): KanbanWorkOrder {
  return {
    id: 'wo-1',
    workCode: 'WC-1',
    sourceOrderId: 'po-1',
    productNote: 'PO/001-LVU/09/2026/002',
    clientProductionCode: 'PDFF_LVU-PNT-01_B-00_PRDN',
    product: 'Mina Top',
    productId: 'LVU-MINA1',
    variationId: 'VAR-1',
    informationVariation: '',
    warna: 'Black',
    size: 'M',
    brand: 'LVU',
    quantity: 100,
    productionStatus: 'PROGRESS',
    invoiceStatus: 'NONE',
    createdBy: 'tester',
    createdAt: '2026-09-01T00:00:00Z',
    derivedStatus: 'PROGRESS',
    ...over,
  };
}

function group(over: Partial<KanbanGroup> = {}): KanbanGroup {
  return {
    productNote: 'PO/001-LVU/09/2026/002',
    clientProductionCode: 'PDFF_LVU-PNT-01_B-00_PRDN',
    product: 'Mina Top',
    brand: 'LVU',
    totalQty: 100,
    status: 'PROGRESS',
    workOrders: [wo()],
    ...over,
  };
}

function row(over: Partial<LaporanRow> = {}): LaporanRow {
  return {
    id: 'row-1',
    workOrderId: 'wo-1',
    tanggal: '2026-09-05',
    produk: 'Mina Top',
    warna: 'Black',
    size: 'M',
    qty: 50,
    pic: 'Budi',
    bukti: 'bukti.jpg',
    ...over,
  };
}

// ===== Peta tab → jenis laporan =====
// Ini titik yang paling mudah salah: union-nya `'jahit'`, bukan `'sewing'`.

test('tab sewing dipetakan ke jenis laporan jahit, bukan sewing', () => {
  assert.equal(LAPORAN_KIND_BY_TAB.sewing, 'jahit');
});

test('kancing dan finishing dipetakan apa adanya', () => {
  assert.equal(LAPORAN_KIND_BY_TAB.kancing, 'kancing');
  assert.equal(LAPORAN_KIND_BY_TAB.finishing, 'finishing');
});

test('setiap tab log punya pemetaan, tidak ada yang undefined', () => {
  for (const [tab, kind] of Object.entries(LAPORAN_KIND_BY_TAB)) {
    assert.ok(typeof kind === 'string' && kind.length > 0, `pemetaan kosong untuk ${tab}`);
  }
});

// ===== rowsForGroup =====

test('tanpa pilihan (null) mengembalikan SELURUH baris — dashboard keseluruhan', () => {
  const rows = [row({ id: 'r1', workOrderId: 'wo-1' }), row({ id: 'r2', workOrderId: 'wo-9' })];
  assert.deepEqual(rowsForGroup(rows, null), rows);
});

test('dengan pilihan hanya mengembalikan baris work order milik kode itu', () => {
  const g = group({ workOrders: [wo({ id: 'wo-1' }), wo({ id: 'wo-2' })] });
  const rows = [
    row({ id: 'r1', workOrderId: 'wo-1' }),
    row({ id: 'r2', workOrderId: 'wo-2' }),
    row({ id: 'r3', workOrderId: 'wo-lain' }),
  ];
  assert.deepEqual(rowsForGroup(rows, g).map((r) => r.id), ['r1', 'r2']);
});

test('kode dengan produk sama tapi productNote berbeda tidak saling bocor', () => {
  // Dua kode produksi bisa memuat produk yang sama persis. Kalau penyaringan
  // memakai nama produk (bukan id work order), baris kode lain akan ikut masuk.
  const gA = group({
    productNote: 'PO/001-LVU/09/2026/002',
    product: 'Mina Top',
    workOrders: [wo({ id: 'wo-a' })],
  });
  const rows = [
    row({ id: 'r-a', workOrderId: 'wo-a', produk: 'Mina Top' }),
    row({ id: 'r-b', workOrderId: 'wo-b', produk: 'Mina Top' }),
  ];
  assert.deepEqual(rowsForGroup(rows, gA).map((r) => r.id), ['r-a']);
});

test('kode tanpa baris di log ini menghasilkan array kosong, bukan seluruh baris', () => {
  const g = group({ workOrders: [wo({ id: 'wo-kosong' })] });
  const rows = [row({ id: 'r1', workOrderId: 'wo-lain' })];
  assert.deepEqual(rowsForGroup(rows, g), []);
});

test('daftar baris kosong tetap aman', () => {
  assert.deepEqual(rowsForGroup([], group()), []);
  assert.deepEqual(rowsForGroup([], null), []);
});

// ===== buildKodeList =====

test('hanya kode yang punya baris di log ini yang muncul', () => {
  const gAda = group({ productNote: 'PO/001', workOrders: [wo({ id: 'wo-1' })] });
  const gKosong = group({ productNote: 'PO/002', workOrders: [wo({ id: 'wo-2' })] });
  const list = buildKodeList([gAda, gKosong], [row({ workOrderId: 'wo-1' })]);
  assert.deepEqual(list.map((e) => e.group.productNote), ['PO/001']);
});

test('kode tanpa work order sama sekali tidak muncul', () => {
  const g = group({ productNote: 'PO/003', workOrders: [] });
  assert.deepEqual(buildKodeList([g], [row()]), []);
});

test('qty per kode = jumlah qty barisnya, bukan qty order', () => {
  const g = group({ workOrders: [wo({ id: 'wo-1', quantity: 100 })] });
  const list = buildKodeList([g], [
    row({ id: 'r1', workOrderId: 'wo-1', qty: 30 }),
    row({ id: 'r2', workOrderId: 'wo-1', qty: 20 }),
  ]);
  assert.equal(list[0].rowQty, 50);
  assert.equal(list[0].rowCount, 2);
});

test('qty kode dijumlah lintas semua variasi work order-nya', () => {
  const g = group({ workOrders: [wo({ id: 'wo-1' }), wo({ id: 'wo-2' })] });
  const list = buildKodeList([g], [
    row({ id: 'r1', workOrderId: 'wo-1', qty: 30 }),
    row({ id: 'r2', workOrderId: 'wo-2', qty: 45 }),
  ]);
  assert.equal(list[0].rowQty, 75);
  assert.equal(list[0].rowCount, 2);
});

test('daftar urut menurun berdasarkan qty', () => {
  const kecil = group({ productNote: 'PO-KECIL', workOrders: [wo({ id: 'wo-k' })] });
  const besar = group({ productNote: 'PO-BESAR', workOrders: [wo({ id: 'wo-b' })] });
  const list = buildKodeList([kecil, besar], [
    row({ id: 'r1', workOrderId: 'wo-k', qty: 10 }),
    row({ id: 'r2', workOrderId: 'wo-b', qty: 90 }),
  ]);
  assert.deepEqual(list.map((e) => e.group.productNote), ['PO-BESAR', 'PO-KECIL']);
});

test('urutan input tidak mempengaruhi hasil — urutannya stabil', () => {
  const a = group({ productNote: 'PO-A', workOrders: [wo({ id: 'wo-a' })] });
  const b = group({ productNote: 'PO-B', workOrders: [wo({ id: 'wo-b' })] });
  const rows = [
    row({ id: 'r1', workOrderId: 'wo-a', qty: 40 }),
    row({ id: 'r2', workOrderId: 'wo-b', qty: 70 }),
  ];
  assert.deepEqual(
    buildKodeList([a, b], rows).map((e) => e.group.productNote),
    buildKodeList([b, a], rows).map((e) => e.group.productNote),
  );
});

test('qty seri dipecah alfabet agar urutan tidak acak antar render', () => {
  const a = group({ productNote: 'PO-B', workOrders: [wo({ id: 'wo-a' })] });
  const b = group({ productNote: 'PO-A', workOrders: [wo({ id: 'wo-b' })] });
  const rows = [
    row({ id: 'r1', workOrderId: 'wo-a', qty: 50 }),
    row({ id: 'r2', workOrderId: 'wo-b', qty: 50 }),
  ];
  assert.deepEqual(buildKodeList([a, b], rows).map((e) => e.group.productNote), ['PO-A', 'PO-B']);
});

test('daftar kosong tetap aman', () => {
  assert.deepEqual(buildKodeList([], []), []);
  assert.deepEqual(buildKodeList([group()], []), []);
});

test('grup yang dikembalikan masih membawa workOrders-nya (dipakai panel kanan)', () => {
  const g = group({ workOrders: [wo({ id: 'wo-1' }), wo({ id: 'wo-2' })] });
  const list = buildKodeList([g], [row({ workOrderId: 'wo-1' })]);
  assert.equal(list[0].group.workOrders.length, 2);
  assert.equal(list[0].group.clientProductionCode, 'PDFF_LVU-PNT-01_B-00_PRDN');
});

// ===== buildLogRows =====

const WOS = [wo({ id: 'wo-1' }), wo({ id: 'wo-2', productNote: 'PO/002' })];

function sewing(over: Record<string, unknown> = {}) {
  return {
    id: 'sr-1',
    workOrderId: 'wo-1',
    workCode: 'WC-1',
    picPenjahit: 'Budi',
    qtySelesai: 50,
    tanggalLaporan: '2026-09-05',
    inputBy: 'admin',
    inputAt: '2026-09-05T10:00:00Z',
    imageName: 'jahit.jpg',
    ...over,
  } as never;
}

test('jahit membaca field jahit', () => {
  const rows = buildLogRows('sewing', [sewing()], WOS, '');
  assert.equal(rows[0].pic, 'Budi');
  assert.equal(rows[0].qty, 50);
  assert.equal(rows[0].tanggal, '2026-09-05');
  assert.equal(rows[0].imageName, 'jahit.jpg');
});

test('kancing membaca field kancing', () => {
  const rec = { id: 'k1', workOrderId: 'wo-1', workCode: 'WC-1', picKancing: 'Ani', qtyKancing: 12, tanggalLaporan: '2026-09-07', inputAt: '2026-09-07T10:00:00Z' };
  const rows = buildLogRows('kancing', [rec], WOS, '');
  assert.equal(rows[0].pic, 'Ani');
  assert.equal(rows[0].qty, 12);
  assert.equal(rows[0].imageName, '');
});

test('finishing jatuh ke inputBy dan syncedAt saat field utamanya kosong', () => {
  const rec = { id: 'f1', workOrderId: 'wo-1', qtyFinishing: 8, tanggalImport: '', syncedAt: '2026-09-09', source: 'x', syncStatus: 'OK', inputBy: 'Sari' };
  const rows = buildLogRows('finishing', [rec], WOS, '');
  assert.equal(rows[0].pic, 'Sari');
  assert.equal(rows[0].tanggal, '2026-09-09');
});

test('finishing memakai picFinishing bila terisi, bukan inputBy', () => {
  const rec = { id: 'f1', workOrderId: 'wo-1', qtyFinishing: 8, tanggalImport: '2026-09-09', syncedAt: '', source: 'x', syncStatus: 'OK', picFinishing: 'Dewi', inputBy: 'admin' };
  assert.equal(buildLogRows('finishing', [rec], WOS, '')[0].pic, 'Dewi');
});

test('qty tidak valid dihitung 0, bukan NaN', () => {
  const rows = buildLogRows('sewing', [sewing({ qtySelesai: null })], WOS, '');
  assert.equal(rows[0].qty, 0);
  assert.ok(Number.isFinite(rows[0].qty));
});

test('baris terbaru di atas', () => {
  const rows = buildLogRows('sewing', [
    sewing({ id: 'a', tanggalLaporan: '2026-09-01' }),
    sewing({ id: 'b', tanggalLaporan: '2026-09-20' }),
  ], WOS, '');
  assert.deepEqual(rows.map((r) => r.id), ['b', 'a']);
});

test('pencarian menemukan lewat kode client work order, bukan cuma field catatan', () => {
  // Kode Produksi Client tidak ada di catatan jahit mana pun — hanya di work
  // order. Tanpa join, mencari kode yang terlihat di tabel akan nihil.
  const rows = buildLogRows('sewing', [sewing()], WOS, 'PDFF_LVU');
  assert.equal(rows.length, 1);
});

test('pencarian menjangkau warna dan size work order', () => {
  assert.equal(buildLogRows('sewing', [sewing()], WOS, 'ivory').length, 0);
  assert.equal(buildLogRows('sewing', [sewing()], WOS, 'black').length, 1);
});

test('pencarian tidak cocok menghasilkan daftar kosong', () => {
  assert.deepEqual(buildLogRows('sewing', [sewing()], WOS, 'tidak-ada'), []);
});

test('kata kunci kosong atau spasi tidak menyaring apa pun', () => {
  assert.equal(buildLogRows('sewing', [sewing()], WOS, '').length, 1);
  assert.equal(buildLogRows('sewing', [sewing()], WOS, '   ').length, 1);
});

test('catatan tanpa work order tetap tampil (tidak hilang diam-diam)', () => {
  const rows = buildLogRows('sewing', [sewing({ workOrderId: 'wo-hilang' })], WOS, '');
  assert.equal(rows.length, 1);
});

test('sumLogQty menjumlah seluruh qty', () => {
  const rows = buildLogRows('sewing', [
    sewing({ id: 'a', qtySelesai: 30 }),
    sewing({ id: 'b', qtySelesai: 45 }),
  ], WOS, '');
  assert.equal(sumLogQty(rows), 75);
});

test('sumLogQty pada daftar kosong = 0', () => {
  assert.equal(sumLogQty([]), 0);
});

// ===== scopedLaporanRows =====
// Rantai bersama untuk panel KPI DAN tabel di bawahnya. Kalau keduanya menyusun
// rantai sendiri-sendiri, filter bisa mengenai KPI saja dan tidak tabelnya.

test('scopedLaporanRows tanpa pilihan mengembalikan seluruh baris laporan', () => {
  const rows = scopedLaporanRows('jahit', [sewing()], WOS, null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].produk, 'Mina Top');
  assert.equal(rows[0].qty, 50);
});

test('scopedLaporanRows dengan pilihan hanya mengembalikan baris kode itu', () => {
  const g = group({ workOrders: [wo({ id: 'wo-1' })] });
  const rows = scopedLaporanRows('jahit', [
    sewing({ id: 'a', workOrderId: 'wo-1' }),
    sewing({ id: 'b', workOrderId: 'wo-2' }),
  ], WOS, g);
  assert.deepEqual(rows.map((r) => r.id), ['a']);
});

test('scopedLaporanRows membawa field laporan, bukan field log', () => {
  // Kontrak penting: tabel panel memakai bentuk ini, jadi produk/warna/size/
  // bukti harus ada. Kalau helper ini keliru mengembalikan bentuk log, kolom
  // tabel akan hilang.
  const rows = scopedLaporanRows('jahit', [sewing()], WOS, null);
  assert.equal(typeof rows[0].produk, 'string');
  assert.equal(typeof rows[0].warna, 'string');
  assert.equal(typeof rows[0].size, 'string');
  assert.equal(typeof rows[0].bukti, 'string');
});

test('scopedLaporanRows pada daftar kosong tetap aman', () => {
  assert.deepEqual(scopedLaporanRows('jahit', [], WOS, null), []);
  assert.deepEqual(scopedLaporanRows('jahit', [], WOS, group()), []);
});
