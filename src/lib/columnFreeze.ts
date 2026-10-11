/**
 * Aturan "bekukan kolom" — MURNI: berkas ini tidak mengimpor apa pun.
 *
 * Dipisahkan dari `src/lib/columnSettings.ts` karena berkas itu mengimpor React
 * (hook `useState`), sehingga `node --test` tidak bisa memuatnya. Semua logika
 * yang perlu diuji ditaruh di sini; `columnSettings.ts` hanya membungkusnya
 * dengan state React + localStorage.
 *
 * ---------------------------------------------------------------------------
 * KENAPA KOLOM BEKU HARUS BERURUTAN DARI KIRI
 * ---------------------------------------------------------------------------
 * Mesin freeze milik ReUI/TanStack TIDAK menyimpan posisi kolom di tempatnya:
 * `table.getHeaderGroups()` dan `row.getVisibleCells()` sama-sama mengangkat
 * kolom yang di-pin ke DEPAN, dengan urutan persis seperti isi
 * `state.columnPinning.start`. Jadi kalau user membekukan kolom ke-5 saja,
 * kolom itu akan MELOMPAT ke paling kiri dan seluruh tabel terlihat berubah
 * urutan — bukan yang dimaksud dengan "freeze".
 *
 * Karena itu himpunan beku selalu ditegakkan sebagai AWALAN (prefix) dari kolom
 * yang terlihat: membekukan kolom ke-N otomatis ikut membekukan kolom 1..N-1,
 * dan melepas kolom ke-N ikut melepas N+1.. . Dengan begitu urutan kolom tidak
 * pernah berubah dan offset `getStart()` selalu menjumlahkan kolom yang benar.
 *
 * Kolom yang sedang disembunyikan TIDAK bisa dibekukan: ia tidak dirender, dan
 * kalau dibiarkan ada di daftar beku, kolom di sebelahnya akan memakai offset
 * yang terlalu kecil (menutupi kolom sebelumnya).
 */

/** Pengaturan satu tabel: kolom tersembunyi, kolom beku, dan header beku. */
export interface TableColumnSettings {
  hidden: string[];
  frozen: string[];
  /**
   * Header menempel saat scroll vertikal. Default `true` karena grid sudah
   * memasang `headerSticky: true` sejak dulu — jadi kotaknya harus terbaca
   * "aktif" saat pertama dibuka, bukan seperti fitur baru yang masih mati.
   */
  headerFrozen: boolean;
}

export const DEFAULT_TABLE_SETTINGS: TableColumnSettings = {
  hidden: [],
  frozen: [],
  headerFrozen: true,
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * Membaca satu entri pengaturan tabel dari nilai mentah localStorage.
 *
 * Menerima DUA bentuk, dan itu disengaja: bentuk lama (sebelum fitur freeze)
 * menyimpan array key yang disembunyikan saja — `["posisi", "status"]`.
 * Pengaturan hide/show yang sudah dimiliki user tidak boleh hilang hanya karena
 * bentuk penyimpanannya berubah, jadi array lama diperlakukan sebagai
 * `hidden` dengan `frozen: []`.
 */
export function parseTableSettings(raw: unknown): TableColumnSettings {
  if (Array.isArray(raw)) {
    return { hidden: asStringArray(raw), frozen: [], headerFrozen: true };
  }
  if (raw !== null && typeof raw === 'object') {
    const source = raw as Record<string, unknown>;
    return {
      hidden: asStringArray(source.hidden),
      frozen: asStringArray(source.frozen),
      headerFrozen:
        typeof source.headerFrozen === 'boolean' ? source.headerFrozen : true,
    };
  }
  return { ...DEFAULT_TABLE_SETTINGS };
}

/**
 * Pengaturan yang tidak menyimpang dari default tidak perlu disimpan, supaya
 * localStorage tidak menumpuk entri kosong (perilaku lama: entri dihapus saat
 * tidak ada kolom tersembunyi).
 */
export function isDefaultTableSettings(settings: TableColumnSettings): boolean {
  return (
    settings.hidden.length === 0 &&
    settings.frozen.length === 0 &&
    settings.headerFrozen
  );
}

/** Urutan kolom yang benar-benar dirender (kolom tersembunyi dibuang). */
export function visibleOrder(orderedKeys: string[], hidden: string[]): string[] {
  const hiddenSet = new Set(hidden);
  return orderedKeys.filter((key) => !hiddenSet.has(key));
}

/**
 * Merapikan daftar beku menjadi awalan yang rapat.
 *
 * Dipakai sebagai jaring pengaman untuk keadaan yang tidak bisa dicegah dari UI:
 * kolom dihapus dari tabel sejak pengaturan disimpan, kolom disembunyikan,
 * urutan kolom berubah, atau localStorage disunting tangan. Hasilnya adalah
 * awalan terpanjang dari kolom TERLIHAT yang seluruhnya ada di daftar beku.
 *
 * `orderedKeys` kosong berarti pemanggil tidak memberi urutan kolom; dalam
 * keadaan itu daftar beku dibiarkan apa adanya, karena menormalkannya tanpa
 * urutan hanya akan mengosongkannya.
 */
export function normalizeFrozen(
  orderedKeys: string[],
  hidden: string[],
  frozen: string[],
): string[] {
  if (orderedKeys.length === 0) return [...frozen];
  const wanted = new Set(frozen);
  const result: string[] = [];
  for (const key of visibleOrder(orderedKeys, hidden)) {
    if (!wanted.has(key)) break;
    result.push(key);
  }
  return result;
}

/**
 * Satu klik ikon pin: bekukan kolom ini, atau lepas kolom ini dan sesudahnya.
 *
 * Mengembalikan awalan yang rapat, sehingga hasilnya selalu bisa dipakai
 * langsung sebagai `state.columnPinning.start` — dan offset `getStart()` selalu
 * menjumlahkan kolom yang benar-benar di sebelah kirinya.
 *
 * `key` yang tidak dikenal atau sedang tersembunyi tidak mengubah apa pun.
 */
export function toggleFrozen(
  orderedKeys: string[],
  hidden: string[],
  frozen: string[],
  key: string,
): string[] {
  const visible = visibleOrder(orderedKeys, hidden);
  const index = visible.indexOf(key);
  if (index < 0) return normalizeFrozen(orderedKeys, hidden, frozen);
  if (frozen.includes(key)) return visible.slice(0, index);
  return visible.slice(0, index + 1);
}
