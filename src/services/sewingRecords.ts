import { supabase } from '@/lib/supabase'
import { generateId } from '@/lib/utils'
import type { SewingRecord } from '@/types/pipeline'

const TABLE = 'sewing_records'

function mapRow(row: Record<string, unknown>): SewingRecord {
  return {
    id: row.id as string,
    workOrderId: row.work_order_id as string,
    workCode: row.work_code as string,
    picPenjahit: row.pic_penjahit as string,
    qtySelesai: row.qty_selesai as number,
    tanggalLaporan: row.tgl_laporan as string,
    inputBy: row.input_by as string,
    inputAt: row.input_at as string,
    imageUrl: row.image_url as string,
    imageName: row.image_name as string,
  }
}

export async function fetchAll(): Promise<{ data: SewingRecord[] | null; error: Error | null }> {
  const { data, error } = await supabase.from(TABLE).select('*').order('input_at', { ascending: false })
  return { data: (data as Record<string, unknown>[])?.map(mapRow) || null, error }
}

export async function fetchByWorkOrder(workOrderId: string): Promise<{ data: SewingRecord[] | null; error: Error | null }> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('work_order_id', workOrderId).order('tgl_laporan', { ascending: false })
  return { data: (data as Record<string, unknown>[])?.map(mapRow) || null, error }
}

export async function create(input: Omit<SewingRecord, 'id'>): Promise<{ data: SewingRecord | null; error: Error | null }> {
  const id = await generateId('SR', TABLE)
  const { data, error } = await supabase.from(TABLE).insert({
    id,
    work_order_id: input.workOrderId,
    work_code: input.workCode,
    pic_penjahit: input.picPenjahit,
    qty_selesai: input.qtySelesai,
    tgl_laporan: input.tanggalLaporan,
    input_by: input.inputBy,
    input_at: input.inputAt,
    image_url: input.imageUrl,
    image_name: input.imageName,
  }).select().single()
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error }
}

export async function remove(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  return { error }
}
