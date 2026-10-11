import type {
  LowStockFilters,
  LowStockResult,
  LowStockRow,
  LowStockSnapshot,
  StockIdentity,
  StockLevel,
  StockProductionOrder,
  StockSummary,
  StockVariation,
  StockWorkOrder,
} from '../types/lowStock.ts';

// ===== Stock Monitoring — perhitungan murni =====
// Tidak mengimpor Supabase maupun runtime Vite, supaya seluruh aturan
// klasifikasi dua section dapat diuji dengan `node --test`.
//
// Dua aturan yang mudah salah dan sengaja dikunci di sini:
// 1. Produksi berakhir saat **finishing** selesai. Status jahit `Finished`
//    maupun status pembayaran/invoice tidak memindahkan baris keluar dari
//    section "Dalam Produksi" (karena itu `deriveStatus` tidak dipakai).
// 2. Stok kosong berarti "belum ada data", bukan nol. Baris seperti itu tetap
//    tampil di section 1 dengan stok unknown dan tidak pernah diklaim sebagai
//    stok <50 di section 2.

/** Batas low stock per variasi warna–size. Tepat 50 tidak dihitung low. */
export const LOW_STOCK_THRESHOLD = 50;

/** Ambang minimum sebuah pcs agar dianggap barang nyata (menyaring qty 0). */
const MIN_QUANTITY = 1;

const ORDER_DRAFT = 'DRAFT';
const ORDER_CANCELLED = 'CANCELLED';
const KNOWN_ORDER_STATUSES: ReadonlySet<string> = new Set([
  ORDER_DRAFT,
  'PULLED',
  ORDER_CANCELLED,
]);

const normalize = (value: string | null): string => (value ?? '').trim().toLowerCase();
const isPositive = (value: number): boolean => Number.isFinite(value) && value >= MIN_QUANTITY;

/**
 * Kunci identitas variasi: brand + Product ID + warna + size.
 *
 * Nama produk sengaja tidak dipakai — dua produk dengan ID berbeda tidak boleh
 * tercampur hanya karena namanya mirip. Tuple diserialisasi sebagai JSON, bukan
 * digabung dengan delimiter, supaya `"a|b" + "c"` tidak bentrok dengan
 * `"a" + "b|c"`. Identitas yang tidak lengkap menghasilkan `null` (bukan
 * wildcard), karena nilai kosong tidak boleh dianggap cocok dengan apa pun.
 */
export function stockIdentityKey(identity: StockIdentity): string | null {
  const parts = [identity.brand, identity.productId, identity.color, identity.size].map(normalize);
  return parts.every(Boolean) ? JSON.stringify(parts) : null;
}

/** Pembaca kualitas data: dikumpulkan per jenis agar pesan UI tetap ringkas. */
class IssueLog {
  private readonly counts = new Map<string, number>();

  add(issue: string, amount = 1): void {
    this.counts.set(issue, (this.counts.get(issue) ?? 0) + amount);
  }

  list(): string[] {
    return [...this.counts.entries()].map(([issue, count]) =>
      count > 1 ? `${issue} (${count} baris)` : issue,
    );
  }
}

interface RowAccumulator {
  identity: StockIdentity;
  key: string;
  /** Kunci internal untuk identitas tidak lengkap; tidak boleh digabung. */
  synthetic: boolean;
  /**
   * Qty variasi order DRAFT. Belum ada work order, jadi seluruh qty-nya
   * masih tersisa dan belum masuk proses finishing.
   */
  draftQuantity: number;
  /** Qty work order aktif (gross, sebelum dikurangi finishing). */
  workOrderQuantity: number;
  /**
   * Sisa work order aktif setelah finishing. Dihitung per WO lebih dulu, jadi
   * over-finishing WO A tidak menutupi kekurangan WO B.
   */
  workOrderRemaining: number;
  stages: Set<'Draft' | 'Dalam Produksi'>;
  /** Order unik; WO tanpa parent dihitung sebagai satu pekerjaan mandiri. */
  orderIds: Set<string>;
}

interface ProductionIndex {
  byKey: Map<string, RowAccumulator>;
  /** Identitas yang berpotensi cocok tetapi produksinya belum dapat dipastikan. */
  uncertainKeys: Set<string>;
}

