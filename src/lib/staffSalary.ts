// Modul murni: TANPA import apa pun, supaya bisa diuji `node --test` tanpa
// database dan tanpa alias `@/`. Pola yang sama dengan `targetBenefit.ts`,
// `targetGeneration.ts`, dan `targetDetailIdentity.ts`.
//
// Permintaan user (verbatim):
//   "saya pengen di Target Jahit, bagian Target Cost / Posisi itu adalah salary
//    mereka di bulan itu. ... yg bisa lihat si Expense Salary ini cuma si USER
//    yang punya nama tsb, finance dan juga owner."
//
// Keputusan user:
//   1. Gaji diinput lewat Expense, kategori MANPOWER > SALARY.
//   2. Bulan gaji diambil dari `entry_date` (bukan kolom bulan tersendiri).
//   3. Satu orang = satu baris gaji per bulan.

/** Nama Main Category tempat gaji berada — disalin ke baris saat dicatat. */
export const SALARY_MAIN_CATEGORY = 'MANPOWER'

/**
 * Nama Sub Category gaji — disalin ke baris saat dicatat.
 *
 * Dipakai juga oleh partial unique index `expense_entries_salary_unique` di
 * database. Kalau nama kategori ini diganti di halaman Kategori Biaya, baris
 * BARU berhenti terdeteksi sebagai gaji; baris lama tetap terbaca karena
 * namanya tersalin. Keterbatasan yang diketahui, bukan kelalaian.
 */
export const SALARY_SUB_CATEGORY = 'SALARY'

/**
 * `YYYY-MM-DD` -> `YYYY-MM`.
 *
 * Mengembalikan string kosong untuk nilai yang tidak berbentuk tanggal, supaya
 * baris cacat tidak diam-diam masuk ke bucket bulan yang salah. Mengiris 7
 * karakter pertama (bukan `Date`) agar tidak ada pergeseran zona waktu: nilai
 * ini adalah tanggal murni tanpa jam.
 */
export function salaryMonthOf(entryDate: string): string {
  const text = String(entryDate ?? '').trim()
  return /^\d{4}-\d{2}/.test(text) ? text.slice(0, 7) : ''
}

/** Bagian baris yang dibutuhkan untuk mengenali sebuah baris gaji. */
export interface SalaryRowShape {
  /** Karyawan penerima gaji; `null` berarti baris ini dibayarkan ke vendor. */
  staffId: number | null
  mainCategoryName: string
  subCategoryName: string
}

/**
 * True bila baris ini adalah pembayaran gaji ke seorang karyawan.
 *
 * Dua syarat, dan keduanya perlu: ada `staff_id` DAN kategorinya SALARY.
 * `staff_id` saja tidak cukup — kelak mungkin ada pembayaran lain ke karyawan
 * (mis. reimburse) yang tidak boleh diperlakukan sebagai gaji bulanan.
 */
export function isSalaryRow(row: SalaryRowShape): boolean {
  return (
    row.staffId !== null &&
    row.staffId !== undefined &&
    row.subCategoryName === SALARY_SUB_CATEGORY
  )
}

/** Satu baris gaji, dalam bentuk yang dibutuhkan pencarian. */
export interface SalaryEntryInput {
  /** Nama karyawan penerima — harus sama persis dengan `target_jahit.nama`. */
  staffName: string
  /** `YYYY-MM-DD`; bulannya dipakai sebagai kunci. */
  entryDate: string
  /** Nominal gaji bulan itu. */
  amount: number
}

/**
 * Pencarian gaji per (nama, bulan).
 *
 * Dibuat sekali lalu ditanyakan berkali-kali: satu kali lintas data, bukan
 * `find` per baris target yang akan berulang kali melintasi array yang sama.
 */
export interface SalaryLookup {
  /**
   * Nominal gaji, atau `undefined` bila belum diinput.
   *
   * `undefined` sengaja dibedakan dari `0`: pemanggil harus bisa membedakan
   * "gajinya nol rupiah" (tidak mungkin terjadi) dari "belum diinput sama
   * sekali", karena yang kedua ditampilkan sebagai "—" dan badge.
   */
  amountFor(name: string, ym: string): number | undefined
  /** True bila gaji untuk (nama, bulan) sudah diinput. */
  has(name: string, ym: string): boolean
}

