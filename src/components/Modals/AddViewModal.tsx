import { useState } from 'react';
import { LayoutList, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        onClose();
        setName('');
      }
    }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-800">Add New View</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Create a new custom view to save your preferred filters and column settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">
              View Name <span className="text-rose-500">*</span>
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cassca Only, Pending Items..."
              className="w-full h-9 px-3"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 block">
              Duplicate From
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:border-sky-300 hover:bg-sky-50/50 transition-all text-left">
                <LayoutList className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600">Empty View</span>
              </button>
              <button className="flex items-center gap-2 px-3 py-2 border border-sky-200 bg-sky-50/40 rounded-lg transition-all text-left">
                <Copy className="w-4 h-4 text-sky-500" />
                <span className="text-sm text-sky-600 font-medium">All Data</span>
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => { onClose(); setName(''); }} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="bg-sky-400 hover:bg-sky-500"
          >
            Create View
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
