import { X } from 'lucide-react';
import type { ColumnDef, FilterRule } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AppSelect } from '@/components/AppSelect';

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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-800">Filter</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-4">
          {filters.length === 0 ? (
            <p className="text-sm text-slate-400">No filters applied. Click "Add Filter" to start.</p>
          ) : (
            filters.map((f, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <AppSelect
                  bare
                  value={f.field}
                  onValueChange={(next) => updateFilter(i, 'field', next)}
                  triggerClassName="flex-1 min-w-0"
                  options={columns.map((c) => ({ value: c.key, label: c.label }))}
                />
                <AppSelect
                  bare
                  value={f.operator}
                  onValueChange={(next) => updateFilter(i, 'operator', next)}
                  options={[
                    { value: 'contains', label: 'contains' },
                    { value: 'equals', label: 'equals' },
                    { value: 'starts', label: 'starts with' },
                    { value: 'ends', label: 'ends with' },
                  ]}
                />
                <input
                  type="text"
                  value={f.value}
                  onChange={(e) => updateFilter(i, 'value', e.target.value)}
                  placeholder="Value..."
                  className="flex-1 min-w-0 h-8 px-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
                <button onClick={() => removeFilter(i)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <button onClick={addFilter} className="mt-3 px-3 py-1.5 text-xs font-medium text-sky-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors">
          + Add Filter
        </button>

        <DialogFooter>
          <button onClick={clearAll} className="px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors">
            Clear All
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onApply} className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors shadow-sm shadow-slate-300">
            Apply Filter
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
