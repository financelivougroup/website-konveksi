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

export async function fetchFilesByPaymentId(paymentId: string): Promise<{ data: InvoicePaymentFileRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('payment_id', paymentId)
    .order('uploaded_at', { ascending: true });
  if (error) return { data: null, error };
  const rows = (data as DbRow[] | null)?.map(mapRow) ?? null;
  return { data: rows, error: null };
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
  const safeName = input.file.name.replace(/[^\w.\-]+/g, '_');
  const filePath = `${input.invoiceId}/${input.paymentId}/${Date.now()}-${safeName}`;
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

export async function removePaymentFile(id: string): Promise<{ error: Error | null }> {
  const { data, error: fetchError } = await supabase
    .from(TABLE)
    .select('file_path')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) return { error: fetchError };
  const filePath = (data as { file_path: string } | null)?.file_path;
  const { error: deleteError } = await supabase.from(TABLE).delete().eq('id', id);
  if (deleteError) return { error: deleteError };
  if (filePath) {
    await supabase.storage.from(BUCKET).remove([filePath]);
  }
  return { error: null };
}