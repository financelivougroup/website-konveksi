import { supabase } from '@/lib/supabase'
import { generateId } from '@/lib/utils'
import type { WorkOrder } from '@/types/pipeline'

const TABLE = 'work_orders'

function mapRow(row: Record<string, unknown>): WorkOrder {
  return {
    id: row.id as string,
    workCode: row.work_code as string,
    sourceOrderId: row.source_order_id as string,
    productionOrderId: (row.production_order_id as string) ?? undefined,
    productNote: row.product_note as string,
    productNoteFull: row.product_note_full as string,
    product: row.product as string,
    productId: row.product_id as string,
    variationId: row.variation_id as string,
    informationVariation: row.information_variation as string,
    warna: row.warna as string,
    size: row.size as string,
    brand: row.brand as string,
    quantity: row.quantity as number,
    productionStatus: row.prod_status as WorkOrder['productionStatus'],
    invoiceStatus: row.invoice_status as WorkOrder['invoiceStatus'],
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    pulledAt: row.pulled_at as string,
  }
}

export async function fetchAll(): Promise<{ data: WorkOrder[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
  return { data: (data as Record<string, unknown>[])?.map(mapRow) || null, error }
}

export async function fetchById(id: string): Promise<{ data: WorkOrder | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single()
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error }
}

export async function create(input: Omit<WorkOrder, 'id'>): Promise<{ data: WorkOrder | null; error: Error | null }> {
  const id = await generateId('WO', TABLE)
  const dbInput = {
    id,
    work_code: input.workCode,
    source_order_id: input.sourceOrderId,
    production_order_id: input.productionOrderId ?? null,
    product_note: input.productNote,
    product_note_full: input.productNoteFull,
    product: input.product,
    product_id: input.productId,
    variation_id: input.variationId,
    information_variation: input.informationVariation,
    warna: input.warna,
    size: input.size,
    brand: input.brand,
    quantity: input.quantity,
    prod_status: input.productionStatus,
    invoice_status: input.invoiceStatus,
    created_by: input.createdBy,
    created_at: input.createdAt,
    pulled_at: input.pulledAt,
  }
  const { data, error } = await supabase
    .from(TABLE)
    .insert(dbInput)
    .select()
    .single()
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error }
}

export async function update(id: string, updates: Partial<WorkOrder>): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
  return { error }
}

export async function remove(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
  return { error }
}

export async function updateProdStatus(id: string, prodStatus: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from(TABLE)
    .update({ prod_status: prodStatus })
    .eq('id', id)
  return { error }
}

export async function fetchByStatus(status: string): Promise<{ data: WorkOrder[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('prod_status', status)
    .order('created_at', { ascending: false })
  return { data: data as WorkOrder[] | null, error }
}
