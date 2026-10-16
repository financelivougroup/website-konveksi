import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findClientByBrand,
  isValidClientCode,
  tallyClientUsage,
} from '../src/lib/clientCode.ts';

const clients = [
  { namaClient: 'Livou', kodeClient: 'LVU' },
  { namaClient: 'Cassca', kodeClient: 'CSC' },
];

test('mencocokkan brand persis dengan nama client terdaftar', () => {
  assert.deepEqual(findClientByBrand('Livou', clients), {
    namaClient: 'Livou',
    kodeClient: 'LVU',
  });
});

test('pencocokan tidak peka huruf besar-kecil', () => {
  assert.deepEqual(findClientByBrand('LIVOU', clients), {
    namaClient: 'Livou',
    kodeClient: 'LVU',
  });
});

test('spasi di pinggir brand diabaikan', () => {
  assert.deepEqual(findClientByBrand('  Cassca  ', clients), {
    namaClient: 'Cassca',
    kodeClient: 'CSC',
  });
});

test('brand yang belum terdaftar mengembalikan null', () => {
  assert.equal(findClientByBrand('Brand Baru', clients), null);
});

test('brand kosong mengembalikan null', () => {
  assert.equal(findClientByBrand('', clients), null);
  assert.equal(findClientByBrand('   ', clients), null);
});

test('mengembalikan baris pertama ketika ada nama kembar', () => {
  const kembar = [
    { namaClient: 'Livou', kodeClient: 'LVU' },
    { namaClient: 'Livou', kodeClient: 'LVO' },
  ];
  assert.deepEqual(findClientByBrand('livou', kembar), {
    namaClient: 'Livou',
    kodeClient: 'LVU',
  });
});

test('menerima kode client berupa huruf dan angka', () => {
  assert.equal(isValidClientCode('LVU'), true);
  assert.equal(isValidClientCode('CSC2'), true);
  assert.equal(isValidClientCode('lvu'), true, 'huruf kecil diterima, diseragamkan saat disimpan');
  assert.equal(isValidClientCode('  LVU  '), true, 'spasi di pinggir diabaikan');
});

test('menerima kode client lengkap dengan angka dan tanda hubung', () => {
  for (const code of ['001-LVU', '002-CSC', ' 001-lvu ', 'LV-U', '001', 'A1-B2-C3']) {
    assert.equal(isValidClientCode(code), true, code);
  }
});

test('menolak kode kosong, pemisah tidak lengkap, dan karakter di luar format', () => {
  for (const code of ['', '   ', '-LVU', 'LVU-', '001--LVU', '001/LVU', '001_LVU', 'LVU!', 'LV U']) {
    assert.equal(isValidClientCode(code), false, code);
  }
});

test('resolusi brand mempertahankan kode client lengkap tanpa membuang prefix angka', () => {
  const numberedClients = [
    { namaClient: 'Livou', kodeClient: '001-LVU' },
    { namaClient: 'Cassca', kodeClient: '002-CSC' },
  ];
  assert.deepEqual(findClientByBrand(' livou ', numberedClients), numberedClients[0]);
  assert.deepEqual(findClientByBrand('CASSCA', numberedClients), numberedClients[1]);
});

test('menghitung Work Order tanpa invoice dan snapshot invoice per client', () => {
  assert.deepEqual(
    tallyClientUsage(
      [{ namaClient: 'Livou' }, { namaClient: 'Cassca' }],
      [
        { id: 'WO-1', brand: 'Livou' },
        { id: 'WO-2', brand: ' LIVOU ' },
        { id: 'WO-3', brand: 'Cassca' },
        { id: 'WO-4', brand: null },
      ],
      [
        { workOrderId: 'WO-1', clientName: 'livou' },
        { workOrderId: 'WO-LAMA-1', clientName: 'Cassca' },
        { workOrderId: 'WO-LAMA-2', clientName: 'Cassca' },
      ],
    ),
    [
      { namaClient: 'Livou', activeWorkOrders: 1, invoices: 1 },
      { namaClient: 'Cassca', activeWorkOrders: 1, invoices: 2 },
    ],
  );
});

test('nama client kosong tidak menyerap brand atau snapshot kosong', () => {
  assert.deepEqual(
    tallyClientUsage(
      [{ namaClient: '' }],
      [{ id: 'WO-1', brand: '' }, { id: 'WO-2', brand: null }],
      [
        { workOrderId: 'WO-1', clientName: '' },
        { workOrderId: 'WO-2', clientName: null },
      ],
    ),
    [{ namaClient: '', activeWorkOrders: 0, invoices: 0 }],
  );
});
