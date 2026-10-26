import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDayPoints,
  buildStageRows,
  filterStageRows,
  STAGES,
  type StageSources,
} from '../src/lib/productionTimeline.ts';
import type {
  CuttingRecord,
  FinishingRecord,
  KancingRecord,
  SewingRecord,
  WorkOrder,
} from '../src/types/pipeline.ts';

// ===== Fixtures minimal =====
// Bentuk field mengikuti tipe di src/types/pipeline.ts. Hanya field yang dibaca
// helper yang diisi; sisanya diberi nilai wajar.

function wo(over: Partial<WorkOrder> = {}): WorkOrder {
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
    ...over,
  };
}

function cutting(over: Partial<CuttingRecord> = {}): CuttingRecord {
  return {
    id: 'cut-1',
    workOrderId: 'wo-1',
    totalCutting: 100,
    inputBy: 'Andi',
    inputAt: '2026-09-02',
    locked: false,
    sisaCutting: 0,
    ...over,
  };
}

function sewing(over: Partial<SewingRecord> = {}): SewingRecord {
  return {
    id: 'sew-1',
    workOrderId: 'wo-1',
    workCode: 'WC-1',
    picPenjahit: 'Budi',
    qtySelesai: 40,
    tanggalLaporan: '2026-09-03',
    inputBy: 'tester',
    inputAt: '2026-09-03T08:00:00Z',
    imageName: 'bukti-jahit.jpg',
    ...over,
  };
}

function kancing(over: Partial<KancingRecord> = {}): KancingRecord {
  return {
    id: 'kan-1',
    workOrderId: 'wo-1',
    workCode: 'WC-1',
    picKancing: 'Cici',
    qtyKancing: 30,
    tanggalLaporan: '2026-09-04',
    inputBy: 'tester',
    inputAt: '2026-09-04T08:00:00Z',
    imageName: 'bukti-kancing.jpg',
    ...over,
  };
}

function finishing(over: Partial<FinishingRecord> = {}): FinishingRecord {
  return {
    id: 'fin-1',
    workOrderId: 'wo-1',
    qtyFinishing: 20,
    tanggalImport: '2026-09-05',
    syncedAt: '2026-09-05T10:00:00Z',
    source: 'IMPORT',
    syncStatus: 'OK',
    picFinishing: 'Dedi',
    imageName: 'bukti-finishing.jpg',
    ...over,
  };
}

function sources(over: Partial<StageSources> = {}): StageSources {
  return {
    workOrders: [wo()],
    cutting: [],
    sewing: [],
    kancing: [],
    finishing: [],
    ...over,
  };
}

// ===== Pemetaan field per tahap =====

