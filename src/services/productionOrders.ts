import { supabase } from '@/lib/supabase';
import type {
  OrderEntryDetail,
  OrderEntryOverview,
  OrderEntrySaveInput,
} from '@/types/pipeline';

export async function fetchAll(): Promise<{ data: OrderEntryOverview[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('order_entry_list');
  if (error) return { data: null, error };
  return { data: (data ?? []) as OrderEntryOverview[], error: null };
}

export async function fetchById(id: string): Promise<{ data: OrderEntryDetail | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('order_entry_get', { p_order_id: id });
  if (error) return { data: null, error };
  return { data: (data as OrderEntryDetail | null) ?? null, error: null };
}

export async function save(input: OrderEntrySaveInput): Promise<{ data: OrderEntryDetail | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('order_entry_save', {
    p_order_id: input.id ?? null,
    p_production_code: input.productionCode,
    p_product_id: input.productId,
    p_product: input.product,
    p_brand: input.brand,
    p_variations: input.variations,
    p_components: input.components,
    p_actor: input.actor,
  });

  if (error) return { data: null, error };
  return { data: data as OrderEntryDetail, error: null };
}

export async function cancel(id: string, actor: string): Promise<{ data: OrderEntryDetail | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('cancel_production_order', {
    p_production_order_id: id,
    p_actor: actor,
  });
  if (error) return { data: null, error };
  return { data: data as OrderEntryDetail, error: null };
}
