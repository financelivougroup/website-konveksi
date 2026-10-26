import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deretHarian,
  gabungLibur,
  hariKerjaBulan,
  hariKerjaMundur,
  hitungHpp,
  hitungUpah,
  perluPerhatian,
  pcsPadaTanggal,
  progress,
  proyeksiAkhir,
  rataRataHariKerja,
  ringkasBulanan,
  ringkasPeriode,
  ringkasPerOrang,
  sisaHariKerja,
  sisaTarget,
  statusBulanFinal,
  statusRitme,
  tanggalHariIni,
  targetNgebutPerHari,
  targetNormalPerHari,
  type KpiEntry,
  type KpiOrang,
} from '../src/lib/kpi.ts';

// ===========================================================================
// Kalender acuan.
//
// Oktober 2026: 31 hari, 4 hari Minggu, tanpa libur nasional → 27 hari kerja.
// Tanggal 1 = Kamis, tanggal 18 = Minggu, tanggal 31 = Sabtu.
// "Hari ini" untuk seluruh tes adalah 18 Oktober 2026 supaya deterministik.
// ===========================================================================

const OKT = '2026-10';
const HARI_INI = new Date(2026, 9, 18); // 18 Oktober 2026 (Minggu)

function entry(over: Partial<KpiEntry> & { pcs: number }): KpiEntry {
  return {
    tanggal: '2026-10-05',
    orangId: 1,
    orangNama: 'Arief Budiman',
    divisi: 'penjahit',
    tarif: 10000,
    ...over,
  };
}

/** 10 entry seed brief: total 443 pcs. */
const SEED: KpiEntry[] = [
  entry({ tanggal: '2026-10-02', orangId: 1, orangNama: 'Arief Budiman', pcs: 40 }),
  entry({ tanggal: '2026-10-06', orangId: 1, orangNama: 'Arief Budiman', pcs: 35 }),
  entry({ tanggal: '2026-10-12', orangId: 1, orangNama: 'Arief Budiman', pcs: 40 }),
  entry({ tanggal: '2026-10-03', orangId: 3, orangNama: 'Suwati', pcs: 50 }),
  entry({ tanggal: '2026-10-10', orangId: 3, orangNama: 'Suwati', pcs: 40 }),
  entry({ tanggal: '2026-10-05', orangId: 9, orangNama: 'Umul Munfaridah', pcs: 38 }),
  entry({ tanggal: '2026-10-13', orangId: 9, orangNama: 'Umul Munfaridah', pcs: 40 }),
  entry({ tanggal: '2026-10-07', orangId: 6, orangNama: 'Asmeriani Bulolo', pcs: 70 }),
  entry({ tanggal: '2026-10-09', orangId: 10, orangNama: 'Fajar Budiman', pcs: 50 }),
  entry({ tanggal: '2026-10-14', orangId: 2, orangNama: 'Iman', pcs: 40 }),
];

const ORANG: KpiOrang[] = [
  { orangId: 1, nama: 'Arief Budiman', divisi: 'penjahit', aktif: true },
  { orangId: 2, nama: 'Iman', divisi: 'leader', aktif: true },
  { orangId: 3, nama: 'Suwati', divisi: 'penjahit', aktif: true },
  { orangId: 5, nama: 'Azrul', divisi: 'finishing', aktif: true },
  { orangId: 6, nama: 'Asmeriani Bulolo', divisi: 'penjahit', aktif: true },
  { orangId: 8, nama: 'Ince', divisi: 'finishing', aktif: true },
  { orangId: 9, nama: 'Umul Munfaridah', divisi: 'penjahit', aktif: true },
  { orangId: 10, nama: 'Fajar Budiman', divisi: 'penjahit', aktif: true },
];

// ===========================================================================
// Hari kerja
// ===========================================================================

test('hariKerjaBulan menghitung Senin-Sabtu dan mengabaikan Minggu', () => {
  assert.equal(hariKerjaBulan(OKT), 27, 'Oktober 2026 = 31 hari − 4 Minggu');
  assert.equal(hariKerjaBulan('2026-09'), 26, 'September 2026 = 30 hari − 4 Minggu');
  assert.equal(hariKerjaBulan('2026-11'), 25, 'November 2026 = 30 hari − 5 Minggu');
});

test('hariKerjaBulan mengurangi hari libur yang diberikan', () => {
  assert.equal(hariKerjaBulan(OKT, ['2026-10-05']), 26);
  assert.equal(hariKerjaBulan(OKT, ['2026-10-05', '2026-10-06', '2026-10-07']), 24);
});

