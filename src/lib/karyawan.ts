/**
 * Aturan seleksi karyawan Register Karyawan (Contact → Karyawan).
 *
 * Murni dan tanpa Supabase supaya bisa diuji langsung, mengikuti pola
 * `complainCascade.ts` dan `staffDebtEligibility.ts`. Service
 * (`src/services/registerPenjahit.ts`) memakai fungsi-fungsi ini supaya aturannya
 * hanya hidup di satu tempat.
 */

/**
 * Bentuk minimal baris karyawan yang dibutuhkan aturan di bawah.
 *
 * Sengaja hanya memuat `picPenjahit`, `posisi`, dan `status` — bukan
 * `RegisterPenjahitRow` yang lengkap — agar modul murni ini tidak perlu tahu
 * soal kolom tanggal maupun bentuk tabelnya.
 */
export interface KaryawanSelectionRow {
  picPenjahit: string;
  posisi: string | null;
  status: string;
}

/**
 * Karyawan yang boleh dipilih sebagai penjahit di form entri produksi.
 *
 * Syaratnya **dua-duanya**: status `Aktif` **dan** posisi `Penjahit`. Karyawan
 * Non-Aktif tidak boleh ditawarkan lagi (mis. Sidik Faisal), dan karyawan
 * berposisi lain (Leader, Finishing) memang bukan penjahit.
 *
 * Dipakai bersama Planning Produksi dan Entry Jahitan. Sebelumnya keduanya
 * menyaring sendiri-sendiri — dan Entry Jahitan malah memakai daftar nama tetap
 * di dalam kode, sehingga menawarkan orang yang tidak ada di Register Karyawan
 * sama sekali ("Budi Santoso", "Ani Wulandari", dst.). Aturan ini sengaja hanya
 * ada di sini supaya kedua halaman tidak bisa berbeda lagi.
 *
 * Perbandingan memakai `toLowerCase()` karena isi kolomnya diketik bebas di
 * Register Karyawan ("Aktif" maupun "aktif"), dan status kosong diperlakukan
 * sebagai Aktif — sama dengan `mapRow` di service.
 */
export function isActivePenjahit(row: KaryawanSelectionRow): boolean {
  return (
    (row.status ?? 'Aktif').toLowerCase() === 'aktif' &&
    (row.posisi ?? '').toLowerCase() === 'penjahit'
  )
}

/** Nama penjahit yang boleh dipilih, untuk dropdown PIC. */
export function activePenjahitNames(rows: KaryawanSelectionRow[]): string[] {
  return rows.filter(isActivePenjahit).map((r) => r.picPenjahit)
}

/** PIC Kancing: karyawan aktif berposisi Penjahit atau Finishing. */
export function activeKancingNames(rows: KaryawanSelectionRow[]): string[] {
  return rows.filter((row) => isActivePenjahit(row) || isActiveFinishing(row)).map((row) => row.picPenjahit)
}

function isActiveFinishing(row: KaryawanSelectionRow): boolean {
  return (row.status ?? 'Aktif').toLowerCase() === 'aktif' && (row.posisi ?? '').toLowerCase() === 'finishing'
}

/** PIC Finishing: hanya karyawan aktif berposisi Finishing. */
export function activeFinishingNames(rows: KaryawanSelectionRow[]): string[] {
  return rows.filter(isActiveFinishing).map((row) => row.picPenjahit)
}
