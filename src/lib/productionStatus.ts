import type { ProductionStatus } from '@/types/pipeline';

export const STATUS_ORDER: ProductionStatus[] = [
  'CUTTING_PENDING',
  'CUTTING_COMPLETE',
  'SEWING_IN_PROGRESS',
  'FINISHING_IN_PROGRESS',
  'FINISHING_COMPLETE',
  'INVOICED',
];

export function deriveStatus(
  rawStatus: ProductionStatus | undefined,
  cuttingTotal: number,
  sewingTotal: number,
  orderQty: number,
): ProductionStatus {
  if (rawStatus === 'INVOICED') return 'INVOICED';
  if (cuttingTotal <= 0) return 'CUTTING_PENDING';
  if (sewingTotal <= 0) return 'CUTTING_COMPLETE';
  if (sewingTotal === cuttingTotal) {
    if (cuttingTotal > orderQty) return 'FINISHING_IN_PROGRESS';
    return 'FINISHING_COMPLETE';
  }
  return 'SEWING_IN_PROGRESS';
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
  if (from === 'SEWING_IN_PROGRESS' && to === 'FINISHING_IN_PROGRESS' && (sewingTotal !== cuttingTotal || sewingTotal <= 0)) {
    return 'Cutting dan jahit harus sama nilainya untuk lanjut finishing';
  }
  if (from === 'FINISHING_IN_PROGRESS' && to === 'FINISHING_COMPLETE' && (sewingTotal !== cuttingTotal || cuttingTotal > quantity)) {
    return 'Cutting harus ≤ qty order untuk finish';
  }
  return null;
}