import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLaporanRows,
  applyLaporanFilters,
  bulanOptions,
  formatBulan,
  picOptions,
  produkOptions,
  sizeOptions,
  warnaOptions,
  warnaSwatch,
  warnaButuhBorder,
  summarizeLaporan,
  laporanToCsv,
  EMPTY_FILTERS,
  EM_DASH,
} from '../src/lib/laporanCompute.ts';
import type { WorkOrder } from '../src/types/pipeline.ts';

function wo(over: Record<string, unknown> = {}): WorkOrder {
  return {
    id: 'wo-1',
    workCode: 'WC-1',
    sourceOrderId: 'po-1',
    productNote: 'Produksi 1',
    clientProductionCode: 'PDFF_LVU-PNT-02_B-00_PRDN',
    product: 'Sheen Pants',
    productId: '',
    variationId: '',
    informationVariation: '',
    warna: 'White',
    size: 'S',
    brand: 'Livou',
    quantity: 100,
    productionStatus: 'NEW',
    invoiceStatus: 'BELUM',
    createdBy: 'admin',
    createdAt: '2026-08-01',
    ...over,
  } as WorkOrder;
}

function sewing(over: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    workOrderId: 'wo-1',
    workCode: 'WC-1',
    picPenjahit: 'Budi Santoso',
    qtySelesai: 50,
    tanggalLaporan: '2026-08-05',
    inputBy: 'admin',
    inputAt: '2026-08-05',
    imageName: 'foto1.jpg',
    ...over,
  };
}

function kancing(over: Record<string, unknown> = {}) {
  return {
    id: 'k-1',
    workOrderId: 'wo-1',
    workCode: 'WC-1',
    picKancing: 'Siti',
    qtyKancing: 20,
    tanggalLaporan: '2026-08-06',
    inputBy: 'admin',
    inputAt: '2026-08-06',
    imageName: null,
    ...over,
  };
}

function finishing(over: Record<string, unknown> = {}) {
  return {
    id: 'f-1',
    workOrderId: 'wo-1',
    qtyFinishing: 15,
    tanggalImport: '2026-08-07',
    syncedAt: '2026-08-07T10:00:00Z',
    source: 'manual',
    syncStatus: 'OK' as const,
    inputBy: 'admin',
    imageName: 'foto2.jpg',
    ...over,
  };
}

test('produk, warna, size di-lookup dari work order', () => {
  const rows = buildLaporanRows('jahit', [sewing()], [wo()]);
  assert.equal(rows[0].produk, 'Sheen Pants');
  assert.equal(rows[0].warna, 'White');
  assert.equal(rows[0].size, 'S');
  assert.equal(rows[0].qty, 50);
  assert.equal(rows[0].pic, 'Budi Santoso');
  assert.equal(rows[0].bukti, 'foto1.jpg');
});

test('produk beda-beda per work order, bukan ikut record', () => {
  const wos = [
    wo({ id: 'wo-1', product: 'Mina Top', warna: 'Black', size: 'M' }),
    wo({ id: 'wo-2', product: 'Rue Top', warna: 'Ivory', size: 'One Size' }),
  ];
  const rows = buildLaporanRows(
    'jahit',
    [sewing({ id: 's-1', workOrderId: 'wo-1' }), sewing({ id: 's-2', workOrderId: 'wo-2' })],
    wos,
  );
  assert.deepEqual(
    rows.map((r) => [r.produk, r.warna, r.size]),
    [
      ['Mina Top', 'Black', 'M'],
      ['Rue Top', 'Ivory', 'One Size'],
    ],
  );
});

test('warna/size kosong di work order → string kosong, bukan "undefined"', () => {
  const rows = buildLaporanRows(
    'jahit',
    [sewing()],
    [wo({ warna: null, size: undefined })],
  );
  assert.equal(rows[0].warna, '');
  assert.equal(rows[0].size, '');
});

test('bukti null → string kosong, bukan "null"', () => {
  const rows = buildLaporanRows('kancing', [kancing()], [wo()]);
  assert.equal(rows[0].bukti, '');
});

test('finishing: tanggalImport kosong memakai syncedAt', () => {
  const rows = buildLaporanRows(
    'finishing',
    [finishing({ tanggalImport: '', syncedAt: '2026-09-05T08:30:00Z' })],
    [wo()],
  );
  assert.equal(rows[0].tanggal, '2026-09-05');
});

