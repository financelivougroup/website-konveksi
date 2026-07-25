import { supabase } from '@/lib/supabase'

const TABLE = 'master_imports'

export interface MasterImport {
  id: number
  supplier: string
  note: string | null
  source_product: string | null
  product_id: string | null
  kode_produksi: string | null
  status: string
  received_at: string | null
}

export async function fetchAll(): Promise<{ data: MasterImport[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true })
  return { data: data as MasterImport[] | null, error }
}
