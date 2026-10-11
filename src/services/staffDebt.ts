import { groupPlannedTargetDetails } from '@/lib/targetDetailIdentity'
import {
  groupPlanningForGeneration,
  isGeneratablePlanningRow,
  type PlanningGenerationRow,
} from '@/lib/targetGeneration'
import {
  productionCodePriceKey,
  type PriceMap,
  type PriceMapValue,
} from '@/lib/targetBenefit'
import { buildSalaryLookup, splitGroupsBySalary, type MissingSalary } from '@/lib/staffSalary'
import { debtAmounts } from '@/lib/staffDebtAmounts'
import { supabase } from '@/lib/supabase'
import * as expenseSvc from '@/services/expenseEntries'

// `productionCodePriceKey`, `PriceMap`, dan `PriceMapValue` tinggal di
// `src/lib/targetBenefit.ts` (modul murni tanpa import) supaya bisa diuji
// `node --test`. Di-export ulang dari sini agar pemanggil lama tidak berubah
// dan tetap hanya ada SATU implementasi.
export { productionCodePriceKey }
export type { PriceMap, PriceMapValue }

/**
 * Build an exact-order price map keyed by normalized Product Note.
 * Product Note is the unique production code, so two runs of the same product
 * never borrow each other's jahit/obras price.
 */
export async function buildPriceMap(): Promise<PriceMap> {
  const map: PriceMap = {}

  const { data: priceRows } = await supabase
    .from('production_order_prices')
    .select('id, production_order_id')
  if (!priceRows || priceRows.length === 0) return map

  const orderIds = priceRows.map((price) => price.production_order_id as string)
  const { data: orderRows } = await supabase
    .from('production_orders')
    .select('id, product_note')
    .in('id', orderIds)

  const orderToProductNote = new Map<string, string>()
  for (const order of orderRows ?? []) {
    const key = productionCodePriceKey(order.product_note as string | null)
    if (key) orderToProductNote.set(order.id as string, key)
  }

  const priceIds = priceRows.map((price) => price.id as string)
  const { data: componentRows } = await supabase
    .from('production_order_price_components')
    .select('order_price_id, component_key, amount_per_piece')
    .in('order_price_id', priceIds)
    .in('component_key', ['jahit', 'obras'])

  const componentsByPrice = new Map<string, PriceMapValue>()
  for (const component of (componentRows ?? []) as Record<string, unknown>[]) {
    const priceId = component.order_price_id as string
    const current = componentsByPrice.get(priceId) ?? { jahit: 0, obras: 0 }
    if (component.component_key === 'jahit') current.jahit = Number(component.amount_per_piece) || 0
    if (component.component_key === 'obras') current.obras = Number(component.amount_per_piece) || 0
    componentsByPrice.set(priceId, current)
  }

  for (const price of priceRows) {
    const productNote = orderToProductNote.get(price.production_order_id as string)
    const components = componentsByPrice.get(price.id as string)
    if (productNote && components) map[productNote] = components
  }

  return map
}

export interface DebtSummary {
  totalTargetCost: number
  /** Realisasi Cost / Posisi — pengurang Target Cost (dulu "Total Nilai PCS"). */
  realisasiCost: number
  utang: number
  status: 'Utang' | 'Tidak Utang'
}

/**
 * Hitung utang satu staf: Target Cost dikurangi Realisasi Cost / Posisi.
 *
 *   Utang = Jumlah Gaji − Realisasi Cost / Posisi
 *
 * **`totalTargetCost`** adalah **JUMLAH GAJI** staf itu dari `expense_entries`
 * (kategori MANPOWER › SALARY), karena `Target Cost / Posisi` didefinisikan
 * ulang oleh user sebagai gaji bulanan mereka:
 *
 *   "iya sbenernya sama aja target cost posisi - nilai realisasi, karna target
 *    cost posisi itu mau dibuatnya berdasarkan salary mereka"
 *
 * **`realisasiCost`** dulu dihitung fungsi ini sendiri dari `sewing_records`
 * (dinamai "Total Nilai PCS") lalu dikurangi potongan complain. Permintaan user
 * mengubahnya:
 *
 *   "di bagian Utang Staf tolong ganti Total Nilai PCS ke Realisasi Cost / Posisi"
 *
 * Nilainya kini diambil dari `realisasiCostPosisi` baris hasil
 * `enrichTargetRows` — kuantitas yang SAMA dengan kolom "Realisasi Cost / Posisi"
 * di tab Target. Karena itu penghitungannya TIDAK lagi dilakukan di sini (lihat
 * `sumRealisasiCostByStaff`): dua tempat yang menghitung angka yang sama adalah
 * cara paling mudah membuat keduanya berbeda diam-diam.
 *
 * Konsekuensi yang disengaja: potongan complain TIDAK lagi dikurangkan, dan
 * realisasi dicocokkan per desain — jadi baris detail yang `product_note`-nya
 * salah tidak lagi ikut terhitung. Keduanya sudah dikonfirmasi user.
 */
