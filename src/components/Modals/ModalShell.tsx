import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalShellProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

export function ModalShell({ open, title, onClose, children, footer, width = '520px' }: ModalShellProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] transition-opacity" />
      <div
        className={cn(
          'relative bg-white rounded-2xl shadow-2xl shadow-slate-200/50 max-h-[80vh] flex flex-col overflow-hidden animate-scaleIn border border-gray-100',
        )}
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[14px] font-semibold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-2 px-6 py-3.5 border-t border-gray-100">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
