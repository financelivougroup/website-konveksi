import { supabase } from '@/lib/supabase'
import { generateId } from '@/lib/utils'
import type { ProductionOrder } from '@/types/pipeline'

const TABLE = 'production_orders'

function mapRow(row: Record<string, unknown>): ProductionOrder {
  return {
    id: row.id as string,
    workCode: row.work_code as string,
    productNote: row.product_note as string,
    product: row.product as string,
    informationVariation: row.information_variation as string,
    warna: row.warna as string,
    size: row.size as string,
    brand: row.brand as string,
    quantity: row.quantity as number,
    status: row.status as 'PLANNING' | 'PULLED' | 'CANCELLED',
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    pulledAt: row.pulled_at as string,
    pulledBy: row.pulled_by as string,
  }
}

function toSnake(input: Omit<ProductionOrder, 'id'>): Record<string, unknown> {
  return {
    work_code: input.workCode,
    product_note: input.productNote,
    product: input.product,
    information_variation: input.informationVariation,
    warna: input.warna,
    size: input.size,
    brand: input.brand,
    quantity: input.quantity,
    status: input.status,
    created_by: input.createdBy,
    created_at: input.createdAt,
    pulled_at: input.pulledAt,
    pulled_by: input.pulledBy,
  }
}

export async function fetchAll(): Promise<{ data: ProductionOrder[] | null; error: Error | null }> {
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false })
  return { data: (data as Record<string, unknown>[])?.map(mapRow) || null, error }
}

export async function fetchById(id: string): Promise<{ data: ProductionOrder | null; error: Error | null }> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single()
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error }
}

export async function create(input: Omit<ProductionOrder, 'id'>): Promise<{ data: ProductionOrder | null; error: Error | null }> {
  const id = await generateId('PO', TABLE)
  console.log('[productionOrders.create] id:', id, 'input:', input);
  const { data, error } = await supabase.from(TABLE).insert({ id, ...toSnake(input) }).select().single()
  console.log('[productionOrders.create] result:', { data, error });
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error }
}

export async function update(id: string, updates: Partial<ProductionOrder>): Promise<{ error: Error | null }> {
  const db: Record<string, unknown> = {}
  if (updates.status !== undefined) db.status = updates.status
  if (updates.pulledAt !== undefined) db.pulled_at = updates.pulledAt
  if (updates.pulledBy !== undefined) db.pulled_by = updates.pulledBy
  console.log('[productionOrders.update] id:', id, 'db:', db, 'table:', TABLE);
  const { data, error } = await supabase.from(TABLE).update(db).eq('id', id).select();
  console.log('[productionOrders.update] result:', { data, error });
  return { error }
}

export async function remove(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  return { error }
}

export async function fetchProductionOrdersWaitingRegisterPo(): Promise<Array<{ id: string; workCode: string; product: string; brand: string; quantity: number }>> {
  // Work Orders in RAW DATA that don't have a register_po yet.
  // source_order_id on work_orders = the production order ID used in register_po.production_order_id

  // Get all PO IDs that already have register_po
  const { data: existingRp } = await supabase
    .from('register_po')
    .select('production_order_id');
  const alreadyRegisteredPoIds = new Set((existingRp as Array<{ production_order_id: string }> | null)?.map((r) => r.production_order_id) ?? []);

  // Get all WO — use source_order_id as the link to production_orders
  const { data: woData, error: woError } = await supabase
    .from('work_orders')
    .select('id, work_code, product, brand, quantity, source_order_id')
    .order('created_at', { ascending: false });

  if (woError || !woData) return [];

  // Filter: WO whose source_order_id is NOT already in register_po
  return (woData as Array<{ id: string; work_code: string; product: string; brand: string; quantity: number; source_order_id: string }>)
    .filter((w) => w.source_order_id && !alreadyRegisteredPoIds.has(w.source_order_id))
    .map((w) => ({ id: w.source_order_id, workCode: w.work_code, product: w.product, brand: w.brand, quantity: w.quantity }));
}

export async function pullToKonveksi(id: string, pulledBy: string): Promise<{ error: Error | null }> {
  console.log('[pullToKonveksi] updating PO id:', id, 'to PULLED');
  const { data, error } = await supabase.from(TABLE).update({
    status: 'PULLED',
    pulled_at: new Date().toISOString(),
    pulled_by: pulledBy,
  }).eq('id', id).select();
  console.log('[pullToKonveksi] result:', { data, error });
  return { error }
}
