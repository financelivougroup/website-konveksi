import { supabase } from '@/lib/supabase'

const TABLE = 'register_penjahit'

// Row shape used by the UI (camelCase, matches viewConfig keys).
export interface RegisterPenjahitRow {
  id: number
  picPenjahit: string
  konveksiTeam: string | null
  posisi: string | null
  status: string
}

export const POSISI_OPTIONS = ['Leader', 'Penjahit', 'Finishing']

function mapRow(row: Record<string, unknown>): RegisterPenjahitRow {
  return {
    id: row.id as number,
    picPenjahit: row.pic_penjahit as string,
    konveksiTeam: (row.konveksi_team as string | null) ?? null,
    posisi: (row.posisi as string | null) ?? null,
    status: (row.status as string) ?? 'Aktif',
  }
}

export async function fetchAll(): Promise<{ data: RegisterPenjahitRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true })
  if (error) return { data: null, error }
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error: null }
}

export async function create(input: Omit<RegisterPenjahitRow, 'id'>): Promise<{ data: RegisterPenjahitRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      pic_penjahit: input.picPenjahit,
      konveksi_team: input.konveksiTeam,
      posisi: input.posisi,
      status: input.status ?? 'Aktif',
    })
    .select()
    .single()
  if (error) return { data: null, error }
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error: null }
}

export async function update(id: number, updates: Partial<RegisterPenjahitRow>): Promise<{ error: Error | null }> {
  const dbUpdates: Record<string, unknown> = {}
  if (updates.picPenjahit !== undefined) dbUpdates.pic_penjahit = updates.picPenjahit
  if (updates.konveksiTeam !== undefined) dbUpdates.konveksi_team = updates.konveksiTeam
  if (updates.posisi !== undefined) dbUpdates.posisi = updates.posisi
  if (updates.status !== undefined) dbUpdates.status = updates.status
  const { error } = await supabase
    .from(TABLE)
    .update(dbUpdates)
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
