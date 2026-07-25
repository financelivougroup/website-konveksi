import { supabase } from '@/lib/supabase'

const TABLE = 'register_penjahit'

export interface RegisterPenjahitRow {
  id: number
  pic_penjahit: string
  konveksi_team: string | null
  status: string
}

export async function fetchAll(): Promise<{ data: RegisterPenjahitRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true })
  return { data: data as RegisterPenjahitRow[] | null, error }
}

export async function create(input: Omit<RegisterPenjahitRow, 'id'>): Promise<{ data: RegisterPenjahitRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input)
    .select()
    .single()
  return { data: data as RegisterPenjahitRow | null, error }
}

export async function update(id: number, updates: Partial<RegisterPenjahitRow>): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
  return { error }
}

export async function remove(id: number): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
  return { error }
}
