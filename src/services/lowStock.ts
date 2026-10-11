import { supabase } from '@/lib/supabase';
import { readCompleteSources, readKeysetPages } from '@/lib/readKeysetPages';
import type { LowStockSnapshot } from '@/types/lowStock';

type DbRow = Record<string, unknown> & { id: string | number };

async function readRows(table: string, columns: string): Promise<DbRow[]> {
  return readKeysetPages<DbRow>(async (after) => {
    let query = supabase.from(table).select(columns).order('id').limit(500);
    if (after !== null) query = query.gt('id', after);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    return data as unknown as DbRow[];
  });
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function quantity(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function fetchLowStock(): Promise<LowStockSnapshot> {
  return readCompleteSources({
    stocks: async () => (await readRows('raw_product_monitoring', 'id,brand,product_id,product,warna,size,available_quantity,status_stock_final,sisa_cutting,source,supplier,received_at')).map((r) => ({
      id: Number(r.id), brand: text(r.brand), productId: text(r.product_id), product: text(r.product) ?? '',
      color: text(r.warna), size: text(r.size), availableQuantity: quantity(r.available_quantity),
      // Qty mentah dipertahankan apa adanya (termasuk negatif bila memang
      // tersimpan); hanya nilai non-numerik yang menjadi null.
      statusStockFinal: text(r.status_stock_final), sisaCutting: quantity(r.sisa_cutting),
      source: text(r.source), supplier: text(r.supplier), receivedAt: text(r.received_at),
    })),
    orders: async () => (await readRows('production_orders', 'id,status,product_id,product,brand')).map((r) => ({
      id: String(r.id), status: text(r.status) ?? '', productId: text(r.product_id),
      product: text(r.product) ?? '', brand: text(r.brand),
    })),
    variations: async () => (await readRows('production_order_variations', 'id,production_order_id,color,size,quantity')).map((r) => ({
      id: String(r.id), orderId: String(r.production_order_id), color: text(r.color) ?? '',
      size: text(r.size) ?? '', quantity: quantity(r.quantity) ?? NaN,
    })),
    workOrders: async () => (await readRows('work_orders', 'id,source_order_id,source_variation_id,product_id,product,brand,warna,size,quantity')).map((r) => ({
      id: String(r.id), orderId: text(r.source_order_id), variationId: text(r.source_variation_id),
      productId: text(r.product_id), product: text(r.product) ?? '', brand: text(r.brand),
      color: text(r.warna), size: text(r.size), quantity: quantity(r.quantity) ?? NaN,
    })),
    finishing: async () => (await readRows('finishing_records', 'id,work_order_id,qty_finishing')).map((r) => ({
      id: String(r.id), workOrderId: String(r.work_order_id), quantity: quantity(r.qty_finishing) ?? NaN,
    })),
  });
}
