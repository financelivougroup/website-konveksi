import { supabase } from '@/lib/supabase'
import type { CategoryLevel, ExpenseCategory } from '@/lib/expenseCategories'

const TABLE = 'expense_categories'

function mapRow(row: Record<string, unknown>): ExpenseCategory {
  return {
    id: row.id as number,
    level: row.level as CategoryLevel,
    parentId: (row.parent_id as number | null) ?? null,
    name: row.name as string,
    sortOrder: (row.sort_order as number) ?? 0,
    isActive: (row.is_active as boolean) ?? true,
  }
}

export async function fetchAll(): Promise<{ data: ExpenseCategory[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) return { data: null, error }
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error: null }
}

export interface CreateCategoryInput {
  level: CategoryLevel
  parentId: number | null
  name: string
  /** Urutan tampil. Bila kosong, diletakkan di akhir kelompoknya. */
  sortOrder?: number
}

/**
 * Tambah satu kategori.
 *
 * `parentId` sengaja nullable: hanya tingkat `type` yang induknya NULL, dan
 * kombinasi tingkat/induk yang salah akan DITOLAK trigger database
 * (`expense_categories_check_hierarchy`). Jadi service ini tidak menduplikasi
 * aturan itu — satu sumber kebenaran, yaitu database.
 */
export async function create(input: CreateCategoryInput): Promise<{ data: ExpenseCategory | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      level: input.level,
      parent_id: input.parentId,
      name: input.name.trim(),
      sort_order: input.sortOrder ?? 0,
    })
    .select()
    .single()
  if (error) return { data: null, error }
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error: null }
}

export async function rename(id: number, name: string): Promise<{ data: ExpenseCategory | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) return { data: null, error }
  // Tanpa pemeriksaan ini, penggantian nama yang tidak mengenai baris apa pun
  // akan dilaporkan sukses — idiom yang sama dipakai `removeInvoice`.
  if (!data) return { data: null, error: new Error('Kategori tidak ditemukan.') }
  return { data: mapRow(data as Record<string, unknown>), error: null }
}

/**
 * Aktifkan / nonaktifkan kategori.
 *
 * Ini pengganti penghapusan (keputusan user): kategori yang tidak dipakai lagi
 * disembunyikan dari dropdown, tetapi riwayat transaksi lama yang menunjuknya
 * tetap utuh. Menonaktifkan TIDAK menyentuh anak-anaknya — induk non-aktif
 * hanya menghilang dari pilihan, dan anaknya tetap tersimpan apa adanya sehingga
 * bisa diaktifkan kembali tanpa kehilangan apa pun.
 */
export async function setActive(id: number, isActive: boolean): Promise<{ data: ExpenseCategory | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ is_active: isActive })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) return { data: null, error }
  if (!data) return { data: null, error: new Error('Kategori tidak ditemukan.') }
  return { data: mapRow(data as Record<string, unknown>), error: null }
}

export interface CategoryUsage {
  /** Jumlah anak langsung (satu tingkat di bawahnya). */
  childCount: number
  /** Nama-nama anak langsung, untuk menjelaskan kenapa tidak bisa dihapus. */
  childNames: string[]
}

/**
 * Berapa anak langsung yang dimiliki sebuah kategori.
 *
 * Dipakai halaman untuk memberi tahu user LEBIH DULU bahwa kategori ini masih
 * menaungi anak-anaknya, alih-alih membiarkan mereka menekan tombol lalu
 * mendapat penolakan dari database. FK-nya `ON DELETE RESTRICT`, jadi jumlah
 * anak adalah alasan sebenarnya sebuah kategori tidak bisa dihapus.
 */
export async function fetchUsage(id: number): Promise<{ data: CategoryUsage | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('name')
    .eq('parent_id', id)
  if (error) return { data: null, error }
  const names = ((data as Array<{ name: string }> | null) ?? []).map((row) => row.name)
  return { data: { childCount: names.length, childNames: names }, error: null }
}

/** Hapus satu kategori. */
export async function remove(id: number): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { error }
  return { error: null }
}

