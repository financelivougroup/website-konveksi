import { supabase } from '@/lib/supabase';

const TABLE = 'complain_files';
const BUCKET = 'complain-proofs';

export interface ComplainFileRow {
  id: string;
  complainId: number;
  fileName: string;
  filePath: string;
  fileUrl: string;
  uploadedAt: string;
}

interface DbRow {
  id: string;
  complain_id: number;
  file_name: string;
  file_path: string;
  file_url: string;
  uploaded_at: string;
}

function mapRow(row: DbRow): ComplainFileRow {
  return {
    id: row.id,
    complainId: row.complain_id,
    fileName: row.file_name,
    filePath: row.file_path,
    fileUrl: row.file_url,
    uploadedAt: row.uploaded_at,
  };
}

export async function fetchFilesByComplainId(complainId: number): Promise<{ data: ComplainFileRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('complain_id', complainId)
    .order('uploaded_at', { ascending: true });
  if (error) return { data: null, error };
  const rows = (data as DbRow[] | null)?.map(mapRow) ?? null;
  return { data: rows, error: null };
}

/**
 * Hitung jumlah file bukti per complain_id dalam satu query.
 * Return: { [complainId]: count }. Key selalu string (bigint bisa tiba
 * sebagai string dari supabase-js), value jumlah foto.
 */
export async function fetchFileCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from(TABLE).select('complain_id');
  if (error || !data) return {};
  const counts: Record<string, number> = {};
  for (const row of data as Array<{ complain_id: unknown }>) {
    if (row.complain_id === null || row.complain_id === undefined) continue;
    const key = String(row.complain_id);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export interface UploadComplainProofInput {
  complainId: number;
  file: File;
}

export interface UploadComplainProofResult {
  fileName: string;
  filePath: string;
  fileUrl: string;
  error: Error | null;
}

export async function uploadComplainProof(input: UploadComplainProofInput): Promise<UploadComplainProofResult> {
  const safeName = input.file.name.replace(/[^\w.\-]+/g, '_');
  const filePath = `complain-${input.complainId}/${Date.now()}-${safeName}`;
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

export async function createComplainFileRecord(input: { complainId: number; fileName: string; filePath: string; fileUrl: string }): Promise<{ data: ComplainFileRow | null; error: Error | null }> {
  const dbInput = {
    complain_id: input.complainId,
    file_name: input.fileName,
    file_path: input.filePath,
    file_url: input.fileUrl,
  };
  const { data, error } = await supabase.from(TABLE).insert(dbInput).select().single();
  if (error) return { data: null, error };
  return { data: data ? mapRow(data as DbRow) : null, error: null };
}

/**
 * Hapus objek storage bukti complain berdasarkan path (best-effort —
 * dipakai saat complain dihapus dan row complain_files hilang oleh CASCADE).
 */
export async function removeComplainFilesByPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabase.storage.from(BUCKET).remove(paths);
}

export async function removeComplainFile(id: string): Promise<{ error: Error | null }> {
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
