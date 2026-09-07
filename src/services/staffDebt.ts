import { groupPlannedTargetDetails } from '@/lib/targetDetailIdentity'
import { productionCodePriceKey, type PriceMap, type PriceMapValue } from '@/lib/productionCode'
import { supabase } from '@/lib/supabase'

// `PriceMapValue`, `PriceMap`, dan `productionCodePriceKey` kini berasal dari
// `src/lib/productionCode` (modul murni, tanpa Supabase) agar helper di
// `src/lib/` dapat memakainya tanpa menarik klien Supabase. Diekspor ulang di
// sini supaya pemanggil yang sudah ada tidak perlu diubah.
export type { PriceMap, PriceMapValue }
export { productionCodePriceKey }

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

function round0(n: number): number {
  return Math.round(n)
}

// Catatan: `computeDebt()` dihapus. Ia membaca `target_jahit.realisasi_cost_posisi`
// (kolom yang tidak pernah ditulis, selalu 0) dan `salary` (sudah dihapus
// migration 2026-09-04). Utang kini dihitung murni di
// `computeDebtFromRows()` (`src/lib/staffDebtEligibility.ts`) dari baris Target
// yang sudah di-enrich, dengan sumber harga identik seperti Sisa Uang dan tanpa
// potongan complain.

export interface GenerateTargetsResult {
  created: number
  error: Error | null
  /** Jumlah planning berstatus approved yang ditemukan untuk bulan target. */
  approvedFound: number
}

/**
 * Generate target_jahid parent rows + target_jahid_detail rows from planning_produksi
 * for a given bulanTarget. Skips staff who already have a target row for that month.
 */
export async function generateTargetsFromPlanning(
  bulanTarget: string,
): Promise<GenerateTargetsResult> {
  const priceMap = await buildPriceMap()

  // Only APPROVED planning rows may be generated into targets.
  const { data: planRows, error: planErr } = await supabase
    .from('planning_produksi')
    .select('*')
    .eq('bulan_target', bulanTarget)
    .eq('status', 'approved')
  if (planErr) return { created: 0, error: planErr, approvedFound: 0 }

  // Look up each staff's posisi from the employee register so the generated
  // target_jahit rows carry it (the column is nullable; keep it filled).
  const { data: staffRows } = await supabase
    .from('register_penjahit')
    .select('pic_penjahit, posisi')
  const posisiByName = new Map<string, string | null>(
    ((staffRows ?? []) as Record<string, unknown>[]).map((r) => [r.pic_penjahit as string, (r.posisi as string | null) ?? null]),
  )

  // Group planning rows by staff.
  const byStaff = new Map<string, {
    rows: Record<string, unknown>[],
    totalQty: number,
    targetCost: number,
    plans: Array<{
      productNote: string | null;
      product: string;
      warna: string | null;
      qty: number;
    }>;
  }>()
  for (const r of (planRows ?? []) as Record<string, unknown>[]) {
    const nama = r.nama_penjahit as string
    const product = r.product as string
    const qty = r.qty as number
    const warna = (r.warna as string | null) ?? null
    const productNote = (r.product_note as string | null) ?? null
    const price = priceMap[productionCodePriceKey(productNote)]
    const pcsCost = (price ? price.jahit + price.obras : 0) * qty

    if (!byStaff.has(nama)) {
      byStaff.set(nama, { rows: [], totalQty: 0, targetCost: 0, plans: [] })
    }
    const staff = byStaff.get(nama)!
    staff.rows.push(r)
    staff.totalQty += qty
    staff.targetCost += pcsCost
    staff.plans.push({
      productNote: (r.product_note as string | null) ?? null,
      product,
      warna,
      qty,
    })
  }

  let created = 0
  for (const [nama, staff] of byStaff) {
    // Avoid duplicates for the same staff + month.
    const { data: existing } = await supabase
      .from('target_jahit')
      .select('id')
      .eq('nama', nama)
      .eq('bulanTahun', bulanTarget)
      .maybeSingle()
    if (existing) continue

    const { data: parent, error: parentErr } = await supabase
      .from('target_jahit')
      .insert({
        nama,
        bulanTahun: bulanTarget,
        posisi: posisiByName.get(nama) ?? null,
        target_monthly: staff.totalQty,
        target_cost_posisi: round0(staff.targetCost),
      })
      .select('id')
      .single()
    if (parentErr || !parent) continue

    const groupedDetails = groupPlannedTargetDetails(staff.plans)
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

  return { created, error: null, approvedFound: (planRows ?? []).length }
}