/**
 * Modul rumus murni untuk dashboard "Monitor Kinerja Produksi".
 *
 * TANPA import apa pun — sama seperti `targetBenefit.ts`, `targetGeneration.ts`,
 * dan `staffDebtEligibility.ts`. Alasannya konkret: tes dijalankan
 * `node --test tests/*.test.ts` tanpa bundler, dan Node tidak mengenal alias `@/`.
 * Modul yang mengimpor `@/...` hanya bisa dipakai sebagai TIPE di tes (di-erase
 * saat runtime), tidak bisa dipanggil. Karena seluruh rumus dashboard ini wajib
 * diuji, ia harus bebas impor.
 *
 * Konsekuensinya: daftar hari libur TIDAK diambil sendiri dari
 * `src/data/nationalHolidays.ts`. Pemanggil wajib menggabungkan libur nasional
 * dan libur manual (`daftar_libur`) lewat `gabungLibur()` sebelum memanggil
 * fungsi di sini. Itu juga yang membuat fungsi-fungsi ini deterministik saat diuji.
 *
 * Semua fungsi bersifat baca-saja dan tidak pernah menyentuh database.
 * Dashboard ini memang READ-ONLY terhadap data produksi.
 */

// ===========================================================================
// Tipe masukan
// ===========================================================================

/** Divisi orang menurut `register_penjahit.posisi` (di-lowercase). */
export type Divisi = 'penjahit' | 'leader' | 'finishing';

/**
 * Divisi sumber ENTRY. Hanya dua nilai karena `v_produksi_harian` menyatukan
 * `sewing_records` (penjahit) dan `finishing_records` (finishing). Leader juga
 * menyetor lewat entry sewing, jadi entry-nya berdivisi `'penjahit'`; siapa
 * orangnya ditentukan oleh `KpiOrang.divisi`.
 */
export type DivisiEntry = 'penjahit' | 'finishing';

export interface KpiOrang {
  orangId: number;
  nama: string;
  divisi: Divisi;
  aktif: boolean;
}

/** Satu baris `v_produksi_harian` yang sudah dilengkapi tarif. */
export interface KpiEntry {
  /** `YYYY-MM-DD`. */
  tanggal: string;
  /**
   * `register_penjahit.id`, atau `null` bila nama pada entry tidak cocok dengan
   * satu pun baris register. Entry seperti itu TETAP dihitung dalam produksi
   * (angkanya nyata), tetapi tidak bisa dimasukkan ke target orang mana pun —
   * inilah salah satu pemicu banner kualitas data.
   */
  orangId: number | null;
  orangNama: string;
  divisi: DivisiEntry;
  pcs: number;
  /**
   * Tarif per pcs yang berlaku pada tanggal entry.
   *
   * `null` berarti tarif BELUM DIISI — dibedakan dari 0 supaya UI menampilkan
   * "Tarif belum diisi", bukan "Rp 0" yang terbaca seolah upahnya nol. Pola yang
   * sama dipakai `salaryAmount` di `targetCompute.ts`.
   */
  tarif: number | null;
}

/** Ambang status ritme, sesuai brief bagian 4. */
export type Ritme = 'hijau' | 'kuning' | 'merah';

// ===========================================================================
// Utilitas tanggal
//
// Semua tanggal diperlakukan sebagai teks `YYYY-MM-DD` dan diurai manual.
// `new Date('2026-10-01')` diurai sebagai UTC lalu bergeser satu hari di zona
// waktu Indonesia — sumber bug yang tidak perlu, jadi tidak dipakai.
// ===========================================================================

interface Tanggal {
  y: number;
  m: number; // 1-12
  d: number;
}

function uraiTanggal(nilai: string): Tanggal | null {
  if (typeof nilai !== 'string') return null;
  const m = nilai.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > jumlahHari(y, mo)) return null;
  return { y, m: mo, d };
}

