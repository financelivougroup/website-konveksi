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

// Kontrak query tunggal: selector, mapper, dan urutan dipakai bersama agar
// modal dan tabel tidak bisa menampilkan set/urutan payment yang berbeda.
function selectPayments() {
  return supabase
    .from(TABLE)
    .select('*')
    .order('termin_no', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true });
}

export async function fetchPaymentsByInvoiceId(invoiceId: string): Promise<{ data: InvoicePaymentRow[] | null; error: Error | null }> {
  const { data, error } = await selectPayments().eq('invoice_id', invoiceId);
  if (error) return { data: null, error };
  return { data: (data as DbRow[] | null)?.map(mapRow) ?? [], error: null };
}

export async function fetchPaymentsByInvoiceIds(invoiceIds: string[]): Promise<{ data: InvoicePaymentRow[] | null; error: Error | null }> {
  if (invoiceIds.length === 0) return { data: [], error: null };
  const { data, error } = await selectPayments().in('invoice_id', invoiceIds);
  if (error) return { data: null, error };
  return { data: (data as DbRow[] | null)?.map(mapRow) ?? [], error: null };
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

export async function updatePayment(
  id: string,
  invoiceId: string,
  updates: Partial<InvoicePaymentRow>,
): Promise<{ error: Error | null }> {
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.paymentDate !== undefined) dbUpdates.payment_date = updates.paymentDate;
  if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
  if (updates.paymentType !== undefined) dbUpdates.payment_type = updates.paymentType;
  if (updates.terminNo !== undefined) dbUpdates.termin_no = updates.terminNo;
  const { data, error } = await supabase
    .from(TABLE)
    .update(dbUpdates)
    .eq('id', id)
    .eq('invoice_id', invoiceId)
    .select('id')
    .maybeSingle();
  if (error) return { error };
  return { error: data ? null : new Error('Payment tidak ditemukan atau bukan milik invoice ini.') };
}

export async function removePayment(id: string, invoiceId: string): Promise<{ error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .eq('invoice_id', invoiceId)
    .select('id')
    .maybeSingle();
  if (error) return { error };
  return { error: data ? null : new Error('Payment tidak ditemukan atau bukan milik invoice ini.') };
}
