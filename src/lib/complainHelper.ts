import { supabase } from '@/lib/supabase';

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

export interface ComplainOption {
  product: string;
  warna: string;
  workCode: string;
  sourceOrderId: string | null;
}

export async function fetchComplainOptions(): Promise<ComplainOption[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('product, warna, work_code, source_order_id');

  if (error || !data || data.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const options: ComplainOption[] = [];

  for (const row of data) {
    const product = row.product ?? '';
    const warna = row.warna ?? '';
    const workCode = row.work_code ?? '';
    const key = `${product}|${warna ?? ''}|${workCode}`;

    if (seen.has(key)) continue;
    seen.add(key);

    options.push({
      product,
      warna,
      workCode,
      sourceOrderId: row.source_order_id ?? null,
    });
  }

  return options;
}

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
