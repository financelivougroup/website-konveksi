import { groupPlannedTargetDetails } from '@/lib/targetDetailIdentity'
import { supabase } from '@/lib/supabase'

export interface PriceMapValue {
  jahit: number
  obras: number
}

export type PriceMap = Record<string, PriceMapValue>

export function productionCodePriceKey(productNote: string | null | undefined): string {
  return productNote?.trim().toLocaleLowerCase('id-ID') ?? ''
}

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

export interface DebtSummary {
  totalGaji: number
  totalNilai: number
  utang: number
  status: 'Utang' | 'Tidak Utang'
}

/**
 * Compute a staff member's debt for the month: salary earned minus nil out
 * from sewing records priced by the product they worked on.
 */
export async function computeDebt(staffName: string): Promise<DebtSummary> {
  // Salary from target_jahit rows for this staff.
  const { data: targetRows } = await supabase
    .from('target_jahit')
    .select('salary')
    .eq('nama', staffName)
  const totalGaji = (targetRows ?? []).reduce(
    (sum, r) => sum + (r.salary as number),
    0,
  )

  const priceMap = await buildPriceMap()

  // All sewing records linked to this staff.
  const { data: sewingRows } = await supabase
    .from('sewing_records')
    .select('work_order_id, qty_selesai')
    .eq('pic_penjahit', staffName)
  const records = (sewingRows ?? []) as Record<string, unknown>[]
  if (records.length === 0) {
    const utang = round0(totalGaji)
    return {
      totalGaji,
      totalNilai: 0,
      utang,
      status: utang > 0 ? 'Utang' : 'Tidak Utang',
    }
  }

  // Resolve the exact production code per work order.
  const workOrderIds = records.map((r) => r.work_order_id as string)
  const { data: workRows } = await supabase
    .from('work_orders')
    .select('id, product_note')
    .in('id', workOrderIds)
  const workOrderPriceKey = new Map<string, string>()
  for (const workOrder of workRows ?? []) {
    const key = productionCodePriceKey(workOrder.product_note as string | null)
    if (key) workOrderPriceKey.set(workOrder.id as string, key)
  }

  let totalNilai = 0
  for (const record of records) {
    const key = workOrderPriceKey.get(record.work_order_id as string)
    const price = key ? priceMap[key] : undefined
    if (!price) continue
    const qty = record.qty_selesai as number
    totalNilai += qty * (price.jahit + price.obras)
  }

  // Nilai bersih = total nilai pcs − potongan valid. A valid potongan is a
  // complain_penalti row for this staff whose posisi is jahit/obras (the only
  // positions that owned this penjahit's output). Potongan finishing/kancing
  // do not affect penjahit.
  let potongan = 0
  const { data: complainRows } = await supabase
    .from('complain_penalti')
    .select('potongan_per_pcs, pcs')
    .eq('pic', staffName)
    .in('posisi', ['jahit', 'obras'])
  for (const c of (complainRows ?? []) as Record<string, unknown>[]) {
    const rate = c.potongan_per_pcs as number
    const count = c.pcs as number
    potongan += rate * count
  }
  const nilaiBersih = totalNilai - potongan

  const utang = round0(totalGaji - nilaiBersih)
  return {
    totalGaji,
    totalNilai: nilaiBersih,
    utang,
    status: utang > 0 ? 'Utang' : 'Tidak Utang',
  }
}

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