test('hariKerjaBulan tidak menghitung dua kali libur yang jatuh pada Minggu', () => {
  // 4 Oktober 2026 adalah Minggu — sudah tidak dihitung, jadi tidak mengurangi apa pun.
  assert.equal(hariKerjaBulan(OKT, ['2026-10-04']), 27);
});

test('hariKerjaBulan mengembalikan 0 untuk bulan tidak valid, bukan NaN', () => {
  assert.equal(hariKerjaBulan(''), 0);
  assert.equal(hariKerjaBulan('bukan-bulan'), 0);
  assert.equal(hariKerjaBulan('2026-13'), 0);
});

test('bulan tanpa hari kerja sama sekali menghasilkan 0', () => {
  // Liburkan seluruh Senin-Sabtu Oktober 2026.
  const semua: string[] = [];
  for (let d = 1; d <= 31; d++) semua.push(`2026-10-${String(d).padStart(2, '0')}`);
  assert.equal(hariKerjaBulan(OKT, semua), 0);
});

test('sisaHariKerja bulan lampau = 0', () => {
  assert.equal(sisaHariKerja('2026-09', [], HARI_INI), 0);
  assert.equal(sisaHariKerja('2025-12', [], HARI_INI), 0);
});

test('sisaHariKerja bulan depan = seluruh hari kerja bulan itu', () => {
  assert.equal(sisaHariKerja('2026-11', [], HARI_INI), 25);
  assert.equal(sisaHariKerja('2026-11', [], HARI_INI), hariKerjaBulan('2026-11'));
});

test('sisaHariKerja bulan berjalan dihitung dari hari ini (inklusif)', () => {
  // 18 Okt 2026 Minggu. Tanggal 18..31 = 14 hari, Minggu ke-2 = 25 Okt → 12 hari kerja.
  assert.equal(sisaHariKerja(OKT, [], HARI_INI), 12);
});

test('sisaHariKerja pada tanggal 1 = seluruh hari kerja bulan', () => {
  const tgl1 = new Date(2026, 9, 1);
  assert.equal(sisaHariKerja(OKT, [], tgl1), 27);
  assert.equal(sisaHariKerja(OKT, [], tgl1), hariKerjaBulan(OKT));
});

test('sisaHariKerja menghormati hari libur setelah hari ini', () => {
  assert.equal(sisaHariKerja(OKT, ['2026-10-20'], HARI_INI), 11);
});

test('hariKerjaMundur mengembalikan 7 hari kerja terakhir, melewati Minggu', () => {
  const hari = hariKerjaMundur('2026-10-18', [], 7);
  // 18 Minggu → dilewati. Urut mundur: 17, 16, 15, 14, 13, 12, (11 Minggu), 10.
  assert.deepEqual(hari, [
    '2026-10-17',
    '2026-10-16',
    '2026-10-15',
    '2026-10-14',
    '2026-10-13',
    '2026-10-12',
    '2026-10-10',
  ]);
});

test('hariKerjaMundur boleh melintasi batas bulan', () => {
  const hari = hariKerjaMundur('2026-10-02', [], 5);
  assert.equal(hari.length, 5);
  assert.ok(hari.includes('2026-09-30'), 'mundur ke September saat awal bulan');
});

test('hariKerjaMundur dengan n=0 atau tanggal tidak valid mengembalikan kosong', () => {
  assert.deepEqual(hariKerjaMundur('2026-10-18', [], 0), []);
  assert.deepEqual(hariKerjaMundur('', [], 7), []);
});

// ===========================================================================
// Angka dasar
// ===========================================================================

test('progress membagi realisasi dengan target', () => {
  assert.equal(progress(443, 600), 443 / 600);
  assert.equal(progress(0, 600), 0);
});

test('progress tidak membagi nol saat target 0 atau kosong', () => {
  assert.equal(progress(100, 0), 0);
  assert.equal(progress(100, -5), 0);
  assert.equal(progress(0, 0), 0);
  assert.ok(Number.isFinite(progress(100, 0)));
});

test('progress boleh melebihi 100%', () => {
  assert.equal(progress(666, 600), 1.11);
  assert.equal(progress(1110, 1000), 1.11);
});

test('progress menangani masukan bukan angka tanpa NaN', () => {
  assert.equal(progress(Number.NaN, 600), 0);
  assert.equal(progress(100, Number.POSITIVE_INFINITY), 0);
});

test('sisaTarget tidak pernah negatif saat realisasi melebihi target', () => {
  assert.equal(sisaTarget(443, 600), 157);
  assert.equal(sisaTarget(700, 600), 0, 'surplus bukan kurang negatif');
  assert.equal(sisaTarget(0, 0), 0);
});

