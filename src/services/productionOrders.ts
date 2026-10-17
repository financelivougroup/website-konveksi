import { supabase } from '@/lib/supabase';
import {
  productPhotoUrl,
  removeProductPhotoByPath,
  uploadVariationPhoto,
} from '@/services/productPhotos';
import type {
  OrderEntryDetail,
  OrderEntryOverview,
  OrderEntrySaveInput,
  ProductionOrderVariation,
} from '@/types/pipeline';

/**
 * Menyisipkan URL publik yang diturunkan dari path.
 * RPC hanya mengembalikan path; URL publik dirangkai di klien supaya path
 * tetap satu-satunya sumber kebenaran di database.
 */
function withPhotoUrl<T extends { productPhotoPath?: string | null }>(row: T) {
  return { ...row, productPhotoUrl: productPhotoUrl(row.productPhotoPath) };
}

/**
 * Sama seperti withPhotoUrl, ditambah foto per variasi dan foto variasi pertama.
 *
 * Sengaja tidak memakai overload: bentuk kembaliannya dirakit dari
 * `Record<string, unknown>` hasil RPC, jadi tidak ada cara jujur untuk
 * menjanjikan `OrderEntryDetail` maupun `OrderEntryOverview` tanpa
 * mengarang-ngarang isinya. Pemanggil yang tahu bentuk pastinya menyempitkan
 * tipe sendiri.
 */
function withVariationPhotos(row: Record<string, unknown>) {
  const variations = (row.variations as ProductionOrderVariation[] | undefined)?.map(
    (variation) => ({ ...variation, photoUrl: productPhotoUrl(variation.photoPath) }),
  );

  return {
    ...withPhotoUrl(row),
    variationPhotoUrl: productPhotoUrl(row.variationPhotoPath as string | null | undefined),
    ...(variations ? { variations } : {}),
  };
}