test('finishing: picFinishing kosong → fallback inputBy → kosong', () => {
  const viaInputBy = buildLaporanRows(
    'finishing',
    [finishing({ picFinishing: undefined, inputBy: 'Sinta' })],
    [wo()],
  );
  assert.equal(viaInputBy[0].pic, 'Sinta');

  const none = buildLaporanRows(
    'finishing',
    [finishing({ picFinishing: undefined, inputBy: undefined })],
    [wo()],
  );
  assert.equal(none[0].pic, '');
});

test('finishing tanpa work order cocok: produk kosong, tidak crash', () => {
  const rows = buildLaporanRows('finishing', [finishing({ workOrderId: 'wo-x' })], []);
  assert.equal(rows[0].produk, '');
  assert.equal(rows[0].warna, '');
  assert.equal(rows[0].size, '');
});

test('kolom produk hanya nama produk — kode work order tidak ikut', () => {
  // work_code work order berbentuk "Produksi - Awal | Sheen Pants | White | S";
  // yang boleh tampil di kolom Produk cuma "Sheen Pants".
  const rows = buildLaporanRows(
    'jahit',
    [sewing({ workCode: 'Produksi - Awal | Sheen Pants | White | S' })],
    [wo({ workCode: 'Produksi - Awal | Sheen Pants | White | S', product: 'Sheen Pants' })],
  );
  assert.equal(rows[0].produk, 'Sheen Pants');
  assert.ok(!JSON.stringify(rows[0]).includes('workCode'));
  assert.ok(!JSON.stringify(rows[0]).includes('Produksi - Awal'));
});

test('qty non-numerik tidak menghasilkan NaN', () => {
  const rows = buildLaporanRows('kancing', [kancing({ qtyKancing: undefined })], [wo()]);
  assert.equal(rows[0].qty, 0);
  assert.ok(Number.isFinite(summarizeLaporan(rows).totalQty));
});

test('baris diurutkan tanggal menaik, tanpa tanggal di bawah', () => {
  const rows = buildLaporanRows(
    'jahit',
    [
      sewing({ id: 's-3', tanggalLaporan: '' }),
      sewing({ id: 's-2', tanggalLaporan: '2026-08-10' }),
      sewing({ id: 's-1', tanggalLaporan: '2026-08-01' }),
    ],
    [wo()],
  );
  assert.deepEqual(rows.map((r) => r.tanggal), ['2026-08-01', '2026-08-10', '']);
});

test('slicer bulan: cuma bulan yang dipilih yang tampil', () => {
  const rows = buildLaporanRows(
    'jahit',
    [
      sewing({ id: 's-1', tanggalLaporan: '2026-08-05' }),
      sewing({ id: 's-2', tanggalLaporan: '2026-08-20' }),
      sewing({ id: 's-3', tanggalLaporan: '2026-09-02' }),
    ],
    [wo()],
  );
  const agustus = applyLaporanFilters(rows, { ...EMPTY_FILTERS, bulan: '2026-08' });
  assert.deepEqual(agustus.map((r) => r.id), ['s-1', 's-2']);

  const september = applyLaporanFilters(rows, { ...EMPTY_FILTERS, bulan: '2026-09' });
  assert.deepEqual(september.map((r) => r.id), ['s-3']);
});

test('slicer produk menggantikan slicer status', () => {
  const wos = [wo({ id: 'wo-1', product: 'Mina Top' }), wo({ id: 'wo-2', product: 'Rue Top' })];
  const rows = buildLaporanRows(
    'jahit',
    [
      sewing({ id: 's-1', workOrderId: 'wo-1', picPenjahit: 'Budi' }),
      sewing({ id: 's-2', workOrderId: 'wo-2', picPenjahit: 'Siti' }),
    ],
    wos,
  );

  assert.deepEqual(
    applyLaporanFilters(rows, { ...EMPTY_FILTERS, produk: 'Rue Top' }).map((r) => r.id),
    ['s-2'],
  );
  assert.deepEqual(
    applyLaporanFilters(rows, { ...EMPTY_FILTERS, pic: 'Budi' }).map((r) => r.id),
    ['s-1'],
  );
});

