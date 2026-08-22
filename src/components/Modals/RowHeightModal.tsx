import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface RowHeightModalProps {
  open: boolean;
  onClose: () => void;
  currentHeight: 'short' | 'medium' | 'tall' | 'extra';
  onSelect: (height: 'short' | 'medium' | 'tall' | 'extra') => void;
  onApply: () => void;
}

const options: { value: 'short' | 'medium' | 'tall' | 'extra'; label: string; desc: string; lines: number }[] = [
  { value: 'short', label: 'Short', desc: 'Compact', lines: 2 },
  { value: 'medium', label: 'Medium', desc: 'Default', lines: 3 },
  { value: 'tall', label: 'Tall', desc: 'Comfortable', lines: 4 },
  { value: 'extra', label: 'Extra', desc: 'Spacious', lines: 5 },
];

export function RowHeightModal({ open, onClose, currentHeight, onSelect, onApply }: RowHeightModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-800">Row Height</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-3 py-4">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className={cn(
                'flex flex-col items-center gap-3 p-3 border rounded-lg transition-all',
                currentHeight === opt.value
                  ? 'border-sky-300 bg-sky-50/60 shadow-sm shadow-sky-100'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              )}
            >
              <div className="flex flex-col gap-[2px] items-center w-full py-2">
                {Array.from({ length: opt.lines }).map((_, li) => (
                  <div
                    key={li}
                    className={cn(
                      'h-[2px] rounded-full',
                      currentHeight === opt.value ? 'bg-sky-200' : 'bg-gray-200'
                    )}
                    style={{ width: li === opt.lines - 1 ? '40%' : `${75 - li * 8}%` }}
                  />
                ))}
              </div>
              <div className="text-sm font-medium text-slate-700">{opt.label}</div>
              <div className="text-xs text-slate-400">{opt.desc}</div>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={onApply} className="bg-sky-400 hover:bg-sky-500">
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