function uraiBulan(bulan: string): { y: number; m: number } | null {
  if (typeof bulan !== 'string') return null;
  const m = bulan.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

function kunci(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Jumlah hari dalam bulan. `new Date(y, m, 0)` = hari terakhir bulan m (1-12). */
function jumlahHari(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** 0 = Minggu … 6 = Sabtu. */
function hariMinggu(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getDay();
}

function geserTanggal(t: Tanggal, delta: number): Tanggal {
  // Lewat objek Date supaya pergantian bulan/tahun ditangani runtime, bukan
  // aritmetika manual yang mudah salah pada tahun kabisat.
  const d = new Date(t.y, t.m - 1, t.d + delta);
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

/** Tanggal hari ini sebagai teks lokal `YYYY-MM-DD`. */
export function tanggalHariIni(hariIni: Date = new Date()): string {
  return kunci(hariIni.getFullYear(), hariIni.getMonth() + 1, hariIni.getDate());
}

/**
 * Gabungkan libur nasional dan libur manual menjadi satu daftar unik.
 *
 * Dipanggil pemanggil sebelum menyerahkan `libur` ke fungsi lain di modul ini.
 * Duplikat dibuang karena `daftar_libur.tanggal` di database tidak unique.
 */
export function gabungLibur(...daftar: ReadonlyArray<readonly string[] | undefined>): string[] {
  const set = new Set<string>();
  for (const baris of daftar) {
    for (const tanggal of baris ?? []) {
      if (typeof tanggal === 'string' && tanggal) set.add(tanggal.slice(0, 10));
    }
  }
  return [...set].sort();
}

// ===========================================================================
// Hari kerja
//
// Aturan brief: Senin–Sabtu dikurangi hari libur. Minggu selalu libur.
// ===========================================================================

function hariKerja(y: number, m: number, d: number, libur: ReadonlySet<string>): boolean {
  if (hariMinggu(y, m, d) === 0) return false;
  return !libur.has(kunci(y, m, d));
}

/** Count an inclusive calendar range with the same Monday–Saturday workday rules. */
export function hariKerjaRentang(dari: string, sampai: string, libur: readonly string[] = []): number {
  const awal = uraiTanggal(dari);
  const akhir = uraiTanggal(sampai);
  if (!awal || !akhir || dari > sampai) return 0;
  const set = new Set(libur);
  let n = 0;
  for (let t = awal; kunci(t.y, t.m, t.d) <= sampai; t = geserTanggal(t, 1)) {
    if (hariKerja(t.y, t.m, t.d, set)) n++;
  }
  return n;
}

/**
 * Jumlah hari kerja dalam satu bulan (`YYYY-MM`).
 *
 * Bulan tanpa hari kerja (mis. seluruh Senin–Sabtu libur) menghasilkan 0, dan
 * seluruh pembagian dengan angka ini WAJIB dijaga pemanggilnya. `0` juga
 * dikembalikan untuk format bulan yang tidak valid — bukan `NaN`.
 */
export function hariKerjaBulan(bulan: string, libur: readonly string[] = []): number {
  const p = uraiBulan(bulan);
  if (!p) return 0;
  const set = new Set(libur);
  let n = 0;
  for (let d = 1; d <= jumlahHari(p.y, p.m); d++) {
    if (hariKerja(p.y, p.m, d, set)) n++;
  }
  return n;
}

/**
 * Hari kerja yang masih tersisa pada bulan ini, DIHITUNG DARI HARI INI
 * (inklusif) sampai akhir bulan.
 *
 * Sengaja berbeda dari `sisaHari` di `targetCompute.ts`, yang mulai dari BESOK:
 * laporan Target Jahit menganggap hari ini sudah selesai, sedangkan dashboard
 * ini menampilkan "target ngebut" untuk sisa hari kerja yang masih bisa dipakai
 * — dan hari ini masih bisa dipakai.
 *
 * Bulan lampau → 0. Bulan depan → seluruh hari kerja bulan itu.
 */
export function sisaHariKerja(
  bulan: string,
  libur: readonly string[] = [],
  hariIni: Date = new Date(),
): number {
  const p = uraiBulan(bulan);
  if (!p) return 0;

  const sekarang = {
    y: hariIni.getFullYear(),
    m: hariIni.getMonth() + 1,
    d: hariIni.getDate(),
  };
  const iniBulanIni = p.y === sekarang.y && p.m === sekarang.m;
  const bulanLampau =
    p.y < sekarang.y || (p.y === sekarang.y && p.m < sekarang.m);

  if (bulanLampau) return 0;
  if (!iniBulanIni) return hariKerjaBulan(bulan, libur);

  const set = new Set(libur);
  let n = 0;
  for (let d = sekarang.d; d <= jumlahHari(p.y, p.m); d++) {
    if (hariKerja(p.y, p.m, d, set)) n++;
  }
  return n;
}

/**
 * Daftar hari kerja terakhir (maksimal `n`) yang berakhir pada `sampai`.
 *
 * Boleh melintasi batas bulan: pada tanggal 3, jendela 7 hari kerja memang
 * mundur ke bulan sebelumnya. Tanpa itu, rata-rata di awal bulan akan selalu
 * terlalu kecil dan proyeksi ikut pesimistis.
 */
export function hariKerjaMundur(
  sampai: string,
  libur: readonly string[] = [],
  n = 7,
): string[] {
  const batas = Math.max(0, Math.floor(n));
  if (batas === 0) return [];
  let t = uraiTanggal(sampai);
  if (!t) return [];

  const set = new Set(libur);
  const hasil: string[] = [];
  // Batas keras 400 hari supaya fungsi tidak pernah berputar tanpa henti pada
  // masukan aneh (mis. seluruh tahun libur).
  for (let i = 0; i < 400 && hasil.length < batas; i++) {
    if (hariKerja(t.y, t.m, t.d, set)) hasil.push(kunci(t.y, t.m, t.d));
    t = geserTanggal(t, -1);
  }
  return hasil;
}

// ===========================================================================
// Angka dasar
// ===========================================================================

function angka(nilai: unknown): number {
  const n = Number(nilai);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Rasio realisasi terhadap target (0..∞; 1 = 100%, boleh lebih dari 1).
 *
 * Target 0 atau kosong → 0, bukan `Infinity`/`NaN`. Baris tanpa target tidak
 * boleh merusak rata-rata, grafik, atau perbandingan `>= 1` pada status ritme.
 */
export function progress(current: number, goal: number): number {
  const c = angka(current);
  const g = angka(goal);
  if (!(g > 0)) return 0;
  return c / g;
}

/** Kekurangan terhadap target; realisasi berlebih bukan "kurang" negatif. */
export function sisaTarget(current: number, goal: number): number {
  return Math.max(0, angka(goal) - angka(current));
}

/** Target rata-rata per hari kerja dalam sebulan penuh. */
export function targetNormalPerHari(goal: number, hariKerja: number): number {
  const g = angka(goal);
  const h = angka(hariKerja);
  if (!(h > 0)) return 0;
  return g / h;
}

export interface TargetNgebut {
  /** Kebutuhan per hari kerja yang tersisa. */
  perHari: number;
  /** Sisa target yang harus dikejar. */
  sisa: number;
  /**
   * True bila hari kerja sudah habis tetapi target belum tercapai. UI wajib
   * menampilkan "Hari kerja habis" alih-alih angka pembagian yang tidak berarti.
   */
  habis: boolean;
}

/**
 * Target ngebut per hari kerja yang tersisa.
 *
 * Bila sisa hari kerja 0 tetapi masih ada sisa target, hasilnya BUKAN pembagian
 * dengan nol: `perHari` diisi `sisa` (supaya UI punya angka yang bisa
 * ditampilkan) dan `habis` dinyatakan true agar labelnya jujur.
 */
export function targetNgebutPerHari(sisa: number, sisaHari: number): TargetNgebut {
  const s = Math.max(0, angka(sisa));
  const h = Math.max(0, angka(sisaHari));
  if (s === 0) return { perHari: 0, sisa: 0, habis: false };
  if (!(h > 0)) return { perHari: s, sisa: s, habis: true };
  return { perHari: s / h, sisa: s, habis: false };
}

// ===========================================================================
// Ritme dan proyeksi
// ===========================================================================

/**
 * Rata-rata pcs per hari kerja pada jendela `n` hari kerja terakhir.
 *
 * Brief menulis "pcs 7 hari kerja terakhir / 7". Pembaginya di sini adalah
 * JUMLAH hari kerja yang benar-benar ditemukan (maksimal 7), bukan angka 7 mati.
 * Pada kondisi normal keduanya identik; pada tanggal 1 pembagi 7 akan
 * melaporkan ritme sepertujuh dari yang sebenarnya dan proyeksi ikut runtuh.
 */
export function rataRataHariKerja(
  entries: readonly KpiEntry[],
  sampai: string,
  libur: readonly string[] = [],
  n = 7,
): number {
  const hari = hariKerjaMundur(sampai, libur, n);
  if (hari.length === 0) return 0;
  const set = new Set(hari);
  let total = 0;
  for (const e of entries) {
    if (!set.has(String(e.tanggal ?? '').slice(0, 10))) continue;
    total += angka(e.pcs);
  }
  return total / hari.length;
}

/** Proyeksi akhir periode: realisasi sekarang + ritme × sisa hari kerja. */
export function proyeksiAkhir(current: number, rataRata: number, sisaHari: number): number {
  return angka(current) + angka(rataRata) * Math.max(0, angka(sisaHari));
}

/**
 * Status ritme dari proyeksi terhadap target.
 *
 * Hijau ≥ 100%, kuning 85–99%, merah < 85% — ambang dari brief bagian 4.
 */
export function statusRitme(proyeksiProgress: number): Ritme {
  const p = angka(proyeksiProgress);
  if (p >= 1) return 'hijau';
  if (p >= 0.85) return 'kuning';
  return 'merah';
}

/**
 * Status bulan yang sudah dikunci.
 *
 * `goal <= 0` menghasilkan "Tanpa target": tanpa target, "Capai target" hanya
 * akan menyesatkan (0 ≥ 0 selalu benar).
 */
export function statusBulanFinal(current: number, goal: number): string {
  const g = angka(goal);
  if (!(g > 0)) return 'Tanpa target';
  return angka(current) >= g ? 'Capai target' : 'Tidak capai target';
}

// ===========================================================================
// Uang
// ===========================================================================

export interface UpahRingkas {
  /** Σ pcs × tarif, hanya entry yang tarifnya terisi. */
  total: number;
  /** Seluruh pcs, termasuk entry yang tarifnya belum diisi. */
  pcsTotal: number;
  /** Pcs yang tarifnya terisi — dasar pembagi upah per pcs. */
  pcsBertarif: number;
  /**
   * Upah per pcs. `null` bila tidak ada satu pun pcs bertarif, supaya UI
   * menampilkan "Tarif belum diisi" alih-alih "Rp 0".
   */
  perPcs: number | null;
  /** Jumlah entry yang tarifnya belum diisi — pemicu banner kualitas data. */
  tarifKosong: number;
}

/**
 * Ringkasan upah dari sekumpulan entry.
 *
 * Pembagi upah per pcs adalah `pcsBertarif`, bukan seluruh pcs. Bila sebagian
 * entry belum bertarif, membagi dengan seluruh pcs akan melaporkan upah per pcs
 * lebih rendah dari yang sebenarnya — angka yang terlihat seperti masalah
 * tarif padahal masalahnya data belum lengkap. Saat data lengkap keduanya sama.
 */
export function hitungUpah(entries: readonly KpiEntry[]): UpahRingkas {
  let total = 0;
  let pcsTotal = 0;
  let pcsBertarif = 0;
  let tarifKosong = 0;

  for (const e of entries) {
    const pcs = Math.max(0, angka(e.pcs));
    pcsTotal += pcs;
    if (e.tarif === null || e.tarif === undefined) {
      tarifKosong += 1;
      continue;
    }
    const tarif = Math.max(0, angka(e.tarif));
    total += pcs * tarif;
    pcsBertarif += pcs;
  }

  return {
    total,
    pcsTotal,
    pcsBertarif,
    perPcs: pcsBertarif > 0 ? total / pcsBertarif : null,
    tarifKosong,
  };
}

export interface HppRingkas {
  upahPenjahit: number;
  upahLeader: number;
  upahFinishing: number;
  totalUpah: number;
  /** Pcs produksi jahit — dasar pembagi HPP, sesuai brief ("pcs sewing"). */
  pcsSewing: number;
  /** `null` bila belum ada pcs sewing atau belum ada upah sama sekali. */
  perPcs: number | null;
  /** Jumlah entry tanpa tarif yang ikut dihitung — pemicu banner. */
  tarifKosong: number;
}

/**
 * Harga pokok produksi per pcs.
 *
 * Brief: `hpp_1pcs = upah sewing + upah leader + upah finishing`, dibagi pcs
 * produksi (pcs SEWING). Pembagi sengaja pcs sewing, bukan pcs finishing:
 * finishing bisa tertinggal dari sewing (barang masih WIP), sehingga membagi
 * dengan pcs finishing akan meledakkan HPP per pcs. Catatan WIP ini wajib
 * ditampilkan di UI.
 *
 * Pemecahan penjahit vs leader memakai `divisi` ORANG, bukan divisi entry:
 * leader menyetor lewat entry sewing yang sama, jadi hanya data orang yang bisa
 * membedakan keduanya. Entry tanpa `orangId` (nama tidak terhubung ke register)
 * diperlakukan sebagai penjahit karena entry-nya berasal dari sewing_records.
 */
export function hitungHpp(
  entries: readonly KpiEntry[],
  orang: readonly KpiOrang[] = [],
): HppRingkas {
  const divisiOrang = new Map<number, Divisi>();
  for (const o of orang) divisiOrang.set(o.orangId, o.divisi);

  let upahPenjahit = 0;
  let upahLeader = 0;
  let upahFinishing = 0;
  let pcsSewing = 0;
  let tarifKosong = 0;

  for (const e of entries) {
    const pcs = Math.max(0, angka(e.pcs));
    const tarif = e.tarif === null || e.tarif === undefined ? null : Math.max(0, angka(e.tarif));
    if (tarif === null) tarifKosong += 1;
    const upah = tarif === null ? 0 : pcs * tarif;

    if (e.divisi === 'finishing') {
      upahFinishing += upah;
      continue;
    }

    // divisi === 'penjahit' (entry sewing): pisahkan leader dari penjahit.
    pcsSewing += pcs;
    const divisi = e.orangId === null ? 'penjahit' : (divisiOrang.get(e.orangId) ?? 'penjahit');
    if (divisi === 'leader') upahLeader += upah;
    else upahPenjahit += upah;
  }

  const totalUpah = upahPenjahit + upahLeader + upahFinishing;
  return {
    upahPenjahit,
    upahLeader,
    upahFinishing,
    totalUpah,
    pcsSewing,
    perPcs: pcsSewing > 0 && (totalUpah > 0 || entries.some((e) => e.pcs > 0 && e.tarif !== null)) ? totalUpah / pcsSewing : null,
    tarifKosong,
  };
}

// ===========================================================================
// Ringkasan periode
// ===========================================================================

export interface RingkasanPeriode {
  current: number;
  goal: number;
  /** 0..∞ rasio (1 = 100%). */
  progress: number;
  sisaTarget: number;
  hariKerjaBulan: number;
  sisaHariKerja: number;
  targetNormalPerHari: number;
  ngebut: TargetNgebut;
  rataRataHariKerja: number;
  proyeksi: number;
  proyeksiProgress: number;
  ritme: Ritme;
  final: boolean;
  /** 'Berjalan' | 'Capai target' | 'Tidak capai target' | 'Tanpa target'. */
  status: string;
}

export interface PeriodeInput {
  entries: readonly KpiEntry[];
  goal: number;
  /** `YYYY-MM`. */
  bulan: string;
  libur?: readonly string[];
  hariIni?: Date;
  /** True bila bulan sudah dikunci (`bulan_status.status = 'final'`). */
  final?: boolean;
  /** Jendela rata-rata bergerak, default 7 hari kerja. */
  jendela?: number;
}

/**
 * Seluruh angka satu periode untuk satu cakupan (tim atau satu orang).
 *
 * `entries` harus SUDAH difilter ke cakupan dan bulan yang dimaksud — fungsi ini
 * tidak menyaring tanggal, supaya pemanggil tetap memegang satu sumber kebenaran
 * tentang apa yang sedang ditampilkan.
 */
export function ringkasPeriode(input: PeriodeInput): RingkasanPeriode {
  const { entries, goal, bulan } = input;
  const libur = input.libur ?? [];
  const hariIni = input.hariIni ?? new Date();
  const final = input.final === true;

  let current = 0;
  for (const e of entries) current += angka(e.pcs);

  const hk = hariKerjaBulan(bulan, libur);
  const sisaHari = sisaHariKerja(bulan, libur, hariIni);
  const sisa = sisaTarget(current, goal);
  const rata = rataRataHariKerja(entries, tanggalHariIni(hariIni), libur, input.jendela ?? 7);
  const proyeksi = proyeksiAkhir(current, rata, sisaHari);
  const proyeksiProgress = progress(proyeksi, goal);

  return {
    current,
    goal: angka(goal),
    progress: progress(current, goal),
    sisaTarget: sisa,
    hariKerjaBulan: hk,
    sisaHariKerja: sisaHari,
    targetNormalPerHari: targetNormalPerHari(goal, hk),
    ngebut: targetNgebutPerHari(sisa, sisaHari),
    rataRataHariKerja: rata,
    proyeksi,
    proyeksiProgress,
    ritme: statusRitme(proyeksiProgress),
    final,
    status: final ? statusBulanFinal(current, goal) : 'Berjalan',
  };
}

// ===========================================================================
// Ringkasan per orang
// ===========================================================================

export interface BarisOrang {
  orangId: number;
  nama: string;
  divisi: Divisi;
  current: number;
  goal: number;
  progress: number;
  sisaTarget: number;
  targetNormalPerHari: number;
  ngebut: TargetNgebut;
  upah: UpahRingkas;
  /** Upah per pcs dibanding target biaya divisi; `null` bila salah satunya kosong. */
  upahPerPcs: number | null;
  targetUpahPerPcs: number | null;
}

export interface BarisOrangInput {
  entries: readonly KpiEntry[];
  orang: readonly KpiOrang[];
  /** Target pcs per orang pada periode ini. Orang tanpa target tidak muncul. */
  targetPerOrang: ReadonlyMap<number, number>;
  /** Target upah per pcs per divisi (`target_biaya`). */
  targetBiaya?: ReadonlyMap<Divisi, number>;
  bulan: string;
  libur?: readonly string[];
  hariIni?: Date;
}

/**
 * Satu baris per orang untuk tab Team mode Bulan.
 *
 * Baris dibentuk dari GABUNGAN orang yang punya target dan orang yang punya
 * entry. Alasannya: orang yang menyetor tanpa target tetap harus terlihat
 * (itu justru masalah yang dicari banner kualitas data), dan orang yang punya
 * target tetapi belum menyetor juga harus tampil sebagai 0 — bukan hilang.
 *
 * Urutan: pencapaian terendah dulu, supaya "perlu perhatian" tinggal mengambil
 * tiga baris teratas.
 */
export function ringkasPerOrang(input: BarisOrangInput): BarisOrang[] {
  const libur = input.libur ?? [];
  const hk = hariKerjaBulan(input.bulan, libur);
  const sisaHari = sisaHariKerja(input.bulan, libur, input.hariIni ?? new Date());
  const targetBiaya = input.targetBiaya ?? new Map<Divisi, number>();

  const info = new Map<number, KpiOrang>();
  for (const o of input.orang) info.set(o.orangId, o);

  const entriesPer = new Map<number, KpiEntry[]>();
  const namaPer = new Map<number, string>();
  for (const e of input.entries) {
    if (e.orangId === null) continue;
    const list = entriesPer.get(e.orangId);
    if (list) list.push(e);
    else entriesPer.set(e.orangId, [e]);
    if (!namaPer.has(e.orangId)) namaPer.set(e.orangId, e.orangNama);
  }

  const ids = new Set<number>([...input.targetPerOrang.keys(), ...entriesPer.keys()]);
  const hasil: BarisOrang[] = [];

  for (const orangId of ids) {
    const daftar = entriesPer.get(orangId) ?? [];
    const o = info.get(orangId);
    const divisi: Divisi = o?.divisi ?? (daftar[0]?.divisi === 'finishing' ? 'finishing' : 'penjahit');
    const nama = o?.nama ?? namaPer.get(orangId) ?? `#${orangId}`;
    const goal = angka(input.targetPerOrang.get(orangId) ?? 0);

    let current = 0;
    for (const e of daftar) current += angka(e.pcs);

    const sisa = sisaTarget(current, goal);
    const upah = hitungUpah(daftar);
    const targetDivisi = targetBiaya.get(divisi);

    hasil.push({
      orangId,
      nama,
      divisi,
      current,
      goal,
      progress: progress(current, goal),
      sisaTarget: sisa,
      targetNormalPerHari: targetNormalPerHari(goal, hk),
      ngebut: targetNgebutPerHari(sisa, sisaHari),
      upah,
      upahPerPcs: upah.perPcs,
      targetUpahPerPcs:
        targetDivisi === undefined || !(targetDivisi > 0) ? null : targetDivisi,
    });
  }

  // Pencapaian terendah dulu. Target kosong (goal 0) memberi progress 0 dan
  // otomatis berada di atas — memang orang itulah yang paling perlu perhatian.
  return hasil.sort((a, b) => {
    if (a.progress !== b.progress) return a.progress - b.progress;
    return a.nama.localeCompare(b.nama);
  });
}

/** Tiga orang paling tertinggal — kartu "Perlu perhatian". */
export function perluPerhatian(baris: readonly BarisOrang[], jumlah = 3): BarisOrang[] {
  return [...baris].slice(0, Math.max(0, jumlah));
}

// ===========================================================================
// Ringkasan bulanan (mode Akumulasi)
// ===========================================================================

export interface BarisBulan {
  bulan: string;
  current: number;
  goal: number;
  progress: number;
  sisaTarget: number;
  /** Target kumulatif s.d. bulan ini. */
  goalKumulatif: number;
  /** Realisasi kumulatif s.d. bulan ini. */
  currentKumulatif: number;
  /**
   * Target kumulatif − realisasi kumulatif. NEGATIF berarti surplus (hijau),
   * sesuai brief bagian 4.
   */
  selisihKumulatif: number;
  progressKumulatif: number;
  ngebut: TargetNgebut;
  final: boolean;
  status: string;
}

export interface BulanInput {
  /** Seluruh entry lintas bulan, sudah difilter ke cakupan. */
  entries: readonly KpiEntry[];
  /** Target pcs per bulan (`YYYY-MM`). */
  targetPerBulan: ReadonlyMap<string, number>;
  /** Bulan yang sudah dikunci. */
  bulanFinal?: ReadonlySet<string>;
  libur?: readonly string[];
  hariIni?: Date;
}

function bulanDariTanggal(tanggal: string): string {
  return String(tanggal ?? '').slice(0, 7);
}

/**
 * Satu baris per bulan, urut menaik, dengan angka kumulatif.
 *
 * Bulan yang punya target tetapi tanpa entry tetap muncul (realisasi 0) — kalau
 * dihilangkan, grafik bulan-ke-bulan akan melompati bulan dan menyembunyikan
 * bulan yang benar-benar kosong. Bulan yang hanya punya entry tanpa target juga
 * muncul, dengan goal 0.
 */
export function ringkasBulanan(input: BulanInput): BarisBulan[] {
  const libur = input.libur ?? [];
  const hariIni = input.hariIni ?? new Date();
  const finalSet = input.bulanFinal ?? new Set<string>();

  const perBulan = new Map<string, KpiEntry[]>();
  for (const e of input.entries) {
    const bulan = bulanDariTanggal(e.tanggal);
    if (!bulan) continue;
    const list = perBulan.get(bulan);
    if (list) list.push(e);
    else perBulan.set(bulan, [e]);
  }

  const semua = new Set<string>([...input.targetPerBulan.keys(), ...perBulan.keys()]);
  const urut = [...semua].filter(Boolean).sort();

  let goalKumulatif = 0;
  let currentKumulatif = 0;
  const hasil: BarisBulan[] = [];

  for (const bulan of urut) {
    const daftar = perBulan.get(bulan) ?? [];
    let current = 0;
    for (const e of daftar) current += angka(e.pcs);
    const goal = angka(input.targetPerBulan.get(bulan) ?? 0);
    const final = finalSet.has(bulan);
    const sisaHari = sisaHariKerja(bulan, libur, hariIni);

    goalKumulatif += goal;
    currentKumulatif += current;
    const sisaKumulatif = sisaTarget(currentKumulatif, goalKumulatif);

    hasil.push({
      bulan,
      current,
      goal,
      progress: progress(current, goal),
      sisaTarget: sisaTarget(current, goal),
      goalKumulatif,
      currentKumulatif,
      selisihKumulatif: goalKumulatif - currentKumulatif,
      progressKumulatif: progress(currentKumulatif, goalKumulatif),
      ngebut: targetNgebutPerHari(sisaKumulatif, sisaHari),
      final,
      status: final ? statusBulanFinal(current, goal) : 'Berjalan',
    });
  }

  return hasil;
}

// ===========================================================================
// Deret harian (halaman per orang)
// ===========================================================================

export interface BarisHarian {
  tanggal: string;
  pcs: number;
  /** True bila tanggal ini libur (Minggu atau ada di daftar libur). */
  libur: boolean;
}

/**
 * Deret harian satu bulan, satu titik per tanggal kalender.
 *
 * Tanggal tanpa entry tetap muncul dengan pcs 0 dan `libur` menandai hari
 * Minggu/libur, sehingga grafik bisa menampilkan hari libur sebagai jeda
 * (brief bagian 7: "hari libur ditandai"). Melubangi tanggal akan membuat
 * sumbu X bohong — jarak antar titik jadi tidak seragam.
 */
export function deretHarian(
  entries: readonly KpiEntry[],
  bulan: string,
  libur: readonly string[] = [],
): BarisHarian[] {
  const p = uraiBulan(bulan);
  if (!p) return [];

  const set = new Set(libur);
  const pcsPer = new Map<string, number>();
  for (const e of entries) {
    const tanggal = String(e.tanggal ?? '').slice(0, 10);
    if (!tanggal.startsWith(bulan)) continue;
    pcsPer.set(tanggal, (pcsPer.get(tanggal) ?? 0) + angka(e.pcs));
  }

  const hasil: BarisHarian[] = [];
  for (let d = 1; d <= jumlahHari(p.y, p.m); d++) {
    const tanggal = kunci(p.y, p.m, d);
    hasil.push({
      tanggal,
      pcs: pcsPer.get(tanggal) ?? 0,
      libur: !hariKerja(p.y, p.m, d, set),
    });
  }
  return hasil;
}

/** Total pcs pada satu tanggal tertentu — dipakai hero "Hari ini". */
export function pcsPadaTanggal(entries: readonly KpiEntry[], tanggal: string): number {
  let total = 0;
  for (const e of entries) {
    if (String(e.tanggal ?? '').slice(0, 10) !== tanggal) continue;
    total += angka(e.pcs);
  }
  return total;
}
