import { supabase } from '@/lib/supabase';
import type { OrderPriceComponent, OrderPricing } from '@/types/pipeline';

interface PriceRow {
  id: string;
  production_order_id: string;
  total_per_piece: number;
}

interface ComponentRow {
  id: string;
  order_price_id: string;
  component_key: OrderPriceComponent['key'];
  label: string;
  amount_per_piece: number;
  sort_order: number;
}

function mapComponent(row: ComponentRow): OrderPriceComponent {
  return {
    id: row.id,
    key: row.component_key,
    label: row.label,
    value: row.amount_per_piece,
    sortOrder: row.sort_order,
  };
}

export async function fetchOrderPriceByProductionOrderId(
  productionOrderId: string,
): Promise<OrderPricing | null> {
  const { data: price, error } = await supabase
    .from('production_order_prices')
    .select('id, production_order_id, total_per_piece')
    .eq('production_order_id', productionOrderId)
    .maybeSingle<PriceRow>();

  if (error || !price) return null;

  const { data: components, error: componentError } = await supabase
    .from('production_order_price_components')
    .select('id, order_price_id, component_key, label, amount_per_piece, sort_order')
    .eq('order_price_id', price.id)
    .order('sort_order', { ascending: true });

  if (componentError) return null;

  const mapped = ((components ?? []) as ComponentRow[]).map(mapComponent);
  return {
    id: price.id,
    totalPerPiece: price.total_per_piece,
    complete: mapped.length === 8 && price.total_per_piece > 0,
    components: mapped,
  };
}

export async function fetchPriceComponentsByProductionOrderIds(
  productionOrderIds: string[],
): Promise<Map<string, OrderPricing>> {
  const result = new Map<string, OrderPricing>();
  if (productionOrderIds.length === 0) return result;

  const uniqueOrderIds = [...new Set(productionOrderIds.filter(Boolean))];
  const { data: prices, error } = await supabase
    .from('production_order_prices')
    .select('id, production_order_id, total_per_piece')
    .in('production_order_id', uniqueOrderIds);

  if (error || !prices || prices.length === 0) return result;

  const priceRows = prices as PriceRow[];
  const { data: components, error: componentError } = await supabase
    .from('production_order_price_components')
    .select('id, order_price_id, component_key, label, amount_per_piece, sort_order')
    .in('order_price_id', priceRows.map((price) => price.id))
    .order('sort_order', { ascending: true });

  if (componentError) return result;

  const byPriceId = new Map<string, OrderPriceComponent[]>();
  for (const component of (components ?? []) as ComponentRow[]) {
    const current = byPriceId.get(component.order_price_id) ?? [];
    current.push(mapComponent(component));
    byPriceId.set(component.order_price_id, current);
  }

  for (const price of priceRows) {
    const mapped = byPriceId.get(price.id) ?? [];
    result.set(price.production_order_id, {
      id: price.id,
      totalPerPiece: price.total_per_piece,
      complete: mapped.length === 8 && price.total_per_piece > 0,
      components: mapped,
    });
  }

  return result;
}

export function getComponentValue(pricing: OrderPricing | null | undefined, key: OrderPriceComponent['key']): number {
  return pricing?.components.find((component) => component.key === key)?.value ?? 0;
}
