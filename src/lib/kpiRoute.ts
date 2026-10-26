/**
 * Aturan pengalihan rute dashboard Kinerja Produksi.
 *
 * Dipisahkan dari komponen React dan dibuat **tanpa impor apa pun** supaya bisa
 * diuji langsung dengan `node --test` (tanpa bundler, tanpa jsdom). Alasannya
 * bukan kerapian: bagian ini menentukan SIAPA melihat data SIAPA, jadi harus
 * ada bukti yang bisa dijalankan ulang — bukan hanya komponen yang "kelihatan
 * benar" saat dibaca.
 *
 * Yang perlu ditegaskan: fungsi ini hanya menyusun alamat. Penolakan akses yang
 * sebenarnya tetap terjadi di database (`kpi_produksi_harian()` mengabaikan
 * parameter `p_orang_id` dari non-owner/finance). Jadi kalau fungsi ini salah
 * pun, penjahit tidak bisa membaca data orang lain lewat RPC.
 */

export type RuteScope = {
  orangId: number | null;
  bisaTim: boolean;
  punyaAkses: boolean;
};

export type KeputusanRute =
  /** Tampilkan halaman tim. */
  | { jenis: 'tim' }
  | { jenis: 'pengaturan' }
  /** Tampilkan halaman satu orang. */
  | { jenis: 'orang'; orangId: number }
  /** Alamat harus diganti lebih dulu (replace, bukan push). */
  | { jenis: 'alihkan'; ke: string }
  /** Akun tidak terhubung ke data karyawan; tidak ada yang boleh ditampilkan. */
  | { jenis: 'tanpa-akses' };

const TIM = '/laporan/team';

/** `orangId` menjadi segmen alamat. Angka saja — tidak ada teks bebas. */
function alamatOrang(orangId: number): string {
  return `/laporan/orang/${orangId}`;
}

/** Normalisasi jalur: buang garis miring di ujung, jaga akar tetap '/'. */
export function normalisasiJalur(jalur: string): string {
  const bersih = (jalur || '/').split('?')[0].split('#')[0];
  const tanpaSlash = bersih.replace(/\/+$/, '');
  return tanpaSlash === '' ? '/' : tanpaSlash;
}

/** `7` dari `/laporan/orang/7`; `null` bila bukan alamat orang. */
export function orangDariJalur(jalur: string): number | null {
  const cocok = normalisasiJalur(jalur).match(/^\/laporan\/orang\/(\d+)$/);
  if (!cocok) return null;
  const id = Number(cocok[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Menentukan apa yang harus ditampilkan untuk satu alamat + satu identitas.
 *
 * Urutan pemeriksaan sengaja begini:
 *   1. Akun tanpa akses berhenti lebih dulu. Jangan pernah mengalihkannya ke
 *      halaman tim hanya karena alamatnya `/laporan/team`.
 *   2. owner/finance bebas: `/laporan` → tim, `/laporan/team` → tim, alamat
 *      orang valid → orang itu.
 *   3. Role terbatas SELALU diarahkan ke alamat dirinya sendiri, apa pun isi
 *      URL. Inilah yang membuat `/laporan/orang/7` tidak berguna bagi orang
 *      lain — id asing tidak pernah sampai ke komponen halaman.
 */
export function tentukanRute(jalur: string, scope: RuteScope): KeputusanRute {
  const path = normalisasiJalur(jalur);

  if (!scope.punyaAkses) return { jenis: 'tanpa-akses' };

  if (scope.bisaTim) {
    if (path === '/laporan/pengaturan') return { jenis: 'pengaturan' };
    if (path === TIM) return { jenis: 'tim' };
    if (path === '/laporan') return { jenis: 'alihkan', ke: TIM };
    const id = orangDariJalur(path);
    if (id !== null) return { jenis: 'orang', orangId: id };
    // Alamat lain di bawah /laporan (mis. /laporan/xyz) → kembali ke tim.
    return { jenis: 'alihkan', ke: TIM };
  }

  // ---- Role terbatas ----
  if (scope.orangId === null) return { jenis: 'tanpa-akses' };

  const milikSendiri = alamatOrang(scope.orangId);
  if (path === milikSendiri) return { jenis: 'orang', orangId: scope.orangId };
  // Termasuk /laporan, /laporan/team, dan /laporan/orang/<id lain>.
  return { jenis: 'alihkan', ke: milikSendiri };
}

/**
 * Alamat awal saat menu "Monitor Kinerja Produksi" dibuka dari sidebar.
 *
 * Tidak memakai `tentukanRute` karena di titik itu scope belum tentu termuat;
 * `/laporan` adalah satu-satunya alamat yang benar untuk kedua peran, dan
 * router akan mengalihkannya setelah identitas diketahui.
 */
export function alamatMasuk(): string {
  return '/laporan';
}
