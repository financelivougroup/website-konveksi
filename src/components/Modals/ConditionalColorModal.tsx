import { X } from 'lucide-react';
import type { ColumnDef, CondColorRule } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AppSelect } from '@/components/AppSelect';

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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-800">Conditional Coloring</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-4">
          {rules.length === 0 ? (
            <p className="text-sm text-slate-400">No rules applied. Click "Add Rule" to start.</p>
          ) : (
            rules.map((r, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex-wrap">
                <span className="text-xs font-medium text-slate-500">If</span>
                <AppSelect
                  bare
                  value={r.field}
                  onValueChange={(next) => updateRule(i, 'field', next)}
                  options={columns.map((c) => ({ value: c.key, label: c.label }))}
                />
                <AppSelect
                  bare
                  value={r.operator}
                  onValueChange={(next) => updateRule(i, 'operator', next)}
                  options={[
                    { value: 'contains', label: 'contains' },
                    { value: 'equals', label: 'equals' },
                  ]}
                />
                <input
                  type="text"
                  value={r.value}
                  onChange={(e) => updateRule(i, 'value', e.target.value)}
                  placeholder="Value..."
                  className="h-8 px-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 w-24"
                />
                <span className="text-xs text-slate-300">→</span>
                <AppSelect
                  bare
                  value={r.color}
                  onValueChange={(next) => updateRule(i, 'color', next)}
                  options={colorOptions.map((c) => ({ value: c.value, label: c.label }))}
                />
                <button onClick={() => removeRule(i)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <button onClick={addRule} className="mt-3 px-3 py-1.5 text-xs font-medium text-sky-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors">
          + Add Rule
        </button>

        <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Preview</div>
          <div className="flex gap-2 flex-wrap">
            <div className="px-3 py-1.5 bg-red-50 rounded-lg text-sm text-red-600 border border-red-100">Red Row</div>
            <div className="px-3 py-1.5 bg-amber-50 rounded-lg text-sm text-amber-600 border border-amber-100">Yellow Row</div>
            <div className="px-3 py-1.5 bg-emerald-50 rounded-lg text-sm text-emerald-600 border border-emerald-100">Green Row</div>
            <div className="px-3 py-1.5 bg-sky-50 rounded-lg text-sm text-sky-600 border border-sky-100">Blue Row</div>
            <div className="px-3 py-1.5 bg-violet-50 rounded-lg text-sm text-violet-600 border border-violet-100">Purple Row</div>
          </div>
        </div>

        <DialogFooter>
          <button onClick={clearAll} className="px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors">
            Clear All
          </button>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={onApply} className="bg-primary hover:bg-primary/90">
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
