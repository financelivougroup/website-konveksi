export interface EntryWorkOrder {
  id: string;
  warna?: string;
  size?: string;
  product?: string;
  productNote?: string;
  clientProductionCode?: string | null;
  workCode?: string;
}

export function entryQuantitiesByWorkOrder<T extends { workOrderId: string }>(
  records: readonly T[],
  getQuantity: (record: T) => number,
  mode: 'sum' | 'first' = 'sum',
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const record of records) {
    if (mode === 'first' && totals.has(record.workOrderId)) continue;
    const quantity = Number(getQuantity(record)) || 0;
    totals.set(record.workOrderId, (totals.get(record.workOrderId) ?? 0) + quantity);
  }
  return totals;
}

export function eligibleEntryWorkOrders<T extends EntryWorkOrder>(
  orders: readonly T[],
  upstreamTotals: ReadonlyMap<string, number>,
  ownTotals: ReadonlyMap<string, number>,
): T[] {
  return orders.filter((wo) => (upstreamTotals.get(wo.id) ?? 0) > (ownTotals.get(wo.id) ?? 0));
}

export function searchEntryWorkOrders<T extends EntryWorkOrder>(orders: T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase('id');
  if (!needle) return orders;
  return orders.filter((wo) => [wo.product, wo.productNote, wo.clientProductionCode, wo.workCode, wo.warna, wo.size]
    .some((value) => value?.toLocaleLowerCase('id').includes(needle)));
}

export function entryProductSuggestions(orders: EntryWorkOrder[]): string[] {
  return [...new Set(orders.map((wo) => wo.product).filter((name): name is string => Boolean(name?.trim())))];
}

export function isEntryQuantityValid(qty: string): boolean {
  const value = Number(qty);
  return qty.trim() !== '' && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

export interface EntrySelection {
  woId: string;
  colour: string;
  size: string;
}

export const EMPTY_ENTRY_SELECTION: EntrySelection = { woId: '', colour: '', size: '' };

export function filterEntryWorkOrders<T extends EntryWorkOrder>(orders: T[], colour: string, size: string): T[] {
  return orders.filter((wo) => (!colour || wo.warna === colour) && (!size || wo.size === size));
}

export function entryVariantOptions(orders: EntryWorkOrder[], field: 'warna' | 'size') {
  return [...new Set(orders.map((wo) => wo[field]).filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }))
    .map((value) => ({ value, label: value }));
}

export function selectEntryWorkOrder(orders: EntryWorkOrder[], woId: string): EntrySelection {
  const wo = orders.find((order) => order.id === woId);
  return wo
    ? { woId: wo.id, colour: wo.warna || '', size: wo.size || '' }
    : { ...EMPTY_ENTRY_SELECTION };
}

export function changeEntryVariant(
  orders: EntryWorkOrder[],
  selection: EntrySelection,
  field: 'colour' | 'size',
  value: string,
): EntrySelection {
  const next = { ...selection, [field]: value };
  if (field === 'colour' && !filterEntryWorkOrders(orders, next.colour, next.size).length) {
    next.size = '';
  }
  if (!filterEntryWorkOrders(orders, next.colour, next.size).some((wo) => wo.id === next.woId)) {
    next.woId = '';
  }
  return next;
}
