import { supabase } from '@/lib/supabase'

const TABLE = 'daftar_libur'

export interface DaftarLiburRow {
  id: number
  tanggal: string
  hari: string | null
  keterangan: string | null
}

export async function fetchAll(): Promise<{ data: DaftarLiburRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('tanggal', { ascending: true })
  return { data: data as DaftarLiburRow[] | null, error }
}

export async function create(input: Omit<DaftarLiburRow, 'id'>): Promise<{ data: DaftarLiburRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input)
    .select()
    .single()
  return { data: data as DaftarLiburRow | null, error }
}

export async function remove(id: number): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
  return { error }
}