/** Seberapa terpakai satu kategori, dipakai sebelum penghapusan massal. */
export interface CategoryUsageDetail {
  id: number
  name: string
  /** Jumlah anak langsung — FK `parent_id` menahan penghapusan bila > 0. */
  childCount: number
  /** Jumlah catatan biaya yang menunjuk kategori ini sebagai kategori ATAU item. */
  entryCount: number
}

/** Batas aman jumlah id per satu permintaan `in(...)`. */
const USAGE_CHUNK = 200

/**
 * Pemakaian beberapa kategori sekaligus.
 *
 * Halaman butuh ini untuk memberi tahu user LEBIH DULU mana yang tidak bisa
 * dihapus, bukan membiarkan mereka menekan Hapus lalu ditolak database:
 * `expense_categories.parent_id` dan kedua FK di `expense_entries`
 * (`category_id`, `item_id`) semuanya `ON DELETE RESTRICT`.
 *
 * Sebuah catatan biaya bisa menunjuk kategori yang sama lewat `category_id` DAN
 * `item_id`; ia dihitung SEKALI per kategori, karena yang dilaporkan ke user
 * adalah "berapa catatan yang memakai kategori ini", bukan berapa kolom yang
 * cocok.
 */
export async function fetchUsageMany(
  ids: readonly number[],
): Promise<{ data: CategoryUsageDetail[] | null; error: Error | null }> {
  if (ids.length === 0) return { data: [], error: null }

  const names = new Map<number, string>()
  const childCounts = new Map<number, number>()
  const entriesByCategory = new Map<number, Set<number>>()

  for (let i = 0; i < ids.length; i += USAGE_CHUNK) {
    const chunk = ids.slice(i, i + USAGE_CHUNK)

    // Dua query terpisah, bukan satu `.or('category_id.in.(…),item_id.in.(…)')`:
    // koma di dalam `in.(…)` bersarang di dalam daftar kondisi `.or()` ambigu
    // untuk dibaca maupun di-debug, dan hasilnya sama saja.
    const [selfResult, childResult, asCategory, asItem] = await Promise.all([
      supabase.from(TABLE).select('id, name').in('id', chunk),
      supabase.from(TABLE).select('id, parent_id').in('parent_id', chunk),
      supabase.from('expense_entries').select('id, category_id').in('category_id', chunk),
      supabase.from('expense_entries').select('id, item_id').in('item_id', chunk),
    ])

    if (selfResult.error) return { data: null, error: selfResult.error }
    if (childResult.error) return { data: null, error: childResult.error }
    if (asCategory.error) return { data: null, error: asCategory.error }
    if (asItem.error) return { data: null, error: asItem.error }

    for (const row of (selfResult.data as Array<{ id: number; name: string }> | null) ?? []) {
      names.set(row.id, row.name)
    }
    for (const row of (childResult.data as Array<{ id: number; parent_id: number | null }> | null) ?? []) {
      if (row.parent_id === null) continue
      childCounts.set(row.parent_id, (childCounts.get(row.parent_id) ?? 0) + 1)
    }
    for (const row of (asCategory.data as Array<{ id: number; category_id: number | null }> | null) ?? []) {
      if (row.category_id === null) continue
      const bucket = entriesByCategory.get(row.category_id) ?? new Set<number>()
      bucket.add(row.id)
      entriesByCategory.set(row.category_id, bucket)
    }
    for (const row of (asItem.data as Array<{ id: number; item_id: number | null }> | null) ?? []) {
      if (row.item_id === null) continue
      const bucket = entriesByCategory.get(row.item_id) ?? new Set<number>()
      bucket.add(row.id)
      entriesByCategory.set(row.item_id, bucket)
    }
  }

  return {
    data: ids.map((id) => ({
      id,
      name: names.get(id) ?? `#${id}`,
      childCount: childCounts.get(id) ?? 0,
      entryCount: entriesByCategory.get(id)?.size ?? 0,
    })),
    error: null,
  }
}
