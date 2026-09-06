import { supabase } from '@/lib/supabase';
import type { InvoicePaymentFileRow } from '@/types/pipeline';

const TABLE = 'invoice_payment_files';
const BUCKET = 'invoice-payment-proofs';

interface DbRow {
  id: string;
  payment_id: string;
  file_name: string;
  file_path: string;
  file_url: string;
  uploaded_at: string;
}

function mapRow(row: DbRow): InvoicePaymentFileRow {
  return {
    id: row.id,
    paymentId: row.payment_id,
    fileName: row.file_name,
    filePath: row.file_path,
    fileUrl: row.file_url,
    uploadedAt: row.uploaded_at,
  };
}

export async function fetchFilesByPaymentIds(paymentIds: string[]): Promise<{ data: InvoicePaymentFileRow[] | null; error: Error | null }> {
  if (paymentIds.length === 0) return { data: [], error: null };
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .in('payment_id', paymentIds)
    .order('uploaded_at', { ascending: true });
  if (error) return { data: null, error };
  return { data: (data as DbRow[] | null)?.map(mapRow) ?? [], error: null };
}

export interface UploadPaymentProofInput {
  invoiceId: string;
  paymentId: string;
  file: File;
}

export interface UploadPaymentProofResult {
  fileName: string;
  filePath: string;
  fileUrl: string;
  error: Error | null;
}

export async function uploadPaymentProof(input: UploadPaymentProofInput): Promise<UploadPaymentProofResult> {
  const safeName = input.file.name.replace(/[^\w.-]+/g, '_');
  const filePath = `${input.invoiceId}/${input.paymentId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, input.file, { upsert: false, contentType: input.file.type || undefined });
  if (uploadError) {
    return { fileName: input.file.name, filePath, fileUrl: '', error: uploadError };
  }
  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return {
    fileName: input.file.name,
    filePath,
    fileUrl: publicUrlData.publicUrl,
    error: null,
  };
}

export async function createPaymentFileRecord(input: { paymentId: string; fileName: string; filePath: string; fileUrl: string }): Promise<{ data: InvoicePaymentFileRow | null; error: Error | null }> {
  const dbInput = {
    payment_id: input.paymentId,
    file_name: input.fileName,
    file_path: input.filePath,
    file_url: input.fileUrl,
  };
  const { data, error } = await supabase.from(TABLE).insert(dbInput).select().single();
  if (error) return { data: null, error };
  return { data: data ? mapRow(data as DbRow) : null, error: null };
}

export async function removePaymentProofObject(filePath: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.storage.from(BUCKET).remove([filePath]);
  return { error };
}

export async function removePaymentProofObjects(filePaths: string[]): Promise<{ error: Error | null }> {
  if (filePaths.length === 0) return { error: null };
  const { error } = await supabase.storage.from(BUCKET).remove(filePaths);
  return { error };
}

export async function removePaymentFile(id: string): Promise<{ error: Error | null; cleanupError: Error | null }> {
  const { data, error: fetchError } = await supabase
    .from(TABLE)
    .select('file_path')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) return { error: fetchError, cleanupError: null };
  const filePath = (data as { file_path: string } | null)?.file_path;
  if (!filePath) return { error: new Error('Bukti pembayaran tidak ditemukan.'), cleanupError: null };

  // Hapus object terlebih dahulu. Jika Storage gagal, metadata tetap menyimpan
  // filePath sehingga cleanup masih dapat dicoba ulang dari UI.
  const { error: cleanupError } = await removePaymentProofObject(filePath);
  if (cleanupError) return { error: null, cleanupError };

  const { data: deleted, error: deleteError } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (deleteError) return { error: deleteError, cleanupError: null };
  if (!deleted) return { error: new Error('Bukti pembayaran tidak ditemukan.'), cleanupError: null };
  return { error: null, cleanupError: null };
}
