export interface StockIdentity {
  brand: string | null;
  productId: string | null;
  product: string;
  color: string | null;
  size: string | null;
}

export interface StockRecord extends StockIdentity {
  id: number;
  availableQuantity: number | null;
  /** Kolom mentah dari sumber stok; tidak dihitung ulang di sini. */
  statusStockFinal: string | null;
  sisaCutting: number | null;
  source: string | null;
  supplier: string | null;
  /** Tanggal barang diterima; belum dipakai UI karena sumbernya masih kosong. */
  receivedAt: string | null;
}

export interface StockProductionOrder {
  id: string;
  status: string;
  productId: string | null;
  product: string;
  brand: string | null;
}

export interface StockVariation {
  id: string;
  orderId: string;
  color: string;
  size: string;
  quantity: number;
}

export interface StockWorkOrder extends StockIdentity {
  id: string;
  orderId: string | null;
  variationId: string | null;
  quantity: number;
}

export interface StockFinishing {
  id: string;
  workOrderId: string;
  quantity: number;
}

/** A complete client refresh, not a transactional database snapshot. */
export interface LowStockSnapshot {
  stocks: StockRecord[];
  orders: StockProductionOrder[];
  variations: StockVariation[];
  workOrders: StockWorkOrder[];
  finishing: StockFinishing[];
}

export interface LowStockRow extends StockIdentity {
  key: string;
  availableQuantity: number | null;
  stockState: 'known' | 'missing' | 'ambiguous';
  orderCount: number;
  orderQuantity: number;
  remainingFinishing: number;
  stages: Array<'Draft' | 'Dalam Produksi'>;
}

/**
 * Tingkat stok satu variasi. `out` berarti habis (qty ≤ 0, termasuk qty negatif
 * yang memang tersimpan), `unknown` berarti belum ada data — bukan nol.
 */
export type StockLevel = 'out' | 'low' | 'ok' | 'unknown';

/** Angka ringkas untuk baris stat tile di atas halaman. */
export interface StockSummary {
  /** Variasi stok unik yang identitasnya lengkap. */
  totalSku: number;
  /** Stok diketahui habis (qty ≤ 0). */
  out: number;
  /** Stok diketahui 0 < qty < 50. */
  low: number;
  /** Stok tersimpan tetapi qty-nya belum ada. */
  unknown: number;
  /** Variasi yang sedang dalam produksi. */
  inProduction: number;
}

export interface LowStockResult {
  inProduction: LowStockRow[];
  waitingProduction: LowStockRow[];
  issues: string[];
  summary: StockSummary;
}

export interface LowStockFilters {
  search: string;
  client: string;
}
