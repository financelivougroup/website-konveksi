import { supabase } from '@/lib/supabase'
import { generateId } from '@/lib/utils'
import type { FinishingRecord } from '@/types/pipeline'

const TABLE = 'finishing_records'

function mapRow(row: Record<string, unknown>): FinishingRecord {
  return {
    id: row.id as string,
    workOrderId: row.work_order_id as string,
    qtyFinishing: row.qty_finishing as number,
    tanggalImport: row.tgl_import as string,
    syncedAt: row.synced_at as string,
    source: row.source as string,
    syncStatus: (row.sync_status as FinishingRecord['syncStatus']) ?? 'OK',
    inputBy: (row.input_by as string | null) ?? undefined,
  }
}

export async function fetchAll(): Promise<{ data: FinishingRecord[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('synced_at', { ascending: false })
  if (error) return { data: null, error }
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error: null }
}

export async function fetchByWorkOrder(workOrderId: string): Promise<{ data: FinishingRecord[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('synced_at', { ascending: false })
  if (error) return { data: null, error }
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error: null }
}

export async function create(input: Omit<FinishingRecord, 'id'>): Promise<{ data: FinishingRecord | null; error: Error | null }> {
  const id = await generateId('FR', TABLE)
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      id,
      work_order_id: input.workOrderId,
      qty_finishing: input.qtyFinishing,
      tgl_import: input.tanggalImport,
      synced_at: input.syncedAt || new Date().toISOString(),
      source: input.source,
      sync_status: input.syncStatus,
      input_by: input.inputBy ?? null,
    })
    .select()
    .single()
  if (error) return { data: null, error }
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error: null }
}

export async function remove(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  return { error }
}