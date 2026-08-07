import { supabase } from '@/lib/supabase'

const TABLE = 'complain_penalti'

export interface ComplainPenaltiRow {
  id: number
  tanggal: string
  product: string
  warna: string | null
  pcs: number
  posisi: string
  pic: string | null
  detailComplain: string | null
  potonganPerPcs: number
  poin: number
  buktiUrl: string | null
  inputBy: string | null
}

function mapRow(row: Record<string, unknown>): ComplainPenaltiRow {
  return {
    id: row.id as number,
    tanggal: row.tanggal as string,
    product: row.product as string,
    warna: (row.warna as string | null) ?? null,
    pcs: row.pcs as number,
    posisi: row.posisi as string,
    pic: (row.pic as string | null) ?? null,
    detailComplain: (row.detail_complain as string | null) ?? null,
    potonganPerPcs: row.potongan_per_pcs as number,
    poin: row.poin as number,
    buktiUrl: (row.bukti_url as string | null) ?? null,
    inputBy: (row.input_by as string | null) ?? null,
  }
}

function toColumns(input: Omit<ComplainPenaltiRow, 'id'>): Record<string, unknown> {
  return {
    tanggal: input.tanggal,
    product: input.product,
    warna: input.warna,
    pcs: input.pcs,
    posisi: input.posisi,
    pic: input.pic,
    detail_complain: input.detailComplain,
    potongan_per_pcs: input.potonganPerPcs,
    poin: input.poin,
    bukti_url: input.buktiUrl,
    input_by: input.inputBy,
  }
}

export async function list(): Promise<{ data: ComplainPenaltiRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true })
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error }
}

export async function create(
  input: Omit<ComplainPenaltiRow, 'id'>,
): Promise<{ data: ComplainPenaltiRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(toColumns(input))
    .select()
    .single()
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error }
}

export async function update(
  id: number,
  updates: Partial<ComplainPenaltiRow>,
): Promise<{ error: Error | null }> {
  const fields: Record<string, unknown> = {}
  if (updates.tanggal !== undefined) fields.tanggal = updates.tanggal
  if (updates.product !== undefined) fields.product = updates.product
  if (updates.warna !== undefined) fields.warna = updates.warna
  if (updates.pcs !== undefined) fields.pcs = updates.pcs
  if (updates.posisi !== undefined) fields.posisi = updates.posisi
  if (updates.pic !== undefined) fields.pic = updates.pic
  if (updates.detailComplain !== undefined) fields.detail_complain = updates.detailComplain
  if (updates.potonganPerPcs !== undefined) fields.potongan_per_pcs = updates.potonganPerPcs
  if (updates.poin !== undefined) fields.poin = updates.poin
  if (updates.buktiUrl !== undefined) fields.bukti_url = updates.buktiUrl
  if (updates.inputBy !== undefined) fields.input_by = updates.inputBy

  const { error } = await supabase.from(TABLE).update(fields).eq('id', id)
  return { error }
}

export async function remove(id: number): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  return { error }
}