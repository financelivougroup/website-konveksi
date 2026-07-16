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

  const wo = currentWo as Record<string, unknown>;
  const productionOrderId = (wo.production_order_id as string | null) ?? null;

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

  // 5. Must have a register_po
  if (!productionOrderId) {
    console.warn('WO has no production_order_id; skipping invoice', workOrderId);
    return { workOrder: updatedWo as unknown as WorkOrder, invoiceCreated: false };
  }
  const registerPo = await fetchRegisterPoByProductionOrderId(productionOrderId);
  if (!registerPo) {
    console.warn('No register_po for', productionOrderId);
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
    rateManpower: registerPo.rateManpower,
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
  const { data: woRows } = await supabase
    .from('work_orders')
    .select('id')
    .in('prod_status', ['FINISHING_COMPLETE', 'INVOICED']);
  if (!woRows) return 0;

  const woIds = (woRows as Array<{ id: string }>).map((w) => w.id);

  // Find which already have an invoice
  const { data: existingInvs } = await supabase
    .from('invoices')
    .select('work_order_id')
    .in('work_order_id', woIds);
  const existingIds = new Set(
    (existingInvs as Array<{ work_order_id: string }> | null)?.map((r) => r.work_order_id) ?? [],
  );

  const missing = woIds.filter((id) => !existingIds.has(id));
  let created = 0;
  for (const id of missing) {
    try {
      // For backfill, skip the prod_status update step by setting it directly first.
      await supabase.from('work_orders').update({ prod_status: 'FINISHING_COMPLETE' }).eq('id', id);
      const result = await transitionToFinishingComplete(id);
      if (result.invoiceCreated) created++;
    } catch (err) {
      console.error('backfill failed for', id, err);
    }
  }
  return created;
}
