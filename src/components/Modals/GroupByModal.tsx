import { X } from 'lucide-react';
import type { ColumnDef, GroupRule } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AppSelect } from '@/components/AppSelect';

interface GroupByModalProps {
  open: boolean;
  onClose: () => void;
  columns: ColumnDef[];
  groups: GroupRule[];
  onUpdate: (groups: GroupRule[]) => void;
  onApply: () => void;
}

export function GroupByModal({ open, onClose, columns, groups, onUpdate, onApply }: GroupByModalProps) {
  const addGroup = () => {
    onUpdate([...groups, { field: columns[0].key }]);
  };

  const updateGroup = (index: number, field: string) => {
    const updated = [...groups];
    updated[index] = { field };
    onUpdate(updated);
  };

  const removeGroup = (index: number) => {
    onUpdate(groups.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    onUpdate([]);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-800">Group By</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-4">
          {groups.length === 0 ? (
            <p className="text-sm text-slate-400">No groups applied. Click "Add Group" to start.</p>
          ) : (
            groups.map((g, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <AppSelect
                  bare
                  value={g.field}
                  onValueChange={(next) => updateGroup(i, next)}
                  triggerClassName="flex-1"
                  options={columns.map((c) => ({ value: c.key, label: c.label }))}
                />
                <button onClick={() => removeGroup(i)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <button onClick={addGroup} className="mt-3 px-3 py-1.5 text-xs font-medium text-sky-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors">
          + Add Group
        </button>

        <DialogFooter>
          <button onClick={clearAll} className="px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors">
            Clear All
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onApply} className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors shadow-sm shadow-slate-300">
            Apply Group
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
