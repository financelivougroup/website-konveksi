import { supabase } from '@/lib/supabase';
import { mergeOrderPriceComponents } from '@/lib/orderEntry';
import type {
  LastPriceMatch,
  OrderPriceComponent,
  OrderPriceComponentKey,
  RegisterHargaRow,
} from '@/types/pipeline';

const TABLE = 'register_harga';

/**
 * Komponen harga dari kolom `components` (jsonb) dilewatkan ke
 * `mergeOrderPriceComponents` supaya delapan kunci kanonik selalu lengkap dan
 * urutannya mengikuti `ORDER_PRICE_COMPONENTS` — snapshot lama yang tidak
 * lengkap pun tetap menghasilkan delapan komponen, bukan lima atau enam.
 */
function mapComponents(value: unknown): OrderPriceComponent[] {
  if (!Array.isArray(value)) return mergeOrderPriceComponents(null);
  return mergeOrderPriceComponents(
    value.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        key: row.key as OrderPriceComponent['key'],
        label: row.label as string,
        value: Number(row.value) || 0,
      };
    }),
  );
}

/**
 * Baris register harga dengan nilai tiap komponen harga di tingkat teratas.
 *
 * Nilai komponen sengaja diratakan (bukan disimpan di `components` saja) karena
 * `applyFilters` dan `applySorts` di `src/lib/tableQuery.ts` membaca
 * `row[field]` dari tingkat teratas baris. Angkanya dibiarkan sebagai number —
 * `applySorts` mengurangkan `Number(nilai)` dan `applyFilters` memakai
 * `parseFloat`, jadi bentuk angka membuat "Lebih dari" dan urutan angka
 * bekerja dengan benar. Format rupiah cukup dilakukan saat menampilkan.
 */
export type RegisterHargaAliased = RegisterHargaRow &
  Record<OrderPriceComponentKey, number>;

function mapRow(row: Record<string, unknown>): RegisterHargaAliased {
  const components = mapComponents(row.components);
  const values = Object.fromEntries(
    components.map((component) => [component.key, Number(component.value) || 0]),
  ) as Record<OrderPriceComponentKey, number>;

  return {
    ...values,
    id: row.id as number,
    productionOrderId: row.production_order_id as string,
    productionCode: (row.production_code as string | null) ?? null,
    clientProductionCode: (row.client_production_code as string | null) ?? null,
    productId: (row.product_id as string | null) ?? null,
    product: (row.product as string | null) ?? null,
    brand: (row.brand as string | null) ?? null,
    totalPerPiece: Number(row.total_per_piece) || 0,
    components,
    actor: (row.actor as string | null) ?? null,
    savedAt: row.saved_at as string,
  };
}

/**
 * Seluruh isi Register Harga untuk halaman baca-saja.
 *
 * Diurutkan KRONOLOGIS: tanggal terlama dulu, yang terbaru di PALING BAWAH.
 *
 * Permintaan user (verbatim): *"register harga juga tolong urutannya diganti,
 * semakin baru tanggalnya, semakin kebawah"* — sengaja dibalik dari sebelumnya
 * (dulu terbaru di atas), mengikuti urutan yang sama dengan halaman Expense.
 *
 * Konsekuensi yang disadari: halaman ini pada dasarnya riwayat harga, dan harga
 * yang BERLAKU adalah baris terbaru — yang kini berada di paling bawah, bukan
 * paling atas. Bila kelak harga terakhir perlu terlihat lebih dulu, yang diubah
 * cukup dua baris `.order()` di sini.
 *
 * `id` menaik sebagai pemecah seri supaya baris dengan `saved_at` sama tetap
 * stabil menurut urutan input, bukan bertukar tempat antar-pemuatan.
 *
 * Halaman ini TIDAK berhalaman (tidak mengirim `onPageChange`), jadi tidak ada
 * lompatan halaman yang perlu diurus setelah menyimpan seperti di Expense.
 */
export async function fetchAll(): Promise<{ data: RegisterHargaAliased[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('saved_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) return { data: null, error };
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error: null };
}

/**
 * Hapus beberapa baris Register Harga sekaligus.
 *
 * Dipakai aksi massal "pilih baris → Hapus" di halaman Register Harga. Sengaja
 * satu perintah DELETE dengan `.in('id', ids)`, bukan satu panggilan per baris:
 * menghapus 50 baris tidak boleh menjadi 50 permintaan jaringan.
 *
 * `.select('id')` dipasang supaya baris yang benar-benar terhapus bisa dibaca
 * kembali. Policy DELETE-nya `USING (true)` tanpa filter tambahan, jadi id yang
 * tidak ada tidak menghasilkan error — hanya tidak ikut terdaftar. Tanpa
 * pemeriksaan ini, permintaan yang tidak mengenai apa pun akan dilaporkan
 * sukses. Idiom yang sama dipakai `remove` di `src/services/expenseEntries.ts`.
 *
 * Yang dikembalikan adalah **id yang benar-benar terhapus**, bukan id yang
 * diminta. Pemanggil memakainya untuk membuang baris dari state lokal; kalau
 * memakai daftar yang diminta, baris yang gagal terhapus akan ikut hilang dari
 * layar padahal masih ada di database.
 *
 * Catatan: penghapusan di sini permanen dan menghilangkan riwayat harga. Tabel
 * ini tidak punya policy INSERT/UPDATE, jadi satu-satunya jalur tulis dari UI
 * adalah hapus ini — lihat migrasi `2026-09-21-register-harga-delete-policy.sql`.
 */
export async function removeMany(
  ids: number[],
): Promise<{ deletedIds: number[]; error: Error | null }> {
  if (ids.length === 0) return { deletedIds: [], error: null };

  const { data, error } = await supabase.from(TABLE).delete().in('id', ids).select('id');

  if (error) return { deletedIds: [], error };
  const deletedIds = (data as { id: number }[] | null)?.map((row) => row.id) ?? [];
  return { deletedIds, error: null };
}

export type FetchLastPriceInput = {
  productId: string;
  brand: string;
  product: string;
  /** Order yang sedang diedit, supaya tidak cocok dengan dirinya sendiri. */
  excludeOrderId?: string | null;
};

/**
 * Ambil harga produksi terakhir untuk auto-fill di Order Entry.
 *
 * Mengembalikan `null` bila belum pernah ada harga untuk Product ID maupun
 * pasangan Client + Produk tersebut — bukan error, karena order baru yang
 * benar-benar baru memang tidak punya acuan harga.
 */
export async function fetchLastPrice(
  input: FetchLastPriceInput,
): Promise<{ data: LastPriceMatch | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('price_register_last_price', {
    p_product_id: input.productId,
    p_brand: input.brand,
    p_product: input.product,
    p_exclude_order_id: input.excludeOrderId ?? null,
  });

  if (error) return { data: null, error };
  if (!data) return { data: null, error: null };

  const row = data as Record<string, unknown>;
  return {
    data: {
      productionOrderId: row.production_order_id as string,
      productionCode: (row.production_code as string | null) ?? null,
      productId: (row.product_id as string | null) ?? null,
      product: (row.product as string | null) ?? null,
      brand: (row.brand as string | null) ?? null,
      totalPerPiece: Number(row.total_per_piece) || 0,
      savedAt: row.saved_at as string,
      matchedBy: row.matched_by === 'product' ? 'product' : 'product_id',
      components: mapComponents(row.components),
    },
    error: null,
  };
}
