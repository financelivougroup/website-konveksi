import type { CuttingRecord, SewingRecord, KancingRecord, FinishingRecord, WorkOrder } from '@/types/pipeline';

export const calls: Array<{ stage: string; input: Record<string, unknown> }> = [];
export const syncCalls: string[] = [];
export const fetchCalls: string[] = [];
export let failNext = false;
export function setFailNext(value: boolean) { failNext = value; }
const date = '2026-10-14';
const inputBy = 'Fixture Operator';

function cutting(workOrderId: string, quantities: number[]): CuttingRecord[] {
  // Service fetch order is latest first; older cutting snapshots must not be summed.
  return quantities.map((totalCutting, i) => ({ id: `cut-${workOrderId}-${i}`, workOrderId, totalCutting,
    inputBy, inputAt: `${date}T${i === 0 ? '12' : '08'}:00:00Z`, locked: true, sisaCutting: 0 }));
}
function sewing(workOrderId: string, quantities: number[]): SewingRecord[] {
  return quantities.map((qtySelesai, i) => ({ id: `sew-${workOrderId}-${i}`, workOrderId,
    workCode: `WORK-${workOrderId}`, qtySelesai, picPenjahit: 'Fixture Penjahit',
    tanggalLaporan: date, inputBy, inputAt: `${date}T12:00:00Z` }));
}
function kancing(workOrderId: string, quantities: number[]): KancingRecord[] {
  return quantities.map((qtyKancing, i) => ({ id: `kan-${workOrderId}-${i}`, workOrderId,
    workCode: `WORK-${workOrderId}`, qtyKancing, picKancing: inputBy,
    tanggalLaporan: date, inputBy, inputAt: `${date}T12:00:00Z` }));
}
function finishing(workOrderId: string, quantities: number[]): FinishingRecord[] {
  return quantities.map((qtyFinishing, i) => ({ id: `fin-${workOrderId}-${i}`, workOrderId,
    qtyFinishing, tanggalImport: date, syncedAt: `${date}T12:00:00Z`, source: 'manual',
    syncStatus: 'OK', picFinishing: inputBy, inputBy }));
}

export function defaultUpstreamRecords(orders: WorkOrder[], stage: string) {
  // All seven WOs have real adjacent-stage output, including the WO awaiting POS qty.
  if (stage === 'sewing') return { existingCuttingRecords: orders.flatMap((wo) => cutting(wo.id, [100])), existingSewingRecords: [] };
  if (stage === 'kancing') return { existingSewingRecords: orders.flatMap((wo) => sewing(wo.id, [40, 60])), existingKancingRecords: [] };
  return { existingKancingRecords: orders.flatMap((wo) => kancing(wo.id, [40, 60])), existingFinishingRecords: [] };
}

// Synthetic regression data, not a claim about the current database. The first pair
// deliberately shares product/code and differs only by WO id, colour and size.
const cases = [
  { id: 'ivory', warna: 'Ivory', size: 'S', quantity: 80, cut: [80], sew: [30, 50], kan: [20, 30], fin: [] },
  { id: 'champagne', warna: 'Champagne', size: 'M', quantity: 32, cut: [32], sew: [], kan: [], fin: [] },
  { id: 'partial', warna: 'Partial', size: 'L', quantity: 100, cut: [100], sew: [25, 35], kan: [10, 20], fin: [4, 6] },
  { id: 'equal', warna: 'Equal', size: 'L', quantity: 20, cut: [20], sew: [8, 12], kan: [5, 15], fin: [8, 12] },
  { id: 'no-upstream', warna: 'No upstream', size: 'L', quantity: 100, cut: [], sew: [], kan: [], fin: [] },
  { id: 'qty-zero', warna: 'Awaiting POS', size: 'L', quantity: 0, cut: [10], sew: [2, 3], kan: [1, 1], fin: [1] },
  { id: 'latest-cut-equal', warna: 'Latest cutting', size: 'L', quantity: 100, cut: [40, 100], sew: [15, 25], kan: [], fin: [] },
  { id: 'zero-output', warna: 'Zero output', size: 'L', quantity: 100, cut: [0], sew: [0], kan: [0], fin: [0] },
  { id: 'over-own', warna: 'Over own', size: 'L', quantity: 12, cut: [12], sew: [7, 8], kan: [9, 9], fin: [10, 10] },
];
export const eligibilityFixture = {
  orders: cases.map((row, i): WorkOrder => ({ id: row.id, workCode: `ELIG-${row.id}`, sourceOrderId: 'po-eligibility',
    productNote: 'PO/002-TEST/10/2026/ELIG', clientProductionCode: 'CLIENT-ELIG', product: 'Odette Shirt',
    productId: 'product-eligibility', variationId: `elig-variant-${i}`, informationVariation: '',
    warna: row.warna, size: row.size, brand: 'Fixture', quantity: row.quantity,
    productionStatus: 'PROGRESS', invoiceStatus: 'NONE', createdBy: inputBy, createdAt: `${date}T00:00:00Z` })),
  cuttingRecords: cases.flatMap((row) => cutting(row.id, row.cut)),
  sewingRecords: cases.flatMap((row) => sewing(row.id, row.sew)),
  kancingRecords: cases.flatMap((row) => kancing(row.id, row.kan)),
  finishingRecords: cases.flatMap((row) => finishing(row.id, row.fin)),
};

let fetchCount = 0;
let upstreamFailed = false;
export async function fetchAllForService(service: string) {
  fetchCount += 1;
  fetchCalls.push(service);
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode');
  const stage = params.get('stage') || 'sewing';
  if (mode === 'loading') await new Promise((resolve) => setTimeout(resolve, 1200));
  // WO is injected. Sewing fetches employees + own + upstream; other stages fetch two records.
  const firstLoadCount = stage === 'sewing' ? 3 : 2;
  const upstreamService = stage === 'sewing' ? 'cuttingRecords' : stage === 'kancing' ? 'sewingRecords' : 'kancingRecords';
  const failUpstream = mode === 'failed-upstream' && service === upstreamService && !upstreamFailed;
  if (failUpstream) upstreamFailed = true;
  if ((mode === 'error' && fetchCount <= firstLoadCount) || failUpstream) {
    return { data: null, error: new Error(`fixture ${service} fetch failure`) };
  }
  if (mode === 'failed-upstream') {
    const records = service === 'cuttingRecords' ? eligibilityFixture.cuttingRecords
      : service === 'sewingRecords' ? eligibilityFixture.sewingRecords
      : service === 'kancingRecords' ? eligibilityFixture.kancingRecords
      : service === 'finishingRecords' ? eligibilityFixture.finishingRecords : [];
    return { data: records, error: null };
  }
  return { data: [], error: null };
}
export async function fetchAll() { return fetchAllForService('generic'); }
export async function create(input: Record<string, unknown>) {
  calls.push({ stage: 'tanggalImport' in input ? 'finishing' : 'picKancing' in input ? 'kancing' : 'sewing', input });
  if (failNext) { failNext = false; return { data: null, error: new Error('fixture failure') }; }
  return { data: { id: 'fixture-record', ...input }, error: null };
}
export async function syncWorkOrderStatus(id: string) { syncCalls.push(id); }
export function activePenjahitNames() { return ['Fixture Penjahit']; }
export function useAuth() { return { profile: { displayName: 'Fixture Operator' } }; }
