import { supabase } from '@/lib/supabase'

const TABLE = 'planning_produksi'

export interface PlanningProduksiRow {
  id: number
  namaPenjahit: string
  product: string
  warna: string | null
  qty: number
  bulanTarget: string
  status: string
}

function mapRow(row: Record<string, unknown>): PlanningProduksiRow {
  return {
    id: row.id as number,
    namaPenjahit: row.nama_penjahit as string,
    product: row.product as string,
    warna: (row.warna as string | null) ?? null,
    qty: row.qty as number,
    bulanTarget: row.bulan_target as string,
    status: row.status as string,
  }
}

function toColumns(input: Omit<PlanningProduksiRow, 'id'>): Record<string, unknown> {
  return {
    nama_penjahit: input.namaPenjahit,
    product: input.product,
    warna: input.warna,
    qty: input.qty,
    bulan_target: input.bulanTarget,
    status: input.status,
  }
}

export async function list(
  bulanTarget?: string,
): Promise<{ data: PlanningProduksiRow[] | null; error: Error | null }> {
  let query = supabase.from(TABLE).select('*')
  if (bulanTarget) {
    query = query.eq('bulan_target', bulanTarget)
  }
  query = query.order('id', { ascending: true })
  const { data, error } = await query
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error }
}

export async function create(
  input: Omit<PlanningProduksiRow, 'id'>,
): Promise<{ data: PlanningProduksiRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(toColumns(input))
    .select()
    .single()
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error }
}

export async function update(
  id: number,
  updates: Partial<PlanningProduksiRow>,
): Promise<{ error: Error | null }> {
  const fields: Record<string, unknown> = {}
  if (updates.namaPenjahit !== undefined) fields.nama_penjahit = updates.namaPenjahit
  if (updates.product !== undefined) fields.product = updates.product
  if (updates.warna !== undefined) fields.warna = updates.warna
  if (updates.qty !== undefined) fields.qty = updates.qty
  if (updates.bulanTarget !== undefined) fields.bulan_target = updates.bulanTarget
  if (updates.status !== undefined) fields.status = updates.status

  const { error } = await supabase.from(TABLE).update(fields).eq('id', id)
  return { error }
}

export async function remove(id: number): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  return { error }
}