import { supabase } from '@/lib/supabase';

export const TINGKAT_OPTIONS = [
  { key: 'ringan', label: 'Ringan', poin: 1 },
  { key: 'sedang', label: 'Sedang', poin: 2 },
  { key: 'berat', label: 'Berat', poin: 3 },
];

export const STATUS_OPTIONS = ['Baru', 'Diproses', 'Selesai'];

// posisi complain -> key komponen di register_po_components
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

  const { data: po, error: poError } = await supabase
    .from('register_po')
    .select('id')
    .eq('production_order_id', sourceOrderId)
    .maybeSingle();

  if (poError || !po) return null;

  const { data: comp, error: compError } = await supabase
    .from('register_po_components')
    .select('value')
    .eq('register_po_id', po.id)
    .eq('key', compKey)
    .maybeSingle();

  if (compError || !comp) return null;

  return Number(comp.value) || null;
}
