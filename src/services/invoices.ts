import { supabase } from '@/lib/supabase';
import type { InvoiceRow, BillingType } from '@/types/pipeline';

const TABLE = 'invoices';
const WO_TABLE = 'work_orders';

interface DbInvoiceRow {
  id: string;
  work_order_id: string;
  order_price_id: string | null;
  auto_created: boolean;
  work_code: string;
  invoice_code: string;
  invoice_date: string;
  month_year: string;
  client_name: string;
  client_code: string;
  billing_type: BillingType;
  billing_type_code: 'MP' | 'SP';
  pcs_linked: number;
  unit_price: number;
  total_amount: number;
  rate_operational: number;
  total_income_manpower: number;
  total_income_operational: number;
  finance_validation: 'Need Register Invoice' | 'Collect Payment' | 'Partial Paid' | 'Paid';
  created_at: string;
  updated_at: string;
}

function mapRow(row: DbInvoiceRow): InvoiceRow {
  return {
    id: row.id,
    workOrderId: row.work_order_id,
    orderPriceId: row.order_price_id ?? undefined,
    autoCreated: row.auto_created,
    workCode: row.work_code,
    invoiceCode: row.invoice_code,
    invoiceDate: row.invoice_date,
    monthYear: row.month_year,
    clientName: row.client_name,
    clientCode: row.client_code,
    billingType: row.billing_type,
    billingTypeCodeValue: row.billing_type_code,
    pcsLinked: row.pcs_linked,
    unitPrice: row.unit_price,
    totalAmount: row.total_amount,
    rateOperational: row.rate_operational,
    totalIncomeManpower: row.total_income_manpower,
    totalIncomeOperational: row.total_income_operational,
    financeValidation: row.finance_validation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchAllInvoices(): Promise<{ data: InvoiceRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('invoice_date', { ascending: false });
  if (error) return { data: null, error };
  const rows = (data as DbInvoiceRow[] | null)?.map(mapRow) ?? null;
  return { data: rows, error: null };
}

export async function fetchInvoiceById(id: string): Promise<{ data: InvoiceRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return { data: null, error };
  return { data: data ? mapRow(data as DbInvoiceRow) : null, error: null };
}

export async function fetchInvoiceByWorkOrderId(workOrderId: string): Promise<{ data: InvoiceRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('work_order_id', workOrderId)
    .maybeSingle();
  if (error) return { data: null, error };
  return { data: data ? mapRow(data as DbInvoiceRow) : null, error: null };
}

export async function fetchMaxSequenceNumber(): Promise<{ sequence: number; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('invoice_code')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return { sequence: 0, error };
  const codes = (data as Array<{ invoice_code: string }> | null) ?? [];
  let maxSeq = 0;
  for (const r of codes) {
    const parts = r.invoice_code.split('/');
    const tail = parts[parts.length - 1];
    const n = parseInt(tail, 10);
    if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
  }
  return { sequence: maxSeq, error: null };
}

export async function createInvoiceAuto(input: Omit<InvoiceRow, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ data: InvoiceRow | null; error: Error | null }> {
  const dbInput = {
    work_order_id: input.workOrderId,
    order_price_id: input.orderPriceId ?? null,
    auto_created: input.autoCreated,
    work_code: input.workCode,
    invoice_code: input.invoiceCode,
    invoice_date: input.invoiceDate,
    month_year: input.monthYear,
    client_name: input.clientName,
    client_code: input.clientCode,
    billing_type: input.billingType,
    billing_type_code: input.billingTypeCodeValue,
    pcs_linked: input.pcsLinked,
    unit_price: input.unitPrice,
    total_amount: input.totalAmount,
    rate_operational: input.rateOperational,
    total_income_manpower: input.totalIncomeManpower,
    total_income_operational: input.totalIncomeOperational,
    finance_validation: input.financeValidation,
  };
  const { data, error } = await supabase
    .from(TABLE)
    .insert(dbInput)
    .select()
    .single();
  if (error) return { data: null, error };
  return { data: data ? mapRow(data as DbInvoiceRow) : null, error: null };
}

export async function updateInvoice(id: string, updates: Partial<InvoiceRow>): Promise<{ error: Error | null }> {
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.workCode !== undefined) dbUpdates.work_code = updates.workCode;
  if (updates.invoiceCode !== undefined) dbUpdates.invoice_code = updates.invoiceCode;
  if (updates.invoiceDate !== undefined) dbUpdates.invoice_date = updates.invoiceDate;
  if (updates.monthYear !== undefined) dbUpdates.month_year = updates.monthYear;
  if (updates.unitPrice !== undefined) dbUpdates.unit_price = updates.unitPrice;
  if (updates.totalAmount !== undefined) dbUpdates.total_amount = updates.totalAmount;
  if (updates.rateOperational !== undefined) dbUpdates.rate_operational = updates.rateOperational;
  if (updates.totalIncomeManpower !== undefined) dbUpdates.total_income_manpower = updates.totalIncomeManpower;
  if (updates.totalIncomeOperational !== undefined) dbUpdates.total_income_operational = updates.totalIncomeOperational;
  if (updates.financeValidation !== undefined) dbUpdates.finance_validation = updates.financeValidation;
  if (updates.billingType !== undefined) dbUpdates.billing_type = updates.billingType;
  if (updates.billingTypeCodeValue !== undefined) dbUpdates.billing_type_code = updates.billingTypeCodeValue;
  const { error } = await supabase.from(TABLE).update(dbUpdates).eq('id', id);
  return { error };
}

export async function removeInvoice(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  return { error };
}

export async function updateWorkOrderInvoiceStatus(
  workOrderId: string,
  status: 'INVOICED' | 'PARTIAL_PAID' | 'PAID',
): Promise<{ error: Error | null }> {
  const update: Record<string, unknown> = { invoice_status: status };
  if (status === 'INVOICED' || status === 'PAID') {
    update.prod_status = 'INVOICED';
  }
  const { error } = await supabase
    .from(WO_TABLE)
    .update(update)
    .eq('id', workOrderId);
  return { error };
}