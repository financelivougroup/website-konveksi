import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_TIME,
  buildCategoryBreakdown,
  buildProfitLossMonths,
  deltaPercent,
  inWindow,
  marginPercent,
  monthOf,
  monthOptions,
  monthWindow,
  previousMonthWindow,
  shiftWindow,
  TANPA_KATEGORI,
  type ProfitLossExpenseInput,
  type ProfitLossInvoiceInput,
} from '../src/lib/profitLoss.ts';

// Impor memakai jalur RELATIF ber-ekstensi `.ts`, bukan alias `@/`, karena
// modul ini dijalankan `node --test` yang tidak punya bundler — aturan yang
// sama berlaku di seluruh tests/ repo ini.

function expense(over: Partial<ProfitLossExpenseInput> = {}): ProfitLossExpenseInput {
  return {
    entryDate: '2026-09-05',
    totalPayment: 100_000,
    mainCategoryName: 'PRODUCTION',
    subCategoryName: 'CUTTING',
    ...over,
  };
}

function invoice(over: Partial<ProfitLossInvoiceInput> = {}): ProfitLossInvoiceInput {
  return { invoiceDate: '2026-09-15', totalAmount: 4_000_000, ...over };
}

test('monthOf mengambil YYYY-MM dan menolak tanggal yang tidak terbaca', () => {
  assert.equal(monthOf('2026-09-15'), '2026-09');
  assert.equal(monthOf(''), '');
  assert.equal(monthOf('15/09/2026'), '');
  assert.equal(monthOf(undefined as unknown as string), '');
});

test('menggabungkan income dan expense pada bulan yang sama', () => {
  const months = buildProfitLossMonths(
    [expense({ totalPayment: 99_970, entryDate: '2026-09-05' })],
    [invoice({ totalAmount: 4_000_000, invoiceDate: '2026-09-15' })],
  );

  assert.equal(months.length, 1);
  assert.equal(months[0].month, '2026-09');
  assert.equal(months[0].income, 4_000_000);
  assert.equal(months[0].expense, 99_970);
  assert.equal(months[0].profit, 4_000_000 - 99_970);
  assert.equal(months[0].invoiceCount, 1);
  assert.equal(months[0].expenseCount, 1);
});

test('BULAN YANG HANYA PUNYA INVOICE TETAP MUNCUL — bukan hilang karena belum ada biaya', () => {
  const months = buildProfitLossMonths(
    [],
    [invoice({ invoiceDate: '2026-07-01', totalAmount: 1_500_000 })],
  );

  assert.equal(months.length, 1);
  assert.equal(months[0].expense, 0);
  assert.equal(months[0].profit, 1_500_000);
});

test('BULAN YANG HANYA PUNYA BIAYA TETAP MUNCUL, dan profitnya NEGATIF', () => {
  const months = buildProfitLossMonths(
    [expense({ entryDate: '2026-08-20', totalPayment: 250_000 })],
    [],
  );

  assert.equal(months.length, 1);
  assert.equal(months[0].income, 0);
  // Rugi TIDAK dijepit ke 0 — justru itu yang dicari dari laporan laba/rugi.
  assert.equal(months[0].profit, -250_000);
});

test('bulan terurut KRONOLOGIS, bukan menurut abjad nama bulan', () => {
  const months = buildProfitLossMonths(
    [],
    [
      invoice({ invoiceDate: '2026-08-01' }),
      invoice({ invoiceDate: '2026-01-01' }),
      invoice({ invoiceDate: '2026-12-01' }),
    ],
  );

  assert.deepEqual(months.map((m) => m.month), ['2026-01', '2026-08', '2026-12']);
});

test('menjumlahkan beberapa baris pada bulan yang sama', () => {
  const months = buildProfitLossMonths(
    [expense({ totalPayment: 30_000 }), expense({ totalPayment: 70_000 })],
    [invoice({ totalAmount: 1_000_000 }), invoice({ totalAmount: 2_000_000 })],
  );

  assert.equal(months[0].income, 3_000_000);
  assert.equal(months[0].expense, 100_000);
  assert.equal(months[0].invoiceCount, 2);
  assert.equal(months[0].expenseCount, 2);
});

test('nominal NaN TIDAK merusak total — dianggap 0', () => {
  const months = buildProfitLossMonths(
    [expense({ totalPayment: Number.NaN }), expense({ totalPayment: 50_000 })],
    [invoice({ totalAmount: Number.POSITIVE_INFINITY })],
  );

  assert.equal(months[0].expense, 50_000);
  assert.equal(months[0].income, 0);
});

