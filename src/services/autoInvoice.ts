import { supabase } from '@/lib/supabase';
import { fetchRegisterPoByProductionOrderId } from '@/services/registerPo';
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
  // Use source_order_id (the production order ID) for register_po lookup
  const poId = (wo.source_order_id as string | null) ?? null;

  // 2. Idempotency — already at FINISHING_COMPLETE
  if (wo.prod_status === 'FINISHING_COMPLETE' || wo.prod_status === 'INVOICED') {
    return {
      workOrder: wo as unknown as WorkOrder,
      invoiceCreated: false,
    };
  }

  // 3. Update prod_status
  const { data: updatedWo, error: updErr } = await supabase
    .from('work_orders')
    .update({ prod_status: 'FINISHING_COMPLETE' })
    .eq('id', workOrderId)
    .select()
    .single();
  if (updErr || !updatedWo) throw updErr ?? new Error('update failed');

  // 4. Already has an invoice? Skip generation.
  const { data: existing } = await fetchInvoiceByWorkOrderId(workOrderId);
  if (existing) {
    return { workOrder: updatedWo as unknown as WorkOrder, invoiceCreated: false, invoice: existing };
  }

  // 5. Must have a register_po (lookup by source_order_id = production order ID)
  if (!poId) {
    console.warn('WO has no source_order_id; skipping invoice', workOrderId);
    return { workOrder: updatedWo as unknown as WorkOrder, invoiceCreated: false };
  }
  const registerPo = await fetchRegisterPoByProductionOrderId(poId);
  if (!registerPo) {
    console.warn('No register_po for', poId);
    return { workOrder: updatedWo as unknown as WorkOrder, invoiceCreated: false };
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
    unitPrice: registerPo.totalPerPcs,
    rateManpower: 0,
  });

  const invoiceInput: Omit<InvoiceRow, 'id' | 'createdAt' | 'updatedAt'> = {
    workOrderId,
    registerPoId: registerPo.id,
    autoCreated: true,
    invoiceCode,
    invoiceDate,
    monthYear,
    clientName: brand,
    clientCode,
    billingType,
    billingTypeCodeValue,
    pcsLinked: quantity,
    unitPrice: registerPo.totalPerPcs,
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
    .in('prod_status', ['FINISHING_COMPLETE', 'INVOICED']);
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

// Generate invoice for a WO that's already FINISHING_COMPLETE (no status update needed)
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

  // Need register_po
  const poId = (wo.source_order_id as string | null) ?? null;
  if (!poId) return false;
  const registerPo = await fetchRegisterPoByProductionOrderId(poId);
  if (!registerPo) return false;

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
    unitPrice: registerPo.totalPerPcs,
    rateManpower: 0,
  });

  const invoiceInput: Omit<InvoiceRow, 'id' | 'createdAt' | 'updatedAt'> = {
    workOrderId,
    registerPoId: registerPo.id,
    autoCreated: true,
    invoiceCode,
    invoiceDate,
    monthYear,
    clientName: brand,
    clientCode,
    billingType,
    billingTypeCodeValue,
    pcsLinked: quantity,
    unitPrice: registerPo.totalPerPcs,
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
