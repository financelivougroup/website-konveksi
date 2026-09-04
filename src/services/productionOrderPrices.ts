import { supabase } from '@/lib/supabase';

// ===== Tarif eksak per Production Order =====
// Jalur live: work_orders.source_order_id -> production_order_prices.production_order_id
//   -> production_order_price_components(component_key IN ['jahit','obras'])
// Tabel register_po/register_po_components sudah tidak ada di schema live,
// sehingga ini adalah sumber tarif yang benar sekarang.
// Service ini hanya fetch dan mapping; tidak menghitung backlog dan tidak menulis.

const PRICE_TABLE = 'production_order_prices';
const COMPONENT_TABLE = 'production_order_price_components';

export interface SewingRateValue {
  jahit: number;
  obras: number;
  total: number;
}

export type SewingRateByProductionOrder = Map<string, SewingRateValue>;

interface PriceRow {
  id: string;
  production_order_id: string;
}

interface ComponentRow {
  order_price_id: string;
  component_key: string;
  amount_per_piece: number;
}

/**
 * Ambil tarif Jahit + Obras per Production Order dalam dua query.
 * Error dikembalikan eksplisit agar pemanggil dapat menurunkan tarif ke null
 * tanpa menjatuhkan daftar backlog.
 */
export async function fetchSewingRatesByProductionOrder(): Promise<{
  data: SewingRateByProductionOrder;
  error: Error | null;
}> {
  const data: SewingRateByProductionOrder = new Map();

  const { data: priceRows, error: priceErr } = await supabase
    .from(PRICE_TABLE)
    .select('id, production_order_id');
  if (priceErr) return { data, error: priceErr };
  if (!priceRows || priceRows.length === 0) return { data, error: null };

  const typedPrices = priceRows as unknown as PriceRow[];
  const priceIds = typedPrices.map((r) => r.id);
  const { data: componentRows, error: compErr } = await supabase
    .from(COMPONENT_TABLE)
    .select('order_price_id, component_key, amount_per_piece')
    .in('order_price_id', priceIds)
    .in('component_key', ['jahit', 'obras']);
  if (compErr) return { data, error: compErr };

  const componentsByPrice = new Map<string, { jahit: number | null; obras: number | null }>();
  for (const c of (componentRows ?? []) as unknown as ComponentRow[]) {
    if (!componentsByPrice.has(c.order_price_id)) {
      componentsByPrice.set(c.order_price_id, { jahit: null, obras: null });
    }
    const entry = componentsByPrice.get(c.order_price_id)!;
    if (c.component_key === 'jahit') entry.jahit = Number(c.amount_per_piece) || 0;
    else if (c.component_key === 'obras') entry.obras = Number(c.amount_per_piece) || 0;
  }

  for (const price of typedPrices) {
    const entry = componentsByPrice.get(price.id);
    if (!entry) continue;
    // Kedua komponen tidak tersedia => tarif tidak tersedia (bukan Rp0).
    if (entry.jahit == null && entry.obras == null) continue;
    const jahit = entry.jahit ?? 0;
    const obras = entry.obras ?? 0;
    data.set(price.production_order_id, { jahit, obras, total: jahit + obras });
  }

  return { data, error: null };
}
