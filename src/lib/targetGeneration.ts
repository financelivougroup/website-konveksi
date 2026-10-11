/**
 * Pengelompokan baris planning terpilih menjadi target jahit.
 *
 * Permintaan user (verbatim):
 *   "buat planning produksi harusnya cara generatenya itu dengan cara: klik
 *    checkboxnya baru generate. jadi meskipun di bulan yg sama dan nama
 *    penjahitnya sama, ga masalah"
 *
 * lalu dikoreksi:
 *   "sorry buat target jahit. harusnya ga kebuat row baru. tapi jumlah targetnya
 *    aja yg nambah"
 *
 * Aturan yang berlaku (koreksi terakhir yang menang):
 *
 * 1. Yang digenerate HANYA baris yang dicentang — bukan seluruh bulan.
 * 2. Satu penjahit punya SATU baris target per bulan. Kalau baris itu sudah ada,
 *    **jumlahnya yang ditambah** (`target_monthly` + `target_cost_posisi`), BUKAN
 *    dibuat baris target baru.
 * 3. Bulan target diambil dari tiap baris (`bulanTarget`), bukan dari satu input
 *    bulan di toolbar: kalau user mencentang baris dari dua bulan sekaligus, tiap
 *    baris masuk ke bulannya masing-masing.
 *
 * Modul ini murni (tanpa Supabase) supaya bisa diuji langsung — pola yang sama
 * dengan `staffDebtEligibility.ts` dan `karyawan.ts`.
 */

/** Satu baris planning yang ikut digenerate. */
export interface PlanningGenerationRow {
  id: number
  namaPenjahit: string
  /** Kode Produksi Konveksi — kunci harga. Jangan diisi kode client. */
  productNote: string | null
  product: string
  warna: string | null
  qty: number
  /** 'YYYY-MM' */
  bulanTarget: string
}

/** Kumpulan baris planning untuk satu (penjahit, bulan). */
export interface PlanningGenerationGroup {
  namaPenjahit: string
  bulanTarget: string
  /** Baris planning asli yang membentuk kelompok ini. */
  rows: PlanningGenerationRow[]
  /** Total qty seluruh baris — ditambahkan ke `target_monthly` bila target sudah ada. */
  totalQty: number
}

/**
 * Kunci kelompok. `\u0000` dipakai sebagai pemisah karena tidak mungkin muncul di
 * nama orang maupun di 'YYYY-MM', jadi tidak ada risiko dua pasangan berbeda
 * menghasilkan kunci yang sama (masalah yang muncul kalau memakai '-' atau '|',
 * karena nama penjahit bebas diketik).
 */
function groupKey(nama: string, bulan: string): string {
  return `${nama}\u0000${bulan}`
}

/**
 * Kelompokkan baris planning terpilih per (penjahit, bulan).
 *
 * Satu kelompok = satu baris `target_jahit`. Kalau baris itu sudah ada di database,
 * pemanggil menambahkan `totalQty` ke baris tersebut alih-alih membuat baris baru.
 *
 * Urutan kemunculan dipertahankan supaya hasilnya bisa diprediksi dan tidak
 * berubah-ubah antar-render — Map di JavaScript menjaga urutan penyisipan.
 */
export function groupPlanningForGeneration(
  rows: PlanningGenerationRow[],
): PlanningGenerationGroup[] {
  const groups = new Map<string, PlanningGenerationGroup>()

  for (const row of rows) {
    const key = groupKey(row.namaPenjahit, row.bulanTarget)
    let group = groups.get(key)
    if (!group) {
      group = {
        namaPenjahit: row.namaPenjahit,
        bulanTarget: row.bulanTarget,
        rows: [],
        totalQty: 0,
      }
      groups.set(key, group)
    }
    group.rows.push(row)
    group.totalQty += Number(row.qty) || 0
  }

  return Array.from(groups.values())
}

/**
 * Baris planning yang boleh digenerate: hanya yang punya nama penjahit dan bulan
 * target. Baris tanpa keduanya tidak bisa menjadi target yang sah — dan lebih
 * baik dilewati di sini (dengan alasan yang bisa dilaporkan) daripada gagal saat
 * insert.
 */
export function isGeneratablePlanningRow(row: PlanningGenerationRow): boolean {
  return Boolean(row.namaPenjahit?.trim() && row.bulanTarget?.trim())
}
