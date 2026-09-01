import { supabase } from '@/lib/supabase';
import { fetchOrderPriceByProductionOrderId } from '@/services/orderPricing';
import {
  clientCodeFromBrand,
  billingTypeCode,
  buildInvoiceCode,
} from '@/lib/invoiceCode';
import { formatMonthYear } from '@/lib/monthYear';
import { computeInvoiceFinancials } from '@/lib/invoiceCompute';
import { deriveBillingType } from '@/lib/autoInvoice';
import {
  fetchInvoiceByWorkOrderId,
  fetchMaxSequenceNumber,
  createInvoiceAuto,
} from '@/services/invoices';
import type { WorkOrder, InvoiceRow } from '@/types/pipeline';

export interface TransitionResult {
  workOrder: WorkOrder;
  invoiceCreated: boolean;
  invoice?: InvoiceRow;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

export async function transitionToFinishingComplete(workOrderId: string): Promise<TransitionResult> {
  // 1. Fetch current WO
  const { data: currentWo, error: woErr } = await supabase
    .from('work_orders')
    .select('*')
    .eq('id', workOrderId)
    .single();
  if (woErr || !currentWo) throw woErr ?? new Error('WO not found');

  console.log('[autoInvoice] transitionToFinishingComplete called for:', workOrderId);
  const wo = currentWo as Record<string, unknown>;
  console.log('[autoInvoice] wo.prod_status:', wo.prod_status, 'source_order_id:', wo.source_order_id);
  const poId = (wo.source_order_id as string | null) ?? null;

  // 2. Idempotency — already at FINISHED or INVOICED
  if (wo.prod_status === 'FINISHED' || wo.prod_status === 'INVOICED') {
    return {
      workOrder: wo as unknown as WorkOrder,
      invoiceCreated: false,
    };
  }

  // 3. Validate exact-order pricing before changing production status.
  if (!poId) {
    throw new Error('Work Order tidak memiliki sumber Order Entry');
  }
  const orderPrice = await fetchOrderPriceByProductionOrderId(poId);
  if (!orderPrice?.complete || !orderPrice.id || orderPrice.totalPerPiece <= 0) {
    throw new Error('Harga Order Entry belum lengkap');
  }

  // 4. Update prod_status only after pricing is known to be valid.
  const { data: updatedWo, error: updErr } = await supabase
    .from('work_orders')
    .update({ prod_status: 'FINISHED' })
    .eq('id', workOrderId)
    .select()
    .single();
  if (updErr || !updatedWo) throw updErr ?? new Error('update failed');

  // 5. Already has an invoice? Skip generation.
  const { data: existing } = await fetchInvoiceByWorkOrderId(workOrderId);
  if (existing) {
    return { workOrder: updatedWo as unknown as WorkOrder, invoiceCreated: false, invoice: existing };
  }

  // 6. Compute derived values
  const brand = wo.brand as string;
  const quantity = wo.quantity as number;
  const clientCode = clientCodeFromBrand(brand);
  const billingType = deriveBillingType(quantity);
  const billingTypeCodeValue = billingTypeCode(billingType);
  const invoiceDate = todayIso();
  const monthYear = formatMonthYear(invoiceDate);

  const { sequence: maxSeq } = await fetchMaxSequenceNumber();
  const invoiceCode = buildInvoiceCode({
    billingTypeCodeValue,
    clientCode,
    invoiceDate,
    sequence: maxSeq + 1,
  });

  const fin = computeInvoiceFinancials({
    pcsLinked: quantity,
    unitPrice: orderPrice.totalPerPiece,
    rateManpower: 0,
  });

  const invoiceInput: Omit<InvoiceRow, 'id' | 'createdAt' | 'updatedAt'> = {
    workOrderId,
    orderPriceId: orderPrice.id,
    autoCreated: true,
    workCode: (wo.work_code as string) ?? '',
    invoiceCode,
    invoiceDate,
    monthYear,
    clientName: brand,
    clientCode,
    billingType,
    billingTypeCodeValue,
    pcsLinked: quantity,
    unitPrice: orderPrice.totalPerPiece,
    totalAmount: fin.totalAmount,
    rateOperational: fin.rateOperational,
    totalIncomeManpower: fin.totalIncomeManpower,
    totalIncomeOperational: fin.totalIncomeOperational,
    financeValidation: 'Collect Payment',
  };

  const { data: createdInvoice, error: invErr } = await createInvoiceAuto(invoiceInput);
  if (invErr) throw invErr;

  return {
    workOrder: updatedWo as unknown as WorkOrder,
    invoiceCreated: true,
    invoice: createdInvoice ?? undefined,
  };
}

export async function backfillMissingInvoices(): Promise<number> {
  // Find WOs in terminal-ish state without an invoice
  console.log('[backfill] fetching WOs...');
  const { data: woRows, error: woErr } = await supabase
    .from('work_orders')
    .select('id, prod_status, source_order_id')
    .in('prod_status', ['FINISHED', 'INVOICED']);
  console.log('[backfill] woRows:', woRows, 'error:', woErr);
  if (!woRows) return 0;

  const woIds = (woRows as Array<{ id: string }>).map((w) => w.id);

  const { data: existingInvs } = await supabase
    .from('invoices')
    .select('work_order_id')
    .in('work_order_id', woIds);
  const existingIds = new Set(
    (existingInvs as Array<{ work_order_id: string }> | null)?.map((r) => r.work_order_id) ?? [],
  );
  console.log('[backfill] already invoiced:', [...existingIds]);

  const missing = woIds.filter((id) => !existingIds.has(id));
  console.log('[backfill] missing:', missing);
  let created = 0;
  for (const id of missing) {
    try {
      console.log('[backfill] generating for', id);
      const result = await generateInvoiceForFinishedWo(id);
      console.log('[backfill] result:', result);
      if (result) created++;
    } catch (err) {
      console.error('[backfill] failed for', id, err);
    }
  }
  return created;
}

// Generate invoice for a WO that's already FINISHED (no status update needed)
async function generateInvoiceForFinishedWo(workOrderId: string): Promise<boolean> {
  const { data: woRow } = await supabase
    .from('work_orders')
    .select('*')
    .eq('id', workOrderId)
    .single();
  if (!woRow) return false;

  const wo = woRow as Record<string, unknown>;

  // Already has invoice?
  const { data: existing } = await fetchInvoiceByWorkOrderId(workOrderId);
  if (existing) return false;

  // Need a complete price for the exact source order.
  const poId = (wo.source_order_id as string | null) ?? null;
  if (!poId) return false;
  const orderPrice = await fetchOrderPriceByProductionOrderId(poId);
  if (!orderPrice?.complete || !orderPrice.id || orderPrice.totalPerPiece <= 0) return false;

  const brand = wo.brand as string;
  const quantity = wo.quantity as number;
  const clientCode = clientCodeFromBrand(brand);
  const billingType = deriveBillingType(quantity);
  const billingTypeCodeValue = billingTypeCode(billingType);
  const invoiceDate = todayIso();
  const monthYear = formatMonthYear(invoiceDate);

  const { sequence: maxSeq } = await fetchMaxSequenceNumber();
  const invoiceCode = buildInvoiceCode({
    billingTypeCodeValue,
    clientCode,
    invoiceDate,
    sequence: maxSeq + 1,
  });

  const fin = computeInvoiceFinancials({
    pcsLinked: quantity,
    unitPrice: orderPrice.totalPerPiece,
    rateManpower: 0,
  });

  const invoiceInput: Omit<InvoiceRow, 'id' | 'createdAt' | 'updatedAt'> = {
    workOrderId,
    orderPriceId: orderPrice.id,
    autoCreated: true,
    workCode: (wo.work_code as string) ?? '',
    invoiceCode,
    invoiceDate,
    monthYear,
    clientName: brand,
    clientCode,
    billingType,
    billingTypeCodeValue,
    pcsLinked: quantity,
    unitPrice: orderPrice.totalPerPiece,
    totalAmount: fin.totalAmount,
    rateOperational: fin.rateOperational,
    totalIncomeManpower: fin.totalIncomeManpower,
    totalIncomeOperational: fin.totalIncomeOperational,
    financeValidation: 'Collect Payment',
  };

  const { data: created, error } = await createInvoiceAuto(invoiceInput);
  if (error || !created) return false;
  return true;
}
