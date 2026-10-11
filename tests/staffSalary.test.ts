import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SALARY_MAIN_CATEGORY,
  SALARY_SUB_CATEGORY,
  buildSalaryLookup,
  emptySalaryLookup,
  isSalaryRow,
  salaryMonthOf,
  splitGroupsBySalary,
  type SalaryEntryInput,
} from '../src/lib/staffSalary.ts';

// ===== salaryMonthOf =====

test('tanggal diiris jadi YYYY-MM tanpa pergeseran zona waktu', () => {
  assert.equal(salaryMonthOf('2026-09-17'), '2026-09');
  assert.equal(salaryMonthOf('2026-10-01'), '2026-10');
});

test('awal dan akhir bulan masuk ke bulan yang sama', () => {
  assert.equal(salaryMonthOf('2026-09-01'), '2026-09');
  assert.equal(salaryMonthOf('2026-09-30'), '2026-09');
});

test('tanggal cacat menghasilkan string kosong, bukan bulan yang salah', () => {
  // Baris seperti ini harus DILEWATI, bukan diam-diam masuk ke bucket tertentu.
  assert.equal(salaryMonthOf('bukan-tanggal'), '');
  assert.equal(salaryMonthOf(''), '');
  assert.equal(salaryMonthOf('2026'), '');
  assert.equal(salaryMonthOf('09-2026'), '');
});

test('timestamp penuh tetap terbaca bulannya', () => {
  assert.equal(salaryMonthOf('2026-09-17T10:30:00Z'), '2026-09');
});

// ===== isSalaryRow =====

test('baris dengan staff_id dan kategori SALARY dikenali sebagai gaji', () => {
  assert.equal(
    isSalaryRow({ staffId: 3, mainCategoryName: SALARY_MAIN_CATEGORY, subCategoryName: SALARY_SUB_CATEGORY }),
    true,
  );
});

test('baris vendor (staff_id null) BUKAN gaji walau kategorinya SALARY', () => {
  // Kasus penting: kategori SALARY bisa saja dipakai untuk membayar pihak lain.
  // Tanpa staff_id, baris itu tidak boleh diperlakukan sebagai gaji karyawan.
  assert.equal(
    isSalaryRow({ staffId: null, mainCategoryName: SALARY_MAIN_CATEGORY, subCategoryName: SALARY_SUB_CATEGORY }),
    false,
  );
});

test('baris dengan staff_id tapi kategori lain BUKAN gaji', () => {
  // Pembayaran lain ke karyawan (mis. reimburse) tidak boleh ikut jadi gaji
  // bulanan — itu sebabnya kedua syarat diperlukan.
  assert.equal(
    isSalaryRow({ staffId: 3, mainCategoryName: 'EXPENSE', subCategoryName: 'MEALS' }),
    false,
  );
  assert.equal(
    isSalaryRow({ staffId: 3, mainCategoryName: 'MANPOWER', subCategoryName: '' }),
    false,
  );
});

// ===== buildSalaryLookup =====

function salary(over: Partial<SalaryEntryInput> = {}): SalaryEntryInput {
  return { staffName: 'Suwati', entryDate: '2026-09-05', amount: 3_000_000, ...over };
}

test('mengembalikan nominal untuk nama dan bulan yang cocok', () => {
  const lookup = buildSalaryLookup([salary()]);
  assert.equal(lookup.amountFor('Suwati', '2026-09'), 3_000_000);
  assert.equal(lookup.has('Suwati', '2026-09'), true);
});

test('gaji yang belum diinput menghasilkan undefined, bukan 0', () => {
  // Perbedaan ini yang membuat halaman bisa menampilkan "—" dan badge,
  // bukan "Rp 0" yang terbaca seolah gajinya nol.
  const lookup = buildSalaryLookup([salary()]);
  assert.equal(lookup.amountFor('Suwati', '2026-10'), undefined);
  assert.equal(lookup.has('Suwati', '2026-10'), false);
});

test('bulan berbeda tidak saling meminjam nominal', () => {
  const lookup = buildSalaryLookup([
    salary({ entryDate: '2026-09-05', amount: 3_000_000 }),
    salary({ entryDate: '2026-10-05', amount: 3_500_000 }),
  ]);
  assert.equal(lookup.amountFor('Suwati', '2026-09'), 3_000_000);
  assert.equal(lookup.amountFor('Suwati', '2026-10'), 3_500_000);
});