function accumulate(index: ProductionIndex, source: {
  identity: StockIdentity;
  key: string;
  synthetic: boolean;
  stage: 'Draft' | 'Dalam Produksi';
  orderId: string | null;
  fallbackOrderId: string;
  draftQuantity?: number;
  workOrderQuantity?: number;
  workOrderRemaining?: number;
}): void {
  let row = index.byKey.get(source.key);
  if (!row) {
    row = {
      identity: source.identity,
      key: source.key,
      synthetic: source.synthetic,
      draftQuantity: 0,
      workOrderQuantity: 0,
      workOrderRemaining: 0,
      stages: new Set(),
      orderIds: new Set(),
    };
    index.byKey.set(source.key, row);
  }
  row.draftQuantity += source.draftQuantity ?? 0;
  row.workOrderQuantity += source.workOrderQuantity ?? 0;
  row.workOrderRemaining += source.workOrderRemaining ?? 0;
  row.stages.add(source.stage);
  // Setelah PULLED, order induk tidak dihitung lagi — WO sudah mewakilinya.
  row.orderIds.add(source.orderId ?? source.fallbackOrderId);
}

/**
 * Identitas WO. Kolom WO sendiri diutamakan; brand/Product ID jatuh ke parent
 * order, sedangkan warna/size hanya boleh jatuh ke variasi induknya — order
 * induk tidak menyimpan warna/size sama sekali.
 */
function workOrderIdentity(
  wo: StockWorkOrder,
  order: StockProductionOrder | null,
  variation: StockVariation | null,
): StockIdentity {
  return {
    brand: wo.brand ?? order?.brand ?? null,
    productId: wo.productId ?? order?.productId ?? null,
    product: wo.product || order?.product || '',
    color: wo.color ?? variation?.color ?? null,
    size: wo.size ?? variation?.size ?? null,
  };
}

function buildProductionIndex(snapshot: LowStockSnapshot, issues: IssueLog): ProductionIndex {
  const index: ProductionIndex = { byKey: new Map(), uncertainKeys: new Set() };
  const ordersById = new Map(snapshot.orders.map((order) => [order.id, order]));

  const unknownStatusOrderIds = new Set(
    snapshot.orders.filter((order) => !KNOWN_ORDER_STATUSES.has(order.status)).map((order) => order.id),
  );
  if (unknownStatusOrderIds.size > 0) {
    issues.add('Order produksi dengan status yang tidak dikenali tidak diklasifikasikan', unknownStatusOrderIds.size);
  }

  // --- Sumber Draft: variasi order DRAFT dengan qty positif.
  let orphanVariationCount = 0;
  for (const variation of snapshot.variations) {
    const order = ordersById.get(variation.orderId);
    if (!order) {
      orphanVariationCount += 1;
      continue;
    }
    if (order.status === ORDER_CANCELLED) continue;
    if (!isPositive(variation.quantity)) continue;

    const identity: StockIdentity = {
      brand: order.brand,
      productId: order.productId,
      product: order.product,
      color: variation.color,
      size: variation.size,
    };
    const key = stockIdentityKey(identity);

    // Order berstatus tak dikenal belum tentu tidak diproduksi: catat
    // identitasnya supaya stoknya tidak diklaim "belum produksi".
    if (unknownStatusOrderIds.has(order.id)) {
      if (key) index.uncertainKeys.add(key);
      continue;
    }
    if (order.status !== ORDER_DRAFT) continue;

    accumulate(index, {
      identity,
      key: key ?? `draft:${variation.id}`,
      synthetic: key === null,
      stage: 'Draft',
      orderId: order.id,
      fallbackOrderId: `draft:${variation.id}`,
      draftQuantity: variation.quantity,
    });
  }
  if (orphanVariationCount > 0) {
    issues.add('Variasi produksi tanpa order induk dilewati', orphanVariationCount);
  }

  // --- Sumber eksekusi: work order yang finishing-nya belum menutup qty.
  const variationsById = new Map(snapshot.variations.map((variation) => [variation.id, variation]));
  const finishingByWorkOrder = new Map<string, number>();
  for (const record of snapshot.finishing) {
    if (!isPositive(record.quantity)) continue;
    finishingByWorkOrder.set(
      record.workOrderId,
      (finishingByWorkOrder.get(record.workOrderId) ?? 0) + record.quantity,
    );
  }

  let missingParentCount = 0;

  // Order PULLED seharusnya sudah punya work order. Kalau tidak ada satu pun
  // yang merujuk — baik lewat order maupun lewat variasinya — produksinya bisa
  // hilang dari daftar. Identitasnya ditahan dari section 2 dan dilaporkan,
  // bukan ditebak sebagai "belum produksi".
  const orderIdsWithWorkOrders = new Set<string>();
  const variationIdsWithWorkOrders = new Set<string>();
  for (const candidate of snapshot.workOrders) {
    if (candidate.orderId) orderIdsWithWorkOrders.add(candidate.orderId);
    if (candidate.variationId) variationIdsWithWorkOrders.add(candidate.variationId);
  }
  let pulledWithoutWorkOrder = 0;
  for (const order of snapshot.orders) {
    if (order.status !== 'PULLED') continue;
    const hasWork = orderIdsWithWorkOrders.has(order.id)
      || snapshot.variations.some(
        (variation) => variation.orderId === order.id && variationIdsWithWorkOrders.has(variation.id),
      );
    if (hasWork) continue;
    pulledWithoutWorkOrder += 1;
    for (const variation of snapshot.variations) {
      if (variation.orderId !== order.id) continue;
      const key = stockIdentityKey({
        brand: order.brand, productId: order.productId, product: order.product,
        color: variation.color, size: variation.size,
      });
      if (key) index.uncertainKeys.add(key);
    }
  }
  if (pulledWithoutWorkOrder > 0) {
    issues.add('Order PULLED tanpa work order tidak dapat dipastikan status produksinya', pulledWithoutWorkOrder);
  }

  for (const wo of snapshot.workOrders) {
    if (!isPositive(wo.quantity)) continue;

    const parent = wo.orderId === null ? null : ordersById.get(wo.orderId) ?? null;
    if (wo.orderId !== null && parent === null) missingParentCount += 1;

    // Order CANCELLED tidak ikut, termasuk WO yang terhubung dengannya.
    if (parent?.status === ORDER_CANCELLED) continue;

    const identity = workOrderIdentity(
      wo,
      parent,
      wo.variationId === null ? null : variationsById.get(wo.variationId) ?? null,
    );
    const key = stockIdentityKey(identity);

    if (parent && unknownStatusOrderIds.has(parent.id)) {
      if (key) index.uncertainKeys.add(key);
      continue;
    }

    // Sisa dihitung per WO lebih dulu, jadi over-finishing WO A tidak menutupi
    // kekurangan WO B. WO yang sudah selesai difinishing keluar dari produksi.
    const finished = finishingByWorkOrder.get(wo.id) ?? 0;
    if (finished >= wo.quantity) continue;

    accumulate(index, {
      identity,
      key: key ?? `wo:${wo.id}`,
      synthetic: key === null,
      stage: 'Dalam Produksi',
      orderId: parent?.id ?? null,
      fallbackOrderId: `wo:${wo.id}`,
      workOrderQuantity: wo.quantity,
      workOrderRemaining: Math.max(0, wo.quantity - finished),
    });
  }
  if (missingParentCount > 0) {
    issues.add('Work order merujuk order yang tidak ditemukan', missingParentCount);
  }

  return index;
}

