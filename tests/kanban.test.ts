import assert from 'node:assert/strict';
import test from 'node:test';
import { buildKanbanGroups, groupStatus, type KanbanWorkOrder } from '../src/lib/kanban.ts';
import type { ProductionStatus } from '../src/types/pipeline.ts';

/**
 * Work Order minimal untuk menguji grouping. Bentuk field-nya mengikuti
 * `WorkOrder` + `derivedStatus` (yang ditambahkan Production Monitoring).
 * Status sengaja diberikan langsung lewat `derivedStatus` — tes ini menguji
 * ATURAN GROUPING, bukan perhitungan status dari angka produksi.
 */
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

// ===== Aturan inti: status kartu = yang BELUM selesai =====
// Permintaan user: kalau satu kode produksi konveksi punya >1 variasi dan masih
// ada yang statusnya PROGRESS, kartu tetap di kolom PROGRESS — BUKAN naik ke
// FINISHED. Dulu aturannya kebalikan (status tertinggi), dan itu yang membuat
// pekerjaan berjalan tersembunyi.

test('3 variasi PROGRESS + 1 FINISHED → kartu tetap PROGRESS (kasus data nyata)', () => {
  // Bentuk persis data live: PO/001-LVU/09/2026/002 dengan 4 variasi.
  const groups = buildKanbanGroups([
    wo({ id: 'wo-1', warna: 'Black', size: 'M', derivedStatus: 'PROGRESS' }),
    wo({ id: 'wo-2', warna: 'Black', size: 'XL', derivedStatus: 'PROGRESS' }),
    wo({ id: 'wo-3', warna: 'Ivory', size: 'M', derivedStatus: 'PROGRESS' }),
    wo({ id: 'wo-4', warna: 'Ivory', size: 'XL', derivedStatus: 'FINISHED' }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].status, 'PROGRESS');
});

test('satu variasi belum digarap (NEW) menahan kartu di NEW', () => {
  const groups = buildKanbanGroups([
    wo({ id: 'wo-1', derivedStatus: 'FINISHED' }),
    wo({ id: 'wo-2', derivedStatus: 'PROGRESS' }),
    wo({ id: 'wo-3', derivedStatus: 'NEW' }),
  ]);
  assert.equal(groups[0].status, 'NEW');
});

test('kartu baru naik ke FINISHED bila SEMUA variasi sudah FINISHED', () => {
  const groups = buildKanbanGroups([
    wo({ id: 'wo-1', derivedStatus: 'FINISHED' }),
    wo({ id: 'wo-2', derivedStatus: 'FINISHED' }),
    wo({ id: 'wo-3', derivedStatus: 'FINISHED' }),
  ]);
  assert.equal(groups[0].status, 'FINISHED');
});

test('urutan input tidak mempengaruhi hasil — yang menentukan status terendah', () => {
  const forward = buildKanbanGroups([
    wo({ id: 'wo-1', derivedStatus: 'NEW' }),
    wo({ id: 'wo-2', derivedStatus: 'FINISHED' }),
  ]);
  const reversed = buildKanbanGroups([
    wo({ id: 'wo-2', derivedStatus: 'FINISHED' }),
    wo({ id: 'wo-1', derivedStatus: 'NEW' }),
  ]);
  assert.equal(forward[0].status, 'NEW');
  assert.equal(reversed[0].status, 'NEW');
});

test('status kartu tidak pernah lebih maju dari variasi paling mundur', () => {
  const combos: ProductionStatus[][] = [
    ['PROGRESS', 'FINISHED'],
    ['NEW', 'INVOICED'],
    ['NEW', 'PROGRESS', 'FINISHED', 'INVOICED'],
    ['PROGRESS', 'INVOICED'],
  ];
  for (const statuses of combos) {
    const groups = buildKanbanGroups(
      statuses.map((derivedStatus, i) => wo({ id: `wo-${i}`, derivedStatus })),
    );
    // Status terendah menurut STATUS_ORDER.
    const order: ProductionStatus[] = ['NEW', 'PROGRESS', 'FINISHED', 'INVOICED'];
    const lowest = order.find((s) => statuses.includes(s));
    assert.equal(groups[0].status, lowest, `gagal untuk ${statuses.join('+')}`);
  }
});

// ===== Satu kartu = satu Kode Produksi Konveksi =====

test('kode produksi berbeda menjadi kartu terpisah', () => {
  const groups = buildKanbanGroups([
    wo({ id: 'wo-1', productNote: 'PO/001-LVU/09/2026/002' }),
    wo({ id: 'wo-2', productNote: 'PO/001-LVU/09/2026/003' }),
  ]);
  assert.equal(groups.length, 2);
});

test('product note dengan spasi di ujung digabung ke kartu yang sama', () => {
  const groups = buildKanbanGroups([
    wo({ id: 'wo-1', productNote: 'PO/001-LVU/09/2026/002' }),
    wo({ id: 'wo-2', productNote: '  PO/001-LVU/09/2026/002  ' }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].workOrders.length, 2);
});

test('work order tanpa product note dilewati — tidak bisa diidentifikasi', () => {
  const groups = buildKanbanGroups([
    wo({ id: 'wo-1', productNote: '' }),
    wo({ id: 'wo-2', productNote: '   ' }),
    wo({ id: 'wo-3', productNote: 'PO/001-LVU/09/2026/002' }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].workOrders.length, 1);
});

// ===== Kode Produksi Client =====

test('kode produksi client ikut terbawa ke kartu', () => {
  const groups = buildKanbanGroups([wo({ derivedStatus: 'PROGRESS' })]);
  assert.equal(groups[0].clientProductionCode, 'PDFF_LVU-PNT-01_B-00_PRDN');
});

test('kode produksi client kosong menjadi null, bukan undefined', () => {
  const groups = buildKanbanGroups([wo({ clientProductionCode: null })]);
  assert.equal(groups[0].clientProductionCode, null);
});

// ===== totalQty =====

test('totalQty menjumlah seluruh variasi termasuk yang sudah FINISHED', () => {
  const groups = buildKanbanGroups([
    wo({ id: 'wo-1', quantity: 100, derivedStatus: 'PROGRESS' }),
    wo({ id: 'wo-2', quantity: 100, derivedStatus: 'PROGRESS' }),
    wo({ id: 'wo-3', quantity: 100, derivedStatus: 'PROGRESS' }),
    wo({ id: 'wo-4', quantity: 100, derivedStatus: 'FINISHED' }),
  ]);
  assert.equal(groups[0].totalQty, 400);
});

test('quantity tidak valid dihitung 0, tidak membuat totalQty NaN', () => {
  const groups = buildKanbanGroups([
    wo({ id: 'wo-1', quantity: 100 }),
    wo({ id: 'wo-2', quantity: Number.NaN }),
  ]);
  assert.equal(groups[0].totalQty, 100);
  assert.ok(Number.isFinite(groups[0].totalQty));
});

// ===== groupStatus =====

test('groupStatus mengembalikan null untuk daftar kosong', () => {
  assert.equal(groupStatus([]), null);
});

test('groupStatus memakai status terendah, sama seperti kartu', () => {
  assert.equal(
    groupStatus([
      wo({ id: 'wo-1', derivedStatus: 'FINISHED' }),
      wo({ id: 'wo-2', derivedStatus: 'PROGRESS' }),
    ]),
    'PROGRESS',
  );
});

// ===== Input kosong =====

test('daftar kosong menghasilkan tanpa kartu', () => {
  assert.deepEqual(buildKanbanGroups([]), []);
});

test('decorated rows tidak memutasi work order aslinya', () => {
  const rows = [wo({ id: 'wo-1', quantity: 100 })];
  buildKanbanGroups(rows);
  assert.equal(rows[0].quantity, 100);
});

// ===== Foto per kode produksi =====

test('kode memakai foto variasi pertama yang punya foto', () => {
  const groups = buildKanbanGroups([
    wo({ id: 'wo-1', variationPhotoUrl: null }),
    wo({ id: 'wo-2', variationPhotoUrl: 'https://x/foto-2.jpg' }),
    wo({ id: 'wo-3', variationPhotoUrl: 'https://x/foto-3.jpg' }),
  ]);
  assert.equal(groups[0].photoUrl, 'https://x/foto-2.jpg');
});

test('foto tidak ditimpa variasi berikutnya — hasilnya mengikuti urutan data secara jujur', () => {
  // Yang dijaga di sini: foto yang sudah terisi TIDAK ditimpa. Jadi kalau
  // urutan input dibalik, yang menang memang foto yang diproses lebih dulu —
  // bukan variasi terakhir yang kebetulan diproses belakangan.
  const depan = buildKanbanGroups([
    wo({ id: 'wo-1', variationPhotoUrl: 'https://x/a.jpg' }),
    wo({ id: 'wo-2', variationPhotoUrl: 'https://x/b.jpg' }),
  ]);
  const belakang = buildKanbanGroups([
    wo({ id: 'wo-2', variationPhotoUrl: 'https://x/b.jpg' }),
    wo({ id: 'wo-1', variationPhotoUrl: 'https://x/a.jpg' }),
  ]);
  assert.equal(depan[0].photoUrl, 'https://x/a.jpg');
  assert.equal(belakang[0].photoUrl, 'https://x/b.jpg');
});

test('variasi tanpa foto tidak menghapus foto yang sudah ada', () => {
  const groups = buildKanbanGroups([
    wo({ id: 'wo-1', variationPhotoUrl: 'https://x/a.jpg' }),
    wo({ id: 'wo-2', variationPhotoUrl: null }),
  ]);
  assert.equal(groups[0].photoUrl, 'https://x/a.jpg');
});

test('kode tanpa satu pun foto berfoto null, bukan undefined', () => {
  const groups = buildKanbanGroups([wo({ variationPhotoUrl: null }), wo({ id: 'wo-2' })]);
  assert.equal(groups[0].photoUrl, null);
});

test('kode berbeda tidak saling mewarisi foto', () => {
  const groups = buildKanbanGroups([
    wo({ id: 'wo-1', productNote: 'PO-A', variationPhotoUrl: 'https://x/a.jpg' }),
    wo({ id: 'wo-2', productNote: 'PO-B', variationPhotoUrl: null }),
  ]);
  assert.equal(groups.find((g) => g.productNote === 'PO-A')?.photoUrl, 'https://x/a.jpg');
  assert.equal(groups.find((g) => g.productNote === 'PO-B')?.photoUrl, null);
});
