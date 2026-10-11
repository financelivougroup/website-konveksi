import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMonthlyTrend,
  entryFromSelection,
  expensesToCsv,
  filterExpenses,
  formatMonthShort,
  monthFilterOptions,
  parseAmount,
  summarizeExpenses,
  valueOptions,
  type ExpenseEntry,
} from '../src/lib/expenseEntries.ts';
import type { ExpenseCategory } from '../src/lib/expenseCategories.ts';

// ===== Fixture: kategori NYATA dari seed, termasuk kasus yang menyulitkan =====
function c(
  id: number,
  level: ExpenseCategory['level'],
  parentId: number | null,
  name: string,
  sortOrder = 0,
): ExpenseCategory {
  return { id, level, parentId, name, sortOrder, isActive: true };
}

const ROWS: ExpenseCategory[] = [
  c(1, 'type', null, 'EXPENSE', 1),
  c(2, 'type', null, 'PURCHASE', 2),
  c(10, 'main', 1, 'MANPOWER', 3),
  c(13, 'main', 2, 'PRODUCTION', 1),
  c(23, 'sub', 10, 'SALARY', 1),
  c(24, 'sub', 13, 'SEWING', 1),
  c(25, 'sub', 13, 'CUTTING', 2),
  c(36, 'item', 24, 'Benang', 6),
  c(34, 'item', 24, 'Mesin', 1),
  c(37, 'item', 25, 'Mesin', 4),
];

function entry(over: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: 1,
    entryDate: '2026-09-17',
    categoryId: 24,
    itemId: 36,
    vendorId: 1,
    vendorName: 'Office Depot',
    quantity: 2,
    unitPrice: 50_000,
    total: 100_000,
    shippingAdmin: 0,
    discountCashback: 0,
    totalPayment: 100_000,
    flowTransaction: 'Cash',
    invoiceNumber: 'INV-0001',
    namaBarang: 'Benang jahit hitam',
    pic: 'Budi Santoso',
    proofPaymentPath: null,
    proofPaymentUrl: null,
    typeName: 'PURCHASE',
    mainCategoryName: 'PRODUCTION',
    subCategoryName: 'SEWING',
    itemName: 'Benang',
    categoryPath: 'PURCHASE › PRODUCTION › SEWING › Benang',
    note: '',
    proofPath: null,
    proofUrl: null,
    inputBy: 'tester',
    createdAt: '2026-09-17T00:00:00Z',
    ...over,
  };
}

/** Daftar vendor untuk penyalinan nama — bentuknya sama dengan services/vendors. */
const VENDORS = [
  { id: 1, nama: 'Office Depot' },
  { id: 2, nama: 'Delta Airlines' },
];

// ===== parseAmount =====

test('nominal bulat positif diterima', () => {
  assert.equal(parseAmount('150000'), 150000);
});

test('nominal kosong bukan angka', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('   '), null);
});

test('nol dan negatif ditolak', () => {
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount('-5000'), null);
});

test('desimal ditolak, bukan dibulatkan diam-diam', () => {
  // 1500.5 adalah ketikan yang salah; membulatkannya jadi 1501 atau 1500
  // menyimpan angka yang tidak pernah diketik user.
  assert.equal(parseAmount('1500.5'), null);
});

test('teks dan Infinity ditolak', () => {
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('Infinity'), null);
  assert.equal(parseAmount('NaN'), null);
});

// ===== entryFromSelection: salinan nama kategori =====

test('menyalin keempat nama dan jalur lengkap dari kategori terpilih', () => {
  const result = entryFromSelection(
    ROWS,
    { typeId: 2, mainId: 13, subId: 24, itemId: 36 },
    { date: '2026-09-17', quantity: '3', unitPrice: '50000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Benang', pic: 'Budi', note: 'beli benang', vendorId: 1, vendors: VENDORS },
  );
  assert.ok(result);
  assert.equal(result.typeName, 'PURCHASE');
  assert.equal(result.mainCategoryName, 'PRODUCTION');
  assert.equal(result.subCategoryName, 'SEWING');
  assert.equal(result.itemName, 'Benang');
  assert.equal(result.categoryPath, 'PURCHASE › PRODUCTION › SEWING › Benang');
  assert.equal(result.total, 150000);
  assert.equal(result.note, 'beli benang');
});