test('tanggal tidak terbaca DILEWATI, bukan dibuatkan bulan palsu', () => {
  const months = buildProfitLossMonths(
    [expense({ entryDate: '' })],
    [invoice({ invoiceDate: 'bukan-tanggal' })],
  );

  assert.equal(months.length, 0);
});

test('monthOptions memberi bulan TERBARU DULU', () => {
  const months = buildProfitLossMonths(
    [],
    [invoice({ invoiceDate: '2026-01-01' }), invoice({ invoiceDate: '2026-09-01' })],
  );

  assert.deepEqual(monthOptions(months).map((o) => o.value), ['2026-09', '2026-01']);
});

test('rincian kategori bertingkat: main total = jumlah sub-nya', () => {
  const rows = buildCategoryBreakdown([
    expense({ mainCategoryName: 'PRODUCTION', subCategoryName: 'CUTTING', totalPayment: 60_000 }),
    expense({ mainCategoryName: 'PRODUCTION', subCategoryName: 'SEWING', totalPayment: 40_000 }),
    expense({ mainCategoryName: 'MOBILITY', subCategoryName: 'DELIVERY', totalPayment: 25_000 }),
  ]);

  const production = rows.find((r) => r.name === 'PRODUCTION');
  assert.equal(production?.total, 100_000);
  assert.equal(production?.count, 2);
  assert.deepEqual(production?.subs.map((s) => s.name), ['CUTTING', 'SEWING']);
  assert.equal(
    production?.total,
    production?.subs.reduce((sum, s) => sum + s.total, 0),
    'total main harus sama dengan jumlah sub-nya',
  );

  // Main terbesar dulu.
  assert.deepEqual(rows.map((r) => r.name), ['PRODUCTION', 'MOBILITY']);
});

test('sub kategori terbesar dulu di dalam main-nya', () => {
  const rows = buildCategoryBreakdown([
    expense({ subCategoryName: 'KECIL', totalPayment: 1_000 }),
    expense({ subCategoryName: 'BESAR', totalPayment: 900_000 }),
    expense({ subCategoryName: 'SEDANG', totalPayment: 50_000 }),
  ]);

  assert.deepEqual(rows[0].subs.map((s) => s.name), ['BESAR', 'SEDANG', 'KECIL']);
});