test('targetNormalPerHari membagi target dengan hari kerja', () => {
  assert.equal(targetNormalPerHari(600, 27), 600 / 27);
  assert.equal(targetNormalPerHari(0, 27), 0);
});

test('targetNormalPerHari tidak membagi nol saat bulan tanpa hari kerja', () => {
  assert.equal(targetNormalPerHari(600, 0), 0);
  assert.ok(Number.isFinite(targetNormalPerHari(600, 0)));
});

// ===========================================================================
// Target ngebut
// ===========================================================================

test('targetNgebutPerHari membagi sisa target dengan sisa hari kerja', () => {
  const r = targetNgebutPerHari(157, 12);
  assert.equal(r.perHari, 157 / 12);
  assert.equal(r.sisa, 157);
  assert.equal(r.habis, false);
});

test('targetNgebutPerHari menandai "Hari kerja habis" saat sisa hari 0', () => {
  const r = targetNgebutPerHari(157, 0);
  assert.equal(r.habis, true, 'UI wajib menampilkan label Hari kerja habis');
  assert.equal(r.perHari, 157, 'tetap ada angka, bukan Infinity');
  assert.ok(Number.isFinite(r.perHari));
});

test('targetNgebutPerHari mengembalikan 0 saat target sudah tercapai', () => {
  const r = targetNgebutPerHari(0, 12);
  assert.deepEqual(r, { perHari: 0, sisa: 0, habis: false });
  // Bahkan ketika hari kerja habis, tidak ada yang perlu dikejar.
  assert.equal(targetNgebutPerHari(0, 0).habis, false);
});

test('targetNgebutPerHari mengabaikan sisa negatif', () => {
  const r = targetNgebutPerHari(-50, 12);
  assert.equal(r.perHari, 0);
  assert.equal(r.sisa, 0);
});

// ===========================================================================
// Ritme & proyeksi
// ===========================================================================

test('rataRataHariKerja menjumlah pcs jendela lalu membagi jumlah hari kerja', () => {
  // Jendela 7 hari kerja s.d. 18 Okt: 17,16,15,14,13,12,10.
  // Entry di jendela: 12 Okt (40), 13 Okt (40), 14 Okt (40), 10 Okt (40) = 160.
  const rata = rataRataHariKerja(SEED, '2026-10-18', [], 7);
  assert.equal(rata, 160 / 7);
});

test('rataRataHariKerja pada tanggal 1 memakai pembagi hari kerja nyata', () => {
  // 1 Okt 2026 (Kamis). Jendela 7 hari kerja mundur: 1, 30 Sep, 29, 28, 26, 25, 24 Sep.
  const entries = [entry({ tanggal: '2026-10-01', pcs: 70 })];
  const rata = rataRataHariKerja(entries, '2026-10-01', [], 7);
  assert.equal(rata, 70 / 7, 'pembagi 7 hari kerja yang benar-benar ditemukan');
  assert.ok(Number.isFinite(rata));
});

test('rataRataHariKerja tanpa entry = 0, bukan NaN', () => {
  assert.equal(rataRataHariKerja([], '2026-10-18', [], 7), 0);
});

test('rataRataHariKerja menghormati hari libur di dalam jendela', () => {
  const tanpaLibur = rataRataHariKerja(SEED, '2026-10-18', [], 7);
  const denganLibur = rataRataHariKerja(SEED, '2026-10-18', ['2026-10-13'], 7);
  // 13 Okt libur → jendela jadi 17,16,15,14,12,10,9.
  // Entry di dalamnya: 14 Okt (Iman 40) + 12 Okt (Arief 40) + 10 Okt (Suwati 40)
  // + 9 Okt (Fajar 50) = 170.
  assert.equal(denganLibur, 170 / 7);
  assert.notEqual(tanpaLibur, denganLibur);
});

test('proyeksiAkhir = current + rata-rata × sisa hari kerja', () => {
  assert.equal(proyeksiAkhir(443, 20, 12), 443 + 240);
  assert.equal(proyeksiAkhir(443, 20, 0), 443, 'tanpa sisa hari, proyeksi = realisasi');
});

test('statusRitme memakai ambang hijau/kuning/merah dari brief', () => {
  assert.equal(statusRitme(1), 'hijau');
  assert.equal(statusRitme(1.5), 'hijau');
  assert.equal(statusRitme(0.99), 'kuning');
  assert.equal(statusRitme(0.85), 'kuning');
  assert.equal(statusRitme(0.849), 'merah');
  assert.equal(statusRitme(0), 'merah');
});

