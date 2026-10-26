// Modul murni: TANPA import apa pun, supaya bisa diuji `node --test` tanpa
// database dan tanpa alias `@/`. Pola yang sama dengan `staffSalary.ts`,
// `staffDebtEligibility.ts`, dan `targetBenefit.ts`.
//
// Permintaan user (verbatim):
//   "di bagian Utang Staff tolong ganti Total Nilai PCS ke Realisasi Cost / Posisi"
//
// Perubahan yang diminta BUKAN sekadar ganti judul kolom: nilainya ikut
// berubah. Dulu "Total Nilai PCS" dihitung `computeDebt` langsung dari
// `sewing_records` (semua bulan) lalu dikurangi potongan complain. Sekarang
// nilainya adalah **Realisasi Cost / Posisi** — kuantitas yang SAMA dengan
// kolom bernama itu di tab Target, yaitu Σ(qty realisasi × tarif desain) dari
// `target_jahit_detail`, dijumlahkan seluruh bulan.
//
// Dua konsekuensi yang disengaja (dan sudah dikonfirmasi user):
//
// 1. **Potongan complain tidak lagi dikurangkan.** Rumusnya kini
//    `Utang = Target Cost − Realisasi Cost`, mengikuti definisi user bahwa
//    "target cost posisi itu mau dibuatnya berdasarkan salary mereka".
// 2. **Realisasi dihitung per DESAIN lewat pencocokan identitas**, bukan lewat
//    `work_orders.product_note`. Bedanya nyata: baris detail yang `product_note`-nya
//    salah tidak akan menemukan pasangannya, sehingga pcs-nya tidak terhitung.
//    Itu memang perilaku tab Target, dan sekarang tab Utang ikut konsisten
//    dengannya — bukan lagi punya hitungan sendiri.
//
// Karena itu fungsinya hidup di sini, bukan inline di halaman: aturan uang yang
// harus tetap sinkron dengan tab Target hanya boleh punya SATU implementasi.

/** Bentuk minimal baris hasil `enrichTargetRows` yang dibutuhkan penjumlahan. */
export interface RealisasiCostSource {
  nama: string;
  /** `realisasiCostPosisi` dari `enrichTargetRows` — sudah per desain. */
  realisasiCostPosisi: number
}

/**
 * Jumlahkan Realisasi Cost seluruh baris target per nama penjahit.
 *
 * Semua bulan ikut dijumlahkan (tidak difilter bulan), sama seperti perilaku
 * lama yang menjumlahkan seluruh baris orang itu.
 *
 * Baris tanpa nama dilewati, dan nominal yang bukan angka dianggap 0 — supaya
 * satu baris cacat tidak menghasilkan `NaN` yang menjalar ke seluruh Utang.
 */
export function sumRealisasiCostByStaff(
  rows: readonly RealisasiCostSource[],
): Map<string, number> {
  const perNama = new Map<string, number>()

  for (const row of rows) {
    const nama = String(row.nama ?? '').trim()
    if (!nama) continue
    const nilai = Number(row.realisasiCostPosisi)
    perNama.set(nama, (perNama.get(nama) ?? 0) + (Number.isFinite(nilai) ? nilai : 0))
  }

  return perNama
}

export interface DebtAmounts {
  /** Realisasi Cost / Posisi — pengurang Target Cost. */
  realisasiCost: number
  utang: number
  status: 'Utang' | 'Tidak Utang'
}

/**
 * Utang = Target Cost − Realisasi Cost / Posisi.
 *
 * `totalTargetCost` adalah JUMLAH GAJI staf itu dari `expense_entries`
 * (MANPOWER › SALARY). Rumusnya sendiri tidak berubah dari sebelumnya — yang
 * berubah hanya apa yang menjadi pengurangnya.
 *
 * Dibulatkan ke rupiah bulat; sisa di bawah Rp1 bukan utang yang bisa ditagih.
 * `status` mengikuti tanda hasilnya, bukan nominal mentahnya.
 */
export function debtAmounts(
  totalTargetCost: number,
  realisasiCost: number,
): DebtAmounts {
  const target = Number(totalTargetCost) || 0
  const realisasi = Number(realisasiCost) || 0
  const utang = Math.round(target - realisasi)

  return {
    realisasiCost: realisasi,
    utang,
    status: utang > 0 ? 'Utang' : 'Tidak Utang',
  }
}
