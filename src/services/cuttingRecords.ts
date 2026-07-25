import { supabase } from '@/lib/supabase'
import type { CuttingRecord } from '@/types/pipeline'
import { generateId } from '@/lib/utils'

const TABLE = 'cutting_records'

function mapRow(row: Record<string, unknown>): CuttingRecord {
  return {
    id: row.id as string,
    workOrderId: row.work_order_id as string,
    totalCutting: row.total_cutting as number,
    sisaCutting: row.sisa_cutting as number,
    inputBy: row.input_by as string,
    inputAt: row.input_at as string,
    locked: row.locked as boolean,
  }
}

export async function fetchAll(): Promise<{ data: CuttingRecord[] | null; error: Error | null }> {
  const { data, error } = await supabase.from(TABLE).select('*').order('input_at', { ascending: false })
  return { data: (data as Record<string, unknown>[])?.map(mapRow) || null, error }
}

export async function fetchByWorkOrder(workOrderId: string): Promise<{ data: CuttingRecord | null; error: Error | null }> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('work_order_id', workOrderId).maybeSingle()
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error }
}

export async function create(input: Omit<CuttingRecord, 'id'>): Promise<{ data: CuttingRecord | null; error: Error | null }> {
  const id = await generateId('CR', TABLE)
  const { data, error } = await supabase.from(TABLE).insert({
    id,
    work_order_id: input.workOrderId,
    total_cutting: input.totalCutting,
    sisa_cutting: input.sisaCutting,
    input_by: input.inputBy,
    input_at: input.inputAt,
    locked: input.locked ?? true,
  }).select().single()
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error }
}

export async function remove(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  return { error }
}