test('statusBulanFinal membedakan capai / tidak capai / tanpa target', () => {
  assert.equal(statusBulanFinal(600, 600), 'Capai target');
  assert.equal(statusBulanFinal(601, 600), 'Capai target');
  assert.equal(statusBulanFinal(599, 600), 'Tidak capai target');
  assert.equal(statusBulanFinal(0, 0), 'Tanpa target', '0 >= 0 tidak boleh disebut capai');
});

// ===========================================================================
// Upah
// ===========================================================================

test('hitungUpah menjumlah pcs × tarif', () => {
  const r = hitungUpah([entry({ pcs: 40, tarif: 10000 }), entry({ pcs: 35, tarif: 10000 })]);
  assert.equal(r.total, 750000);
  assert.equal(r.pcsTotal, 75);
  assert.equal(r.pcsBertarif, 75);
  assert.equal(r.perPcs, 10000);
  assert.equal(r.tarifKosong, 0);
});

test('hitungUpah membedakan tarif belum diisi dari tarif 0', () => {
  const r = hitungUpah([entry({ pcs: 40, tarif: null }), entry({ pcs: 35, tarif: 10000 })]);
  assert.equal(r.total, 350000, 'entry tanpa tarif tidak menyumbang upah');
  assert.equal(r.pcsTotal, 75);
  assert.equal(r.pcsBertarif, 35, 'pembagi hanya pcs yang benar-benar bertarif');
  assert.equal(r.perPcs, 10000, 'upah per pcs tidak turun palsu karena data kosong');
  assert.equal(r.tarifKosong, 1, 'pemicu banner kualitas data');
});

test('hitungUpah mengembalikan perPcs null bila belum ada tarif sama sekali', () => {
  const r = hitungUpah([entry({ pcs: 40, tarif: null })]);
  assert.equal(r.perPcs, null, 'UI harus menampilkan "Tarif belum diisi", bukan Rp 0');
  assert.equal(r.total, 0);
  assert.equal(r.pcsTotal, 40);
});

test('hitungUpah tanpa entry = 0 dan perPcs null', () => {
  const r = hitungUpah([]);
  assert.deepEqual(r, {
    total: 0,
    pcsTotal: 0,
    pcsBertarif: 0,
    perPcs: null,
    tarifKosong: 0,
  });
});

// ===========================================================================
// HPP
// ===========================================================================

test('hitungHpp menjumlah tiga komponen upah dibagi pcs sewing', () => {
  const entries: KpiEntry[] = [
    entry({ orangId: 1, divisi: 'penjahit', pcs: 100, tarif: 10000 }),
    entry({ orangId: 2, divisi: 'penjahit', pcs: 100, tarif: 3000 }), // leader
    entry({ orangId: 5, divisi: 'finishing', pcs: 60, tarif: 3000 }),
  ];
  const r = hitungHpp(entries, ORANG);
  assert.equal(r.upahPenjahit, 1000000);
  assert.equal(r.upahLeader, 300000);
  assert.equal(r.upahFinishing, 180000);
  assert.equal(r.totalUpah, 1480000);
  assert.equal(r.pcsSewing, 200, 'pcs sewing saja, finishing tidak ikut');
  assert.equal(r.perPcs, 1480000 / 200);
});

test('hitungHpp membagi dengan pcs SEWING walau finishing tertinggal (WIP)', () => {
  // Finishing 60 pcs dari 200 pcs sewing — kondisi normal barang masih di jalan.
  const entries: KpiEntry[] = [
    entry({ orangId: 1, divisi: 'penjahit', pcs: 200, tarif: 10000 }),
    entry({ orangId: 5, divisi: 'finishing', pcs: 60, tarif: 3000 }),
  ];
  const r = hitungHpp(entries, ORANG);
  assert.equal(r.pcsSewing, 200);
  // Bila salah membagi dengan pcs finishing (60), angkanya akan 5× lipat.
  assert.equal(r.perPcs, 2180000 / 200);
  assert.notEqual(r.perPcs, 2180000 / 60);
});

test('hitungHpp memperlakukan entry tanpa orangId sebagai penjahit', () => {
  const entries: KpiEntry[] = [entry({ orangId: null, divisi: 'penjahit', pcs: 10, tarif: 5000 })];
  const r = hitungHpp(entries, ORANG);
  assert.equal(r.upahPenjahit, 50000);
  assert.equal(r.upahLeader, 0);
});

