import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  total: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ total, currentPage, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="h-11 bg-white border-t border-gray-200/60 flex items-center justify-between px-6 flex-shrink-0">
      <span className="text-[11px] text-slate-400">
        Showing <span className="font-medium text-slate-600">{start}-{end}</span> of <span className="font-medium text-slate-600">{total}</span>
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-slate-500 hover:bg-slate-50 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {getPageNumbers().map((p, i) => (
          <button
            key={i}
            onClick={() => typeof p === 'number' && onPageChange(p)}
            disabled={typeof p !== 'number'}
            className={cn(
              'min-w-[28px] h-7 flex items-center justify-center rounded-lg border text-[12px] font-medium transition-all',
              p === currentPage
                ? 'bg-sky-50 border-sky-200 text-sky-600'
                : typeof p === 'number'
                ? 'border-gray-200 bg-white text-slate-500 hover:bg-slate-50 hover:border-gray-300'
                : 'border-transparent bg-transparent text-slate-300 cursor-default'
            )}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-slate-500 hover:bg-slate-50 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
