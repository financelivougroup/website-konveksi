import { ModalShell } from './ModalShell';
import { X } from 'lucide-react';
import type { ColumnDef, FilterRule } from '@/types';

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
  columns: ColumnDef[];
  filters: FilterRule[];
  onUpdate: (filters: FilterRule[]) => void;
  onApply: () => void;
}

export function FilterModal({ open, onClose, columns, filters, onUpdate, onApply }: FilterModalProps) {
  const addFilter = () => {
    onUpdate([...filters, { field: columns[0].key, operator: 'contains', value: '' }]);
  };

  const updateFilter = (index: number, key: keyof FilterRule, value: string) => {
    const updated = [...filters];
    updated[index] = { ...updated[index], [key]: value };
    onUpdate(updated);
  };

  const removeFilter = (index: number) => {
    onUpdate(filters.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    onUpdate([]);
  };

  return (
    <ModalShell
      open={open}
      title="Filter"
      onClose={onClose}
      footer={
        <>
          <button onClick={clearAll} className="px-4 py-2 text-[13px] font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors">
            Clear All
          </button>
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onApply} className="px-4 py-2 text-[13px] font-medium text-white bg-sky-400 hover:bg-sky-500 rounded-lg transition-colors shadow-sm shadow-sky-200">
            Apply Filter
          </button>
        </>
      }
    >
      <div className="space-y-2">
        {filters.length === 0 ? (
          <p className="text-[12px] text-slate-400">No filters applied. Click "Add Filter" to start.</p>
        ) : (
          filters.map((f, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <select
                value={f.field}
                onChange={(e) => updateFilter(i, 'field', e.target.value)}
                className="flex-1 min-w-0 h-8 px-2.5 text-[12px] border border-gray-200 rounded-lg bg-white outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                {columns.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <select
                value={f.operator}
                onChange={(e) => updateFilter(i, 'operator', e.target.value)}
                className="h-8 px-2.5 text-[12px] border border-gray-200 rounded-lg bg-white outline-none focus:border-sky-300"
              >
                <option value="contains">contains</option>
                <option value="equals">equals</option>
                <option value="starts">starts with</option>
                <option value="ends">ends with</option>
              </select>
              <input
                type="text"
                value={f.value}
                onChange={(e) => updateFilter(i, 'value', e.target.value)}
                placeholder="Value..."
                className="flex-1 min-w-0 h-8 px-2.5 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-sky-300"
              />
              <button onClick={() => removeFilter(i)} className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
      <button onClick={addFilter} className="mt-3 px-3 py-1.5 text-[11px] font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-100 rounded-lg transition-colors">
        + Add Filter
      </button>
    </ModalShell>
  );
}