test('nama kategori KOSONG dikelompokkan sebagai "(tanpa kategori)", bukan string kosong', () => {
  const rows = buildCategoryBreakdown([
    expense({ mainCategoryName: '', subCategoryName: '' }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, TANPA_KATEGORI);
  assert.equal(rows[0].subs[0].name, TANPA_KATEGORI);
});

test('nama kategori berspasi saja diperlakukan sama seperti kosong', () => {
  const rows = buildCategoryBreakdown([
    expense({ mainCategoryName: '   ', subCategoryName: '  ' }),
  ]);

  assert.equal(rows[0].name, TANPA_KATEGORI);
});

test('kategori tanpa data menghasilkan daftar kosong, bukan baris hantu', () => {
  assert.deepEqual(buildCategoryBreakdown([]), []);
});

test('margin persen: null saat income 0, bukan 0% atau 100%', () => {
  assert.equal(marginPercent(0, 0), null);
  assert.equal(marginPercent(0, -50_000), null);
  assert.equal(marginPercent(Number.NaN, 100), null);
});

test('margin persen dibulatkan satu desimal dan boleh negatif', () => {
  assert.equal(marginPercent(4_000_000, 3_900_030), 97.5);
  assert.equal(marginPercent(100_000, -25_000), -25);
  assert.equal(marginPercent(1_000_000, 1_000_000), 100);
});

test('profit selalu income dikurangi expense pada tiap bulan', () => {
  const months = buildProfitLossMonths(
    [
      expense({ entryDate: '2026-07-10', totalPayment: 500_000 }),
      expense({ entryDate: '2026-08-10', totalPayment: 3_000_000 }),
    ],
    [
      invoice({ invoiceDate: '2026-07-20', totalAmount: 2_000_000 }),
      invoice({ invoiceDate: '2026-08-20', totalAmount: 1_000_000 }),
    ],
  );

  for (const m of months) {
    assert.equal(m.profit, m.income - m.expense, `profit ${m.month} harus income - expense`);
  }
  assert.equal(months.find((m) => m.month === '2026-07')?.profit, 1_500_000);
  assert.equal(months.find((m) => m.month === '2026-08')?.profit, -2_000_000);
});

// ===== Jendela periode =====

test('monthWindow: hari terakhir dihitung dari kalender, bukan diasumsikan 30', () => {
  assert.deepEqual(monthWindow('2026-09'), { start: '2026-09-01', end: '2026-09-30' });
  assert.deepEqual(monthWindow('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
  // Tahun kabisat: 2028 habis dibagi 4 -> Februari 29 hari.
  assert.deepEqual(monthWindow('2028-02'), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(monthWindow('2026-01'), { start: '2026-01-01', end: '2026-01-31' });
  assert.deepEqual(monthWindow('2026-04'), { start: '2026-04-01', end: '2026-04-30' });
});

test('monthWindow menolak kunci bulan yang tidak sah', () => {
  assert.equal(monthWindow('2026-13'), null);
  assert.equal(monthWindow('2026'), null);
  assert.equal(monthWindow(''), null);
});

test('previousMonthWindow mundur SATU BULAN, bukan 30 hari', () => {
  // 1 September mundur 30 hari = 2 Agustus, jadi Agustus akan kehilangan sehari.
  assert.deepEqual(previousMonthWindow('2026-09'), { start: '2026-08-01', end: '2026-08-31' });
  assert.deepEqual(previousMonthWindow('2026-03'), { start: '2026-02-01', end: '2026-02-28' });
});

test('previousMonthWindow menyeberangi batas tahun', () => {
  assert.deepEqual(previousMonthWindow('2026-01'), { start: '2025-12-01', end: '2025-12-31' });
  assert.deepEqual(previousMonthWindow('2026-03'), { start: '2026-02-01', end: '2026-02-28' });
});

test('shiftWindow memakai panjang rentang yang sama', () => {
  // 1-31 Maret (31 hari) -> sebelumnya 29-31 Jan? tidak: 31 hari sebelum 1 Mar.
  const w = shiftWindow({ start: '2026-03-01', end: '2026-03-31' });
  assert.deepEqual(w, { start: '2026-01-29', end: '2026-02-28' });

  const w2 = shiftWindow({ start: '2026-03-10', end: '2026-03-19' });
  assert.deepEqual(w2, { start: '2026-02-28', end: '2026-03-09' });
});

test('shiftWindow menolak rentang terbalik', () => {
  assert.equal(shiftWindow({ start: '2026-03-31', end: '2026-03-01' }), null);
});

test('inWindow inklusif di KEDUA ujung', () => {
  const w = { start: '2026-09-01', end: '2026-09-30' };
  assert.equal(inWindow('2026-09-01', w), true, 'tanggal awal harus ikut');
  assert.equal(inWindow('2026-09-30', w), true, 'tanggal akhir harus ikut');
  assert.equal(inWindow('2026-09-15', w), true);
  assert.equal(inWindow('2026-08-31', w), false);
  assert.equal(inWindow('2026-10-01', w), false);
});

test('inWindow menolak tanggal yang tidak terbaca', () => {
  assert.equal(inWindow('', ALL_TIME), false);
  assert.equal(inWindow('bukan-tanggal', ALL_TIME), false);
  // 31 Februari tidak ada — jangan diam-diam dibetulkan jadi 3 Maret.
  assert.equal(inWindow('2026-02-31', ALL_TIME), false);
});

test('ALL_TIME mencakup tanggal apa pun yang sah', () => {
  assert.equal(inWindow('2020-01-01', ALL_TIME), true);
  assert.equal(inWindow('2035-12-31', ALL_TIME), true);
});

// ===== Delta vs periode sebelumnya =====

test('deltaPercent: null saat pembanding 0 — bukan 100% yang dikarang', () => {
  assert.equal(deltaPercent(4_000_000, 0), null);
  assert.equal(deltaPercent(0, 0), null);
});

test('deltaPercent menghitung kenaikan dan penurunan, satu desimal', () => {
  assert.equal(deltaPercent(150, 100), 50);
  assert.equal(deltaPercent(50, 100), -50);
  assert.equal(deltaPercent(0, 100), -100);
  assert.equal(deltaPercent(110, 100), 10);
  assert.equal(deltaPercent(33, 30), 10);
});

test('deltaPercent memakai nilai absolut pembanding, jadi tanda tidak terjebak', () => {
  // Pembanding negatif (mis. profit rugi bulan lalu) lalu membaik jadi -50.
  assert.equal(deltaPercent(-50, -100), 50);
  assert.equal(deltaPercent(-150, -100), -50);
});
