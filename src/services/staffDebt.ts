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