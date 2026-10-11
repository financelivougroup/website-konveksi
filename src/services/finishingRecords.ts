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
    picFinishing: (row.pic_finishing as string | null) ?? undefined,
    imageName: (row.image_name as string | null) ?? undefined,
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
      pic_finishing: input.picFinishing ?? null,
      image_name: input.imageName ?? null,
    })
    .select()
    .single()
  if (error) return { data: null, error }
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error: null }
}

/** Kolom yang boleh diubah dari UI — lihat penjelasan di `sewingRecords.ts`. */
export interface FinishingRecordUpdate {
  picFinishing?: string
  qtyFinishing?: number
  tanggalImport?: string
  imageName?: string
}

/** Alasan `.select('id')` ada di sini sama dengan di `sewingRecords.update`. */
export async function update(
  id: string,
  updates: FinishingRecordUpdate,
): Promise<{ error: Error | null }> {
  const dbUpdates: Record<string, unknown> = {}
  if (updates.picFinishing !== undefined) dbUpdates.pic_finishing = updates.picFinishing
  if (updates.qtyFinishing !== undefined) dbUpdates.qty_finishing = updates.qtyFinishing
  if (updates.tanggalImport !== undefined) dbUpdates.tgl_import = updates.tanggalImport
  if (updates.imageName !== undefined) dbUpdates.image_name = updates.imageName

  if (Object.keys(dbUpdates).length === 0) return { error: null }

  const { data, error } = await supabase
    .from(TABLE)
    .update(dbUpdates)
    .eq('id', id)
    .select('id')
  if (error) return { error }
  if (!data || data.length === 0) {
    return {
      error: new Error(
        'Tidak ada baris yang berubah. Kemungkinan role Anda tidak berhak mengubah catatan ini, atau barisnya sudah terhapus.',
      ),
    }
  }
  return { error: null }
}

export async function remove(id: string): Promise<{ error: Error | null }> {
  // `.select('id')` wajib: penghapusan yang ditolak policy RLS menghasilkan
  // 0 baris TANPA error, dan itu tidak boleh dilaporkan sebagai berhasil.
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id')
  if (error) return { error }
  if (!data || data.length === 0) {
    return {
      error: new Error(
        'Tidak ada baris yang terhapus. Kemungkinan role Anda tidak berhak menghapus catatan ini, atau barisnya sudah terhapus.',
      ),
    }
  }
  return { error: null }
}