test('hitungHpp memisahkan leader dari penjahit lewat divisi ORANG, bukan divisi entry', () => {
  // Keduanya entry sewing (divisi 'penjahit'); hanya data orang yang membedakan.
  const entries: KpiEntry[] = [
    entry({ orangId: 1, divisi: 'penjahit', pcs: 10, tarif: 10000 }),
    entry({ orangId: 2, divisi: 'penjahit', pcs: 10, tarif: 10000 }),
  ];
  const r = hitungHpp(entries, ORANG);
  assert.equal(r.upahPenjahit, 100000);
  assert.equal(r.upahLeader, 100000);
});

test('hitungHpp tanpa pcs sewing mengembalikan perPcs null, bukan Infinity', () => {
  const r = hitungHpp([entry({ orangId: 5, divisi: 'finishing', pcs: 30, tarif: 3000 })], ORANG);
  assert.equal(r.pcsSewing, 0);
  assert.equal(r.perPcs, null);
  assert.ok(r.totalUpah > 0);
});

test('hitungHpp mencatat entry tanpa tarif sebagai tarifKosong', () => {
  const r = hitungHpp([entry({ pcs: 10, tarif: null })], ORANG);
  assert.equal(r.tarifKosong, 1);
  assert.equal(r.perPcs, null);
});

// ===========================================================================
// Ringkasan periode — angka brief: tim 443 / 600 = 74%
// ===========================================================================

test('ringkasPeriode menghasilkan 443/600 = 74% untuk data seed brief', () => {
  const r = ringkasPeriode({ entries: SEED, goal: 600, bulan: OKT, hariIni: HARI_INI });
  assert.equal(r.current, 443);
  assert.equal(r.goal, 600);
  assert.equal(r.progress, 443 / 600);
  assert.ok(Math.abs(r.progress * 100 - 73.83) < 0.01, '74% sesuai brief');
  assert.equal(r.sisaTarget, 157);
  assert.equal(r.hariKerjaBulan, 27);
  assert.equal(r.sisaHariKerja, 12);
  assert.equal(r.targetNormalPerHari, 600 / 27);
  assert.equal(r.ngebut.perHari, 157 / 12);
  assert.equal(r.ngebut.habis, false);
});

test('ringkasPeriode menghitung proyeksi dari rata-rata jendela berjalan', () => {
  const r = ringkasPeriode({ entries: SEED, goal: 600, bulan: OKT, hariIni: HARI_INI });
  assert.equal(r.rataRataHariKerja, 160 / 7);
  assert.equal(r.proyeksi, 443 + (160 / 7) * 12);
  assert.equal(r.proyeksiProgress, r.proyeksi / 600);
  assert.equal(r.ritme, 'hijau', 'proyeksi melewati target');
  assert.equal(r.status, 'Berjalan');
});

test('ringkasPeriode tanpa entry: semua angka 0 dan tidak ada NaN', () => {
  const r = ringkasPeriode({ entries: [], goal: 600, bulan: OKT, hariIni: HARI_INI });
  assert.equal(r.current, 0);
  assert.equal(r.progress, 0);
  assert.equal(r.sisaTarget, 600);
  assert.equal(r.rataRataHariKerja, 0);
  assert.equal(r.proyeksi, 0);
  assert.equal(r.ritme, 'merah');
  for (const nilai of [r.progress, r.proyeksiProgress, r.targetNormalPerHari, r.ngebut.perHari]) {
    assert.ok(Number.isFinite(nilai), 'tidak boleh ada NaN/Infinity');
  }
});

test('ringkasPeriode dengan goal 0 tidak membagi nol', () => {
  const r = ringkasPeriode({ entries: SEED, goal: 0, bulan: OKT, hariIni: HARI_INI });
  assert.equal(r.goal, 0);
  assert.equal(r.progress, 0);
  assert.equal(r.sisaTarget, 0);
  assert.equal(r.targetNormalPerHari, 0);
  assert.ok(Number.isFinite(r.proyeksiProgress));
});

test('ringkasPeriode pada tanggal 1 tetap wajar', () => {
  const entries = [entry({ tanggal: '2026-10-01', pcs: 70 })];
  const r = ringkasPeriode({
    entries,
    goal: 600,
    bulan: OKT,
    hariIni: new Date(2026, 9, 1),
  });
  assert.equal(r.current, 70);
  assert.equal(r.sisaHariKerja, 27, 'tanggal 1 masih punya seluruh hari kerja');
  assert.equal(r.rataRataHariKerja, 10, '70 pcs pada hari pertama / 7 hari kerja');
  assert.ok(Number.isFinite(r.proyeksi));
});