test('tanpa Item: itemName kosong dan jalur berhenti di Sub Category', () => {
  // SALARY memang tidak punya item — inilah kasus yang membuat Item opsional.
  const result = entryFromSelection(
    ROWS,
    { typeId: 1, mainId: 10, subId: 23, itemId: null },
    { date: '2026-09-17', quantity: '1', unitPrice: '5000000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-2', namaBarang: 'Gaji', pic: 'Budi', note: 'gaji', vendorId: 1, vendors: VENDORS },
  );
  assert.ok(result);
  assert.equal(result.itemName, '');
  assert.equal(result.itemId, null);
  assert.equal(result.categoryPath, 'EXPENSE › MANPOWER › SALARY');
  // Yang penting: tidak pernah menulis 'undefined' ke lapangan.
  assert.ok(!result.categoryPath.includes('undefined'));
  assert.ok(!result.itemName.includes('undefined'));
});

test('nama item sama di Sub Category berbeda tetap terbedakan jalurnya', () => {
  // 'Mesin' ada di SEWING dan di CUTTING. Jalur lengkap yang membedakannya.
  const sewing = entryFromSelection(
    ROWS,
    { typeId: 2, mainId: 13, subId: 24, itemId: 34 },
    { date: '2026-09-17', quantity: '1', unitPrice: '1000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Barang', pic: 'Budi', note: '', vendorId: 1, vendors: VENDORS },
  );
  const cutting = entryFromSelection(
    ROWS,
    { typeId: 2, mainId: 13, subId: 25, itemId: 37 },
    { date: '2026-09-17', quantity: '1', unitPrice: '1000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Barang', pic: 'Budi', note: '', vendorId: 1, vendors: VENDORS },
  );
  assert.equal(sewing?.itemName, 'Mesin');
  assert.equal(cutting?.itemName, 'Mesin');
  // Nama item SAMA, tapi jalurnya berbeda — ini sebabnya jalur disimpan.
  assert.notEqual(sewing?.categoryPath, cutting?.categoryPath);
  assert.equal(sewing?.categoryId, 24);
  assert.equal(cutting?.categoryId, 25);
});

test('pilihan belum lengkap menghasilkan null, bukan baris separuh jadi', () => {
  const base = { date: '2026-09-17', quantity: '1', unitPrice: '1000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Barang', pic: 'Budi', note: '', vendorId: 1, vendors: VENDORS };
  assert.equal(entryFromSelection(ROWS, { typeId: 2, mainId: null, subId: null, itemId: null }, base), null);
  assert.equal(entryFromSelection(ROWS, { typeId: 2, mainId: 13, subId: null, itemId: null }, base), null);
});

