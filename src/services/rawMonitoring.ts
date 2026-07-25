import { supabase } from '@/lib/supabase'

const TABLE = 'raw_product_monitoring'

export interface RawMonitoring {
  id: number
  product_id: string
  product: string
  warna: string | null
  size: string | null
  available_quantity: number
  status_stock_final: string | null
  sisa_cutting: number
  prioritas_dalam_proses: string | null
  prioritas_tunggu_prdn: string | null
  prioritas_tunggu_whlb: string | null
  brand: string | null
  source: string | null
}

export async function fetchAll(): Promise<{ data: RawMonitoring[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true })
  return { data: data as RawMonitoring[] | null, error }
}