test('cutting memetakan inputAt/qty/inputBy', () => {
  const rows = buildStageRows(sources({ cutting: [cutting()] }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stage, 'cutting');
  assert.equal(rows[0].tanggal, '2026-09-02');
  assert.equal(rows[0].qty, 100);
  assert.equal(rows[0].pic, 'Andi');
  assert.equal(rows[0].warna, 'Black');
  assert.equal(rows[0].size, 'M');
  assert.equal(rows[0].bukti, '');
});

test('sewing memetakan tanggalLaporan/qtySelesai/picPenjahit/imageName', () => {
  const rows = buildStageRows(sources({ sewing: [sewing()] }));
  assert.deepEqual(
    { stage: rows[0].stage, tanggal: rows[0].tanggal, qty: rows[0].qty, pic: rows[0].pic, bukti: rows[0].bukti },
    { stage: 'sewing', tanggal: '2026-09-03', qty: 40, pic: 'Budi', bukti: 'bukti-jahit.jpg' },
  );
});

test('kancing memetakan tanggalLaporan/qtyKancing/picKancing', () => {
  const rows = buildStageRows(sources({ kancing: [kancing()] }));
  assert.deepEqual(
    { stage: rows[0].stage, tanggal: rows[0].tanggal, qty: rows[0].qty, pic: rows[0].pic },
    { stage: 'kancing', tanggal: '2026-09-04', qty: 30, pic: 'Cici' },
  );
});

test('finishing memakai tanggalImport dan picFinishing bila ada', () => {
  const rows = buildStageRows(sources({ finishing: [finishing()] }));
  assert.equal(rows[0].tanggal, '2026-09-05');
  assert.equal(rows[0].qty, 20);
  assert.equal(rows[0].pic, 'Dedi');
});

test('finishing jatuh ke syncedAt dan inputBy bila tanggalImport/picFinishing kosong', () => {
  const rows = buildStageRows(
    sources({ finishing: [finishing({ tanggalImport: '', picFinishing: '', inputBy: 'Eka' })] }),
  );
  assert.equal(rows[0].tanggal, '2026-09-05');
  assert.equal(rows[0].pic, 'Eka');
});

test('tanggal berformat timestamp ISO dipotong ke YYYY-MM-DD', () => {
  const rows = buildStageRows(sources({ cutting: [cutting({ inputAt: '2026-09-02T13:45:00.000Z' })] }));
  assert.equal(rows[0].tanggal, '2026-09-02');
});

// ===== Scoping ke work order grup =====

test('catatan milik work order lain tidak ikut', () => {
  const rows = buildStageRows(
    sources({
      workOrders: [wo({ id: 'wo-1' })],
      sewing: [sewing({ id: 's1', workOrderId: 'wo-1' }), sewing({ id: 's2', workOrderId: 'wo-99' })],
    }),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 's1');
});

test('warna/size dibaca dari work order, bukan dari record', () => {
  const rows = buildStageRows(
    sources({
      workOrders: [wo({ id: 'wo-1', warna: 'Ivory', size: 'XL' })],
      sewing: [sewing()],
    }),
  );
  assert.equal(rows[0].warna, 'Ivory');
  assert.equal(rows[0].size, 'XL');
});

// ===== Urutan baris =====

test('baris diurut menurun; tanggal kosong paling bawah', () => {
  const rows = buildStageRows(
    sources({
      cutting: [cutting({ id: 'c1', inputAt: '2026-09-02' })],
      sewing: [sewing({ id: 's1', tanggalLaporan: '2026-09-10' })],
      kancing: [kancing({ id: 'k1', tanggalLaporan: '' })],
    }),
  );
  assert.deepEqual(rows.map((r) => r.id), ['s1', 'c1', 'k1']);
});

// ===== buildDayPoints =====

test('buildDayPoints menjumlah qty per tanggal per tahap, urut menaik', () => {
  const rows = buildStageRows(
    sources({
      cutting: [cutting({ id: 'c1', inputAt: '2026-09-02', totalCutting: 100 })],
      sewing: [
        sewing({ id: 's1', tanggalLaporan: '2026-09-03', qtySelesai: 40 }),
        sewing({ id: 's2', tanggalLaporan: '2026-09-03', qtySelesai: 20 }),
      ],
    }),
  );
  const days = buildDayPoints(rows);
  assert.equal(days.length, 2);
  assert.deepEqual(days.map((d) => d.tanggal), ['2026-09-02', '2026-09-03']);
  assert.equal(days[0].cutting, 100);
  assert.equal(days[0].sewing, 0);
  assert.equal(days[1].sewing, 60);
  assert.equal(days[1].label, '03/09');
});

test('buildDayPoints mengabaikan baris tanpa tanggal', () => {
  const rows = buildStageRows(
    sources({
      sewing: [sewing({ id: 's1', tanggalLaporan: '' })],
      kancing: [kancing({ id: 'k1', tanggalLaporan: '2026-09-04' })],
    }),
  );
  const days = buildDayPoints(rows);
  assert.equal(days.length, 1);
  assert.equal(days[0].tanggal, '2026-09-04');
});

test('qty tidak valid dihitung 0, tidak menghasilkan NaN', () => {
  const rows = buildStageRows(
    sources({ sewing: [sewing({ qtySelesai: Number.NaN })] }),
  );
  const days = buildDayPoints(rows);
  assert.equal(days[0].sewing, 0);
  assert.ok(Number.isFinite(days[0].sewing));
});

test('buildDayPoints pada daftar kosong menghasilkan array kosong', () => {
  assert.deepEqual(buildDayPoints([]), []);
});

// ===== filterStageRows =====

test("filter 'all' mengembalikan semua tahap", () => {
  const rows = buildStageRows(
    sources({ cutting: [cutting()], sewing: [sewing()], kancing: [kancing()], finishing: [finishing()] }),
  );
  assert.equal(filterStageRows(rows, 'all').length, 4);
});

test('filter satu tahap hanya mengembalikan tahap itu', () => {
  const rows = buildStageRows(
    sources({ cutting: [cutting()], sewing: [sewing()], kancing: [kancing()], finishing: [finishing()] }),
  );
  const only = filterStageRows(rows, 'sewing');
  assert.equal(only.length, 1);
  assert.equal(only[0].stage, 'sewing');
});

test('filterStageRows mengurut menaik: tanggal terbaru di paling bawah', () => {
  const rows = buildStageRows(
    sources({
      sewing: [
        sewing({ id: 's1', tanggalLaporan: '2026-09-01' }),
        sewing({ id: 's2', tanggalLaporan: '2026-09-20' }),
      ],
    }),
  );
  assert.deepEqual(filterStageRows(rows, 'all').map((r) => r.id), ['s1', 's2']);
});

test('filterStageRows menaruh tanggal kosong paling atas tanpa mengacak tanggal valid', () => {
  const rows = buildStageRows(
    sources({
      cutting: [cutting({ id: 'c1', inputAt: '2026-09-02' })],
      sewing: [sewing({ id: 's1', tanggalLaporan: '2026-09-10' })],
      kancing: [kancing({ id: 'k1', tanggalLaporan: '' })],
    }),
  );
  assert.deepEqual(filterStageRows(rows, 'all').map((r) => r.id), ['k1', 'c1', 's1']);
});

test('filter tahap tanpa baris menghasilkan array kosong', () => {
  const rows = buildStageRows(sources({ sewing: [sewing()] }));
  assert.deepEqual(filterStageRows(rows, 'finishing'), []);
});

// ===== Kontrak STAGES =====

test('STAGES berisi empat tahap dalam urutan lini produksi', () => {
  assert.deepEqual(STAGES, ['cutting', 'sewing', 'kancing', 'finishing']);
});
