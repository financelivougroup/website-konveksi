import type { BillingType } from '@/types/pipeline';

/** Maximum quantity that is still classified as Sample Production (SP). */
export const SAMPLE_PRODUCTION_QTY_THRESHOLD = 10;

export function deriveBillingType(quantity: number): BillingType {
  return quantity <= SAMPLE_PRODUCTION_QTY_THRESHOLD ? 'sample_production' : 'mass_production';
}