test('orang berbeda tidak saling meminjam nominal', () => {
  const lookup = buildSalaryLookup([
    salary({ staffName: 'Suwati', amount: 3_000_000 }),
    salary({ staffName: 'Sidik Faisal', amount: 4_000_000 }),
  ]);
  assert.equal(lookup.amountFor('Suwati', '2026-09'), 3_000_000);
  assert.equal(lookup.amountFor('Sidik Faisal', '2026-09'), 4_000_000);
  assert.equal(lookup.amountFor('Iman', '2026-09'), undefined);
});

test('nama dibandingkan setelah di-trim', () => {
  // Nama yang tersalin bisa saja punya spasi di ujung; itu tidak boleh membuat
  // gaji orang itu tidak ketemu.
  const lookup = buildSalaryLookup([salary({ staffName: '  Suwati  ' })]);
  assert.equal(lookup.amountFor('Suwati', '2026-09'), 3_000_000);
});

test('baris tanggal cacat dilewati, tidak masuk bulan yang salah', () => {
  const lookup = buildSalaryLookup([
    salary({ entryDate: 'bukan-tanggal', amount: 9_000_000 }),
    salary({ entryDate: '2026-09-05', amount: 3_000_000 }),
  ]);
  assert.equal(lookup.amountFor('Suwati', '2026-09'), 3_000_000);
});

test('nominal tidak valid dianggap 0, tidak membuat hasil NaN', () => {
  const lookup = buildSalaryLookup([salary({ amount: Number.NaN })]);
  assert.equal(lookup.amountFor('Suwati', '2026-09'), 0);
  assert.ok(Number.isFinite(lookup.amountFor('Suwati', '2026-09') as number));
});

test('dua baris untuk orang dan bulan yang sama dijumlahkan', () => {
  // Partial unique index di database seharusnya mencegah ini; penjumlahan di
  // sini adalah jaring pengaman supaya tidak ada nominal yang diam-diam hilang.
  const lookup = buildSalaryLookup([
    salary({ amount: 1_000_000 }),
    salary({ amount: 500_000 }),
  ]);
  assert.equal(lookup.amountFor('Suwati', '2026-09'), 1_500_000);
});

test('daftar kosong tidak menemukan apa pun', () => {
  const lookup = buildSalaryLookup([]);
  assert.equal(lookup.amountFor('Suwati', '2026-09'), undefined);
  assert.equal(lookup.has('Suwati', '2026-09'), false);
});

test('pencarian kosong berperilaku sama dengan daftar kosong', () => {
  const lookup = emptySalaryLookup();
  assert.equal(lookup.amountFor('Suwati', '2026-09'), undefined);
  assert.equal(lookup.has('Suwati', '2026-09'), false);
});

test('input tidak dimutasi', () => {
  const entries = [salary()];
  const before = JSON.stringify(entries);
  buildSalaryLookup(entries);
  assert.equal(JSON.stringify(entries), before);
});

// ===== splitGroupsBySalary =====
//
// Permintaan user (verbatim): "kalo data lama yang udah keinput ya di NULL kan
// saja, tapi nextnya ya bakal gagal ke generate".
//
// Inilah aturan terpenting fitur ini: SIAPA yang boleh digenerate. Karena itu
// ia hidup di modul murni ini — bukan inline di `staffDebt.ts` yang mengimpor
// Supabase — supaya bisa diuji tanpa database.

test('kelompok yang gajinya sudah diinput ikut digenerate', () => {
  const groups = [{ namaPenjahit: 'Suwati', bulanTarget: '2026-10' }];
  const salaries = buildSalaryLookup([salary({ staffName: 'Suwati', entryDate: '2026-10-05' })]);
  const { generatable, missing } = splitGroupsBySalary(groups, salaries);
  assert.equal(generatable.length, 1);
  assert.equal(missing.length, 0);
});

