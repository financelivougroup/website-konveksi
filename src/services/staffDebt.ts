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

  const utang = round0(totalGaji - totalNilai)
  return {
    totalGaji,
    totalNilai,
    utang,
    status: utang > 0 ? 'Utang' : 'Tidak Utang',
  }
}

export interface GenerateTargetsResult {
  created: number
  error: Error | null
}

/**
 * Generate target_jahid parent rows + target_jahid_detail rows from planning_produksi
 * for a given bulanTarget. Skips staff who already have a target row for that month.
 */
export async function generateTargetsFromPlanning(
  bulanTarget: string,
): Promise<GenerateTargetsResult> {
  const priceMap = await buildPriceMap()

  const { data: planRows, error: planErr } = await supabase
    .from('planning_produksi')
    .select('*')
    .eq('bulan_target', bulanTarget)
  if (planErr) return { created: 0, error: planErr }

  // Group planning rows by staff.
  const byStaff = new Map<string, {
    rows: Record<string, unknown>[],
    totalQty: number,
    targetCost: number,
    products: Map<string, { product: string; qty: number; warna: string | null }>,
  }>()
  for (const r of (planRows ?? []) as Record<string, unknown>[]) {
    const nama = r.nama_penjahit as string
    const product = r.product as string
    const qty = r.qty as number
    const warna = (r.warna as string | null) ?? null
    const price = priceMap[product]
    const pcsCost = (price ? price.jahit + price.obras : 0) * qty

    if (!byStaff.has(nama)) {
      byStaff.set(nama, { rows: [], totalQty: 0, targetCost: 0, products: new Map() })
    }
    const staff = byStaff.get(nama)!
    staff.rows.push(r)
    staff.totalQty += qty
    staff.targetCost += pcsCost
    const key = product + '|' + (warna ?? '')
    const existing = staff.products.get(key)
    if (existing) existing.qty += qty
    else staff.products.set(key, { product, qty, warna })
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
        target_monthly: staff.totalQty,
        target_cost_posisi: round0(staff.targetCost),
      })
      .select('id')
      .single()
    if (parentErr || !parent) continue

    const details = Array.from(staff.products.values()).map((p) => {
      const price = priceMap[p.product]
      return {
        target_jahit_id: parent.id as number,
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

  return { created, error: null }
}