test('slicer bersifat AND, bukan OR', () => {
  const wos = [wo({ id: 'wo-1', product: 'Mina Top' }), wo({ id: 'wo-2', product: 'Rue Top' })];
  const rows = buildLaporanRows(
    'jahit',
    [
      sewing({
        id: 's-1',
        workOrderId: 'wo-1',
        picPenjahit: 'Budi',
        tanggalLaporan: '2026-08-05',
      }),
      sewing({
        id: 's-2',
        workOrderId: 'wo-2',
        picPenjahit: 'Budi',
        tanggalLaporan: '2026-08-06',
      }),
    ],
    wos,
  );

  // Bulan Agustus + produk Mina Top + PIC Budi → cuma s-1.
  const filtered = applyLaporanFilters(rows, {
    bulan: '2026-08',
    produk: 'Mina Top',
    pic: 'Budi',
  });
  assert.deepEqual(filtered.map((r) => r.id), ['s-1']);
});

test('slicer kosong mengembalikan array yang sama', () => {
  const rows = buildLaporanRows('jahit', [sewing()], [wo()]);
  assert.equal(applyLaporanFilters(rows, EMPTY_FILTERS), rows);
});

test('formatBulan: 2026-08 → Agustus 2026', () => {
  assert.equal(formatBulan('2026-08'), 'Agustus 2026');
  assert.equal(formatBulan('2026-01'), 'Januari 2026');
  assert.equal(formatBulan('2026-12'), 'Desember 2026');
  assert.equal(formatBulan('bukan-bulan'), 'bukan-bulan');
  assert.equal(formatBulan('2026-13'), '2026-13');
});

test('opsi bulan urut menurun dan unik', () => {
  const rows = buildLaporanRows(
    'jahit',
    [
      sewing({ id: 's-1', tanggalLaporan: '2026-08-05' }),
      sewing({ id: 's-2', tanggalLaporan: '2026-08-20' }),
      sewing({ id: 's-3', tanggalLaporan: '2026-09-02' }),
      sewing({ id: 's-4', tanggalLaporan: '' }),
    ],
    [wo()],
  );
  assert.deepEqual(bulanOptions(rows), [
    { value: '2026-09', label: 'September 2026' },
    { value: '2026-08', label: 'Agustus 2026' },
  ]);
});

test('opsi produk urut alfabet, tanpa nama tidak jadi opsi', () => {
  const wos = [
    wo({ id: 'wo-1', product: 'Sheen Pants' }),
    wo({ id: 'wo-2', product: 'Mina Top' }),
    wo({ id: 'wo-3', product: '' }),
  ];
  const rows = buildLaporanRows(
    'jahit',
    [
      sewing({ id: 's-1', workOrderId: 'wo-1' }),
      sewing({ id: 's-2', workOrderId: 'wo-2' }),
      sewing({ id: 's-3', workOrderId: 'wo-3' }),
    ],
    wos,
  );
  assert.deepEqual(produkOptions(rows), [
    { value: 'Mina Top', label: 'Mina Top' },
    { value: 'Sheen Pants', label: 'Sheen Pants' },
  ]);
});

test('opsi PIC urut alfabet, tanpa nama tidak jadi opsi', () => {
  const rows = buildLaporanRows(
    'jahit',
    [
      sewing({ id: 's-1', picPenjahit: 'Siti' }),
      sewing({ id: 's-2', picPenjahit: 'Budi' }),
      sewing({ id: 's-3', picPenjahit: '' }),
    ],
    [wo()],
  );
  assert.deepEqual(picOptions(rows), [
    { value: 'Budi', label: 'Budi' },
    { value: 'Siti', label: 'Siti' },
  ]);
});

test('opsi warna & size dari work order, urut alfabet', () => {
  const wos = [
    wo({ id: 'wo-1', warna: 'Ivory', size: 'S' }),
    wo({ id: 'wo-2', warna: 'Black', size: 'M' }),
  ];
  const rows = buildLaporanRows(
    'jahit',
    [sewing({ id: 's-1', workOrderId: 'wo-1' }), sewing({ id: 's-2', workOrderId: 'wo-2' })],
    wos,
  );
  assert.deepEqual(warnaOptions(rows), [
    { value: 'Black', label: 'Black' },
    { value: 'Ivory', label: 'Ivory' },
  ]);
  assert.deepEqual(sizeOptions(rows), [
    { value: 'M', label: 'M' },
    { value: 'S', label: 'S' },
  ]);
});

