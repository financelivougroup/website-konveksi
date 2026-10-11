export interface EntryWorkOrder {
  id: string;
  warna?: string;
  size?: string;
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
