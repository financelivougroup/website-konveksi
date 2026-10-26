import {
  productionCodePriceKey,
  type PriceMap,
  type PriceMapValue,
} from '@/lib/targetBenefit'
import type { MissingSalary } from '@/lib/staffSalary'
import { kpiError } from '@/services/kpiSettings'
import { debtAmounts } from '@/lib/staffDebtAmounts'
import { supabase } from '@/lib/supabase'
import * as expenseSvc from '@/services/expenseEntries'

export { productionCodePriceKey }
export type { PriceMap, PriceMapValue }

/** Exact-order prices keyed by normalized Product Note. */
export async function buildPriceMap(): Promise<PriceMap> {
  const map: PriceMap = {}
  const { data: priceRows } = await supabase
    .from('production_order_prices')
    .select('id, production_order_id')
  if (!priceRows || priceRows.length === 0) return map

  const { data: orderRows } = await supabase
    .from('production_orders')
    .select('id, product_note')
    .in('id', priceRows.map((price) => price.production_order_id as string))
  const orderToProductNote = new Map<string, string>()
  for (const order of orderRows ?? []) {
    const key = productionCodePriceKey(order.product_note as string | null)
    if (key) orderToProductNote.set(order.id as string, key)
  }
  const { data: componentRows } = await supabase
    .from('production_order_price_components')
    .select('order_price_id, component_key, amount_per_piece')
    .in('order_price_id', priceRows.map((price) => price.id as string))
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
  realisasiCost: number
  utang: number
  status: 'Utang' | 'Tidak Utang'
}

/** Salary comes from Expense; realization is the same value used by Target Jahit. */
export async function computeDebt(staffName: string, realisasiCost: number): Promise<DebtSummary> {
  const { data: salaryRows } = await expenseSvc.fetchSalaries(staffName)
  const totalTargetCost = (salaryRows ?? []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  return { totalTargetCost, ...debtAmounts(totalTargetCost, realisasiCost) }
}

export interface GenerateTargetsResult {
  created: number
  merged: number
  processedFound: number
  skippedNotApproved: number
  skippedIncomplete: number
  skippedNoSalary: number
  missingSalary: MissingSalary[]
  error: Error | null
}
const EMPTY_GENERATE_RESULT = {
  created: 0, merged: 0, processedFound: 0, skippedNotApproved: 0,
  skippedIncomplete: 0, skippedNoSalary: 0, missingSalary: [] as MissingSalary[],
}

/**
 * Selected approved Planning rows are merged into targets in ONE server transaction.
 * The server rechecks salary eligibility and final-month locks, preserving the
 * existing skip-without-salary behavior without partial parent/detail writes.
 */
export async function generateTargetsFromPlanning(planningIds: number[]): Promise<GenerateTargetsResult> {
  const ids = [...new Set(planningIds.filter((id) => Number.isSafeInteger(id) && id > 0))]
  if (!ids.length) return { ...EMPTY_GENERATE_RESULT, error: null }
  if (ids.length > 200) return { ...EMPTY_GENERATE_RESULT, error: new Error('Maksimal 200 baris Planning per Generate.') }
  try {
    const { data, error } = await supabase.rpc('kpi_generate_targets', { p_ids: ids })
    if (error) return { ...EMPTY_GENERATE_RESULT, error: kpiError(error) }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Respons Generate target tidak valid.')
    const result = data as Record<string, unknown>
    const counts = ['created', 'merged', 'processedFound', 'skippedNotApproved', 'skippedIncomplete', 'skippedNoSalary'] as const
    if (counts.some((key) => !Number.isSafeInteger(result[key]) || Number(result[key]) < 0)
      || !Array.isArray(result.missingSalary)
      || result.missingSalary.some((row: unknown) => !row || typeof row !== 'object' || !('nama' in row) || !('bulan' in row) || typeof row.nama !== 'string' || typeof row.bulan !== 'string')) {
      throw new Error('Respons Generate target tidak valid.')
    }
    return {
      created: Number(result.created), merged: Number(result.merged), processedFound: Number(result.processedFound),
      skippedNotApproved: Number(result.skippedNotApproved), skippedIncomplete: Number(result.skippedIncomplete),
      skippedNoSalary: Number(result.skippedNoSalary), missingSalary: result.missingSalary as MissingSalary[], error: null,
    }
  } catch (error) {
    return { ...EMPTY_GENERATE_RESULT, error: kpiError(error) }
  }
}
