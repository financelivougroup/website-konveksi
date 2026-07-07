import {
  Filter,
  FolderTree,
  ArrowUpDown,
  StretchVertical,
  Palette,
  Download,
  Upload,
  Lock,
  Settings2,
  CalendarRange,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SubTab {
  id: string;
  label: string;
}

interface ToolbarProps {
  filterCount: number;
  groupCount: number;
  colorCount: number;
  isReadOnly: boolean;
  dateRangeActive: boolean;
  onCustomizeField: () => void;
  onFilter: () => void;
  onGroupBy: () => void;
  onSort: () => void;
  onRowHeight: () => void;
  onCondColor: () => void;
  onDateRange: () => void;
  onExport: () => void;
  onImport: () => void;
  // Inner sub-tabs (only provided for combined views like "Production Data")
  subTabs?: SubTab[];
  activeSub?: string;
  onSubTabChange?: (id: string) => void;
}

export function Toolbar({
  filterCount,
  groupCount,
  colorCount,
  isReadOnly,
  dateRangeActive,
  onCustomizeField,
  onFilter,
  onGroupBy,
  onSort,
  onRowHeight,
  onCondColor,
  onDateRange,
  onExport,
  onImport,
  subTabs,
  activeSub,
  onSubTabChange,
}: ToolbarProps) {
  return (
    <div className="h-10 bg-white border-b border-gray-200/60 flex items-center px-6 gap-1 flex-shrink-0">
      {/* Inner sub-tabs for combined views */}
      {subTabs && subTabs.length > 0 && (
        <>
          <div className="flex items-center gap-0.5 mr-2">
            {subTabs.map((tab) => {
              const isActive = tab.id === activeSub;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSubTabChange?.(tab.id)}
                  className={cn(
                    'inline-flex items-center px-2.5 h-7 text-[12px] font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-sky-100 text-sky-700'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="w-px h-4 bg-gray-200 mx-1" />
        </>
      )}

      <ToolbarButton icon={Settings2} label="Fields" onClick={onCustomizeField} />
      <ToolbarButton
        icon={Filter}
        label="Filter"
        badge={filterCount > 0 ? filterCount : undefined}
        onClick={onFilter}
      />
      <ToolbarButton
        icon={CalendarRange}
        label="Date Range"
        active={dateRangeActive}
        onClick={onDateRange}
      />
      <ToolbarButton
        icon={FolderTree}
        label="Group"
        badge={groupCount > 0 ? groupCount : undefined}
        badgeClass="bg-emerald-500"
        onClick={onGroupBy}
      />
      <ToolbarButton icon={ArrowUpDown} label="Sort" onClick={onSort} />

      <div className="w-px h-4 bg-gray-200 mx-1" />

      <ToolbarButton icon={StretchVertical} label="Height" onClick={onRowHeight} />
      <ToolbarButton
        icon={Palette}
        label="Colors"
        badge={colorCount > 0 ? colorCount : undefined}
        onClick={onCondColor}
      />

      <div className="w-px h-4 bg-gray-200 mx-1" />

      <ToolbarButton icon={Download} label="Export" onClick={onExport} />
      {!isReadOnly && (
        <ToolbarButton icon={Upload} label="Import" onClick={onImport} />
      )}

      <div className="flex-1" />

      {isReadOnly && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 text-sky-600 border border-sky-100 text-[11px] font-semibold">
          <Lock className="w-3 h-3" />
          Read-Only
        </span>
      )}
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  badge,
  badgeClass = 'bg-sky-400',
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  badge?: number;
  badgeClass?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded-lg transition-colors relative',
        active
          ? 'text-sky-600 bg-sky-50'
          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
      )}
    >
      <Icon className={cn('w-3.5 h-3.5', active && 'text-sky-500')} />
      <span>{label}</span>
      {badge !== undefined && (
        <span
          className={cn(
            'ml-0.5 text-[9px] font-bold text-white px-1.5 py-0 rounded-full min-w-[16px] text-center leading-4',
            badgeClass
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
