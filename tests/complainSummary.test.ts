import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TANPA_PIC,
  buildComplainSummary,
  complainMonthOf,
  totalPotongan,
  type ComplainSummarySource,
} from '../src/lib/complainSummary.ts';

// Permintaan user (verbatim):
//   "saya mau di Complain & Penalti itu ada 2 section (pertama yg section
//    sekarang), kedua kyk summary per orang, per bulan, dan Potongan / Pcs."
//
// Keputusan user saat ditanya:
//   1. Tab, bukan dua tabel bertumpuk.
//   2. "Potongan / Pcs" = TOTAL POTONGAN RUPIAH (Σ pcs × tarif).
//   3. SEMUA baris ikut dihitung, NEED PROCEED maupun SOLVED.
//
// Ketiganya diuji di sini supaya tidak perlu database untuk membuktikan
// angkanya benar.

// ===== complainMonthOf =====

test('tanggal diiris jadi YYYY-MM tanpa pergeseran zona waktu', () => {
  assert.equal(complainMonthOf('2026-09-24'), '2026-09');
  assert.equal(complainMonthOf('2026-10-01'), '2026-10');
});

test('awal dan akhir bulan masuk ke bulan yang sama', () => {
  assert.equal(complainMonthOf('2026-09-01'), '2026-09');
  assert.equal(complainMonthOf('2026-09-30'), '2026-09');
});

test('tanggal cacat menghasilkan string kosong, bukan bulan yang salah', () => {
  // Baris seperti ini harus DILEWATI, bukan diam-diam masuk ke bucket tertentu.
  assert.equal(complainMonthOf('bukan-tanggal'), '');
  assert.equal(complainMonthOf(''), '');
  assert.equal(complainMonthOf('2026'), '');
  assert.equal(complainMonthOf('09-2026'), '');
});

// ===== totalPotongan =====

test('total potongan = pcs dikali tarif per pcs', () => {
  assert.equal(totalPotongan(3, 5000), 15000);
  assert.equal(totalPotongan(1, 5000), 5000);
});

test('tarif berbentuk string tetap dihitung — kolom numeric bisa tiba sebagai string', () => {
  // supabase-js dapat mengembalikan `numeric` sebagai string; itu tidak boleh
  // membuat potongannya dianggap nol.
  assert.equal(totalPotongan(3, '5000' as unknown as number), 15000);
});

test('pcs nol berarti potongan nol, bukan NaN', () => {
  assert.equal(totalPotongan(0, 5000), 0);
});

test('nilai tidak valid dianggap 0, tidak merambat jadi NaN', () => {
  assert.equal(totalPotongan(Number.NaN, 5000), 0);
  assert.equal(totalPotongan(3, Number.NaN), 0);
  assert.equal(totalPotongan(3, null as unknown as number), 0);
  assert.ok(Number.isFinite(totalPotongan(Number.NaN, Number.NaN)));
});

// ===== buildComplainSummary =====

function row(over: Partial<ComplainSummarySource> = {}): ComplainSummarySource {
  return { tanggal: '2026-09-24', pic: 'Suwati', pcs: 1, potonganPerPcs: 5000, ...over };
}

test('satu orang satu bulan dikelompokkan jadi satu baris', () => {
  const hasil = buildComplainSummary([row(), row()]);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].pic, 'Suwati');
  assert.equal(hasil[0].bulan, '2026-09');
  assert.equal(hasil[0].jumlahComplain, 2);
  assert.equal(hasil[0].totalPcs, 2);
  assert.equal(hasil[0].totalPotongan, 10000);
});

test('tarif berbeda di bulan yang sama dijumlahkan, bukan dirata-rata', () => {
  // Inilah keputusan user: "Total potongan rupiah", bukan tarif rata-rata.
  // Kasus dari preview yang dipilih user: (3 × 5.000) + (2 × 8.000) = 31.000.
  const hasil = buildComplainSummary([
    row({ pcs: 3, potonganPerPcs: 5000 }),
    row({ pcs: 2, potonganPerPcs: 8000 }),
  ]);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].totalPcs, 5);
  assert.equal(hasil[0].totalPotongan, 31000);
});

test('orang berbeda tidak saling meminjam nominal', () => {
  const hasil = buildComplainSummary([
    row({ pic: 'Suwati', potonganPerPcs: 5000 }),
    row({ pic: 'Iman', potonganPerPcs: 9000 }),
  ]);
  assert.equal(hasil.length, 2);
  assert.equal(hasil.find((r) => r.pic === 'Suwati')?.totalPotongan, 5000);
  assert.equal(hasil.find((r) => r.pic === 'Iman')?.totalPotongan, 9000);
});

test('bulan berbeda dihitung terpisah untuk orang yang sama', () => {
  const hasil = buildComplainSummary([
    row({ tanggal: '2026-09-24', potonganPerPcs: 5000 }),
    row({ tanggal: '2026-10-02', potonganPerPcs: 7000 }),
  ]);
  assert.equal(hasil.length, 2);
  assert.equal(hasil.find((r) => r.bulan === '2026-09')?.totalPotongan, 5000);
  assert.equal(hasil.find((r) => r.bulan === '2026-10')?.totalPotongan, 7000);
});

