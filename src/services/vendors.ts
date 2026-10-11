import { supabase } from '@/lib/supabase'

const TABLE = 'vendors'

/** Satu vendor seperti yang dipakai UI (camelCase, mengikuti viewConfig). */
export interface VendorRow {
  id: number
  nama: string
  kontak?: string | null
  catatan?: string | null
  status: string
}

export const STATUS_OPTIONS = ['Aktif', 'Non-Aktif']

function mapRow(row: Record<string, unknown>): VendorRow {
  return {
    id: row.id as number,
    nama: row.nama as string,
    kontak: (row.kontak as string | null) ?? null,
    catatan: (row.catatan as string | null) ?? null,
    status: (row.status as string) ?? 'Aktif',
  }
}

export async function fetchAll(): Promise<{ data: VendorRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('nama', { ascending: true })
  if (error) return { data: null, error }
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error: null }
}

/**
 * Vendor aktif saja — dipakai dropdown di form Expense.
 *
 * Vendor non-aktif sengaja disembunyikan supaya tidak terpilih lagi, sama
 * seperti kategori. Riwayat catatan biaya lama tetap utuh karena nama vendor
 * disalin ke baris.
 */
export async function fetchActive(): Promise<{ data: VendorRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('status', 'Aktif')
    .order('nama', { ascending: true })
  if (error) return { data: null, error }
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error: null }
}

export async function create(input: Omit<VendorRow, 'id'>): Promise<{ data: VendorRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      nama: input.nama.trim(),
      kontak: input.kontak?.trim() || null,
      catatan: input.catatan?.trim() || null,
      status: input.status ?? 'Aktif',
    })
    .select()
    .single()
  if (error) return { data: null, error }
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error: null }
}

export async function update(id: number, updates: Partial<VendorRow>): Promise<{ data: VendorRow | null; error: Error | null }> {
  const dbUpdates: Record<string, unknown> = {}
  if (updates.nama !== undefined) dbUpdates.nama = updates.nama.trim()
  if (updates.kontak !== undefined) dbUpdates.kontak = updates.kontak?.trim() || null
  if (updates.catatan !== undefined) dbUpdates.catatan = updates.catatan?.trim() || null
  if (updates.status !== undefined) dbUpdates.status = updates.status

  const { data, error } = await supabase
    .from(TABLE)
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) return { data: null, error }
  // Tanpa pemeriksaan ini, pengubahan yang tidak mengenai baris apa pun akan
  // dilaporkan sukses — idiom yang sama dipakai `removeInvoice`.
  if (!data) return { data: null, error: new Error('Vendor tidak ditemukan.') }
  return { data: mapRow(data as Record<string, unknown>), error: null }
}

export interface VendorUsage {
  /** Jumlah catatan biaya yang memakai vendor ini. */
  entryCount: number
}

/**
 * Berapa catatan biaya yang memakai vendor ini.
 *
 * Dipakai halaman untuk memberi tahu user LEBIH DULU bahwa vendor masih dipakai,
 * alih-alih membiarkan mereka menekan tombol lalu ditolak database. FK-nya
 * `ON DELETE RESTRICT`, jadi jumlah pemakaian adalah alasan sebenarnya sebuah
 * vendor tidak bisa dihapus.
 */
export async function fetchUsage(id: number): Promise<{ data: VendorUsage | null; error: Error | null }> {
  const { count, error } = await supabase
    .from('expense_entries')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_id', id)
  if (error) return { data: null, error }
  return { data: { entryCount: count ?? 0 }, error: null }
}

/** Hapus satu vendor. */
export async function remove(id: number): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { error }
  return { error: null }
}

/** Pemakaian beberapa vendor sekaligus, untuk pemeriksaan sebelum hapus massal. */
export interface VendorUsageDetail {
  id: number
  nama: string
  /** Jumlah catatan biaya yang menunjuk vendor ini (`vendor_id`). */
  entryCount: number
}

/** Batas aman jumlah id per satu permintaan `in(...)`. */
const USAGE_CHUNK = 200

/**
 * Pemakaian beberapa vendor sekaligus.
 *
 * `expense_entries.vendor_id` adalah FK `ON DELETE RESTRICT`, jadi menghitung
 * pemakaian lebih dulu adalah satu-satunya cara memberi tahu user mana yang
 * tidak bisa dihapus tanpa membiarkan database menolaknya lebih dulu. Satu
 * query `in(...)` untuk semua id sekaligus, dipecah per `USAGE_CHUNK` agar
 * panjang URL tetap aman bila suatu saat vendornya banyak.
 */
export async function fetchUsageMany(
  ids: readonly number[],
): Promise<{ data: VendorUsageDetail[] | null; error: Error | null }> {
  if (ids.length === 0) return { data: [], error: null }

  const names = new Map<number, string>()
  const counts = new Map<number, number>()

  for (let i = 0; i < ids.length; i += USAGE_CHUNK) {
    const chunk = ids.slice(i, i + USAGE_CHUNK)

    const [selfResult, entryResult] = await Promise.all([
      supabase.from(TABLE).select('id, nama').in('id', chunk),
      supabase.from('expense_entries').select('vendor_id').in('vendor_id', chunk),
    ])

    if (selfResult.error) return { data: null, error: selfResult.error }
    if (entryResult.error) return { data: null, error: entryResult.error }

    for (const row of (selfResult.data as Array<{ id: number; nama: string }> | null) ?? []) {
      names.set(row.id, row.nama)
    }
    for (const row of (entryResult.data as Array<{ vendor_id: number | null }> | null) ?? []) {
      if (row.vendor_id === null) continue
      counts.set(row.vendor_id, (counts.get(row.vendor_id) ?? 0) + 1)
    }
  }

  return {
    data: ids.map((id) => ({
      id,
      nama: names.get(id) ?? `#${id}`,
      entryCount: counts.get(id) ?? 0,
    })),
    error: null,
  }
}