test('ringkasPeriode menandai bulan final dan memakai status capai/tidak capai', () => {
  const capai = ringkasPeriode({
    entries: SEED, goal: 400, bulan: OKT, hariIni: HARI_INI, final: true,
  });
  assert.equal(capai.final, true);
  assert.equal(capai.status, 'Capai target');

  const tidak = ringkasPeriode({
    entries: SEED, goal: 600, bulan: OKT, hariIni: HARI_INI, final: true,
  });
  assert.equal(tidak.status, 'Tidak capai target');
});

test('ringkasPeriode bulan lampau: sisa hari kerja 0 dan ngebut ditandai habis', () => {
  const r = ringkasPeriode({ entries: [], goal: 600, bulan: '2026-09', hariIni: HARI_INI });
  assert.equal(r.sisaHariKerja, 0);
  assert.equal(r.ngebut.habis, true, 'masih ada sisa target tapi hari kerja sudah habis');
  assert.equal(r.ngebut.perHari, 600);
});

// ===========================================================================
// Ringkasan per orang
// ===========================================================================

test('ringkasPerOrang menghitung realisasi dan target per orang', () => {
  const target = new Map<number, number>([
    [1, 164], [2, 50], [3, 120], [6, 96], [9, 100], [10, 70],
  ]);
  const baris = ringkasPerOrang({
    entries: SEED, orang: ORANG, targetPerOrang: target, bulan: OKT, hariIni: HARI_INI,
  });
  const arief = baris.find((b) => b.orangId === 1)!;
  assert.equal(arief.current, 115, 'Arief 40+35+40 = 115 sesuai brief');
  assert.equal(arief.goal, 164);
  assert.equal(arief.progress, 115 / 164);
  assert.ok(Math.abs(arief.progress * 100 - 70.12) < 0.01, '70% sesuai brief');
  assert.equal(arief.sisaTarget, 49);
});

test('ringkasPerOrang mengurutkan pencapaian terendah lebih dulu', () => {
  const target = new Map<number, number>([[1, 164], [3, 120], [9, 100], [6, 96], [10, 70], [2, 50]]);
  const baris = ringkasPerOrang({
    entries: SEED, orang: ORANG, targetPerOrang: target, bulan: OKT, hariIni: HARI_INI,
  });
  const progress = baris.map((b) => b.progress);
  const urut = [...progress].sort((a, b) => a - b);
  assert.deepEqual(progress, urut, 'paling tertinggal di atas');
});

test('ringkasPerOrang menampilkan orang bertarget yang belum menyetor sebagai 0', () => {
  const target = new Map<number, number>([[1, 164], [5, 200]]);
  const baris = ringkasPerOrang({
    entries: SEED, orang: ORANG, targetPerOrang: target, bulan: OKT, hariIni: HARI_INI,
  });
  const azrul = baris.find((b) => b.orangId === 5)!;
  assert.ok(azrul, 'orang bertarget tanpa entry tetap tampil');
  assert.equal(azrul.current, 0);
  assert.equal(azrul.goal, 200);
  assert.equal(azrul.progress, 0);
});

test('ringkasPerOrang menampilkan orang menyetor tanpa target sebagai goal 0', () => {
  const target = new Map<number, number>([[1, 164]]);
  const baris = ringkasPerOrang({
    entries: SEED, orang: ORANG, targetPerOrang: target, bulan: OKT, hariIni: HARI_INI,
  });
  const suwati = baris.find((b) => b.orangId === 3)!;
  assert.ok(suwati, 'penyetor tanpa target tidak boleh hilang');
  assert.equal(suwati.current, 90);
  assert.equal(suwati.goal, 0);
  assert.equal(suwati.progress, 0, 'goal 0 tidak menghasilkan Infinity');
});

test('ringkasPerOrang mengabaikan entry tanpa orangId dari daftar orang', () => {
  const entries = [entry({ orangId: null, orangNama: 'Tanpa Register', pcs: 25 })];
  const baris = ringkasPerOrang({
    entries, orang: ORANG, targetPerOrang: new Map(), bulan: OKT, hariIni: HARI_INI,
  });
  assert.equal(baris.length, 0, 'entry tanpa orang tidak bisa dipetakan ke baris');
});

test('ringkasPerOrang menyertakan target upah divisi bila ada', () => {
  const target = new Map<number, number>([[1, 164], [5, 200]]);
  const targetBiaya = new Map([
    ['penjahit', 10000] as const,
    ['finishing', 3000] as const,
  ]);
  const entries = [
    ...SEED,
    entry({ tanggal: '2026-10-08', orangId: 5, orangNama: 'Azrul', divisi: 'finishing', pcs: 120, tarif: 3000 }),
  ];
  const baris = ringkasPerOrang({
    entries, orang: ORANG, targetPerOrang: target, targetBiaya,
    bulan: OKT, hariIni: HARI_INI,
  });
  assert.equal(baris.find((b) => b.orangId === 1)!.targetUpahPerPcs, 10000);
  assert.equal(baris.find((b) => b.orangId === 5)!.targetUpahPerPcs, 3000);
});

