import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToastMessage } from '@/types';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onRemove: (id: number) => void;
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const styles = {
  success: 'bg-emerald-500 shadow-emerald-200/50',
  error: 'bg-rose-500 shadow-rose-200/50',
  info: 'bg-sky-500 shadow-sky-200/50',
};

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        return (
          <div
            key={toast.id}
            className={cn(
              'flex items-center gap-2.5 pl-3.5 pr-2.5 py-2.5 rounded-xl text-white text-[13px] font-medium shadow-lg animate-slideIn backdrop-blur-sm',
              styles[toast.type]
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0 opacity-90" />
            <span>{toast.message}</span>
            <button
              onClick={() => onRemove(toast.id)}
              className="ml-1 w-5 h-5 rounded-md flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
