import { supabase } from '@/lib/supabase'
import { generateId } from '@/lib/utils'
import type { KancingRecord } from '@/types/pipeline'

const TABLE = 'kancing_records'

function mapRow(row: Record<string, unknown>): KancingRecord {
  return {
    id: row.id as string,
    workOrderId: row.work_order_id as string,
    workCode: (row.work_code as string | null) ?? '',
    picKancing: row.pic_kancing as string,
    qtyKancing: row.qty_kancing as number,
    tanggalLaporan: row.tgl_laporan as string,
    inputBy: (row.input_by as string | null) ?? undefined,
    inputAt: row.input_at as string,
    imageUrl: (row.image_url as string | null) ?? undefined,
    imageName: (row.image_name as string | null) ?? undefined,
  }
}

export async function fetchAll(): Promise<{ data: KancingRecord[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('input_at', { ascending: false })
  if (error) return { data: null, error }
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error: null }
}

export async function fetchByWorkOrder(workOrderId: string): Promise<{ data: KancingRecord[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('input_at', { ascending: false })
  if (error) return { data: null, error }
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error: null }
}

export async function create(input: Omit<KancingRecord, 'id'>): Promise<{ data: KancingRecord | null; error: Error | null }> {
  const id = await generateId('KR', TABLE)
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      id,
      work_order_id: input.workOrderId,
      work_code: input.workCode,
      pic_kancing: input.picKancing,
      qty_kancing: input.qtyKancing,
      tgl_laporan: input.tanggalLaporan,
      input_by: input.inputBy ?? null,
      input_at: input.inputAt || new Date().toISOString(),
      image_url: input.imageUrl ?? '',
      image_name: input.imageName ?? '',
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
