import { supabase } from '@/lib/supabase';
import { preview, execute } from '@/services/permanentDeletion';
import type { InvoiceRow, BillingType } from '@/types/pipeline';

const TABLE = 'invoices';
const WO_TABLE = 'work_orders';

interface DbInvoiceRow {
  id: string;
  work_order_id: string;
  production_order_id: string | null;
  client_production_code: string | null;
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
    productionOrderId: row.production_order_id ?? null,
    clientProductionCode: row.client_production_code ?? null,
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

/**
 * Invoice milik satu Kode Produksi Konveksi.
 *
 * Sejak invoice dibuat per kode produksi (bukan per variasi), inilah
 * pencarian yang dipakai untuk mencegah invoice kedua bagi kode yang sama.
 *
 * **Invoice lama harus ikut ditemukan.** Sebelum migrasi
 * `invoices_per_production_code`, invoice dibuat per work order sehingga
 * `production_order_id`-nya NULL — dan data live memang masih punya baris
 * seperti itu. Kalau pencarian ini hanya melihat `production_order_id`, baris
 * lama tidak terlihat, `ensureInvoiceForProductionOrder` mengira kode itu belum
 * ditagih, lalu menerbitkan **invoice kedua untuk kode yang sama** — klien
 * tertagih dua kali. Karena itu pencarian diperluas lewat WO wakil: id work
 * order yang ber-`source_order_id` kode tersebut.
 *
 * `work_order_id` UNIQUE + `production_order_id` tidak, jadi penggabungan
 * dilakukan di klien dan hasil pertama yang menang — bukan `maybeSingle()`
 * yang akan melempar bila dua baris cocok.
 */
export async function fetchInvoiceByProductionOrderId(
  productionOrderId: string,
): Promise<{ data: InvoiceRow | null; error: Error | null }> {
  const direct = await supabase
    .from(TABLE)
    .select('*')
    .eq('production_order_id', productionOrderId)
    .limit(1);
  if (direct.error) return { data: null, error: direct.error };
  const directRow = (direct.data ?? [])[0];
  if (directRow) return { data: mapRow(directRow as DbInvoiceRow), error: null };

  // Belum ketemu → kemungkinan invoice lama (production_order_id NULL). Telusuri
  // lewat work order grup.
  const groupWos = await supabase
    .from(WO_TABLE)
    .select('id')
    .eq('source_order_id', productionOrderId);
  if (groupWos.error) return { data: null, error: groupWos.error };
  const ids = ((groupWos.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (ids.length === 0) return { data: null, error: null };

  const legacy = await supabase
    .from(TABLE)
    .select('*')
    .in('work_order_id', ids)
    .limit(1);
  if (legacy.error) return { data: null, error: legacy.error };
  const legacyRow = (legacy.data ?? [])[0];
  return { data: legacyRow ? mapRow(legacyRow as DbInvoiceRow) : null, error: null };
}

export async function fetchMaxSequenceNumber(): Promise<{ sequence: number; error: Error | null }> {
  const { data, error } = await supabase.rpc('permanent_delete_invoice_sequence');
  if (error) return { sequence: 0, error };
  if (!Number.isSafeInteger(data) || data < 0) {
    return { sequence: 0, error: new Error('Nomor urut invoice tidak valid.') };
  }
  return { sequence: data, error: null };
}

export async function createInvoiceAuto(input: Omit<InvoiceRow, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ data: InvoiceRow | null; error: Error | null }> {
  const dbInput = {
    work_order_id: input.workOrderId,
    production_order_id: input.productionOrderId ?? null,
    client_production_code: input.clientProductionCode ?? null,
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
  const result = await deleteInvoice(id);
  return { error: result.error };
}

/**
 * Kembalikan SELURUH work order satu Kode Produksi ke antrean tagihan setelah
 * invoice-nya dibatalkan.
 *
 * Kenapa seluruh grup, bukan satu WO: invoice kini milik satu **Kode Produksi
 * Konveksi**, sedangkan `invoices.work_order_id` hanya menunjuk satu variasi
 * sebagai wakil (skema masih NOT NULL + UNIQUE). `order_entry_list` menghitung
 * status produksi order dari jumlah WO yang ber-invoice di grup
 * (`invoice_count = work_order_count`), jadi mengembalikan satu WO saja akan
 * membuat order tampak "sebagian sudah ditagih" padahal invoice-nya sudah
 * dibatalkan seluruhnya.
 *
 * Terpisah dari `updateWorkOrderInvoiceStatus` karena fungsi itu hanya menerima
 * status maju (`INVOICED`/`PARTIAL_PAID`/`PAID`) dan tidak pernah menurunkan
 * `prod_status`. Di sini `prod_status` memang harus turun: produksinya sudah
 * selesai, yang dibatalkan hanya tagihannya.
 */
export async function resetWorkOrderInvoiceStatus(
  workOrderId: string,
  productionOrderId?: string | null,
): Promise<{ error: Error | null }> {
  const next = { invoice_status: 'WAITING_INVOICE', prod_status: 'FINISHED' };

  // Rantai: invoice → grup WO. Tanpa productionOrderId (invoice lama sebelum
  // migrasi invoices_per_production_code) hanya WO wakil yang bisa dikembalikan.
  let query = supabase.from(WO_TABLE).update(next).select('id');
  query = productionOrderId
    ? query.eq('source_order_id', productionOrderId)
    : query.eq('id', workOrderId);

  const { data, error } = await query;
  if (error) return { error };
  return { error: data && data.length > 0 ? null : new Error('Work order tidak ditemukan.') };
}

export interface DeleteInvoiceResult {
  /** Operasi gagal dan tidak ada yang berubah — invoice masih ada. */
  error: Error | null;
  /** Invoice sudah terhapus, tetapi ada sisa yang gagal dirapikan. */
  cleanupError: Error | null;
}

/** Atomic server deletion; media cleanup runs only after commit. */
export async function deleteInvoice(invoiceId: string): Promise<DeleteInvoiceResult> {
  const impact = await preview('invoices', [invoiceId]);
  if (impact.error) return { error: impact.error, cleanupError: null };
  const result = await execute('invoices', [invoiceId], impact.data.fingerprint);
  return { error: result.error, cleanupError: result.data?.cleanupError ?? null };
}

/**
 * Tandai status tagihan pada SELURUH work order satu Kode Produksi Konveksi.
 *
 * Sama seperti `resetWorkOrderInvoiceStatus`, cakupannya grup — bukan satu WO.
 * Alasannya konsisten: `invoices.work_order_id` hanya menunjuk satu variasi
 * sebagai wakil, sedangkan `order_entry_list` membaca status produksi order
 * dari `invoice_count = work_order_count` di grup. Kalau hanya WO wakil yang
 * ditandai, order dengan 4 variasi akan selamanya tampak belum lunas walau
 * invoice-nya sudah PAID.
 *
 * Tanpa `productionOrderId` (invoice lama) hanya WO wakil yang ditandai —
 * perilaku lama dipertahankan agar invoice pra-migrasi tidak ikut mengubah
 * variasi lain yang mungkin memang belum ditagih.
 */
export async function updateWorkOrderInvoiceStatus(
  workOrderId: string,
  status: 'INVOICED' | 'PARTIAL_PAID' | 'PAID',
  productionOrderId?: string | null,
): Promise<{ error: Error | null }> {
  const update: Record<string, unknown> = { invoice_status: status };
  if (status === 'INVOICED' || status === 'PAID') {
    update.prod_status = 'INVOICED';
  }
  let query = supabase.from(WO_TABLE).update(update);
  query = productionOrderId
    ? query.eq('source_order_id', productionOrderId)
    : query.eq('id', workOrderId);
  const { error } = await query;
  return { error };
}