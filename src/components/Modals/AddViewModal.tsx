import { useState } from 'react';
import { ModalShell } from './ModalShell';
import { LayoutList, Copy } from 'lucide-react';

interface AddViewModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function AddViewModal({ open, onClose, onCreate }: AddViewModalProps) {
  const [name, setName] = useState('');

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName('');
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title="Add New View"
      onClose={() => { onClose(); setName(''); }}
      width="420px"
      footer={
        <>
          <button onClick={() => { onClose(); setName(''); }} className="px-4 py-2 text-[13px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 text-[13px] font-medium text-white bg-sky-400 hover:bg-sky-500 rounded-lg transition-colors shadow-sm shadow-sky-200"
          >
            Create View
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            View Name <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cassca Only, Pending Items..."
            className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 transition-all"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Duplicate From</label>
          <div className="flex gap-2">
            <button className="flex-1 flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:border-sky-300 hover:bg-sky-50/50 transition-all text-left">
              <LayoutList className="w-4 h-4 text-slate-400" />
              <span className="text-[12px] text-slate-600">Empty View</span>
            </button>
            <button className="flex-1 flex items-center gap-2 px-3 py-2 border border-sky-200 bg-sky-50/40 rounded-lg transition-all text-left">
              <Copy className="w-4 h-4 text-sky-500" />
              <span className="text-[12px] text-sky-600 font-medium">All Data</span>
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
