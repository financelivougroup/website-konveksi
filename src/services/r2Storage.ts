import { supabase } from '@/lib/supabase';
import { MEDIA_PATH_PREFIX, r2PublicUrl, type R2LogicalBucket } from '@/lib/r2';

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

/**
 * Basis URL publik lampiran.
 *
 * Default-nya rute baca Worker (`<endpoint>/media`), BUKAN `<bucket>.r2.dev`:
 * domain `r2.dev` diblokir DNS oleh sebagian ISP Indonesia ("Internet Positif"),
 * jadi gambar tidak pernah sampai ke Cloudflare. `workers.dev` tidak diblokir.
 *
 * `VITE_R2_PUBLIC_BASE` tetap didukung untuk custom domain R2 di kemudian hari —
 * nilainya dipakai apa adanya sebagai basis, jadi isi dengan asal domain
 * (tanpa `/media`), karena kunci objek sudah membawa awalan jenis lampiran.
 */
const PUBLIC_BASE =
  (import.meta.env.VITE_R2_PUBLIC_BASE as string | undefined)?.trim() ||
  (SIGN_ENDPOINT ? `${SIGN_ENDPOINT.replace(/\/+$/, '')}${MEDIA_PATH_PREFIX.replace(/\/$/, '')}` : undefined);

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
 * Unggah satu berkas ke R2 lewat Worker.
 *
 * Isi berkas dikirim sebagai badan permintaan, metadata lewat header. Ini
 * SENGAJA tidak lagi memakai URL presigned: R2 hanya mengizinkan CORS pada
 * bucket yang punya kebijakan CORS, dan token API proyek ini tidak berhak
 * mengubahnya (403 AccessDenied). Tanpa kebijakan itu browser memblokir PUT
 * lintas-origin sebelum terkirim, sehingga unggahan gagal tanpa objek apa pun
 * tersimpan. Lewat Worker, browser hanya bicara dengan origin yang CORS-nya
 * kita kendalikan.
 */
export async function uploadToR2(input: UploadToR2Input): Promise<{ error: Error | null }> {
  try {
    const contentType = input.file.type || 'application/octet-stream';
    const res = await fetch(`${SIGN_ENDPOINT}/sign/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'x-r2-bucket': input.logicalBucket,
        'x-r2-path': input.path,
        'x-r2-content-type': contentType,
        ...(await authHeaders()),
      },
      body: input.file,
    });
    if (!res.ok) return { error: await toError(res) };
    return { error: null };
  } catch (cause) {
    // Callers expect returned errors so a saved order can report a failed photo.
    return { error: cause instanceof Error ? cause : new Error('Unggah lampiran gagal. Silakan coba lagi.') };
  }
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

/**
 * URL lampiran yang tersimpan sebagai kolom teks (`file_url`, `proof_url`).
 *
 * Kolom itu menyimpan URL ABSOLUT yang dirangkai saat unggahan, sehingga ikut
 * membeku bersama konfigurasi saat itu — termasuk URL `r2.dev` yang kini
 * diblokir ISP, atau alamat `127.0.0.1` saat dikembangkan lokal. Karena setiap
 * tabel lampiran juga menyimpan `path`, URL dihitung ulang dari path bila ada;
 * nilai tersimpan hanya dipakai sebagai cadangan untuk baris lama tanpa path.
 *
 * `stored` bisa berupa URL Supabase Storage lama, jadi jangan dipakai apa adanya
 * bila path tersedia.
 */
export function attachmentUrlFor(
  logicalBucket: R2LogicalBucket,
  path: string | null | undefined,
  stored: string | null | undefined,
): string | null {
  return publicUrlFor(logicalBucket, path) ?? (stored?.trim() ? stored : null);
}

/** True bila basis URL menunjuk mesin pengembang, bukan host yang bisa diakses umum. */
function isLoopbackBase(base: string | undefined): boolean {
  if (!base) return false;
  try {
    const host = new URL(base).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * URL untuk DISIMPAN ke kolom teks (`file_url`, `proof_url`).
 *
 * Berbeda dari `publicUrlFor`: alamat loopback tidak pernah ditulis ke database.
 * Saat mengembangkan lokal, signer mengarah ke `127.0.0.1` — menyimpannya
 * sebagai URL permanen akan membuat lampiran itu mati bagi semua orang lain dan
 * setelah deploy. Karena pembacaan selalu menghitung ulang dari `path`, kolom
 * ini boleh kosong tanpa kehilangan apa pun.
 */
export function durableAttachmentUrlFor(
  logicalBucket: R2LogicalBucket,
  path: string | null | undefined,
): string {
  if (isLoopbackBase(PUBLIC_BASE)) return '';
  return publicUrlFor(logicalBucket, path) ?? '';
}
