import { ModalShell } from './ModalShell';
import { X } from 'lucide-react';
import type { ColumnDef, CondColorRule } from '@/types';

interface ConditionalColorModalProps {
  open: boolean;
  onClose: () => void;
  columns: ColumnDef[];
  rules: CondColorRule[];
  onUpdate: (rules: CondColorRule[]) => void;
  onApply: () => void;
}

const colorOptions: { value: CondColorRule['color']; label: string; dot: string }[] = [
  { value: 'red', label: 'Red', dot: 'bg-red-400' },
  { value: 'yellow', label: 'Yellow', dot: 'bg-amber-400' },
  { value: 'green', label: 'Green', dot: 'bg-emerald-400' },
  { value: 'blue', label: 'Blue', dot: 'bg-sky-400' },
  { value: 'purple', label: 'Purple', dot: 'bg-violet-400' },
];

export function ConditionalColorModal({ open, onClose, columns, rules, onUpdate, onApply }: ConditionalColorModalProps) {
  const addRule = () => {
    onUpdate([...rules, { field: columns[0].key, operator: 'contains', value: '', color: 'red' }]);
  };

  const updateRule = (index: number, key: keyof CondColorRule, value: string) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], [key]: value };
    onUpdate(updated);
  };

  const removeRule = (index: number) => {
    onUpdate(rules.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    onUpdate([]);
  };

  return (
    <ModalShell
      open={open}
      title="Conditional Coloring"
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
            Apply
          </button>
        </>
      }
    >
      <div className="space-y-2">
        {rules.length === 0 ? (
          <p className="text-[12px] text-slate-400">No rules applied. Click "Add Rule" to start.</p>
        ) : (
          rules.map((r, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex-wrap">
              <span className="text-[11px] font-medium text-slate-500">If</span>
              <select
                value={r.field}
                onChange={(e) => updateRule(i, 'field', e.target.value)}
                className="h-8 px-2 text-[12px] border border-gray-200 rounded-lg bg-white outline-none focus:border-sky-300"
              >
                {columns.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <select
                value={r.operator}
                onChange={(e) => updateRule(i, 'operator', e.target.value)}
                className="h-8 px-2 text-[12px] border border-gray-200 rounded-lg bg-white outline-none focus:border-sky-300"
              >
                <option value="contains">contains</option>
                <option value="equals">equals</option>
              </select>
              <input
                type="text"
                value={r.value}
                onChange={(e) => updateRule(i, 'value', e.target.value)}
                placeholder="Value..."
                className="h-8 px-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-sky-300 w-24"
              />
              <span className="text-[11px] text-slate-300">\u2192</span>
              <select
                value={r.color}
                onChange={(e) => updateRule(i, 'color', e.target.value)}
                className="h-8 px-2 text-[12px] border border-gray-200 rounded-lg bg-white outline-none focus:border-sky-300"
              >
                {colorOptions.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <button onClick={() => removeRule(i)} className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
      <button onClick={addRule} className="mt-3 px-3 py-1.5 text-[11px] font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-100 rounded-lg transition-colors">
        + Add Rule
      </button>

      <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Preview</div>
        <div className="flex gap-2 flex-wrap">
          <div className="px-3 py-1.5 bg-red-50 rounded-lg text-[11px] text-red-600 border border-red-100">Red Row</div>
          <div className="px-3 py-1.5 bg-amber-50 rounded-lg text-[11px] text-amber-600 border border-amber-100">Yellow Row</div>
          <div className="px-3 py-1.5 bg-emerald-50 rounded-lg text-[11px] text-emerald-600 border border-emerald-100">Green Row</div>
          <div className="px-3 py-1.5 bg-sky-50 rounded-lg text-[11px] text-sky-600 border border-sky-100">Blue Row</div>
          <div className="px-3 py-1.5 bg-violet-50 rounded-lg text-[11px] text-violet-600 border border-violet-100">Purple Row</div>
        </div>
      </div>
    </ModalShell>
  );
}