test('ringkasPerOrang tanpa target biaya memberi targetUpahPerPcs null', () => {
  const baris = ringkasPerOrang({
    entries: SEED, orang: ORANG, targetPerOrang: new Map([[1, 164]]),
    bulan: OKT, hariIni: HARI_INI,
  });
  assert.equal(baris.find((b) => b.orangId === 1)!.targetUpahPerPcs, null);
});

test('perluPerhatian mengambil tiga baris teratas', () => {
  const target = new Map<number, number>([[1, 164], [3, 120], [9, 100], [6, 96], [10, 70], [2, 50]]);
  const baris = ringkasPerOrang({
    entries: SEED, orang: ORANG, targetPerOrang: target, bulan: OKT, hariIni: HARI_INI,
  });
  const tiga = perluPerhatian(baris);
  assert.equal(tiga.length, 3);
  assert.deepEqual(tiga, baris.slice(0, 3));
});

test('perluPerhatian aman saat baris lebih sedikit dari jumlah yang diminta', () => {
  assert.deepEqual(perluPerhatian([], 3), []);
  // Satu orang saja — entry dibatasi ke Arief, bukan seluruh SEED.
  const satu = ringkasPerOrang({
    entries: SEED.filter((e) => e.orangId === 1),
    orang: ORANG,
    targetPerOrang: new Map([[1, 164]]),
    bulan: OKT,
    hariIni: HARI_INI,
  });
  assert.equal(satu.length, 1);
  assert.equal(perluPerhatian(satu, 3).length, 1);
});

// ===========================================================================
// Ringkasan bulanan (akumulasi)
// ===========================================================================

test('ringkasBulanan menghitung kumulatif dan selisih kumulatif', () => {
  const entries: KpiEntry[] = [
    entry({ tanggal: '2026-08-05', pcs: 100 }),
    entry({ tanggal: '2026-09-05', pcs: 200 }),
    entry({ tanggal: '2026-10-05', pcs: 300 }),
  ];
  const target = new Map([['2026-08', 150], ['2026-09', 250], ['2026-10', 350]]);
  const baris = ringkasBulanan({ entries, targetPerBulan: target, hariIni: HARI_INI });

  assert.equal(baris.length, 3);
  assert.deepEqual(baris.map((b) => b.bulan), ['2026-08', '2026-09', '2026-10']);
  assert.equal(baris[0].goalKumulatif, 150);
  assert.equal(baris[0].currentKumulatif, 100);
  assert.equal(baris[0].selisihKumulatif, 50, 'positif = masih kurang');
  assert.equal(baris[1].goalKumulatif, 400);
  assert.equal(baris[1].currentKumulatif, 300);
  assert.equal(baris[2].goalKumulatif, 750);
  assert.equal(baris[2].currentKumulatif, 600);
  assert.equal(baris[2].selisihKumulatif, 150);
});

test('ringkasBulanan memberi selisih kumulatif negatif saat surplus', () => {
  const entries: KpiEntry[] = [
    entry({ tanggal: '2026-09-05', pcs: 400 }),
    entry({ tanggal: '2026-10-05', pcs: 500 }),
  ];
  const target = new Map([['2026-09', 250], ['2026-10', 350]]);
  const baris = ringkasBulanan({ entries, targetPerBulan: target, hariIni: HARI_INI });
  // 900 realisasi vs 600 target → selisih -300 (surplus, hijau).
  assert.equal(baris[1].selisihKumulatif, -300);
  assert.equal(baris[1].progressKumulatif, 900 / 600);
});

test('ringkasBulanan memunculkan bulan bertarget tanpa entry sebagai 0', () => {
  const target = new Map([['2026-09', 250], ['2026-10', 350]]);
  const baris = ringkasBulanan({ entries: [], targetPerBulan: target, hariIni: HARI_INI });
  assert.equal(baris.length, 2, 'bulan kosong tidak boleh hilang dari grafik');
  assert.equal(baris[0].current, 0);
  assert.equal(baris[0].progress, 0);
});

