import { supabase } from '@/lib/supabase'

const TABLE = 'target_jahit_detail'

export interface TargetJahitDetailRow {
  id: number
  targetJahitId: number
  product: string
  warna: string | null
  qtyTarget: number
  qtyRealisasi: number
  hargaJahit: number
  hargaObras: number
}

function mapRow(row: Record<string, unknown>): TargetJahitDetailRow {
  return {
    id: row.id as number,
    targetJahitId: row.target_jahit_id as number,
    product: row.product as string,
    warna: (row.warna as string | null) ?? null,
    qtyTarget: row.qty_target as number,
    qtyRealisasi: row.qty_realisasi as number,
    hargaJahit: row.harga_jahit as number,
    hargaObras: row.harga_obras as number,
  }
}

function toColumns(input: Omit<TargetJahitDetailRow, 'id'>): Record<string, unknown> {
  return {
    target_jahit_id: input.targetJahitId,
    product: input.product,
    warna: input.warna,
    qty_target: input.qtyTarget,
    qty_realisasi: input.qtyRealisasi,
    harga_jahit: input.hargaJahit,
    harga_obras: input.hargaObras,
  }
}

export async function listByTargetId(
  targetJahitId: number,
): Promise<{ data: TargetJahitDetailRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('target_jahit_id', targetJahitId)
    .order('id', { ascending: true })
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error }
}

export async function fetchAll(): Promise<{ data: TargetJahitDetailRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true })
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error }
}

export async function upsertBatch(
  rows: Array<Omit<TargetJahitDetailRow, 'id'>>,
): Promise<{ error: Error | null }> {
  if (rows.length === 0) return { error: null }
  const { error } = await supabase
    .from(TABLE)
    .upsert(rows.map(toColumns))
  return { error }
}

export async function removeByTarget(targetJahitId: number): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('target_jahit_id', targetJahitId)
  return { error }
}