export async function fetchAll(): Promise<{ data: OrderEntryOverview[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('order_entry_list');
  if (error) return { data: null, error };
  const rows = ((data ?? []) as Record<string, unknown>[]).map(
    (row) => withVariationPhotos(row) as unknown as OrderEntryOverview,
  );
  return { data: rows, error: null };
}

export async function fetchById(id: string): Promise<{ data: OrderEntryDetail | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('order_entry_get', { p_order_id: id });
  if (error) return { data: null, error };
  const row = (data as Record<string, unknown> | null) ?? null;
  return {
    data: row ? (withVariationPhotos(row) as unknown as OrderEntryDetail) : null,
    error: null,
  };
}

export async function save(input: OrderEntrySaveInput): Promise<{ data: OrderEntryDetail | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('order_entry_save', {
    p_order_id: input.id ?? null,
    p_production_code: input.productionCode,
    p_client_production_code: input.clientProductionCode,
    p_product_id: input.productId,
    p_product: input.product,
    p_brand: input.brand,
    p_variations: input.variations,
    p_components: input.components,
    p_actor: input.actor,
  });

  if (error) return { data: null, error };
  return {
    data: withVariationPhotos(data as Record<string, unknown>) as unknown as OrderEntryDetail,
    error: null,
  };
}

/**
 * Ambil pratinjau kode produksi untuk client tertentu.
 *
 * Nomor di sini **tidak dipesan** — hanya untuk ditampilkan di form sebelum
 * disimpan. Kode yang berlaku adalah yang dikembalikan `save()`, karena
 * `next_production_code()` yang mengunci nomor saat penyimpanan. Karena itu
 * nilai ini tidak pernah dipakai sebagai kunci, dan tidak masalah bila
 * bergeser satu angka saat ada user lain yang menyimpan bersamaan.
 *
 * Kembalian `null` berarti client belum terdaftar di Register Client atau RPC
 * gagal — pemanggil menampilkan placeholder, bukan error.
 */
export async function previewProductionCode(brand: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('production_code_preview', { p_brand: brand });
  if (error) return null;
  return typeof data === 'string' ? data : null;
}

/** Satu baris laporan order yang tidak bisa dibatalkan oleh pembatalan massal. */
export interface CancelSkipped {
  id: string;
  productionCode?: string | null;
  reason: string;
}

export interface CancelManyResult {
  cancelled: number;
  skipped: CancelSkipped[];
}

/**
 * Batalkan banyak order sekaligus.
 *
 * Lewat RPC `cancel_production_orders`, bukan loop `cancel()` dari klien:
 * pembatalan per baris harus divalidasi terhadap status dan progres terbaru,
 * dan tiap baris perlu dikunci (`FOR UPDATE`) supaya dua user tidak
 * membatalkan order yang sama bersamaan.
 *
 * RPC sengaja tidak menggagalkan seluruh batch bila satu order tidak bisa
 * dibatalkan: yang memenuhi syarat tetap dibatalkan, sisanya dilaporkan
 * beserta alasannya agar UI bisa menjelaskan kenapa.
 */
export async function cancelMany(
  ids: string[],
  actor: string,
): Promise<{ data: CancelManyResult | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('cancel_production_orders', {
    p_production_order_ids: ids,
    p_actor: actor,
  });
  if (error) return { data: null, error };

  const result = (data ?? {}) as { cancelled?: number; skipped?: CancelSkipped[] };
  return {
    data: {
      cancelled: result.cancelled ?? 0,
      skipped: result.skipped ?? [],
    },
    error: null,
  };
}

/**
 * Simpan path foto ke order.
 *
 * Langsung ke tabel production_orders (bukan RPC baru) karena policy UPDATE
 * untuk role authenticated sudah USING(true) WITH CHECK(true), dan foto
 * bukan bagian dari transaksi penyimpanan order — order harus tetap
 * tersimpan walau unggah fotonya gagal.
 */
export async function setProductPhoto(
  id: string,
  filePath: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('production_orders')
    .update({ product_photo_path: filePath })
    .eq('id', id);
  return { error };
}

export interface SetVariationPhotoResult {
  /** Path yang tersimpan, atau null bila foto dilepas. */
  photoPath: string | null;
  error: Error | null;
}

/**
 * Pasang foto ke satu variasi.
 *
 * Lewat RPC `order_entry_set_variation_photo`, bukan update tabel langsung:
 * production_order_variations ber-RLS SELECT saja, dan memberi policy UPDATE
 * akan membuka celah bagi klien untuk mengubah quantity/color sambil
 * melewati validasi struktur di order_entry_save.
 *
 * Unggah objek terjadi sebelum RPC dipanggil, dan objek lama dihapus setelah
 * path baru tersimpan — jadi tidak ada jendela di mana kolom menunjuk ke
 * objek yang sudah hilang.
 */
export async function setVariationPhoto(
  variationId: string,
  orderId: string,
  file: File,
): Promise<SetVariationPhotoResult> {
  const upload = await uploadVariationPhoto({ orderId, variationId, file });
  if (upload.error) return { photoPath: null, error: upload.error };

  const { data, error } = await supabase.rpc('order_entry_set_variation_photo', {
    p_variation_id: variationId,
    p_photo_path: upload.filePath,
  });

  if (error) {
    // Path tidak tersimpan, jadi objek yang baru diunggah menjadi sampah.
    await removeProductPhotoByPath(upload.filePath);
    return { photoPath: null, error };
  }

  const oldPath = (data as { oldPhotoPath?: string | null } | null)?.oldPhotoPath ?? null;
  if (oldPath && oldPath !== upload.filePath) {
    await removeProductPhotoByPath(oldPath);
  }

  return { photoPath: upload.filePath, error: null };
}

/**
 * Lepas foto dari satu variasi.
 *
 * Kolom dinul-kan lebih dulu, lalu objeknya dihapus — kalau hapus objek
 * gagal, kolom sudah konsisten dan tidak meninggalkan URL mati di UI.
 */
export async function clearVariationPhoto(
  variationId: string,
  oldPath: string | null | undefined,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('order_entry_set_variation_photo', {
    p_variation_id: variationId,
    p_photo_path: null,
  });
  if (error) return { error };
  if (oldPath) await removeProductPhotoByPath(oldPath);
  return { error: null };
}

/**
 * Lepas foto dari order: null-kan kolom, lalu hapus objeknya dari storage.
 * Urutan sengaja kolom dulu — kalau hapus objek yang gagal, kolom sudah
 * konsisten dan tidak meninggalkan URL mati di UI.
 */
export async function clearProductPhoto(
  id: string,
  oldPath: string | null | undefined,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('production_orders')
    .update({ product_photo_path: null })
    .eq('id', id);
  if (error) return { error };
  if (oldPath) await removeProductPhotoByPath(oldPath);
  return { error: null };
}
