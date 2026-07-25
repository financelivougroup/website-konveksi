import { supabase } from '@/lib/supabase'

const TABLE = 'master_products'

export interface MasterProduct {
  id: number
  brand: string
  product_id: string
  product: string
  category: string | null
  status_product: string
  warning_stock: string | null
}

export async function fetchAll(): Promise<{ data: MasterProduct[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true })
  return { data: data as MasterProduct[] | null, error }
}
