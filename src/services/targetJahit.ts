import { supabase } from '@/lib/supabase'

const TABLE = 'target_jahit'

export interface TargetJahitRow {
  id: number
  bulan_tahun: string
  nama: string
  posisi: string | null
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
  /**
   * @deprecated Kolom ini TIDAK LAGI DITULIS. Nilainya kini adalah GAJI bulan itu,
   * yang dibaca dari `expense_entries` (kategori MANPOWER › SALARY) dan disuntikkan
   * oleh `enrichTargetRows` — lihat `src/lib/staffSalary.ts`.
   *
   * Kolom DB-nya sengaja dibiarkan ada dan sudah di-NULL-kan (permintaan user:
   * "di null kan saja"), jadi jangan membaca nilainya langsung dari sini; bacalah
   * `EnrichedTargetRow.target_cost_posisi` / `salaryAmount` sebagai gantinya.
   */
  target_cost_posisi: number
  realisasi_cost_posisi: number
  target_accum: number
  realisasi_accum: number
  selisih_accum: number
  target_ngebut_hari_akumulasi: number
  progress_accum: number
  status_final_akumulasi: string | null
  /**
   * @deprecated Tidak dipakai lagi. Tarif benefit sekarang per DESAIN dan
   * diambil dari Register Harga (harga jahit + obras) — lihat
   * `src/lib/targetBenefit.ts`. Kolom DB-nya sengaja dibiarkan ada; `fetchAll`
   * memakai `select('*')` sehingga nilainya tetap ikut terbaca.
   */
  benefit_per_pcs: number | null
}

// Live schema quirk: kolom bulan di DB bernama 'bulanTahun' (camelCase),
// satu-satunya kolom yang tidak snake_case di tabel ini. Normalisasi ke
// 'bulan_tahun' di sini supaya semua pemakai (page, enrichment lib) konsisten.
function normalizeRow(row: Record<string, unknown>): TargetJahitRow {
  const out = { ...row } as Record<string, unknown>
  if (out.bulan_tahun == null && out.bulanTahun != null) {
    out.bulan_tahun = out.bulanTahun
  }
  return out as unknown as TargetJahitRow
}

export async function fetchAll(): Promise<{ data: TargetJahitRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true })
  return { data: (data as Record<string, unknown>[] | null)?.map(normalizeRow) ?? null, error }
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
