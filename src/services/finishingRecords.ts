import { supabase } from '@/lib/supabase'
import { generateId } from '@/lib/utils'
import type { FinishingRecord } from '@/types/pipeline'

const TABLE = 'finishing_records'

export async function fetchAll(): Promise<{ data: FinishingRecord[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('synced_at', { ascending: false })
  return { data: data as FinishingRecord[] | null, error }
}

export async function fetchByWorkOrder(workOrderId: string): Promise<{ data: FinishingRecord[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('synced_at', { ascending: false })
  return { data: data as FinishingRecord[] | null, error }
}

export async function create(input: Omit<FinishingRecord, 'id'>): Promise<{ data: FinishingRecord | null; error: Error | null }> {
  const id = await generateId('FR', TABLE)
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ id, ...input })
    .select()
    .single()
  return { data: data as FinishingRecord | null, error }
}
