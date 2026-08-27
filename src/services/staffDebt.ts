import { groupPlannedTargetDetails } from '@/lib/targetDetailIdentity'
import { supabase } from '@/lib/supabase'

export interface PriceMapValue {
  jahit: number
  obras: number
}

export type PriceMap = Record<string, PriceMapValue>

/**
 * Build a price map per product from Register PO components.
 * Components keyed 'jahit' and 'obras' are read from register_po_components,
 * attached to a product via register_po.production_order_id -> production_orders.product.
 * If multiple POs exist for a product, the latest (by updated_at) wins.
 */
export async function buildPriceMap(): Promise<PriceMap> {
  const map: PriceMap = {}

  const { data: poRows } = await supabase
    .from('register_po')
    .select('id, production_order_id, updated_at')
    .order('updated_at', { ascending: false })
  if (!poRows || poRows.length === 0) return map

  const poIds = poRows.map((p) => p.id as string)
  const orderIds = poRows.map((p) => p.production_order_id as string)

  // Resolve product per production order.
  const orderToProduct = new Map<string, string>()
  const { data: orderRows } = await supabase
    .from('production_orders')
    .select('id, product')
    .in('id', orderIds)
  if (orderRows) {
    for (const o of orderRows) {
      orderToProduct.set(o.id as string, o.product as string)
    }
  }

  // Read jahit + obras components for all POs in one go.
  const { data: compRows } = await supabase
    .from('register_po_components')
    .select('register_po_id, key, value')
    .in('register_po_id', poIds)
    .in('key', ['jahit', 'obras'])
  const compsByPo = new Map<string, { jahit: number; obras: number }>()
  if (compRows) {
    for (const c of compRows as Record<string, unknown>[]) {
      const poId = c.register_po_id as string
      const key = c.key as string
      const value = c.value as number
      if (!compsByPo.has(poId)) compsByPo.set(poId, { jahit: 0, obras: 0 })
      const entry = compsByPo.get(poId)!
      if (key === 'jahit') entry.jahit = value
      else if (key === 'obras') entry.obras = value
    }
  }

  // Register_po is ordered updated_at desc -> first occurrence wins (latest).
  for (const p of poRows) {
    const product = orderToProduct.get(p.production_order_id as string)
    if (!product) continue
    if (map[product]) continue
    const comp = compsByPo.get(p.id as string)
    if (!comp) continue
    map[product] = { jahit: comp.jahit, obras: comp.obras }
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

  // Resolve product per work order.
  const workOrderIds = records.map((r) => r.work_order_id as string)
  const { data: workRows } = await supabase
    .from('work_orders')
    .select('id, product')
    .in('id', workOrderIds)
  const workProduct = new Map<string, string>()
  if (workRows) {
    for (const w of workRows) {
      workProduct.set(w.id as string, w.product as string)
    }
  }

  let totalNilai = 0
  for (const r of records) {
    const product = workProduct.get(r.work_order_id as string)
    if (!product) continue
    const price = priceMap[product]
    if (!price) continue
    const qty = r.qty_selesai as number
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
    const price = priceMap[product]
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
      const price = priceMap[p.product]
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