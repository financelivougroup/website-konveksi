import { ModalShell } from './ModalShell';
import { X } from 'lucide-react';
import type { ColumnDef, GroupRule } from '@/types';

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
    <ModalShell
      open={open}
      title="Group By"
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
            Apply Group
          </button>
        </>
      }
    >
      <div className="space-y-2">
        {groups.length === 0 ? (
          <p className="text-[12px] text-slate-400">No groups applied. Click "Add Group" to start.</p>
        ) : (
          groups.map((g, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <select
                value={g.field}
                onChange={(e) => updateGroup(i, e.target.value)}
                className="flex-1 h-8 px-2.5 text-[12px] border border-gray-200 rounded-lg bg-white outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                {columns.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <button onClick={() => removeGroup(i)} className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
      <button onClick={addGroup} className="mt-3 px-3 py-1.5 text-[11px] font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-100 rounded-lg transition-colors">
        + Add Group
      </button>
    </ModalShell>
  );
}
