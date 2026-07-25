import { supabase } from '@/lib/supabase';
import { deriveStatus } from '@/lib/productionStatus';
import type { ProductionStatus, WorkOrder } from '@/types/pipeline';

const WO_TABLE = 'work_orders';
const INVOICE_TABLE = 'invoices';

interface DbWorkOrderRow {
  id: string;
  work_code: string;
  source_order_id: string;
  product_note: string;
  product: string;
  product_id: string;
  variation_id: string;
  information_variation: string;
  warna: string;
  size: string;
  brand: string;
  quantity: number;
  prod_status: WorkOrder['productionStatus'];
  invoice_status: WorkOrder['invoiceStatus'];
  created_by: string;
  created_at: string;
  pulled_at: string | null;
}

function mapRow(row: DbWorkOrderRow): WorkOrder {
  return {
    id: row.id,
    workCode: row.work_code,
    sourceOrderId: row.source_order_id,
    productNote: row.product_note,
    product: row.product,
    productId: row.product_id,
    variationId: row.variation_id,
    informationVariation: row.information_variation,
    warna: row.warna,
    size: row.size,
    brand: row.brand,
    quantity: row.quantity,
    productionStatus: row.prod_status,
    invoiceStatus: row.invoice_status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    pulledAt: row.pulled_at ?? undefined,
  };
}

export async function fetchEligibleWorkOrders(): Promise<{ data: WorkOrder[] | null; error: Error | null }> {
  // Fetch WO in any pre-INVOICED state so we can apply deriveStatus() and pick up
  // rows whose DB prod_status hasn't been updated yet but whose actual cutting/sewing
  // totals mean the WO is Finished.
  const { data: woData, error: woError } = await supabase
    .from(WO_TABLE)
    .select('*')
    .in('prod_status', ['CUTTING_COMPLETE', 'SEWING_IN_PROGRESS', 'FINISHING_IN_PROGRESS', 'FINISHING_COMPLETE', 'INVOICED'] as ProductionStatus[])
    .order('created_at', { ascending: false });
  if (woError) return { data: null, error: woError };
  if (!woData) return { data: [], error: null };

  // Fetch cutting + sewing totals so derived status can be computed locally.
  const woIds = (woData as DbWorkOrderRow[]).map((w) => w.id);
  const [{ data: crData }, { data: srData }] = await Promise.all([
    supabase
      .from('cutting_records')
      .select('work_order_id,total_cutting')
      .in('work_order_id', woIds),
    supabase
      .from('sewing_records')
      .select('work_order_id,qty_selesai')
      .in('work_order_id', woIds),
  ]);
  const cuttingByWo = new Map<string, number>();
  ((crData as Array<{ work_order_id: string; total_cutting: number }> | null) ?? []).forEach((r) => {
    cuttingByWo.set(r.work_order_id, Number(r.total_cutting) || 0);
  });
  const sewingByWo = new Map<string, number>();
  ((srData as Array<{ work_order_id: string; qty_selesai: number }> | null) ?? []).forEach((r) => {
    sewingByWo.set(r.work_order_id, (sewingByWo.get(r.work_order_id) ?? 0) + (Number(r.qty_selesai) || 0));
  });

  const { data: invoiceData, error: invoiceError } = await supabase
    .from(INVOICE_TABLE)
    .select('work_order_id');
  if (invoiceError) return { data: null, error: invoiceError };
  const invoicedWoIds = new Set(
    ((invoiceData as Array<{ work_order_id: string }> | null) ?? []).map((r) => r.work_order_id),
  );

  const eligible = (woData as DbWorkOrderRow[])
    .filter((w) => !invoicedWoIds.has(w.id))
    .filter((w) => {
      const cuttingTotal = cuttingByWo.get(w.id) ?? 0;
      const sewingTotal = sewingByWo.get(w.id) ?? 0;
      const orderQty = Number(w.quantity) || 0;
      return deriveStatus(w.prod_status as ProductionStatus, cuttingTotal, sewingTotal, orderQty) === 'FINISHING_COMPLETE';
    });

  return { data: eligible.map(mapRow), error: null };
}