test('ringkasBulanan memunculkan bulan berentry tanpa target sebagai goal 0', () => {
  const entries = [entry({ tanggal: '2026-07-05', pcs: 80 })];
  const baris = ringkasBulanan({ entries, targetPerBulan: new Map(), hariIni: HARI_INI });
  assert.equal(baris.length, 1);
  assert.equal(baris[0].goal, 0);
  assert.equal(baris[0].current, 80);
  assert.equal(baris[0].progress, 0);
});

test('ringkasBulanan menandai bulan final dengan status capai/tidak capai', () => {
  const entries = [entry({ tanggal: '2026-09-05', pcs: 300 })];
  const target = new Map([['2026-09', 250]]);
  const baris = ringkasBulanan({
    entries, targetPerBulan: target, bulanFinal: new Set(['2026-09']), hariIni: HARI_INI,
  });
  assert.equal(baris[0].final, true);
  assert.equal(baris[0].status, 'Capai target');
});

test('ringkasBulanan: bulan berjalan berstatus Berjalan', () => {
  const baris = ringkasBulanan({
    entries: SEED, targetPerBulan: new Map([[OKT, 600]]), hariIni: HARI_INI,
  });
  assert.equal(baris[0].final, false);
  assert.equal(baris[0].status, 'Berjalan');
});

test('ringkasBulanan tidak membagi nol saat seluruh target kumulatif 0', () => {
  const entries = [entry({ tanggal: '2026-07-05', pcs: 80 })];
  const baris = ringkasBulanan({ entries, targetPerBulan: new Map(), hariIni: HARI_INI });
  assert.equal(baris[0].progressKumulatif, 0);
  assert.ok(Number.isFinite(baris[0].progressKumulatif));
});

// ===========================================================================
// Deret harian
// ===========================================================================

test('deretHarian mengembalikan satu titik per tanggal kalender', () => {
  const deret = deretHarian(SEED, OKT);
  assert.equal(deret.length, 31, 'Oktober punya 31 tanggal');
  assert.equal(deret[0].tanggal, '2026-10-01');
  assert.equal(deret[30].tanggal, '2026-10-31');
});

test('deretHarian menjumlah beberapa entry pada tanggal yang sama', () => {
  const entries = [
    entry({ tanggal: '2026-10-05', pcs: 40 }),
    entry({ tanggal: '2026-10-05', pcs: 35 }),
  ];
  const deret = deretHarian(entries, OKT);
  assert.equal(deret.find((d) => d.tanggal === '2026-10-05')!.pcs, 75);
});

test('deretHarian menandai Minggu dan hari libur', () => {
  const deret = deretHarian([], OKT, ['2026-10-05']);
  assert.equal(deret.find((d) => d.tanggal === '2026-10-04')!.libur, true, 'Minggu');
  assert.equal(deret.find((d) => d.tanggal === '2026-10-05')!.libur, true, 'libur manual');
  assert.equal(deret.find((d) => d.tanggal === '2026-10-06')!.libur, false, 'hari kerja');
});

test('deretHarian mengabaikan entry dari bulan lain', () => {
  const entries = [entry({ tanggal: '2026-09-30', pcs: 99 })];
  const deret = deretHarian(entries, OKT);
  assert.equal(deret.reduce((a, d) => a + d.pcs, 0), 0);
});

test('deretHarian untuk bulan tidak valid mengembalikan kosong', () => {
  assert.deepEqual(deretHarian([], ''), []);
  assert.deepEqual(deretHarian([], '2026-13'), []);
});

test('pcsPadaTanggal menjumlah hanya tanggal yang diminta', () => {
  assert.equal(pcsPadaTanggal(SEED, '2026-10-12'), 40);
  assert.equal(pcsPadaTanggal(SEED, '2026-10-18'), 0, 'belum ada setoran');
});

// ===========================================================================
// Utilitas tanggal & libur
// ===========================================================================

test('gabungLibur membuang duplikat dan mengurutkan', () => {
  const hasil = gabungLibur(['2026-10-05', '2026-10-01'], ['2026-10-05', '2026-10-02'], undefined);
  assert.deepEqual(hasil, ['2026-10-01', '2026-10-02', '2026-10-05']);
});

test('gabungLibur menerima daftar kosong dan undefined', () => {
  assert.deepEqual(gabungLibur(), []);
  assert.deepEqual(gabungLibur([], undefined, []), []);
});

test('gabungLibur memotong timestamp menjadi tanggal saja', () => {
  assert.deepEqual(gabungLibur(['2026-10-05T00:00:00Z']), ['2026-10-05']);
});

test('tanggalHariIni memakai tanggal lokal, bukan UTC', () => {
  assert.equal(tanggalHariIni(new Date(2026, 9, 18, 23, 30)), '2026-10-18');
  assert.equal(tanggalHariIni(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
});
