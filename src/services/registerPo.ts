import { supabase } from '@/lib/supabase';
import type { RegisterPoRow, RegisterPoComponentRow, ProductionOrder } from '@/types/pipeline';

interface ProductionOrderRow {
  id: string;
  work_code: string;
  product_note: string;
  product: string;
  brand: string;
  quantity: number;
}

const TABLE = 'register_po';

function mapRow(row: Record<string, unknown>): RegisterPoRow {
  return {
    id: row.id as string,
    productionOrderId: row.production_order_id as string,
    totalPerPcs: row.total_per_pcs as number,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function fetchRegisterPoByProductionOrderId(poId: string): Promise<RegisterPoRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('production_order_id', poId)
    .maybeSingle();
  if (error) {
    console.error('fetchRegisterPoByProductionOrderId error', error);
    return null;
  }
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export interface RegisterPoWithComponents {
  po: RegisterPoRow;
  components: RegisterPoComponentRow[];
}

export async function fetchRegisterPoWithComponents(poId: string): Promise<RegisterPoWithComponents | null> {
  const po = await fetchRegisterPoByProductionOrderId(poId);
  if (!po) return null;
  const { data: compData } = await supabase
    .from('register_po_components')
    .select('*')
    .eq('register_po_id', po.id)
    .order('sort_order', { ascending: true });
  const components = (compData as Record<string, unknown>[] | null)?.map((r) => ({
    id: r.id as string,
    registerPoId: r.register_po_id as string,
    key: r.key as string,
    label: r.label as string,
    value: r.value as number,
    sortOrder: r.sort_order as number,
  })) ?? [];
  return { po, components };
}

export interface RegisterPoListItem {
  po: RegisterPoRow;
  productionOrder: ProductionOrder;
  components: RegisterPoComponentRow[];
}

export async function fetchAllRegisterPo(): Promise<RegisterPoListItem[]> {
  const { data: poRows, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('updated_at', { ascending: false });
  if (error || !poRows) return [];

  const results: RegisterPoListItem[] = [];
  for (const r of poRows as Record<string, unknown>[]) {
    const po = mapRow(r);
    const { data: ordRow } = await supabase
      .from('production_orders')
      .select('id, work_code, product_note, product, brand, quantity')
      .eq('id', po.productionOrderId)
      .maybeSingle<ProductionOrderRow>();
    if (!ordRow) continue;
    const orderMapped: ProductionOrder = {
      id: ordRow.id,
      workCode: ordRow.work_code,
      productNote: ordRow.product_note,
      product: ordRow.product,
      informationVariation: '',
      warna: '',
      size: '',
      brand: ordRow.brand,
      quantity: ordRow.quantity,
      status: 'PULLED',
      createdBy: '',
      createdAt: '',
      pulledAt: '',
    };
    const { data: comps } = await supabase
      .from('register_po_components')
      .select('*')
      .eq('register_po_id', po.id)
      .order('sort_order', { ascending: true });
    const components: RegisterPoComponentRow[] = (comps as Record<string, unknown>[] | null)?.map((c) => ({
      id: c.id as string,
      registerPoId: c.register_po_id as string,
      key: c.key as string,
      label: c.label as string,
      value: c.value as number,
      sortOrder: c.sort_order as number,
    })) ?? [];
    results.push({ po, productionOrder: orderMapped, components });
  }
  return results;
}

export interface RegisterPoInput {
  productionOrderId: string;
  components: Array<{ key: string; label: string; value: number }>;
}

export async function createRegisterPo(input: RegisterPoInput): Promise<{ id: string } | { error: Error }> {
  const { data: po, error: poErr } = await supabase
    .from(TABLE)
    .insert({
      production_order_id: input.productionOrderId,
      total_per_pcs: input.components.reduce((sum, c) => sum + c.value, 0),
    })
    .select()
    .single();
  if (poErr || !po) return { error: poErr ?? new Error('insert failed') };

  const newId = po.id as string;
  if (input.components.length > 0) {
    const rows = input.components.map((c, i) => ({
      register_po_id: newId,
      key: c.key,
      label: c.label,
      value: c.value,
      sort_order: i,
    }));
    const { error: compErr } = await supabase.from('register_po_components').insert(rows);
    if (compErr) {
      // Roll back parent row to avoid orphan half-state
      await supabase.from(TABLE).delete().eq('id', newId);
      return { error: compErr };
    }
  }
  return { id: newId };
}

export async function updateRegisterPo(id: string, input: Omit<RegisterPoInput, 'productionOrderId'>): Promise<{ error: Error | null }> {
  const totalPerPcs = input.components.reduce((sum, c) => sum + c.value, 0);

  // Update total_per_pcs directly
  await supabase.from(TABLE).update({ total_per_pcs: totalPerPcs }).eq('id', id);

  // Replace components atomically: delete all, then insert new
  const { error: delErr } = await supabase.from('register_po_components').delete().eq('register_po_id', id);
  if (delErr) return { error: delErr };

  if (input.components.length > 0) {
    const rows = input.components.map((c, i) => ({
      register_po_id: id,
      key: c.key,
      label: c.label,
      value: c.value,
      sort_order: i,
    }));
    const { error: compErr } = await supabase.from('register_po_components').insert(rows);
    if (compErr) return { error: compErr };
  }
  return { error: null };
}

export async function removeRegisterPo(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  return { error };
}