export async function computeDebt(
  staffName: string,
  realisasiCost: number,
): Promise<DebtSummary> {
  // Gaji dari expense_entries untuk staf ini, SEMUA bulan — sama seperti
  // perilaku lama yang menjumlahkan seluruh baris target_jahit orang itu.
  const { data: salaryRows } = await expenseSvc.fetchSalaries(staffName)
  const totalTargetCost = (salaryRows ?? []).reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0,
  )

  return {
    totalTargetCost,
    ...debtAmounts(totalTargetCost, realisasiCost),
  }
}

export interface GenerateTargetsResult {
  /** Jumlah baris target_jahit yang BARU dibuat. */
  created: number
  /** Jumlah baris target_jahit yang SUDAH ADA dan qty-nya ditambahkan. */
  merged: number
  /** Jumlah baris planning terpilih yang ditemukan di database. */
  processedFound: number
  /** Baris terpilih yang dilewati karena statusnya bukan `approved`. */
  skippedNotApproved: number
  /** Baris terpilih yang dilewati karena nama penjahit / bulan targetnya kosong. */
  skippedIncomplete: number
  /** Jumlah kelompok (penjahit, bulan) yang dilewati karena gajinya belum diinput. */
  skippedNoSalary: number
  /**
   * Kelompok yang dilewati karena gajinya belum diinput — nama + bulannya, bukan
   * sekadar jumlah, supaya alert-nya bisa ditindaklanjuti: user perlu tahu SIAPA
   * dan BULAN APA yang harus diisi gajinya.
   */
  missingSalary: MissingSalary[]
  error: Error | null
}

const EMPTY_GENERATE_RESULT = {
  created: 0,
  merged: 0,
  processedFound: 0,
  skippedNotApproved: 0,
  skippedIncomplete: 0,
  skippedNoSalary: 0,
  missingSalary: [],
}

/**
 * Tambahkan qty target dari baris planning_produksi yang DIPILIH ke target jahit.
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
 * 1. **Masukannya id baris terpilih.** Bulan target diambil dari tiap baris
 *    (`bulan_target`), jadi mencentang baris dari dua bulan sekaligus
 *    menghasilkan penambahan di bulan masing-masing.
 * 2. **Satu penjahit = satu baris target per bulan.** Kalau baris itu sudah ada,
 *    `target_monthly` dan `target_cost_posisi`-nya DITAMBAH, dan baris detailnya
 *    digabung — TIDAK dibuat baris target baru. Kalau belum ada, baris baru dibuat.
 *
 * Aturan nomor 2 juga ditegakkan database lewat unique index
 * `idx_target_jahit_unique ("bulanTahun", nama)` — lihat
 * supabase/migrations/2026-09-24-target-jahit-merge-and-restore-unique.sql.
 * Pemeriksaan di sini bukan pengganti index itu, hanya agar jalurnya jelas
 * (update vs insert) dan pesannya bisa dibedakan.
 *
 * Status `approved` TETAP disyaratkan. Baris terpilih yang belum approved tidak
 * digenerate, dan jumlahnya dilaporkan lewat `skippedNotApproved` supaya tidak
 * diam-diam terabaikan.
 */
