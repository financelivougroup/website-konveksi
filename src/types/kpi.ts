import type { Divisi, DivisiEntry, KpiEntry, KpiOrang } from '@/lib/kpi';

/**
 * Tipe batas antara database dan dashboard "Monitor Kinerja Produksi".
 *
 * Semua angka turunan TIDAK disimpan di sini — ia dihitung ulang di `src/lib/kpi.ts`
 * dari `KpiEntry` mentah, sesuai brief bagian 3 ("Jangan simpan hasil hitung yang
 * bisa basi").
 */

/**
 * Identitas orang milik sesi yang sedang login, menurut DATABASE.
 *
 * Ini bukan data dari URL atau state klien: `kpi_orang_scope()` membacanya dari
 * `profiles.orang_id` di server, sehingga penjahit tidak bisa membuka data orang
 * lain dengan mengganti id di alamat halaman.
 */
export interface KpiScope {
  /** `null` untuk owner/finance, dan untuk akun yang tidak punya orang. */
  orangId: number | null;
  nama: string | null;
  divisi: Divisi | null;
  /** True untuk owner/finance — boleh melihat seluruh tim. */
  bisaTim: boolean;
  /**
   * False bila akun sah tetapi tidak terhubung ke satu pun baris
   * `register_penjahit`. Akun seperti ini TIDAK boleh melihat data siapa pun,
   * termasuk dirinya sendiri.
   */
  punyaAkses: boolean;
}

/** Mode tampilan dashboard. */
export type KpiMode = 'bulan' | 'akumulasi';

/** Satu baris `kpi_produksi_harian()`. */
export interface KpiProduksiRow {
  tanggal: string;
  divisi: DivisiEntry;
  orangId: number | null;
  orangNama: string | null;
  pcs: number;
  workOrderId: string | null;
  workCode: string | null;
}

/** Satu baris `kpi_target_bulanan()`. */
export interface KpiTargetRow {
  targetId: number;
  bulan: string;
  orangId: number | null;
  nama: string;
  divisi: Divisi;
  targetPcs: number;
  statusFinal: string | null;
}

/** Satu baris `kpi_orang_list()`. */
export interface KpiOrangRow extends KpiOrang {
  punyaAkun: boolean;
}

/**
 * Data mentah yang dibutuhkan dashboard untuk SATU periode.
 *
 * `entries` sudah digabung dengan tarif yang berlaku pada tanggalnya, sehingga
 * `src/lib/kpi.ts` tidak perlu tahu apa pun tentang tarif atau database.
 */
export interface KpiPeriodeData {
  entries: KpiEntry[];
  legacyRateCount?: number;
  orang: KpiOrang[];
  /** Target pcs per orang pada bulan/periode ini. */
  targetPerOrang: Map<number, number>;
  /**
   * Total target pcs per bulan (`YYYY-MM`) untuk cakupan yang diminta.
   *
   * Dibutuhkan mode Akumulasi: `ringkasBulanan()` menghitung target kumulatif
   * bulan demi bulan, dan target kumulatif tidak bisa direkonstruksi dari satu
   * angka total saja.
   */
  targetPerBulan: Map<string, number>;
  /** Target pcs per bulan, dipisah per divisi agar sewing dan finishing tidak tercampur. */
  targetPerBulanPerDivisi: Map<string, Map<Divisi, number>>;
  /** Target upah per pcs per divisi pada periode terpilih, dari `target_biaya`. */
  targetBiaya: Map<Divisi | 'total', number>;
  /** Target upah/HPP per pcs per divisi dan bulan (`YYYY-MM`). */
  targetBiayaPerBulan: Map<string, Map<Divisi | 'total', number>>;
  /** Baris target asli agar divisi historis dan target tanpa setoran tetap terjaga. */
  targets: KpiTargetRow[];
  /** Bulan yang sudah dikunci (`bulan_status.status = 'final'`). */
  bulanFinal: Set<string>;
  /** Hari libur gabungan (nasional + `daftar_libur`) untuk rentang ini. */
  libur: string[];
}

export interface KpiUpahPribadi {
  bulan: string;
  pcsTotal: number;
  pcsBertarif: number;
  estimasi: number | null;
  entryTanpaTarif: number;
  pcsTanpaTarif: number;
}

export interface KpiHistoryRow {
  entryId: string;
  tanggal: string;
  divisi: DivisiEntry;
  pcs: number;
}

export type KpiHistoryCursor = Pick<KpiHistoryRow, 'entryId' | 'tanggal' | 'divisi'>;

/**
 * Keadaan pemuatan yang dipakai halaman.
 *
 * `error` dipisahkan dari `loading` supaya halaman bisa menampilkan tombol
 * "Coba lagi" — brief bagian 8 mewajibkan error state eksplisit, bukan layar
 * kosong yang terlihat seperti "belum ada data".
 */
export interface KpiLoadState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}