/** Kunci gabungan nama + bulan. Dipisah karakter yang tidak muncul di keduanya. */
function keyOf(name: string, ym: string): string {
  return `${String(name ?? '').trim()}\u0000${ym}`
}

/**
 * Susun pencarian gaji dari baris-baris gaji.
 *
 * Nominal dijumlahkan bila ternyata ada lebih dari satu baris untuk (nama,
 * bulan). Partial unique index `expense_entries_salary_unique` seharusnya sudah
 * mencegahnya, jadi penjumlahan ini adalah jaring pengaman — bukan aturan yang
 * diandalkan. Baris dengan tanggal cacat dilewati, bukan dimasukkan ke bulan
 * yang salah.
 */
export function buildSalaryLookup(entries: readonly SalaryEntryInput[]): SalaryLookup {
  const perKey = new Map<string, number>()

  for (const entry of entries) {
    const ym = salaryMonthOf(entry.entryDate)
    if (!ym) continue;
    const key = keyOf(entry.staffName, ym)
    const amount = Number(entry.amount)
    perKey.set(key, (perKey.get(key) ?? 0) + (Number.isFinite(amount) ? amount : 0))
  }

  return {
    amountFor(name: string, ym: string): number | undefined {
      return perKey.get(keyOf(name, ym))
    },
    has(name: string, ym: string): boolean {
      return perKey.has(keyOf(name, ym))
    },
  }
}

/**
 * Pencarian kosong — dipakai sebagai nilai awal sebelum data gaji termuat, dan
 * oleh halaman yang memang tidak menampilkan biaya.
 *
 * Disediakan sebagai fungsi (bukan satu objek bersama) supaya tidak ada pemanggil
 * yang bisa menyetel isinya lewat referensi yang sama.
 */
export function emptySalaryLookup(): SalaryLookup {
  return buildSalaryLookup([])
}

/** Bentuk minimal kelompok yang perlu diperiksa gajinya: nama + bulan. */
export interface SalaryKeyedGroup {
  namaPenjahit: string
  /** 'YYYY-MM' */
  bulanTarget: string
}

/** Kelompok yang gajinya belum diinput — nama + bulan, bukan sekadar jumlah. */
export interface MissingSalary {
  nama: string
  bulan: string
}

/**
 * Pisahkan kelompok menjadi yang **boleh digenerate** dan yang **gajinya belum
 * diinput**.
 *
 * Permintaan user (verbatim): *"kalo data lama yang udah keinput ya di NULL kan
 * saja, tapi nextnya ya bakal gagal ke generate"*.
 *
 * Dipisah ke modul murni ini — bukan ditulis inline di service Supabase —
 * mengikuti pola `isGeneratablePlanningRow` di `targetGeneration.ts`, supaya
 * aturan terpenting fitur ini (SIAPA yang boleh digenerate) bisa diuji tanpa
 * database. Sebelumnya aturan ini hidup di dalam `staffDebt.ts` yang mengimpor
 * Supabase, jadi tidak mungkin diuji `node --test`.
 *
 * Kelompok yang belum ada gajinya DILEWATI, sisanya tetap jalan: satu orang yang
 * gajinya belum diisi tidak boleh menggagalkan generate orang lain.
 *
 * `missing` sengaja memuat nama + bulan (bukan hanya jumlahnya) supaya alert-nya
 * bisa ditindaklanjuti — user perlu tahu siapa dan bulan apa yang harus diisi.
 * Urutan asli dipertahankan agar pesannya stabil antar-pemuatan.
 */
export function splitGroupsBySalary<T extends SalaryKeyedGroup>(
  groups: readonly T[],
  salaries: SalaryLookup,
): { generatable: T[]; missing: MissingSalary[] } {
  const generatable: T[] = []
  const missing: MissingSalary[] = []

  for (const group of groups) {
    if (salaries.has(group.namaPenjahit, group.bulanTarget)) {
      generatable.push(group)
    } else {
      missing.push({ nama: group.namaPenjahit, bulan: group.bulanTarget })
    }
  }

  return { generatable, missing }
}