export async function generateTargetsFromPlanning(
  planningIds: number[],
): Promise<GenerateTargetsResult> {
  // Dedup + buang id yang bukan angka: pemanggil mengirim isi Set, dan tidak ada
  // gunanya menanyakan id yang sama dua kali.
  const ids = Array.from(
    new Set(planningIds.filter((id) => Number.isFinite(id))),
  )
  if (ids.length === 0) return { ...EMPTY_GENERATE_RESULT, error: null }

  const priceMap = await buildPriceMap()

  const { data: planRows, error: planErr } = await supabase
    .from('planning_produksi')
    .select('*')
    .in('id', ids)
  if (planErr) return { ...EMPTY_GENERATE_RESULT, error: planErr }

  const rows = (planRows ?? []) as Record<string, unknown>[]
  const approvedRows = rows.filter((r) => r.status === 'approved')
  const skippedNotApproved = rows.length - approvedRows.length

  // Baris yang bisa jadi target: nama penjahit dan bulan targetnya terisi.
  const generatable: PlanningGenerationRow[] = approvedRows.map((r) => ({
    id: r.id as number,
    namaPenjahit: (r.nama_penjahit as string) ?? '',
    productNote: (r.product_note as string | null) ?? null,
    product: (r.product as string) ?? '',
    warna: (r.warna as string | null) ?? null,
    qty: Number(r.qty) || 0,
    bulanTarget: (r.bulan_target as string) ?? '',
  }))
  const readyRows = generatable.filter(isGeneratablePlanningRow)
  const skippedIncomplete = generatable.length - readyRows.length

  // Look up each staff's posisi from the employee register so the generated
  // target_jahit rows carry it (the column is nullable; keep it filled).
  const { data: staffRows } = await supabase
    .from('register_penjahit')
    .select('pic_penjahit, posisi')
  const posisiByName = new Map<string, string | null>(
    ((staffRows ?? []) as Record<string, unknown>[]).map((r) => [r.pic_penjahit as string, (r.posisi as string | null) ?? null]),
  )

  // Satu kelompok = satu baris target_jahit, dikunci (penjahit, bulan).
  const groups = groupPlanningForGeneration(readyRows)

  // Gaji menentukan siapa yang boleh digenerate. Permintaan user (verbatim):
  //   "kalo data lama yang udah keinput ya di NULL kan saja, tapi nextnya ya
  //    bakal gagal ke generate"
  // Aturannya hidup di `splitGroupsBySalary` (modul murni, bisa diuji) supaya
  // "siapa yang boleh digenerate" tidak jadi logika tersembunyi di dalam service
  // yang mengimpor Supabase. Kelompok tanpa gaji DILEWATI, dan sisanya tetap
  // jalan — satu orang yang gajinya belum diisi tidak boleh menggagalkan
  // generate orang lain.
  const { data: salaryRows } = await expenseSvc.fetchSalaries()
  const salaries = buildSalaryLookup(salaryRows ?? [])
  const { generatable: generatableGroups, missing: missingSalary } =
    splitGroupsBySalary(groups, salaries)

  // Baris target yang sudah ada untuk (penjahit, bulan) yang ikut diproses,
  // diambil sekali di muka. `bulanTahun` adalah satu-satunya kolom camelCase di
  // tabel ini (lihat catatan di `src/services/targetJahit.ts`).
  const bulanList = Array.from(new Set(generatableGroups.map((g) => g.bulanTarget)))
  const namaList = Array.from(new Set(generatableGroups.map((g) => g.namaPenjahit)))
  const existingByKey = new Map<string, { id: number; qty: number }>()
  if (bulanList.length > 0 && namaList.length > 0) {
    const { data: existingRows } = await supabase
      .from('target_jahit')
      .select('id, nama, "bulanTahun", target_monthly')
      .in('bulanTahun', bulanList)
      .in('nama', namaList)
    for (const r of (existingRows ?? []) as Record<string, unknown>[]) {
      const key = `${(r.nama as string) ?? ''}\u0000${(r.bulanTahun as string) ?? ''}`
      existingByKey.set(key, {
        id: r.id as number,
        qty: Number(r.target_monthly) || 0,
      })
    }
  }

  let created = 0
  let merged = 0
  for (const group of generatableGroups) {
    const nama = group.namaPenjahit

    // Detail yang akan ditulis, dalam bentuk kolom DB.
    const groupedDetails = groupPlannedTargetDetails(
      group.rows.map((row) => ({
        productNote: row.productNote,
        product: row.product,
        warna: row.warna,
        qty: row.qty,
      })),
    )

    const existing = existingByKey.get(`${nama}\u0000${group.bulanTarget}`)

    if (existing) {
      // SUDAH ADA → jumlahnya ditambah, baris targetnya tidak dibuat ulang.
      //
      // PENTING: hanya `target_monthly` yang ditambah di sini. `target_cost_posisi`
      // SENGAJA tidak ikut ditulis lagi — nilainya kini adalah GAJI bulan itu,
      // yang dibaca dari `expense_entries`. Menambahkannya seperti dulu akan
      // mengalikan gaji setiap kali tombol Generate ditekan.
      const { error: updErr } = await supabase
        .from('target_jahit')
        .update({
          target_monthly: existing.qty + group.totalQty,
        })
        .eq('id', existing.id)
      if (updErr) continue

      // Detail digabung ke baris yang sama. `upsertBatch` memakai primary key `id`,
      // jadi tanpa `id` ia selalu INSERT baris baru — bukan menimpa. Karena itu
      // baris detail yang produk+warnanya sama perlu disatukan dulu di sini,
      // kalau tidak akan ada dua baris detail untuk satu desain.
      const { data: currentDetails } = await supabase
        .from('target_jahit_detail')
        .select('id, product_note, product, warna, qty_target')
        .eq('target_jahit_id', existing.id)

      const details = (currentDetails ?? []) as Record<string, unknown>[]
      const incoming = groupedDetails.map((p) => {
        const price = priceMap[productionCodePriceKey(p.productNote)]
        return {
          product_note: p.productNote,
          product: p.product,
          warna: p.warna,
          qty_target: p.qty,
          harga_jahit: price ? price.jahit : 0,
          harga_obras: price ? price.obras : 0,
        }
      })

      // Desain yang sudah ada ditambahkan qty-nya; sisanya disisipkan sebagai baris baru.
      for (const inc of incoming) {
        const match = details.find(
          (d) =>
            ((d.product_note as string | null) ?? null) === inc.product_note &&
            ((d.warna as string | null) ?? null) === inc.warna &&
            (d.product as string) === inc.product,
        )
        if (match) {
          const { error: detUpdErr } = await supabase
            .from('target_jahit_detail')
            .update({ qty_target: (Number(match.qty_target) || 0) + inc.qty_target })
            .eq('id', match.id as number)
          if (detUpdErr) continue
        } else {
          const { error: detInsErr } = await supabase
            .from('target_jahit_detail')
            .insert({ ...inc, target_jahit_id: existing.id, qty_realisasi: 0 })
          if (detInsErr) continue
        }
      }

      merged++
      continue
    }

    // BELUM ADA → buat baris target baru beserta detailnya.
    //
    // `target_cost_posisi` sengaja TIDAK ikut ditulis: nilainya kini adalah
    // GAJI bulan itu, yang dibaca dari `expense_entries`. Menulisnya di sini
    // akan menimpa gaji dengan hasil hitungan harga jahit.
    const { data: parent, error: parentErr } = await supabase
      .from('target_jahit')
      .insert({
        nama,
        bulanTahun: group.bulanTarget,
        posisi: posisiByName.get(nama) ?? null,
        target_monthly: group.totalQty,
      })
      .select('id')
      .single()
    if (parentErr || !parent) continue

    const details = groupedDetails.map((p) => {
      const price = priceMap[productionCodePriceKey(p.productNote)]
      return {
        target_jahit_id: parent.id as number,
        product_note: p.productNote,
        product: p.product,
        warna: p.warna,
        qty_target: p.qty,
        qty_realisasi: 0,
        harga_jahit: price ? price.jahit : 0,
        harga_obras: price ? price.obras : 0,
      }
    })
    if (details.length > 0) {
      const { error: detErr } = await supabase
        .from('target_jahit_detail')
        .insert(details)
      if (detErr) continue
    }

    created++
  }

  return {
    created,
    merged,
    processedFound: rows.length,
    skippedNotApproved,
    skippedIncomplete,
    skippedNoSalary: missingSalary.length,
    missingSalary,
    error: null,
  }
}