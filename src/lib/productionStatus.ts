import type { ProductionStatus } from '@/types/pipeline';

export const STATUS_ORDER: ProductionStatus[] = [
  'NEW',
  'CUTTING',
  'PROGRESS',
  'FINISHED',
  'INVOICED',
];

/**
 * Derive production status from actual cutting/sewing totals vs order qty.
 * Invoiced is NOT derived here — it is driven by invoiceStatus != 'NONE'
 * (callers that track invoicing check that separately).
 */
export function deriveStatus(
  cuttingTotal: number,
  sewingTotal: number,
  orderQty: number,
): ProductionStatus {
  if (cuttingTotal <= 0) return 'NEW';
  if (sewingTotal <= 0) return 'CUTTING';
  if (sewingTotal >= orderQty && sewingTotal > 0) return 'FINISHED';
  return 'PROGRESS';
}

export function validateStatusTransition(
  from: string,
  to: string,
  sewingTotal: number,
  cuttingTotal: number,
  quantity: number,
): string | null {
  if (from === to) return null;
  const fromIdx = STATUS_ORDER.indexOf(from as ProductionStatus);
  const toIdx = STATUS_ORDER.indexOf(to as ProductionStatus);
  if (toIdx < 0 || fromIdx < 0) return null;
  if (toIdx < fromIdx) return 'Gak bisa mundur status';
  if (toIdx > fromIdx + 1) return 'Gak bisa lompat status — maju satu per satu';
  if (from === 'CUTTING' && to === 'PROGRESS' && sewingTotal <= 0) {
    return 'Jahit harus sudah terisi untuk lanjut Progress';
  }
  if (from === 'PROGRESS' && to === 'FINISHED' && (sewingTotal < quantity || cuttingTotal <= 0)) {
    return 'Cutting dan jahit harus sampai qty order untuk finish';
  }
  return null;
}