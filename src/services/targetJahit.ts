import { supabase } from '@/lib/supabase'

const TABLE = 'target_jahit'

export interface TargetJahitRow {
  id: number
  bulan_tahun: string
  nama: string
  posisi: string | null
  salary: number
  total_hari_kerja: number
  hari_kerja_hari_ini: number
  sisa_hari: number
  target_daily: number
  target_ngebut_hari: number
  target_monthly: number
  realisasi_monthly: number
  sisa_target_monthly: number
  progress_monthly: number
  status_final: string | null
  target_cost_posisi: number
  realisasi_cost_posisi: number
  target_accum: number
  realisasi_accum: number
  selisih_accum: number
  target_ngebut_hari_akumulasi: number
  progress_accum: number
  status_final_akumulasi: string | null
}

export async function fetchAll(): Promise<{ data: TargetJahitRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true })
  return { data: data as TargetJahitRow[] | null, error }
}

export async function update(id: number, updates: Partial<TargetJahitRow>): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
  return { error }
}

export async function create(input: Omit<TargetJahitRow, 'id'>): Promise<{ data: TargetJahitRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input)
    .select()
    .single()
  return { data: data as TargetJahitRow | null, error }
}

export async function remove(id: number): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
  return { error }
}