function toRow(accumulator: RowAccumulator): LowStockRow {
  const stages: LowStockRow['stages'] = [];
  if (accumulator.stages.has('Draft')) stages.push('Draft');
  if (accumulator.stages.has('Dalam Produksi')) stages.push('Dalam Produksi');
  return {
    ...accumulator.identity,
    key: accumulator.key,
    availableQuantity: null,
    stockState: 'missing',
    orderCount: accumulator.orderIds.size,
    // Qty order aktif = qty Draft + qty work order aktif. Sisa finishing
    // hanya dihitung dari work order, karena Draft belum masuk finishing.
    orderQuantity: accumulator.draftQuantity + accumulator.workOrderQuantity,
    remainingFinishing: accumulator.workOrderRemaining,
    stages,
  };
}

/** Tingkat stok satu baris. Stok yang belum ada datanya bukan nol. */
export function stockLevel(row: LowStockRow): StockLevel {
  if (row.stockState !== 'known' || row.availableQuantity === null) return 'unknown';
  if (row.availableQuantity <= 0) return 'out';
  return row.availableQuantity < LOW_STOCK_THRESHOLD ? 'low' : 'ok';
}

const byKey = (a: LowStockRow, b: LowStockRow): number => a.key.localeCompare(b.key);

interface StockEntry {
  /** Nilai asli untuk tampilan; kunci ternormalisasi hanya untuk pencocokan. */
  identity: StockIdentity;
  availableQuantity: number | null;
}