test('SEMUA baris ikut dihitung — status tidak pernah dilihat', () => {
  // Keputusan user: "Semua baris". Modul ini karena itu sengaja TIDAK punya
  // parameter status: tidak ada cara menyaringnya tanpa mengubah tanda tangan.
  // Baris di bawah mewakili satu SOLVED dan satu NEED PROCEED; keduanya harus
  // ikut terhitung.
  const hasil = buildComplainSummary([
    row({ pcs: 3, potonganPerPcs: 5000 }),
    row({ pcs: 2, potonganPerPcs: 8000 }),
  ]);
  assert.equal(hasil[0].jumlahComplain, 2);
  assert.equal(hasil[0].totalPotongan, 31000);
});

test('PIC kosong dikelompokkan sebagai "(Tanpa PIC)", tidak dibuang', () => {
  // Membuangnya akan membuat total di summary lebih kecil daripada di tabel,
  // dan user tidak punya cara tahu ada baris yang perlu diisi PIC-nya.
  const hasil = buildComplainSummary([
    row({ pic: null }),
    row({ pic: '   ' }),
    row({ pic: 'Suwati', potonganPerPcs: 1000 }),
  ]);
  const tanpa = hasil.find((r) => r.pic === TANPA_PIC);
  assert.ok(tanpa, 'baris tanpa PIC harus tetap muncul');
  assert.equal(tanpa?.jumlahComplain, 2);
  assert.equal(tanpa?.totalPotongan, 10000);
  assert.equal(hasil.length, 2);
});

test('nama PIC dibandingkan setelah di-trim', () => {
  // Nama yang tersalin bisa punya spasi di ujung; itu tidak boleh membuat satu
  // orang terpecah jadi dua baris.
  const hasil = buildComplainSummary([
    row({ pic: '  Suwati  ' }),
    row({ pic: 'Suwati' }),
  ]);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].jumlahComplain, 2);
});

test('baris tanggal cacat dilewati, tidak masuk bulan yang salah', () => {
  const hasil = buildComplainSummary([
    row({ tanggal: 'bukan-tanggal', potonganPerPcs: 999_000 }),
    row({ tanggal: '2026-09-24', potonganPerPcs: 5000 }),
  ]);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].totalPotongan, 5000);
});

test('daftar kosong menghasilkan daftar kosong', () => {
  assert.deepEqual(buildComplainSummary([]), []);
});

test('hasil diurutkan per BULAN lalu per PIC, bukan urutan kemunculan', () => {
  // Urutannya sepasang dengan urutan kolom di tabel (Bulan adalah kolom
  // pertama), jadi barisnya berkelompok per bulan secara kronologis dan
  // kolom depan tidak melompat-lompat.
  //
  // Datanya sengaja dipilih supaya urutan lama (PIC dulu) menghasilkan jawaban
  // yang BERBEDA: 'Iman' lebih dulu secara alfabet tetapi bulannya lebih
  // akhir, jadi PIC-dulu akan menaruh Oktober di depan September.
  const hasil = buildComplainSummary([
    row({ pic: 'Iman', tanggal: '2026-10-02' }),
    row({ pic: 'Suwati', tanggal: '2026-09-24' }),
  ]);
  assert.deepEqual(
    hasil.map((r) => `${r.bulan} ${r.pic}`),
    ['2026-09 Suwati', '2026-10 Iman'],
  );
});

test('kolom Bulan tidak pernah melompat-lompat saat satu orang punya banyak bulan', () => {
  // Inilah alasan urutannya bukan PIC-dulu: kalau PIC yang mengurut lebih dulu,
  // kolom Bulan di depan akan berbunyi Sep, Okt, Sep, Okt.
  const hasil = buildComplainSummary([
    row({ pic: 'Iman', tanggal: '2026-09-01' }),
    row({ pic: 'Iman', tanggal: '2026-10-01' }),
    row({ pic: 'Suwati', tanggal: '2026-09-01' }),
    row({ pic: 'Suwati', tanggal: '2026-10-01' }),
  ]);
  assert.deepEqual(
    hasil.map((r) => r.bulan),
    ['2026-09', '2026-09', '2026-10', '2026-10'],
  );
  assert.deepEqual(
    hasil.map((r) => r.pic),
    ['Iman', 'Suwati', 'Iman', 'Suwati'],
  );
});

test('input tidak dimutasi', () => {
  const rows = [row()];
  const before = JSON.stringify(rows);
  buildComplainSummary(rows);
  assert.equal(JSON.stringify(rows), before);
});

test('pcs tidak valid tidak membuat totalPcs jadi NaN', () => {
  const hasil = buildComplainSummary([row({ pcs: Number.NaN }), row({ pcs: 2 })]);
  assert.equal(hasil[0].totalPcs, 2);
  assert.ok(Number.isFinite(hasil[0].totalPcs));
  assert.ok(Number.isFinite(hasil[0].totalPotongan));
});
