import { supabase } from '@/lib/supabase';
import {
  buildClientVariants,
  buildComplainOptions,
  type ClientVariant,
  type ComplainOptionRow,
  type ComplainProductionOption,
} from './complainCascade.ts';

export const TINGKAT_OPTIONS = [
  { key: 'ringan', label: 'Ringan', poin: 1 },
  { key: 'sedang', label: 'Sedang', poin: 2 },
  { key: 'berat', label: 'Berat', poin: 3 },
];

// Status lifecycle: complain baru dibuat otomatis berstatus NEED PROCEED;
// setelah pemotongan gaji dieksekusi, statusnya diganti SOLVED (via tombol
// di tabel — bukan pilihan user di form).
export const COMPLAIN_STATUS = {
  NEED_PROCEED: 'NEED PROCEED',
  SOLVED: 'SOLVED',
} as const;

// posisi complain -> key komponen harga Order Entry
export const POTONGAN_POSISI_KEY: Record<string, string> = {
  jahit: 'jahit',
  obras: 'obras',
  finishing: 'finishing',
  kancing: 'jasa_pasang_kancing',
};

/**
 * Pasangan kode produksi dari `work_orders` — **mentah, satu query**.
 *
 * Sengaja mengembalikan barisnya apa adanya, bukan salah satu bentuk turunan,
 * karena dua halaman membutuhkannya dalam bentuk berbeda dan keduanya harus
 * melihat data yang sama persis:
 *
 * - **Complain & Penalti** memakai `buildComplainOptions` (per produk+warna+kode;
 *   size sengaja dibuang karena kolomnya tidak menyimpan size).
 * - **Planning Produksi** memakai `buildClientVariants` (warna **dan** size
 *   dipertahankan, untuk dropdown Warna/Size yang mengikuti kode client).
 *
 * Dua fungsi query terpisah akan menggandakan request yang sama dan membuka
 * peluang keduanya berbeda; satu query + dua pembentuk lebih aman. `size` ikut
 * di-select justru karena Planning membutuhkannya.
 *
 * `work_code` tidak diambil: sejak 2026-09-22 form memisahkan Kode Produksi
 * Konveksi (`product_note`) dari Kode Produksi Client (`client_production_code`),
 * sama seperti halaman produksi lain.
 */
export async function fetchProductionCodeRows(): Promise<ComplainOptionRow[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('product, warna, size, client_production_code, product_note, source_order_id');

  if (error || !data || data.length === 0) {
    return [];
  }

  return data as ComplainOptionRow[];
}

/** Opsi cascade Complain — per produk + warna + kode client. */
export async function fetchProductionCodeOptions(): Promise<ComplainProductionOption[]> {
  return buildComplainOptions(await fetchProductionCodeRows());
}

/**
 * **Kedua** bentuk turunan sekaligus, dari satu query.
 *
 * Dipakai Planning Produksi, yang butuh keduanya untuk halaman yang sama:
 * `options` mengisi dropdown Kode Produksi Client (lewat `clientCodeChoices`),
 * `variants` mengisi dropdown Warna/Size. Memanggil dua loader terpisah akan
 * menembak `work_orders` dua kali dan membuka peluang keduanya melihat snapshot
 * berbeda di tengah pemuatan.
 */
export async function fetchProductionCodeData(): Promise<{
  options: ComplainProductionOption[];
  variants: ClientVariant[];
}> {
  const rows = await fetchProductionCodeRows();
  return {
    options: buildComplainOptions(rows),
    variants: buildClientVariants(rows),
  };
}

/** Nama yang dipakai halaman Complain & Penalti untuk query yang sama. */
export const fetchComplainOptions = fetchProductionCodeOptions;

export async function suggestPotongan(
  sourceOrderId: string | null,
  posisi: string
): Promise<number | null> {
  if (!sourceOrderId) return null;

  const compKey = POTONGAN_POSISI_KEY[posisi];
  if (!compKey) return null;

  const { data: price, error: priceError } = await supabase
    .from('production_order_prices')
    .select('id')
    .eq('production_order_id', sourceOrderId)
    .maybeSingle();

  if (priceError || !price) return null;

  const { data: component, error: componentError } = await supabase
    .from('production_order_price_components')
    .select('amount_per_piece')
    .eq('order_price_id', price.id)
    .eq('component_key', compKey)
    .maybeSingle();

  if (componentError || !component) return null;

  const value = Number(component.amount_per_piece);
  return Number.isFinite(value) ? value : null;
}
