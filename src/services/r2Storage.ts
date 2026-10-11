import { supabase } from '@/lib/supabase';
import { r2PublicUrl, type R2LogicalBucket } from '@/lib/r2';

/**
 * Lapisan IO penyimpanan lampiran di Cloudflare R2.
 *
 * Kenapa lewat Cloudflare Worker, bukan langsung: R2 tidak punya RLS, jadi
 * browser tidak boleh memegang kredensial apa pun. Worker-lah satu-satunya
 * penjaga pintu — ia memverifikasi token Supabase sebelum menandatangani
 * unggahan. Modul ini hanya: minta tanda tangan, unggah/hapus, dan merangkai URL.
 *
 * Tanda tangan (presigned) hanya diperlukan untuk MENULIS. Karena bucket R2
 * publik, membaca cukup URL biasa — persis seperti pola `getPublicUrl` Supabase
 * yang digantikan modul ini.
 */

const SIGN_ENDPOINT = (import.meta.env.VITE_R2_SIGN_ENDPOINT as string | undefined) ?? '';

/** Basis URL publik R2 (custom domain), dipakai `publicUrlFor`. */
const PUBLIC_BASE = import.meta.env.VITE_R2_PUBLIC_BASE as string | undefined;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sesi tidak ditemukan — silakan masuk kembali.');
  return { Authorization: `Bearer ${token}` };
}

/**
 * Ubah balasan gagal Worker menjadi `Error` biasa.
 *
 * Pemanggil di seluruh aplikasi hanya membaca `error.message` (tidak ada yang
 * menyentuh `name`, `code`, atau `status` Supabase), jadi `Error` biasa sudah
 * setara dengan `StorageError` yang dikembalikan supabase-js sebelumnya.
 */
async function toError(res: Response): Promise<Error> {
  let message = `Penyimpanan gagal (HTTP ${res.status}).`;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body?.error?.message) message = body.error.message;
  } catch {
    // Balasan bukan JSON — pakai pesan generik di atas.
  }
  return new Error(message);
}

export interface UploadToR2Input {
  logicalBucket: R2LogicalBucket;
  /** Path relatif dari database, TANPA awalan jenis lampiran. */
  path: string;
  file: File;
}

/**
 * Unggah satu berkas ke R2 lewat dua langkah: minta URL bertanda tangan, lalu
 * PUT isinya.
 *
 * `Content-Type` WAJIB dikirim ulang saat PUT karena nilainya ikut masuk ke
 * tanda tangan — kalau berbeda, R2 menolak dengan SignatureDoesNotMatch.
 */
export async function uploadToR2(input: UploadToR2Input): Promise<{ error: Error | null }> {
  const contentType = input.file.type || 'application/octet-stream';
  const res = await fetch(`${SIGN_ENDPOINT}/sign/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({
      logicalBucket: input.logicalBucket,
      path: input.path,
      contentType,
      size: input.file.size,
    }),
  });
  if (!res.ok) return { error: await toError(res) };

  const { uploadUrl } = (await res.json()) as { uploadUrl?: string };
  if (!uploadUrl) return { error: new Error('Worker tidak mengembalikan URL unggah.') };

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: input.file,
  });
  if (!put.ok) return { error: new Error(`Unggah ke penyimpanan gagal (HTTP ${put.status}).`) };
  return { error: null };
}

/**
 * Hapus satu atau banyak objek sekaligus.
 *
 * Satu panggilan hanya boleh menyentuh SATU jenis lampiran — semua pemanggil
 * memang begitu (mereka menghapus path dari bucket yang sama). Kegagalan
 * sebagian dikembalikan sebagai error, sama seperti `storage.remove` yang
 * best-effort: pemanggil sudah memperlakukannya sebagai sampah yang tersisa,
 * bukan kegagalan fatal.
 */
export async function removeFromR2(
  logicalBucket: R2LogicalBucket,
  paths: string[],
): Promise<{ error: Error | null }> {
  const cleaned = paths.filter((path): path is string => Boolean(path));
  if (cleaned.length === 0) return { error: null };

  const res = await fetch(`${SIGN_ENDPOINT}/sign/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ logicalBucket, paths: cleaned }),
  });
  if (!res.ok) return { error: await toError(res) };

  const body = (await res.json()) as { errors?: Array<{ message?: string }> };
  if (body.errors?.length) {
    const first = body.errors[0]?.message ?? 'tidak diketahui';
    return { error: new Error(`Sebagian lampiran gagal dihapus: ${first}`) };
  }
  return { error: null };
}

/**
 * URL publik untuk path relatif. Sinkron dan tanpa IO, jadi bisa dipanggil saat
 * render — sama seperti `productPhotoUrl` sebelum migrasi.
 */
export function publicUrlFor(
  logicalBucket: R2LogicalBucket,
  path: string | null | undefined,
): string | null {
  return r2PublicUrl(PUBLIC_BASE, logicalBucket, path);
}
