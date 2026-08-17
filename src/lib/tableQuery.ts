// Shared filter/sort logic for design-system tables (see TableTools.tsx).
// Kept separate so TableTools.tsx only exports React components.

export interface FieldOption { key: string; label: string }
export interface FilterRule { field: string; op: string; value: string }
export interface SortRule { field: string; dir: 'asc' | 'desc' }

export const FILTER_OPERATORS: { key: string; label: string }[] = [
  { key: 'contains', label: 'Mengandung' },
  { key: 'not_contains', label: 'Tidak mengandung' },
  { key: 'equals', label: 'Sama dengan' },
  { key: 'not_equals', label: 'Tidak sama dengan' },
  { key: 'gt', label: 'Lebih dari' },
  { key: 'lt', label: 'Kurang dari' },
  { key: 'is_empty', label: 'Kosong' },
  { key: 'is_not_empty', label: 'Tidak kosong' },
];

function cellString(v: unknown): string {
  return v == null ? '' : String(v);
}

export function applyFilters<T extends Record<string, unknown>>(rows: T[], filters: FilterRule[]): T[] {
  if (filters.length === 0) return rows;
  return rows.filter((row) => filters.every((f) => {
    const s = cellString(row[f.field]);
    const q = f.value.toLowerCase();
    switch (f.op) {
      case 'contains': return s.toLowerCase().includes(q);
      case 'not_contains': return !s.toLowerCase().includes(q);
      case 'equals': return s.toLowerCase() === q;
      case 'not_equals': return s.toLowerCase() !== q;
      case 'gt': return parseFloat(s) > parseFloat(f.value);
      case 'lt': return parseFloat(s) < parseFloat(f.value);
      case 'is_empty': return s.trim() === '';
      case 'is_not_empty': return s.trim() !== '';
      default: return true;
    }
  }));
}

export function applySorts<T extends Record<string, unknown>>(rows: T[], sorts: SortRule[]): T[] {
  if (sorts.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const s of sorts) {
      const av = a[s.field];
      const bv = b[s.field];
      const aEmpty = av == null || av === '';
      const bEmpty = bv == null || bv === '';
      if (aEmpty && bEmpty) continue;
      if (aEmpty) return 1; // empty values always last
      if (bEmpty) return -1;
      const an = Number(av);
      const bn = Number(bv);
      const cmp = (!Number.isNaN(an) && !Number.isNaN(bn)) ? an - bn : cellString(av).localeCompare(cellString(bv));
      if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}
