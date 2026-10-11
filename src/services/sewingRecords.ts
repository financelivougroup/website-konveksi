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

/**
 * Kolom yang boleh diubah dari UI.
 *
 * `work_order_id` dan `work_code` sengaja TIDAK ada di sini. Memindahkan baris
 * ke work order lain akan menyulut trigger
 * `assert_work_order_has_complete_price()` dan — yang lebih halus — membuat
 * angka "sudah terjahit" dua work order sekaligus berubah tanpa jejak. Yang
 * memang sering salah ketik operator adalah jumlah, tanggal, dan nama PIC,
 * jadi hanya itu yang dibuka.
 */
export interface SewingRecordUpdate {
  picPenjahit?: string
  qtySelesai?: number
  tanggalLaporan?: string
  imageName?: string
}

/**
 * Ubah satu baris log jahit.
 *
 * `.select('id')` WAJIB ada. Tanpa itu PostgREST membalas `error: null`
 * walaupun 0 baris cocok — dan sejak policy RLS dibatasi ke owner/finance
 * (lihat supabase/migrations/2026-09-24-production-log-role-restriction.sql),
 * 0 baris adalah jawaban normal bagi role `inventory`. Tanpa pemeriksaan ini
 * aplikasi akan melaporkan "berhasil" palsu.
 */
export async function update(
  id: string,
  updates: SewingRecordUpdate,
): Promise<{ error: Error | null }> {
  const dbUpdates: Record<string, unknown> = {}
  if (updates.picPenjahit !== undefined) dbUpdates.pic_penjahit = updates.picPenjahit
  if (updates.qtySelesai !== undefined) dbUpdates.qty_selesai = updates.qtySelesai
  if (updates.tanggalLaporan !== undefined) dbUpdates.tgl_laporan = updates.tanggalLaporan
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
  // Alasan `.select('id')` sama dengan di `update` di atas: sejak policy RLS
  // dibatasi, penghapusan yang ditolak menghasilkan 0 baris TANPA error, dan
  // pemanggil tidak boleh menganggapnya berhasil.
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
