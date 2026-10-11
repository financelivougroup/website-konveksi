// Modul murni: TANPA import apa pun, supaya bisa diuji `node --test` tanpa
// database dan tanpa alias `@/`. Pola yang sama dengan `staffDebtAmounts.ts`,
// `staffSalary.ts`, dan `targetBenefit.ts`.
//
// Permintaan user (verbatim):
//   "saya mau di Complain & Penalti itu ada 2 section (pertama yg section
//    sekarang), kedua kyk summary per orang, per bulan, dan Potongan / Pcs."
//
// Keputusan user saat ditanya (jangan diubah tanpa bertanya lagi):
//   1. Section kedua berupa TAB, bukan dua tabel bertumpuk.
//   2. Kolom "Potongan / Pcs" isinya TOTAL POTONGAN RUPIAH
//      (Σ pcs × tarif), bukan tarif per pcs.
//   3. SEMUA baris ikut dihitung — yang NEED PROCEED maupun SOLVED.
//
// Susulan (permintaan user, verbatim): *"di summary, kolom bulan tahun dulu
// baru PIC"* — kolomnya dibalik, dan urutan baris di `buildComplainSummary`
// ikut dibalik supaya sepasang dengan urutan kolomnya.
//
// Karena aturan uang ini harus sama persis dengan yang dilihat user di tabel,
// ia hidup di modul murni yang bisa diuji — bukan ditulis inline di halaman.

/** Bagian baris complain yang dibutuhkan ringkasan. */
export interface ComplainSummarySource {
  /** `YYYY-MM-DD`. */
  tanggal: string
  /** Penjahit yang mengerjakan. `null`/kosong berarti belum diisi. */
  pic: string | null
  /** Jumlah pcs yang di-complain. */
  pcs: number
  /** Potongan per pcs, dalam rupiah. */
  potonganPerPcs: number
}

/**
 * Nama kelompok untuk baris yang PIC-nya belum diisi.
 *
 * Sengaja tidak dibuang: membuangnya akan membuat total potongan di summary
 * lebih kecil daripada di tabel, dan user tidak punya cara tahu ada baris yang
 * perlu diisi PIC-nya. Nama ini diawali tanda kurung supaya terbaca sebagai
 * penanda, bukan sebagai nama orang.
 */
export const TANPA_PIC = '(Tanpa PIC)'

/**
 * `YYYY-MM-DD` -> `YYYY-MM`.
 *
 * Mengembalikan string kosong untuk nilai yang tidak berbentuk tanggal, supaya
 * baris cacat tidak diam-diam masuk ke bulan yang salah. Mengiris 7 karakter
 * pertama (bukan `Date`) agar tidak ada pergeseran zona waktu — `tanggal` adalah
 * tanggal murni tanpa jam.
 */
export function complainMonthOf(tanggal: string): string {
  const text = String(tanggal ?? '').trim()
  return /^\d{4}-\d{2}/.test(text) ? text.slice(0, 7) : ''
}

/**
 * Total potongan satu baris = `pcs` × tarif per pcs.
 *
 * `Number()` dipakai (bukan mempercayai tipe) karena kolom `potongan_per_pcs`
 * bertipe `numeric` — nilainya bisa tiba sebagai string dari supabase-js.
 * Nilai tidak valid dianggap 0 supaya tidak menghasilkan `NaN` yang akan
 * merambat ke seluruh penjumlahan bulan itu.
 */
export function totalPotongan(pcs: number, potonganPerPcs: number): number {
  const jumlah = Number(pcs)
  const tarif = Number(potonganPerPcs)
  if (!Number.isFinite(jumlah) || !Number.isFinite(tarif)) return 0
  return jumlah * tarif
}

/** Satu baris ringkasan: satu orang pada satu bulan. */
export interface ComplainSummaryRow {
  /** Nama PIC, atau `TANPA_PIC` bila belum diisi. */
  pic: string
  /** `YYYY-MM` — kunci pengurutan yang tidak terpengaruh nama bulan. */
  bulan: string
  /** Jumlah baris complain yang dihitung. */
  jumlahComplain: number
  totalPcs: number
  totalPotongan: number
}

/** Kunci gabungan PIC + bulan. Dipisah karakter yang tidak muncul di keduanya. */
function keyOf(pic: string, bulan: string): string {
  return `${pic}\u0000${bulan}`
}

/**
 * Ringkas complain per (PIC, bulan).
 *
 * Permintaan user: *"summary per orang, per bulan, dan Potongan / Pcs"* — satu
 * baris per orang per bulan, bukan per complain.
 *
 * **Semua baris ikut dihitung**, termasuk yang masih `NEED PROCEED`: user memilih
 * "semua baris" saat ditanya, jadi angkanya menggambarkan seluruh complain yang
 * tercatat bulan itu — bukan hanya potongan yang sudah dieksekusi.
 *
 * Urutan hasil: **bulan menaik dulu, lalu PIC menaik**. Urutannya sengaja
 * mengikuti urutan kolom di tabel — kolom pertama adalah Bulan, jadi barisnya
 * berkelompok per bulan secara kronologis; di dalam satu bulan orangnya urut
 * alfabet. Kalau urutannya dibalik (PIC dulu), kolom Bulan yang berada di depan
 * akan melompat-lompat (Agustus, September, Agustus, September) dan tabelnya
 * terbaca seperti tidak berurut.
 *
 * Baris dengan tanggal cacat DILEWATI, mengikuti pola `buildSalaryLookup`:
 * baris seperti itu tidak punya bulan, jadi ia tidak bisa ditempatkan di bucket
 * mana pun tanpa mengarang bulan. Kolom `tanggal` bertipe `date NOT NULL` di
 * database, jadi keadaan ini praktis tidak terjadi.
 */
export function buildComplainSummary(
  rows: readonly ComplainSummarySource[],
): ComplainSummaryRow[] {
  const perKey = new Map<string, ComplainSummaryRow>()

  for (const row of rows) {
    const bulan = complainMonthOf(row.tanggal)
    if (!bulan) continue

    const pic = String(row.pic ?? '').trim() || TANPA_PIC
    const key = keyOf(pic, bulan)
    const existing = perKey.get(key)

    const pcs = Number(row.pcs)
    const potongan = totalPotongan(row.pcs, row.potonganPerPcs)

    if (existing) {
      existing.jumlahComplain += 1
      existing.totalPcs += Number.isFinite(pcs) ? pcs : 0
      existing.totalPotongan += potongan
    } else {
      perKey.set(key, {
        pic,
        bulan,
        jumlahComplain: 1,
        totalPcs: Number.isFinite(pcs) ? pcs : 0,
        totalPotongan: potongan,
      })
    }
  }

  return [...perKey.values()].sort(
    (a, b) => a.bulan.localeCompare(b.bulan) || a.pic.localeCompare(b.pic),
  )
}
