import { RefreshCw, Plus, CircleDot } from 'lucide-react';
import type { ModuleId } from '@/types';
import { viewConfig } from '@/data/mockData';

interface TopBarProps {
  currentView: ModuleId;
  onRefresh: () => void;
  onAddNew: () => void;
}

const dotColors: Record<ModuleId, string> = {
  'production-monitoring': 'text-blue-500',
  'order-entry': 'text-blue-500',
  'sewing-entry': 'text-purple-500',
  'finishing-entry': 'text-emerald-500',
  'kancing-entry': 'text-violet-500',
  'invoicing': 'text-orange-500',
  'register-po': 'text-sky-500',
  'selesai-jahit': 'text-amber-500',
  'target-jahit': 'text-rose-500',
  'planning-produksi': 'text-emerald-500',
  'complain-penalti': 'text-red-500',
  'register-jahit': 'text-slate-400',
  'daftar-libur': 'text-slate-400',
  'register-penjahit': 'text-slate-400',
  'master-product': 'text-slate-400',
  'raw-monitoring': 'text-slate-400',
  'master-import': 'text-slate-400',
  'production-data': 'text-violet-500',
};

// Strip emoji from title
function cleanTitle(title: string): string {
  return title.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]\s*/u, '').trim();
}

export function TopBar({ currentView, onRefresh, onAddNew }: TopBarProps) {
  const config = viewConfig[currentView];
  const title = cleanTitle(config.title);
  const dotClass = dotColors[currentView] || 'text-slate-400';

  return (
    <header className="h-[52px] bg-white/80 backdrop-blur-sm border-b border-gray-200/60 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-2.5">
        <CircleDot className={`w-4 h-4 ${dotClass} fill-current`} />
        <h1 className="text-[15px] font-semibold text-slate-800">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-gray-200"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
        <button
          onClick={onAddNew}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium text-white bg-gradient-to-r from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 rounded-lg transition-all shadow-sm shadow-sky-200/60"
        >
          <Plus className="w-4 h-4" />
          Add New
        </button>
      </div>
    </header>
  );
}
