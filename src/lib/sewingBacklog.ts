import type { SewingRecord, WorkOrder } from '@/types/pipeline';

// ===== Belum Jahit (backlog jahit global) =====
// Helper murni: tidak melakukan fetch, tidak mengimpor Supabase, dan tidak
// menulis data. Seluruh aritmetika backlog dan Sisa Uang berada di sini agar
// dapat diuji tanpa database.

export interface SewingRate {
  jahit: number;
  obras: number;
  total: number;
}

export interface WorkOrderBacklog {
  workOrderId: string;
  sourceOrderId: string | null;
  workCode: string;
  productNote: string | null;
  product: string;
  warna: string | null;
  size: string | null;
  qtyOrder: number;
  qtyJahit: number;
  totalBelumJahit: number;
  rate: number | null;
}

export type SummaryRate =
  | { kind: 'single'; value: number }
  | { kind: 'varied' }
  | { kind: 'missing' };

export interface ProductNoteBacklog {
  key: string;
  productNote: string | null;
  productLabel: string;
  totalQtyOrder: number;
  totalQtyJahit: number;
  totalBelumJahit: number;
  rate: SummaryRate;
  workOrders: WorkOrderBacklog[];
  searchText: string;
}

function noteKey(productNote: string): string {
  return `note:${productNote.trim().toLowerCase()}`;
}

function normalizeText(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s === '' ? null : s;
}

function summarizeRate(rates: (number | null)[]): SummaryRate {
  const present = rates.filter((r): r is number => r != null);
  if (present.length === 0) return { kind: 'missing' };
  if (present.length !== rates.length) return { kind: 'varied' };
  const first = present[0];
  return present.every((r) => r === first)
    ? { kind: 'single', value: first }
    : { kind: 'varied' };
}

function summarizeProduct(products: string[]): string {
  const unique = Array.from(new Set(products.map((p) => p.trim()).filter((p) => p !== '')));
  if (unique.length === 0) return '—';
  return unique.length === 1 ? unique[0] : 'Bervariasi';
}

/**
 * Sisa Uang yang Harus Dikejar untuk satu baris Target bulanan.
 * Bulanan dan tidak kumulatif; hasil minimum Rp0; tidak memasukkan penalti
 * dan tidak mengubah rumus Utang Staf.
 */
export function calculateMonthlyRemainingMoney(
  salary: number,
  realisasiCostPosisi: number,
): number {
  const s = Number(salary) || 0;
  const c = Number(realisasiCostPosisi) || 0;
  return Math.max(0, s - c);
}

/**
 * Bangun daftar backlog jahit global yang dikelompokkan per Product Note.
 *
 * Qty Jahit menjumlahkan seluruh sewing_records Work Order lintas penjahit dan
 * tanggal. Total Belum Jahit = max(0, Qty Order - Qty Jahit). Work Order tanpa
 * sisa tidak masuk hasil.
 */
export function buildSewingBacklog(
  workOrders: WorkOrder[],
  sewingRecords: SewingRecord[],
  ratesByProductionOrder: ReadonlyMap<string, SewingRate>,
): ProductNoteBacklog[] {
  const qtyByWorkOrder = new Map<string, number>();
  for (const record of sewingRecords) {
    const key = String(record.workOrderId ?? '');
    if (!key) continue;
    qtyByWorkOrder.set(key, (qtyByWorkOrder.get(key) ?? 0) + (Number(record.qtySelesai) || 0));
  }

  const items: WorkOrderBacklog[] = [];
  for (const w of workOrders) {
    const qtyOrder = Number(w.quantity) || 0;
    const qtyJahit = qtyByWorkOrder.get(String(w.id)) ?? 0;
    const totalBelumJahit = Math.max(0, qtyOrder - qtyJahit);
    if (totalBelumJahit === 0) continue;

    const sourceOrderId = normalizeText(w.sourceOrderId);
    const rateEntry = sourceOrderId ? ratesByProductionOrder.get(sourceOrderId) : undefined;

    items.push({
      workOrderId: String(w.id),
      sourceOrderId,
      workCode: String(w.workCode ?? ''),
      productNote: normalizeText(w.productNote),
      product: String(w.product ?? ''),
      warna: normalizeText(w.warna),
      size: normalizeText(w.size),
      qtyOrder,
      qtyJahit,
      totalBelumJahit,
      rate: rateEntry ? rateEntry.total : null,
    });
  }

  const groups = new Map<string, WorkOrderBacklog[]>();
  for (const item of items) {
    const key = item.productNote
      ? noteKey(item.productNote)
      : item.sourceOrderId
        ? `src:${item.sourceOrderId}`
        : `wo:${item.workOrderId}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const result: ProductNoteBacklog[] = [];
  for (const [key, members] of groups) {
    const sortedMembers = [...members].sort(
      (a, b) =>
        b.totalBelumJahit - a.totalBelumJahit ||
        a.workCode.localeCompare(b.workCode),
    );
    const productNote = sortedMembers[0].productNote;

    result.push({
      key,
      productNote,
      productLabel: summarizeProduct(sortedMembers.map((m) => m.product)),
      totalQtyOrder: sortedMembers.reduce((sum, m) => sum + m.qtyOrder, 0),
      totalQtyJahit: sortedMembers.reduce((sum, m) => sum + m.qtyJahit, 0),
      totalBelumJahit: sortedMembers.reduce((sum, m) => sum + m.totalBelumJahit, 0),
      rate: summarizeRate(sortedMembers.map((m) => m.rate)),
      workOrders: sortedMembers,
      searchText: [
        ...sortedMembers.map((m) => m.productNote ?? ''),
        ...sortedMembers.map((m) => m.product),
        ...sortedMembers.map((m) => m.workCode),
        ...sortedMembers.map((m) => m.warna ?? ''),
        ...sortedMembers.map((m) => m.size ?? ''),
      ]
        .join(' ')
        .toLowerCase(),
    });
  }

  return result.sort(
    (a, b) =>
      b.totalBelumJahit - a.totalBelumJahit ||
      (a.productNote ?? '').localeCompare(b.productNote ?? ''),
  );
}
