import { ModalShell } from './ModalShell';
import { X, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnDef, SortRule } from '@/types';

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
    <ModalShell
      open={open}
      title="Sort"
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
            Apply Sort
          </button>
        </>
      }
    >
      <div className="space-y-2">
        {sorts.length === 0 ? (
          <p className="text-[12px] text-slate-400">No sorts applied. Click "Add Sort" to start.</p>
        ) : (
          sorts.map((s, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <select
                value={s.field}
                onChange={(e) => updateField(i, e.target.value)}
                className="flex-1 h-8 px-2.5 text-[12px] border border-gray-200 rounded-lg bg-white outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                {columns.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <button
                onClick={() => toggleDir(i)}
                className={cn(
                  'h-8 px-2.5 text-[12px] border rounded-lg flex items-center gap-1 transition-colors',
                  s.dir === 'asc'
                    ? 'border-sky-300 text-sky-500 bg-sky-50'
                    : 'border-gray-200 text-slate-500 hover:bg-slate-50'
                )}
              >
                {s.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              </button>
              <button onClick={() => removeSort(i)} className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
      <button onClick={addSort} className="mt-3 px-3 py-1.5 text-[11px] font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-100 rounded-lg transition-colors">
        + Add Sort
      </button>
    </ModalShell>
  );
}