test('swatch warna: nama dikenal dipetakan, nama asing stabil', () => {
  assert.equal(warnaSwatch('Black'), '#111827');
  assert.equal(warnaSwatch('  ivory  '), '#F5EFE1'); // dibersihkan & case-insensitive
  assert.equal(warnaSwatch('Chocolate'), '#4B2E22');

  const asing = warnaSwatch('Warna Aneh');
  assert.match(asing, /^hsl\(\d{1,3} 45% 48%\)$/);
  // Nama yang sama selalu menghasilkan warna yang sama (stabil antar render).
  assert.equal(warnaSwatch('Warna Aneh'), asing);
  assert.notEqual(warnaSwatch('Warna Lain'), asing);

  assert.equal(warnaSwatch(''), '#CBD5E1');
});

test('warna terang butuh border, warna gelap tidak', () => {
  assert.equal(warnaButuhBorder('White'), true);
  assert.equal(warnaButuhBorder('Ivory'), true);
  assert.equal(warnaButuhBorder('Black'), false);
  assert.equal(warnaButuhBorder('Chocolate'), false);
});

test('ringkasan: total, jumlah WO, produk, PIC, bukti', () => {
  const wos = [
    wo({ id: 'wo-1', product: 'Mina Top' }),
    wo({ id: 'wo-2', product: 'Rue Top' }),
  ];
  const rows = buildLaporanRows(
    'jahit',
    [
      sewing({ id: 's-1', workOrderId: 'wo-1', qtySelesai: 50, picPenjahit: 'Budi' }),
      sewing({ id: 's-2', workOrderId: 'wo-1', qtySelesai: 30, picPenjahit: 'Budi' }),
      sewing({
        id: 's-3',
        workOrderId: 'wo-2',
        qtySelesai: 20,
        picPenjahit: 'Siti',
        imageName: null,
      }),
    ],
    wos,
  );
  const s = summarizeLaporan(rows);
  assert.equal(s.totalQty, 100);
  assert.equal(s.rowCount, 3);
  assert.equal(s.workOrderCount, 2);
  assert.equal(s.produkCount, 2);
  assert.equal(s.picCount, 2);
  assert.equal(s.buktiCount, 2);
});

test('ringkasan kosong: nol di semua hitungan', () => {
  const s = summarizeLaporan([]);
  assert.equal(s.totalQty, 0);
  assert.equal(s.rowCount, 0);
  assert.equal(s.workOrderCount, 0);
  assert.equal(s.produkCount, 0);
  assert.equal(s.picCount, 0);
  assert.equal(s.buktiCount, 0);
});

test('CSV: header, baris, dan baris Total', () => {
  const rows = buildLaporanRows('jahit', [sewing({ qtySelesai: 50 })], [wo()]);
  const csv = laporanToCsv(rows, summarizeLaporan(rows), 'Penjahit');

  assert.ok(csv.startsWith('﻿'), 'BOM untuk Excel UTF-8');
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  assert.equal(lines.length, 3); // header + 1 baris + Total
  assert.match(lines[0], /"Produk","Warna","Size","Qty","Bukti Barang","Penjahit"/);
  assert.match(lines[1], /"Sheen Pants","White","S"/);
  assert.equal(lines[2], '"","Total","","","50","",""');
  assert.ok(!csv.includes('NaN'));
});

test('CSV: nilai kosong jadi em-dash, koma dan kutip di-escape', () => {
  const rows = buildLaporanRows('jahit', [sewing({ imageName: null })], [
    wo({ product: null, warna: null, size: null }),
  ]);
  const csv = laporanToCsv(rows, summarizeLaporan(rows), 'Penjahit');
  const dataLine = csv.replace(/^﻿/, '').split('\r\n')[1];
  assert.ok(dataLine.startsWith(`"2026-08-05","${EM_DASH}","${EM_DASH}","${EM_DASH}"`), dataLine);

  // Koma dan kutip di dalam nilai harus di-escape.
  const quoted = buildLaporanRows('jahit', [sewing()], [wo({ product: 'A, "B"' })]);
  assert.ok(laporanToCsv(quoted, summarizeLaporan(quoted), 'Penjahit').includes('"A, ""B"""'));
});