test('kelompok yang gajinya BELUM diinput dilewati, bukan digagalkan', () => {
  // Inti permintaan user: yang belum ada gajinya "gagal ke generate".
  const groups = [{ namaPenjahit: 'Suwati', bulanTarget: '2026-10' }];
  const { generatable, missing } = splitGroupsBySalary(groups, emptySalaryLookup());
  assert.equal(generatable.length, 0);
  assert.deepEqual(missing, [{ nama: 'Suwati', bulan: '2026-10' }]);
});

test('SATU orang tanpa gaji tidak menggagalkan orang lain', () => {
  // Inilah alasan aturannya berupa penyaringan, bukan penghentian.
  const groups = [
    { namaPenjahit: 'Suwati', bulanTarget: '2026-10' },
    { namaPenjahit: 'Iman', bulanTarget: '2026-10' },
    { namaPenjahit: 'Sidik Faisal', bulanTarget: '2026-10' },
  ];
  const salaries = buildSalaryLookup([
    salary({ staffName: 'Suwati', entryDate: '2026-10-05' }),
    salary({ staffName: 'Sidik Faisal', entryDate: '2026-10-06' }),
  ]);
  const { generatable, missing } = splitGroupsBySalary(groups, salaries);
  assert.deepEqual(
    generatable.map((g) => g.namaPenjahit),
    ['Suwati', 'Sidik Faisal'],
  );
  assert.deepEqual(missing, [{ nama: 'Iman', bulan: '2026-10' }]);
});

test('bulan yang berbeda dihitung terpisah', () => {
  // Gaji Oktober TIDAK boleh membuat November ikut lolos.
  const groups = [
    { namaPenjahit: 'Suwati', bulanTarget: '2026-10' },
    { namaPenjahit: 'Suwati', bulanTarget: '2026-11' },
  ];
  const salaries = buildSalaryLookup([salary({ staffName: 'Suwati', entryDate: '2026-10-05' })]);
  const { generatable, missing } = splitGroupsBySalary(groups, salaries);
  assert.deepEqual(generatable.map((g) => g.bulanTarget), ['2026-10']);
  assert.deepEqual(missing, [{ nama: 'Suwati', bulan: '2026-11' }]);
});

test('nama yang tidak cocok dianggap belum diinput', () => {
  // Tautan nama adalah titik terlemah fitur ini: "Suwati" != "suwati ".
  const groups = [{ namaPenjahit: 'Suwati', bulanTarget: '2026-10' }];
  const salaries = buildSalaryLookup([salary({ staffName: 'Suwati Lain', entryDate: '2026-10-05' })]);
  const { generatable, missing } = splitGroupsBySalary(groups, salaries);
  assert.equal(generatable.length, 0);
  assert.deepEqual(missing, [{ nama: 'Suwati', bulan: '2026-10' }]);
});

test('daftar kelompok kosong menghasilkan keduanya kosong', () => {
  const { generatable, missing } = splitGroupsBySalary([], emptySalaryLookup());
  assert.deepEqual(generatable, []);
  assert.deepEqual(missing, []);
});

test('urutan kelompok dipertahankan supaya pesan alert stabil', () => {
  const groups = [
    { namaPenjahit: 'C', bulanTarget: '2026-10' },
    { namaPenjahit: 'A', bulanTarget: '2026-10' },
    { namaPenjahit: 'B', bulanTarget: '2026-10' },
  ];
  const { missing } = splitGroupsBySalary(groups, emptySalaryLookup());
  assert.deepEqual(missing.map((m) => m.nama), ['C', 'A', 'B']);
});

test('kelompok tetap membawa data aslinya, bukan disalin ulang', () => {
  // `splitGroupsBySalary` harus meneruskan objek aslinya: pemanggil butuh
  // `rows`/`totalQty` untuk menulis target, bukan hanya nama + bulan.
  const groups = [
    { namaPenjahit: 'Suwati', bulanTarget: '2026-10', totalQty: 120, rows: [{ id: 1 }] },
  ];
  const salaries = buildSalaryLookup([salary({ staffName: 'Suwati', entryDate: '2026-10-05' })]);
  const { generatable } = splitGroupsBySalary(groups, salaries);
  assert.equal(generatable[0], groups[0]);
  assert.equal(generatable[0].totalQty, 120);
});
