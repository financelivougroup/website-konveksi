import { ModalShell } from './ModalShell';
import { cn } from '@/lib/utils';

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
    <ModalShell
      open={open}
      title="Row Height"
      onClose={onClose}
      width="400px"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onApply} className="px-4 py-2 text-[13px] font-medium text-white bg-sky-400 hover:bg-sky-500 rounded-lg transition-colors shadow-sm shadow-sky-200">
            Apply
          </button>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className={cn(
              'flex flex-col items-center gap-2 p-3 border rounded-xl transition-all',
              currentHeight === opt.value
                ? 'border-sky-300 bg-sky-50/60 shadow-sm shadow-sky-100'
                : 'border-gray-150 bg-white hover:border-gray-300'
            )}
          >
            <div className="flex flex-col gap-[3px] items-center w-full py-1">
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
            <div className="text-[12px] font-semibold text-slate-700">{opt.label}</div>
            <div className="text-[10px] text-slate-400">{opt.desc}</div>
          </button>
        ))}
      </div>
    </ModalShell>
  );
}