export function buildLowStock(snapshot: LowStockSnapshot): LowStockResult {
  const issues = new IssueLog();
  const production = buildProductionIndex(snapshot, issues);

  // --- Klasifikasi stok. Stok kosong bukan stok nol: ia tetap "Belum ada data".
  const stockByKey = new Map<string, StockEntry>();
  const ambiguousKeys = new Set<string>();
  let incompleteStockCount = 0;
  let duplicateStockCount = 0;

  for (const stock of snapshot.stocks) {
    const key = stockIdentityKey(stock);
    if (key === null) {
      incompleteStockCount += 1;
      continue;
    }
    // Stok duplikat tidak boleh dijumlahkan tanpa kontrak bahwa setiap baris
    // adalah gudang berbeda, jadi jumlahnya tidak dapat dipastikan.
    if (stockByKey.has(key)) {
      ambiguousKeys.add(key);
      duplicateStockCount += 1;
      continue;
    }
    stockByKey.set(key, {
      identity: {
        brand: stock.brand, productId: stock.productId, product: stock.product,
        color: stock.color, size: stock.size,
      },
      availableQuantity: stock.availableQuantity,
    });
  }
  if (incompleteStockCount > 0) {
    issues.add('Baris stok dengan identitas tidak lengkap tidak dapat dicocokkan', incompleteStockCount);
  }
  if (duplicateStockCount > 0) {
    issues.add('Baris stok dengan identitas sama (stok ganda) tidak dijumlahkan', duplicateStockCount);
  }

  // --- Section 1: semua variasi dalam produksi, tanpa batas stok.
  const inProduction: LowStockRow[] = [];
  for (const accumulator of production.byKey.values()) {
    const row = toRow(accumulator);
    if (!accumulator.synthetic) {
      const stock = stockByKey.get(accumulator.key);
      if (ambiguousKeys.has(accumulator.key)) row.stockState = 'ambiguous';
      else if (stock && stock.availableQuantity !== null) {
        row.availableQuantity = stock.availableQuantity;
        row.stockState = 'known';
      } else if (stock) {
        // Baris stok ada tetapi qty-nya tidak terbaca: tetap "Belum ada data",
        // dan stok tidak dipalsukan menjadi 0.
        row.stockState = 'missing';
      }
      if (!row.product && stock?.identity.product) row.product = stock.identity.product;
    }
    // Identitas tidak lengkap tampil dengan stok unknown, tidak digabung.
    inProduction.push(row);
  }
  inProduction.sort(byKey);

  // --- Section 2: stok numerik <50 yang tidak punya produksi aktif.
  const waitingProduction: LowStockRow[] = [];
  let uncertainStockCount = 0;
  for (const [key, entry] of stockByKey) {
    if (production.byKey.has(key)) continue;
    if (ambiguousKeys.has(key)) continue;
    const { availableQuantity, identity: display } = entry;
    if (availableQuantity === null || !Number.isFinite(availableQuantity)) continue;
    if (production.uncertainKeys.has(key)) {
      uncertainStockCount += 1;
      continue;
    }
    if (availableQuantity >= LOW_STOCK_THRESHOLD) continue;

    waitingProduction.push({
      brand: display.brand, productId: display.productId, product: display.product,
      color: display.color, size: display.size,
      key,
      availableQuantity,
      stockState: 'known',
      orderCount: 0,
      orderQuantity: 0,
      remainingFinishing: 0,
      stages: [],
    });
  }
  if (uncertainStockCount > 0) {
    issues.add(
      'Stok dengan order berstatus tidak dikenali belum dapat dipastikan masuk daftar belum produksi',
      uncertainStockCount,
    );
  }
  waitingProduction.sort((a, b) => a.availableQuantity! - b.availableQuantity! || byKey(a, b));

  // --- Ringkasan. Dihitung dari seluruh snapshot, bukan dari hasil filter,
  // supaya angka di stat tile tidak berubah saat user mengetik pencarian.
  const summary: StockSummary = {
    totalSku: 0,
    out: 0,
    low: 0,
    unknown: 0,
    inProduction: inProduction.length,
  };
  for (const [key, entry] of stockByKey) {
    // Stok ganda tidak dihitung: jumlahnya memang tidak dapat dipastikan.
    if (ambiguousKeys.has(key)) continue;
    summary.totalSku += 1;
    if (entry.availableQuantity === null || !Number.isFinite(entry.availableQuantity)) {
      summary.unknown += 1;
    } else if (entry.availableQuantity <= 0) {
      summary.out += 1;
    } else if (entry.availableQuantity < LOW_STOCK_THRESHOLD) {
      summary.low += 1;
    }
  }

  return { inProduction, waitingProduction, issues: issues.list(), summary };
}

/** Baris yang cocok dengan pencarian produk/ID/warna/size dan filter client. */
export function filterLowStockRows(rows: LowStockRow[], filters: LowStockFilters): LowStockRow[] {
  const search = normalize(filters.search);
  const client = normalize(filters.client);
  if (!search && !client) return rows;
  return rows.filter((row) => {
    if (client && normalize(row.brand) !== client) return false;
    if (!search) return true;
    return [row.product, row.productId, row.color, row.size]
      .some((field) => normalize(field).includes(search));
  });
}

/**
 * Opsi filter client dari seluruh hasil, bukan dari baris yang sedang tampil —
 * daftarnya tidak boleh menyusut saat satu client dipilih.
 */
export function lowStockClients(rows: LowStockRow[]): Array<{ value: string; label: string }> {
  const labels = new Map<string, string>();
  for (const row of rows) {
    const value = normalize(row.brand);
    if (!value || labels.has(value)) continue;
    labels.set(value, (row.brand ?? '').trim());
  }
  return [...labels.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
