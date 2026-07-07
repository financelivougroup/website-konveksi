import { useState } from 'react';
import {
  Factory,
  Search,
  LayoutDashboard,
  CheckCircle,
  Scissors,
  Target,
  FolderOpen,
  Calendar,
  Users,
  Package,
  BarChart3,
  Settings,
  Lock,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { navGroups } from '@/data/mockData';
import type { ModuleId } from '@/types';

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  CheckCircle,
  Scissors,
  Target,
  FolderOpen,
  Calendar,
  Users,
  Package,
  BarChart3,
  Settings,
  Layers,
};

interface SidebarProps {
  currentView: ModuleId | 'dashboard' | 'reports' | 'settings';
  onSwitchView: (view: ModuleId | 'dashboard' | 'reports' | 'settings') => void;
  renames: Record<string, string>;
  onRename: (id: string, name: string) => void;
  onViewLanding: () => void;
}

export function Sidebar({ currentView, onSwitchView, renames, onRename, onViewLanding }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const filteredGroups = searchQuery
    ? navGroups.map((g) => ({
        ...g,
        items: g.items.filter((i) =>
          (renames[i.id] || i.label).toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter((g) => g.items.length > 0)
    : navGroups;

  const startEdit = (id: string, current: string) => {
    setEditingId(id);
    setEditValue(current);
  };

  const finishEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <aside
      className={cn(
        'relative bg-white border-r border-gray-200/80 flex flex-col h-screen transition-all duration-300 ease-in-out',
        collapsed ? 'w-[64px] min-w-[64px]' : 'w-[220px] min-w-[220px]'
      )}
    >
      {/* Collapse / Expand toggle — floats on the right edge of the sidebar */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute top-7 -translate-y-1/2 -right-3 z-20 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-sky-500 hover:border-sky-300 hover:shadow transition-all"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* Brand */}
      <div
        className={cn(
          'py-3.5 flex items-center border-b border-gray-100',
          collapsed ? 'px-0 justify-center' : 'px-4 gap-2.5'
        )}
      >
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-sky-500 flex items-center justify-center shadow-sm shadow-sky-200 flex-shrink-0">
          <Factory className="w-3.5 h-3.5 text-white" />
        </div>
        {!collapsed && (
          <span className="text-[15px] font-semibold text-slate-800 tracking-tight whitespace-nowrap">
            Konveksi Pro
          </span>
        )}
      </div>

      {/* Search — hidden when collapsed */}
      {!collapsed && (
        <div className="px-3 py-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-3 text-xs text-slate-700 placeholder-gray-400 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 transition-all"
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
        {filteredGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && !collapsed && (
              <div className="px-3 pt-4 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = iconMap[item.icon] || Package;
              const isActive = currentView === item.id;
              const displayName = renames[item.id] || item.label;
              const isEditing = editingId === item.id;
              const itemAny = item as Record<string, unknown>;

              return (
                <div
                  key={item.id}
                  title={collapsed ? displayName : undefined}
                  className={cn(
                    'group flex items-center gap-1 rounded-lg transition-all duration-150 relative',
                    isActive
                      ? 'bg-sky-50 text-sky-600'
                      : 'text-slate-500 hover:bg-gray-50 hover:text-slate-700'
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-sky-400 rounded-r-full" />
                  )}
                  <button
                    onClick={() => onSwitchView(item.id)}
                    className={cn(
                      'flex-1 flex items-center gap-2.5 text-[13px] text-left',
                      collapsed ? 'justify-center px-0 py-[9px]' : 'px-2.5 py-[7px]'
                    )}
                  >
                    {itemAny.dot ? (
                      <span
                        className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                        style={{ backgroundColor: itemAny.dot as string, boxShadow: `0 0 0 2px ${itemAny.dot as string}30, 0 0 0 3px white` }}
                      />
                    ) : (
                      <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-sky-500' : 'text-gray-400')} />
                    )}

                    {isEditing ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={finishEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') finishEdit();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 h-6 px-1.5 text-[12px] bg-white border border-sky-300 rounded outline-none"
                      />
                    ) : (
                      !collapsed && <span className="flex-1 truncate">{displayName}</span>
                    )}
                  </button>

                  {/* Rename button (only on hover, only when expanded) */}
                  {!isEditing && !collapsed && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(item.id, displayName);
                      }}
                      className="w-6 h-6 mr-1 rounded flex items-center justify-center text-slate-300 hover:text-sky-500 hover:bg-sky-50 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                      title="Rename"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}

                  {!!itemAny.locked && !collapsed && <Lock className="w-3 h-3 text-gray-300 flex-shrink-0 mr-2" />}
                </div>
              );
            })}
            {gi < filteredGroups.length - 1 && !collapsed && (
              <div className="my-2 border-t border-gray-100" />
            )}
          </div>
        ))}
      </nav>

      {/* View Landing Page button */}
      <div className={cn('mb-2 flex-shrink-0', collapsed ? 'mx-2' : 'mx-3')}>
        <button
          onClick={onViewLanding}
          title="View Landing Page"
          className={cn(
            'w-full flex items-center gap-2 rounded-lg transition-colors text-slate-500 hover:bg-sky-50 hover:text-sky-600',
            collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-2 text-[12px] font-medium'
          )}
        >
          <Layers className="w-3.5 h-3.5 flex-shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">View Landing Page</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </>
          )}
        </button>
      </div>

      {/* User Block */}
      <div
        className={cn(
          'mb-3 rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-100/60 flex items-center gap-2.5',
          collapsed ? 'mx-2 p-2 justify-center' : 'mx-3 p-2.5'
        )}
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-sky-500 flex items-center justify-center shadow-sm shadow-sky-200 flex-shrink-0">
          <span className="text-[11px] font-bold text-white">AD</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-[12px] font-semibold text-slate-700 truncate">Admin</span>
            <span className="text-[10px] text-slate-400">Manager</span>
          </div>
        )}
      </div>
    </aside>
  );
}
