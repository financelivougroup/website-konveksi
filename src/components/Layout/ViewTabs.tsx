import { Plus, X, LayoutList } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SavedView } from '@/types';

interface ViewTabsProps {
  views: SavedView[];
  activeIndex: number;
  onSwitch: (index: number) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}

export function ViewTabs({ views, activeIndex, onSwitch, onRemove, onAdd }: ViewTabsProps) {
  return (
    <div className="h-9 bg-white border-b border-gray-200/60 flex items-center px-6 gap-0.5 overflow-x-auto flex-shrink-0">
      {views.map((view, i) => (
        <div
          key={i}
          onClick={() => onSwitch(i)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium cursor-pointer border-b-[1.5px] transition-all duration-150 whitespace-nowrap rounded-t-md group relative',
            i === activeIndex
              ? 'text-sky-600 border-b-sky-400 bg-sky-50/40'
              : 'text-slate-400 border-b-transparent hover:text-slate-600 hover:bg-slate-50/50'
          )}
        >
          <LayoutList className="w-3 h-3" />
          <span>{view.name}</span>
          {i > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(i);
              }}
              className="w-4 h-4 rounded flex items-center justify-center text-slate-300 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all ml-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onAdd}
        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-sky-500 hover:bg-sky-50/50 rounded-md transition-all whitespace-nowrap ml-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Add View
      </button>
    </div>
  );
}
