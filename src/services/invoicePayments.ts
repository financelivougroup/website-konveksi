import { supabase } from '@/lib/supabase';
import type { InvoicePaymentRow } from '@/types/pipeline';

const TABLE = 'invoice_payments';

interface DbRow {
  id: string;
  invoice_id: string;
  payment_type: 'cash' | 'termin';
  termin_no: number | null;
  payment_date: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: DbRow): InvoicePaymentRow {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    paymentType: row.payment_type,
    terminNo: row.termin_no,
    paymentDate: row.payment_date,
    amount: row.amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchPaymentsByInvoiceId(invoiceId: string): Promise<{ data: InvoicePaymentRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('termin_no', { ascending: true });
  if (error) return { data: null, error };
  const rows = (data as DbRow[] | null)?.map(mapRow) ?? null;
  return { data: rows, error: null };
}

export async function createPayment(input: Omit<InvoicePaymentRow, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ data: InvoicePaymentRow | null; error: Error | null }> {
  const dbInput = {
    invoice_id: input.invoiceId,
    payment_type: input.paymentType,
    termin_no: input.terminNo,
    payment_date: input.paymentDate,
    amount: input.amount,
  };
  const { data, error } = await supabase.from(TABLE).insert(dbInput).select().single();
  if (error) return { data: null, error };
  return { data: data ? mapRow(data as DbRow) : null, error: null };
}

export async function updatePayment(id: string, updates: Partial<InvoicePaymentRow>): Promise<{ error: Error | null }> {
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.paymentDate !== undefined) dbUpdates.payment_date = updates.paymentDate;
  if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
  if (updates.paymentType !== undefined) dbUpdates.payment_type = updates.paymentType;
  if (updates.terminNo !== undefined) dbUpdates.termin_no = updates.terminNo;
  const { error } = await supabase.from(TABLE).update(dbUpdates).eq('id', id);
  return { error };
}

export async function removePayment(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  return { error };
}

export async function removePaymentsByInvoiceId(invoiceId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('invoice_id', invoiceId);
  return { error };
}