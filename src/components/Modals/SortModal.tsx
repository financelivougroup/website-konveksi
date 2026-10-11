import { X, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnDef, SortRule } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AppSelect } from '@/components/AppSelect';

interface SortModalProps {
  open: boolean;
  onClose: () => void;
  columns: ColumnDef[];
  sorts: SortRule[];
  onUpdate: (sorts: SortRule[]) => void;
  onApply: () => void;
}

export function SortModal({ open, onClose, columns, sorts, onUpdate, onApply }: SortModalProps) {
  const addSort = () => {
    onUpdate([...sorts, { field: columns[0].key, dir: 'asc' }]);
  };

  const updateField = (index: number, field: string) => {
    const updated = [...sorts];
    updated[index] = { ...updated[index], field };
    onUpdate(updated);
  };

  const toggleDir = (index: number) => {
    const updated = [...sorts];
    updated[index] = { ...updated[index], dir: updated[index].dir === 'asc' ? 'desc' : 'asc' };
    onUpdate(updated);
  };

  const removeSort = (index: number) => {
    onUpdate(sorts.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    onUpdate([]);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-800">Sort</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-4">
          {sorts.length === 0 ? (
            <p className="text-sm text-slate-400">No sorts applied. Click "Add Sort" to start.</p>
          ) : (
            sorts.map((s, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <AppSelect
                  bare
                  value={s.field}
                  onValueChange={(next) => updateField(i, next)}
                  triggerClassName="flex-1"
                  options={columns.map((c) => ({ value: c.key, label: c.label }))}
                />
                <button
                  onClick={() => toggleDir(i)}
                  className={cn(
                    'h-8 px-2.5 text-sm border rounded-lg flex items-center gap-1 transition-colors',
                    s.dir === 'asc'
                      ? 'border-slate-400 text-sky-500 bg-slate-50'
                      : 'border-gray-200 text-slate-500 hover:bg-slate-50'
                  )}
                >
                  {s.dir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => removeSort(i)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <button onClick={addSort} className="mt-3 px-3 py-1.5 text-xs font-medium text-sky-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors">
          + Add Sort
        </button>

        <DialogFooter>
          <button onClick={clearAll} className="px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors">
            Clear All
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onApply} className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors shadow-sm shadow-slate-300">
            Apply Sort
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