test('nominal tidak sah membatalkan seluruh baris', () => {
  const selection = { typeId: 2, mainId: 13, subId: 24, itemId: 36 };
  assert.equal(entryFromSelection(ROWS, selection, { date: '2026-09-17', quantity: '1', unitPrice: '0', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Barang', pic: 'Budi', note: '', vendorId: 1, vendors: VENDORS }), null);
  assert.equal(entryFromSelection(ROWS, selection, { date: '2026-09-17', quantity: '', unitPrice: '', shippingAdmin: '', discountCashback: '', flowTransaction: '', invoiceNumber: '', namaBarang: '', pic: '', note: '', vendorId: null, vendors: VENDORS }), null);
});

test('tanggal kosong membatalkan baris', () => {
  const selection = { typeId: 2, mainId: 13, subId: 24, itemId: 36 };
  assert.equal(entryFromSelection(ROWS, selection, { date: '', quantity: '1', unitPrice: '1000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Barang', pic: 'Budi', note: '', vendorId: 1, vendors: VENDORS }), null);
});

test('kategori yang tidak ada di data ditolak', () => {
  assert.equal(
    entryFromSelection(ROWS, { typeId: 999, mainId: 13, subId: 24, itemId: 36 }, { date: '2026-09-17', quantity: '1', unitPrice: '1000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Barang', pic: 'Budi', note: '', vendorId: 1, vendors: VENDORS }),
    null,
  );
});

test('keterangan di-trim, dan keterangan kosong jadi string kosong', () => {
  const result = entryFromSelection(
    ROWS,
    { typeId: 2, mainId: 13, subId: 24, itemId: 36 },
    { date: '2026-09-17', quantity: '1', unitPrice: '1000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Barang', pic: 'Budi', note: '  ada spasi  ', vendorId: 1, vendors: VENDORS },
  );
  assert.equal(result?.note, 'ada spasi');
});

// ===== Vendor =====

test('nama vendor disalin dari daftar vendor, bukan dari nilai ketikan', () => {
  const result = entryFromSelection(
    ROWS,
    { typeId: 2, mainId: 13, subId: 24, itemId: 36 },
    { date: '2026-09-17', quantity: '3', unitPrice: '50000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Benang', pic: 'Budi', note: '', vendorId: 1, vendors: VENDORS },
  );
  assert.ok(result);
  assert.equal(result.vendorId, 1);
  assert.equal(result.vendorName, 'Office Depot');
});

test('vendor WAJIB: tanpa vendor seluruh baris dibatalkan', () => {
  // Perubahan aturan dari user: vendor tidak lagi opsional. Ditolak di klien
  // supaya pesannya bisa ditindaklanjuti, bukan error constraint dari database.
  const result = entryFromSelection(
    ROWS,
    { typeId: 2, mainId: 13, subId: 24, itemId: 36 },
    { date: '2026-09-17', quantity: '3', unitPrice: '50000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Benang', pic: 'Budi', note: '' },
  );
  assert.equal(result, null);
});

// ===== Karyawan sebagai pihak yang dibayar (baris gaji) =====

/** Daftar karyawan untuk penyalinan nama — bentuknya sama dengan register_penjahit. */
const STAFFS = [
  { id: 3, nama: 'Suwati' },
  { id: 4, nama: 'Sidik Faisal' },
];

test('membayar karyawan: staffId terisi, vendorId null, nama karyawan disalin', () => {
  // Kasus gaji: dibayarkan ke KARYAWAN, bukan vendor. Ini yang membuat
  // `Target Cost / Posisi` bisa menampilkan gaji orang yang bersangkutan.
  const result = entryFromSelection(
    ROWS,
    { typeId: 1, mainId: 10, subId: 23, itemId: null },
    { date: '2026-09-25', quantity: '1', unitPrice: '3000000', shippingAdmin: '', discountCashback: '', flowTransaction: 'LIVOU TRANSFER', namaBarang: 'Gaji September', pic: 'Sidik Faisal', note: '', staffId: 3, staffs: STAFFS },
  );
  assert.ok(result);
  assert.equal(result.staffId, 3);
  assert.equal(result.vendorId, null);
  // Kolomnya NOT NULL, jadi nama karyawan yang disalin ke sini.
  assert.equal(result.vendorName, 'Suwati');
});

test('TEPAT SATU pihak: vendor DAN karyawan sekaligus ditolak', () => {
  // Ini cerminan CHECK `expense_entries_payee_check` di database.
  const result = entryFromSelection(
    ROWS,
    { typeId: 1, mainId: 10, subId: 23, itemId: null },
    { date: '2026-09-25', quantity: '1', unitPrice: '3000000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', namaBarang: 'Gaji', pic: 'Budi', note: '', vendorId: 1, vendors: VENDORS, staffId: 3, staffs: STAFFS },
  );
  assert.equal(result, null);
});

test('staffId yang tidak ada di daftar membatalkan baris', () => {
  const result = entryFromSelection(
    ROWS,
    { typeId: 1, mainId: 10, subId: 23, itemId: null },
    { date: '2026-09-25', quantity: '1', unitPrice: '3000000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', namaBarang: 'Gaji', pic: 'Budi', note: '', staffId: 999, staffs: STAFFS },
  );
  assert.equal(result, null);
});

test('tanpa vendor DAN tanpa karyawan ditolak', () => {
  const result = entryFromSelection(
    ROWS,
    { typeId: 2, mainId: 13, subId: 24, itemId: 36 },
    { date: '2026-09-17', quantity: '3', unitPrice: '50000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', namaBarang: 'Benang', pic: 'Budi', note: '', vendors: VENDORS, staffs: STAFFS },
  );
  assert.equal(result, null);
});

test('pembelian vendor tidak berubah: staffId null dan nama vendor disalin', () => {
  // Regresi: jalur lama harus tetap persis seperti sebelumnya.
  const result = entryFromSelection(
    ROWS,
    { typeId: 2, mainId: 13, subId: 24, itemId: 36 },
    { date: '2026-09-17', quantity: '3', unitPrice: '50000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', namaBarang: 'Benang', pic: 'Budi', note: '', vendorId: 2, vendors: VENDORS, staffs: STAFFS },
  );
  assert.ok(result);
  assert.equal(result.vendorId, 2);
  assert.equal(result.staffId, null);
  assert.equal(result.vendorName, 'Delta Airlines');
});

test('vendorId yang tidak ada di daftar juga membatalkan baris', () => {
  // Menyimpan id vendor yang tidak dikenal akan merusak pengelompokan per
  // vendor, dan sekarang tidak ada jalur untuk menyimpan tanpa vendor sama
  // sekali.
  const result = entryFromSelection(
    ROWS,
    { typeId: 2, mainId: 13, subId: 24, itemId: 36 },
    { date: '2026-09-17', quantity: '3', unitPrice: '50000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Benang', pic: 'Budi', note: '', vendorId: 999, vendors: VENDORS },
  );
  assert.equal(result, null);
});

test('teks wajib yang kosong membatalkan baris', () => {
  const selection = { typeId: 2, mainId: 13, subId: 24, itemId: 36 };
  const base = { date: '2026-09-17', quantity: '3', unitPrice: '50000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Benang', pic: 'Budi', note: '', vendorId: 1, vendors: VENDORS };
  // Nomor Invoice TIDAK termasuk: user meminta kolomnya dihapus, jadi ia tidak
  // lagi diwajibkan (lihat catatan yang sama di expenseEntries.ts).
  for (const field of ['flowTransaction', 'namaBarang', 'pic'] as const) {
    assert.equal(
      entryFromSelection(ROWS, selection, { ...base, [field]: '   ' }),
      null,
      `${field} kosong seharusnya membatalkan baris`,
    );
  }
});

test('nomor invoice tidak lagi diwajibkan', () => {
  const result = entryFromSelection(
    ROWS,
    { typeId: 2, mainId: 13, subId: 24, itemId: 36 },
    { date: '2026-09-17', quantity: '1', unitPrice: '1000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: '', namaBarang: 'Barang', pic: 'Budi', note: '', vendorId: 1, vendors: VENDORS },
  );
  assert.ok(result, 'tanpa nomor invoice seharusnya tetap bisa disimpan');
  assert.equal(result.invoiceNumber, '');
});

test('jumlah dan harga/item WAJIB dan harus lebih dari nol', () => {
  const selection = { typeId: 2, mainId: 13, subId: 24, itemId: 36 };
  const base = { date: '2026-09-17', quantity: '3', unitPrice: '50000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Benang', pic: 'Budi', note: '', vendorId: 1, vendors: VENDORS };
  assert.equal(entryFromSelection(ROWS, selection, { ...base, quantity: '' }), null);
  assert.equal(entryFromSelection(ROWS, selection, { ...base, quantity: '0' }), null);
  assert.equal(entryFromSelection(ROWS, selection, { ...base, unitPrice: '' }), null);
  assert.equal(entryFromSelection(ROWS, selection, { ...base, unitPrice: '0' }), null);
});

test('Total dan Total Payment dihitung saat merakit baris', () => {
  const result = entryFromSelection(
    ROWS,
    { typeId: 2, mainId: 13, subId: 24, itemId: 36 },
    { date: '2026-09-17', quantity: '3', unitPrice: '100000', shippingAdmin: '20000', discountCashback: '5000', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Benang', pic: 'Budi', note: '', vendorId: 1, vendors: VENDORS },
  );
  assert.ok(result);
  // Kasus yang sama diuji di database dan menghasilkan angka yang sama.
  assert.equal(result.total, 300_000);
  assert.equal(result.totalPayment, 315_000);
});

test('ongkir dan diskon kosong dianggap nol, bukan error', () => {
  const result = entryFromSelection(
    ROWS,
    { typeId: 2, mainId: 13, subId: 24, itemId: 36 },
    { date: '2026-09-17', quantity: '2', unitPrice: '50000', shippingAdmin: '', discountCashback: '', flowTransaction: 'Cash', invoiceNumber: 'INV-1', namaBarang: 'Benang', pic: 'Budi', note: '', vendorId: 1, vendors: VENDORS },
  );
  assert.ok(result);
  assert.equal(result.shippingAdmin, 0);
  assert.equal(result.discountCashback, 0);
  assert.equal(result.totalPayment, 100_000);
});

// ===== Pencarian ikut mencari vendor =====

test('pencarian menemukan baris lewat nama vendor', () => {
  const rows = [
    entry({ id: 1, vendorName: 'Office Depot', note: 'kertas' }),
    entry({ id: 2, vendorName: 'Delta Airlines', note: 'tiket' }),
  ];
  assert.deepEqual(filterExpenses(rows, { query: 'delta' }).map((r) => r.id), [2]);
});

test('pencarian tidak peka huruf besar-kecil', () => {
  const rows = [entry({ id: 1, vendorName: 'Office Depot' })];
  assert.deepEqual(filterExpenses(rows, { query: 'OFFICE' }).map((r) => r.id), [1]);
});

test('pencarian masih menemukan lewat keterangan dan kategori', () => {
  // namaBarang, itemName, dan categoryPath sengaja dikosongkan/dibedakan:
  // fixture default memuat 'Benang' di ketiganya, sehingga tanpa ini baris
  // kedua ikut cocok dan tesnya tidak membuktikan apa pun.
  const rows = [
    entry({ id: 1, note: 'beli benang hitam', namaBarang: '', itemName: '', categoryPath: 'EXPENSE › OTHERS › MEALS' }),
    entry({ id: 2, note: 'lain', namaBarang: '', itemName: '', categoryPath: 'EXPENSE › OTHERS › MEALS' }),
  ];
  assert.deepEqual(filterExpenses(rows, { query: 'benang' }).map((r) => r.id), [1]);
});

test('pencarian menemukan lewat jalur kategori', () => {
  const rows = [
    entry({ id: 1, note: 'x', itemName: '', categoryPath: 'EXPENSE › MANPOWER › SALARY' }),
    entry({ id: 2, note: 'x', itemName: '', categoryPath: 'PURCHASE › PRODUCTION › SEWING' }),
  ];
  assert.deepEqual(filterExpenses(rows, { query: 'salary' }).map((r) => r.id), [1]);
});

test('pencarian menemukan lewat nominal', () => {
  const rows = [entry({ id: 1, totalPayment: 50000 }), entry({ id: 2, totalPayment: 75000 })];
  assert.deepEqual(filterExpenses(rows, { query: '50000' }).map((r) => r.id), [1]);
});

test('pencarian kosong tidak menyaring apa pun', () => {
  const rows = [entry({ id: 1 }), entry({ id: 2 })];
  assert.equal(filterExpenses(rows, { query: '   ' }), rows);
});

// ===== CSV memuat vendor =====

test('CSV memuat kolom Vendor', () => {
  const csv = expensesToCsv([entry({ id: 1, vendorName: 'Office Depot' })]);
  const [header, row] = csv.split('\n');
  assert.match(header, /Vendor/);
  assert.match(row, /Office Depot/);
});



test('ringkasan menjumlah total dan menghitung transaksi', () => {
  const rows = [
    entry({ id: 1, totalPayment: 100_000 }),
    entry({ id: 2, totalPayment: 250_000 }),
    entry({ id: 3, totalPayment: 50_000 }),
  ];
  const summary = summarizeExpenses(rows);
  assert.equal(summary.total, 400_000);
  assert.equal(summary.count, 3);
});

test('ringkasan mengelompokkan per Main Category, terbesar dulu', () => {
  const rows = [
    entry({ id: 1, totalPayment: 100_000, mainCategoryName: 'PRODUCTION' }),
    entry({ id: 2, totalPayment: 300_000, mainCategoryName: 'MANPOWER' }),
    entry({ id: 3, totalPayment: 200_000, mainCategoryName: 'PRODUCTION' }),
  ];
  const summary = summarizeExpenses(rows);
  assert.deepEqual(summary.byMainCategory, [
    { name: 'MANPOWER', total: 300_000, count: 1 },
    { name: 'PRODUCTION', total: 300_000, count: 2 },
  ]);
});

test('ringkasan pada data kosong tidak menghasilkan NaN', () => {
  const summary = summarizeExpenses([]);
  assert.equal(summary.total, 0);
  assert.equal(summary.count, 0);
  assert.deepEqual(summary.byMainCategory, []);
});

test('nominal tidak valid dihitung 0, tidak membuat total NaN', () => {
  const rows = [entry({ id: 1, totalPayment: 100_000 }), entry({ id: 2, totalPayment: Number.NaN })];
  const summary = summarizeExpenses(rows);
  assert.equal(summary.total, 100_000);
  assert.ok(Number.isFinite(summary.total));
});

// ===== buildMonthlyTrend =====

test('tren diurutkan kronologis walau data masuk tidak berurutan', () => {
  const rows = [
    entry({ id: 1, entryDate: '2026-09-05', totalPayment: 100 }),
    entry({ id: 2, entryDate: '2026-07-01', totalPayment: 200 }),
    entry({ id: 3, entryDate: '2026-08-15', totalPayment: 300 }),
  ];
  assert.deepEqual(buildMonthlyTrend(rows).map((p) => p.month), ['2026-07', '2026-08', '2026-09']);
});

test('tren mengurutkan lintas tahun dengan benar', () => {
  const rows = [
    entry({ id: 1, entryDate: '2026-01-10', totalPayment: 100 }),
    entry({ id: 2, entryDate: '2025-12-31', totalPayment: 200 }),
  ];
  // Urutan abjad '2025-12' < '2026-01' juga benar, tapi yang diuji di sini
  // adalah bahwa Desember TIDAK muncul setelah Januari.
  assert.deepEqual(buildMonthlyTrend(rows).map((p) => p.month), ['2025-12', '2026-01']);
});

test('tren menjumlah per bulan, bukan sekadar menghitung baris', () => {
  const rows = [
    entry({ id: 1, entryDate: '2026-09-05', totalPayment: 100 }),
    entry({ id: 2, entryDate: '2026-09-20', totalPayment: 250 }),
  ];
  const trend = buildMonthlyTrend(rows);
  assert.equal(trend.length, 1);
  assert.equal(trend[0].total, 350);
  assert.equal(trend[0].count, 2);
});

test('tren memberi label bulan siap tampil', () => {
  assert.equal(buildMonthlyTrend([entry({ entryDate: '2026-09-17' })])[0].label, 'Sep 2026');
});

test('tanggal tidak berbentuk dilewati, tidak merusak grafik', () => {
  const rows = [entry({ id: 1, entryDate: 'bukan-tanggal' }), entry({ id: 2, entryDate: '2026-09-17', totalPayment: 50 })];
  const trend = buildMonthlyTrend(rows);
  assert.equal(trend.length, 1);
  assert.equal(trend[0].total, 50);
});

test('formatMonthShort mengembalikan input apa adanya bila tidak terbaca', () => {
  assert.equal(formatMonthShort('2026-09'), 'Sep 2026');
  assert.equal(formatMonthShort('2026-13'), '2026-13');
  assert.equal(formatMonthShort('aneh'), 'aneh');
});

// ===== filterExpenses =====

test('tanpa filter mengembalikan array yang sama, bukan salinan', () => {
  const rows = [entry({ id: 1 })];
  assert.equal(filterExpenses(rows, {}), rows);
});

test('slicer bulan memakai awalan tanggal', () => {
  const rows = [
    entry({ id: 1, entryDate: '2026-09-17' }),
    entry({ id: 2, entryDate: '2026-08-31' }),
  ];
  assert.deepEqual(filterExpenses(rows, { month: '2026-09' }).map((r) => r.id), [1]);
});

test('slicer bersifat AND, bukan OR', () => {
  const rows = [
    entry({ id: 1, typeName: 'PURCHASE', mainCategoryName: 'PRODUCTION', entryDate: '2026-09-01' }),
    entry({ id: 2, typeName: 'EXPENSE', mainCategoryName: 'PRODUCTION', entryDate: '2026-09-01' }),
  ];
  assert.deepEqual(
    filterExpenses(rows, { type: 'EXPENSE', mainCategory: 'PRODUCTION' }).map((r) => r.id),
    [2],
  );
});

// ===== opsi slicer =====

test('opsi Type dan Main Category diturunkan dari data', () => {
  const rows = [
    entry({ id: 1, typeName: 'PURCHASE', mainCategoryName: 'PRODUCTION' }),
    entry({ id: 2, typeName: 'EXPENSE', mainCategoryName: 'MANPOWER' }),
  ];
  assert.deepEqual(valueOptions(rows, 'type'), ['EXPENSE', 'PURCHASE']);
  assert.deepEqual(valueOptions(rows, 'mainCategory'), ['MANPOWER', 'PRODUCTION']);
});

test('opsi bulan terbaru lebih dulu', () => {
  const rows = [
    entry({ id: 1, entryDate: '2026-07-01' }),
    entry({ id: 2, entryDate: '2026-09-01' }),
  ];
  assert.deepEqual(monthFilterOptions(rows).map((o) => o.value), ['2026-09', '2026-07']);
});

// ===== CSV =====

test('CSV memuat header dan baris', () => {
  const csv = expensesToCsv([entry({ id: 1, totalPayment: 150000, note: 'beli benang' })]);
  const [header, row] = csv.split('\n');
  // Header mengikuti urutan kolom yang diminta user.
  assert.match(header, /Date Invoice/);
  assert.match(header, /Nama Barang/);
  assert.match(header, /Total Payment/);
  assert.match(row, /150000/);
  assert.match(row, /beli benang/);
});

test('CSV meng-escape koma dan tanda kutip', () => {
  const csv = expensesToCsv([entry({ id: 1, note: 'a, b "c"' })]);
  assert.ok(csv.includes('"a, b ""c"""'));
});

test('CSV tidak pernah memuat NaN', () => {
  const csv = expensesToCsv([entry({ id: 1, totalPayment: Number.NaN })]);
  assert.ok(!csv.includes('NaN'));
});

// ===== ketahanan =====

test('input tidak dimutasi', () => {
  const rows = [entry({ id: 1, totalPayment: 100 })];
  const before = JSON.stringify(rows);
  summarizeExpenses(rows);
  buildMonthlyTrend(rows);
  filterExpenses(rows, { type: 'PURCHASE' });
  expensesToCsv(rows);
  assert.equal(JSON.stringify(rows), before);
});
