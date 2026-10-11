import { productPhotoPath, variationPhotoPath } from '@/lib/orderEntry';
import { publicUrlFor, removeFromR2, uploadToR2 } from '@/services/r2Storage';

/**
 * Foto produk kini disimpan di Cloudflare R2 (satu bucket, awalan
 * `product-photos/`), bukan lagi di Supabase Storage. Path relatif yang
 * disimpan di database TIDAK berubah — awalan ditambahkan oleh lapisan R2.
 */

/**
 * URL publik untuk path objek foto produk.
 *
 * Mengembalikan null bila path kosong atau basis R2 belum dikonfigurasi, jadi
 * pemanggil cukup mengecek truthy sebelum merender <img>. Sinkron dan tanpa
 * permintaan jaringan — sama seperti sebelumnya, hanya sumber URL yang berganti.
 */
export function productPhotoUrl(path: string | null | undefined): string | null {
  return publicUrlFor('product-photos', path);
}

export interface UploadProductPhotoInput {
  orderId: string;
  file: File;
}

export interface UploadProductPhotoResult {
  filePath: string;
  error: Error | null;
}

/**
 * Unggah satu foto produk ke R2.
 * Mengembalikan path (bukan URL) — path itulah yang disimpan di kolom
 * production_orders.product_photo_path.
 */
export async function uploadProductPhoto(
  input: UploadProductPhotoInput,
): Promise<UploadProductPhotoResult> {
  const filePath = productPhotoPath(input.orderId, input.file.name, Date.now());
  const { error } = await uploadToR2({ logicalBucket: 'product-photos', path: filePath, file: input.file });
  if (error) return { filePath, error };
  return { filePath, error: null };
}

export interface UploadVariationPhotoInput {
  orderId: string;
  variationId: string;
  file: File;
}

/**
 * Unggah satu foto variasi ke R2.
 *
 * Path-nya memuat id variasi supaya dua variasi dalam order yang sama tidak
 * saling menimpa walau nama filenya sama.
 */
export async function uploadVariationPhoto(
  input: UploadVariationPhotoInput,
): Promise<UploadProductPhotoResult> {
  const filePath = variationPhotoPath(
    input.orderId,
    input.variationId,
    input.file.name,
    Date.now(),
  );
  const { error } = await uploadToR2({ logicalBucket: 'product-photos', path: filePath, file: input.file });
  if (error) return { filePath, error };
  return { filePath, error: null };
}

/**
 * Hapus objek foto dari R2. Best-effort: kegagalan di sini tidak
 * boleh membatalkan penyimpanan order, cukup dibiarkan — kolom sudah
 * dinul-kan lebih dulu oleh clearProductPhoto.
 */
export async function removeProductPhotoByPath(
  path: string | null | undefined,
): Promise<{ error: Error | null }> {
  if (!path) return { error: null };
  return removeFromR2('product-photos', [path]);
}

/**
 * Hapus banyak objek foto sekaligus.
 *
 * Dipakai saat order dihapus permanen: baris database sudah lenyap, jadi
 * pemanggil memperlakukan kegagalan di sini sebagai sampah Storage yang
 * tersisa — bukan kegagalan penghapusan.
 */
export async function removeProductPhotoByPaths(
  paths: string[],
): Promise<{ error: Error | null }> {
  return removeFromR2('product-photos', paths);
}
