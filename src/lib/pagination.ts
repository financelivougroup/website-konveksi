// ===== Pagination tabel log =====
// Helper murni: tidak menyentuh React maupun Supabase, supaya bisa diuji
// tanpa merender komponen (mengikuti pola src/lib/sewingBacklog.ts).

/** Jumlah baris per halaman untuk tabel log (Sewing / Kancing / Finishing). */
export const LOG_PAGE_SIZE = 10;

/** Jumlah halaman untuk sejumlah baris. Minimal 1 — tabel kosong pun punya
 *  satu halaman, supaya kontrol pagination tidak pernah menampilkan "0 of 0"
 *  dengan tombol yang semuanya nonaktif. */
export function totalPages(totalRows: number, pageSize: number = LOG_PAGE_SIZE): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(totalRows / pageSize));
}

/**
 * Kembalikan nomor halaman yang masih masuk akal untuk jumlah baris saat ini.
 *
 * Dipakai karena himpunan baris bisa menyusut di bawah halaman yang sedang
 * dibuka — misal user mengetik di kotak pencarian saat berada di halaman 5,
 * lalu hasilnya tinggal 1 halaman. Tanpa clamping, irisan barisnya kosong dan
 * tabel terlihat "tidak ada data" padahal datanya ada.
 */
export function clampPage(
  page: number,
  totalRows: number,
  pageSize: number = LOG_PAGE_SIZE,
): number {
  if (!Number.isFinite(page) || page < 1) return 1;
  const last = totalPages(totalRows, pageSize);
  return Math.min(Math.floor(page), last);
}

/**
 * Nomor halaman yang pasti berada di atau setelah halaman terakhir.
 *
 * Dipakai pemanggil yang ingin **mendarat di halaman terakhir** tanpa tahu
 * jumlah barisnya — `clampPage` yang menariknya turun. Diperlukan di halaman
 * yang urutannya kronologis: baris yang baru disimpan ada di PALING BAWAH, jadi
 * halaman terakhirlah yang memuatnya.
 *
 * Sengaja berupa nilai besar, bukan hitungan `totalPages(...)`: pemanggilnya
 * (mis. `ExpensePage`) baru selesai memuat ulang datanya, sehingga jumlah baris
 * di tangannya masih yang lama. Menghitung dari angka basi akan mendarat di
 * halaman yang salah.
 */
export const LAST_PAGE = Number.MAX_SAFE_INTEGER;

/** Irisan baris untuk satu halaman. Halaman di-clamp lebih dulu, jadi
 *  memanggilnya dengan nomor halaman usang tetap aman. */
export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number = LOG_PAGE_SIZE,
): T[] {
  const safePage = clampPage(page, rows.length, pageSize);
  const start = (safePage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}
