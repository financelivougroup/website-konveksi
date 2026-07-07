import { useRef, useState, useCallback, useEffect } from 'react';
import {
  Eye, Pencil, Trash2,
  Cloud, CloudOff, Calculator, Lock, Star, Heart, Zap, AlertCircle,
  Database, RefreshCw, StickyNote, SortAsc, SortDesc,
  FolderTree, ChevronDown, X,
} from 'lucide-react';
import { cn, formatCurrency, getBadgeClass, getBadgeStyles, getRowCondColor } from '@/lib/utils';
import type { ColumnDef, CondColorRule, SortRule, ColumnSource } from '@/types';

interface DisplayColumn extends ColumnDef {
  _note?: string;
  _originalIndex: number;
  _source?: ColumnSource;
}

interface DataTableProps {
  columns: DisplayColumn[];
  data: Record<string, unknown>[];
  selectedRows: Set<number>;
  rowHeight: 'short' | 'medium' | 'tall' | 'extra';
  condColors: CondColorRule[];
  editable: boolean;
  sorts: SortRule[];
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  onViewDetail: (id: number) => void;
  onEditDetail: (id: number) => void;
  onDeleteRow: (id: number) => void;
  onResizeColumn: (key: string, width: number) => void;
  onReorderColumn: (fromIndex: number, toIndex: number) => void;
  onRenameColumn: (key: string, newName: string) => void;
  onUpdateNote: (key: string, note: string) => void;
  onSortColumn: (field: string, dir: 'asc' | 'desc') => void;
  onGroupColumn: (field: string) => void;
  onSetSource: (key: string, icon: string, label: string) => void;
}

const rowHeightClasses = {
  short: '[&_td]:py-1',
  medium: '[&_td]:py-2',
  tall: '[&_td]:py-3.5',
  extra: '[&_td]:py-5',
};

/** Map source icon string to Lucide component */
const sourceIconMap: Record<string, React.FC<{ className?: string }>> = {
  cloud: Cloud,
  pencil: Pencil,
  calculator: Calculator,
  lock: Lock,
  star: Star,
  heart: Heart,
  zap: Zap,
  'alert-circle': AlertCircle,
  database: Database,
  sync: RefreshCw,
};

const sourceIconOptions = [
  { value: '', label: 'None', color: 'text-slate-300' },
  { value: 'cloud', label: 'Cloud Sync', color: 'text-sky-400' },
  { value: 'pencil', label: 'Manual Input', color: 'text-amber-400' },
  { value: 'calculator', label: 'Formula', color: 'text-emerald-400' },
  { value: 'lock', label: 'Locked', color: 'text-rose-400' },
  { value: 'star', label: 'Important', color: 'text-yellow-400' },
  { value: 'heart', label: 'Favorite', color: 'text-pink-400' },
  { value: 'zap', label: 'Auto', color: 'text-violet-400' },
  { value: 'alert-circle', label: 'Alert', color: 'text-orange-400' },
  { value: 'database', label: 'Database', color: 'text-cyan-400' },
  { value: 'sync', label: 'Sync', color: 'text-teal-400' },
];

/** Small dropdown menu that appears on header click */
function HeaderMenu({
  x, y, col, onClose, onEditNote, onSortAsc, onSortDesc, onGroupBy, onSetSource,
}: {
  x: number; y: number; col: DisplayColumn;
  onClose: () => void;
  onEditNote: () => void; onSortAsc: () => void; onSortDesc: () => void; onGroupBy: () => void;
  onSetSource: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[70] min-w-[200px] bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 animate-scaleIn"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-gray-50 mb-1">
        {col.label}
      </div>
      <button onClick={() => { onEditNote(); onClose(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-600 hover:bg-slate-50 transition-colors text-left">
        <StickyNote className="w-3.5 h-3.5 text-amber-400" /> Edit Field Description
      </button>
      <button onClick={() => { onSetSource(); onClose(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-600 hover:bg-slate-50 transition-colors text-left">
        <Database className="w-3.5 h-3.5 text-cyan-400" /> Set Source Indicator
      </button>
      <div className="mx-3 my-1 border-t border-gray-50" />
      <button onClick={() => { onSortAsc(); onClose(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-600 hover:bg-slate-50 transition-colors text-left">
        <SortAsc className="w-3.5 h-3.5 text-sky-500" /> Sort Ascending
      </button>
      <button onClick={() => { onSortDesc(); onClose(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-600 hover:bg-slate-50 transition-colors text-left">
        <SortDesc className="w-3.5 h-3.5 text-sky-500" /> Sort Descending
      </button>
      <div className="mx-3 my-1 border-t border-gray-50" />
      <button onClick={() => { onGroupBy(); onClose(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-600 hover:bg-slate-50 transition-colors text-left">
        <FolderTree className="w-3.5 h-3.5 text-emerald-500" /> Add Field to Group
      </button>
    </div>
  );
}

export function DataTable({
  columns, data, selectedRows, rowHeight, condColors, editable, sorts,
  onToggleRow, onToggleAll, onViewDetail, onEditDetail, onDeleteRow,
  onResizeColumn, onReorderColumn, onRenameColumn, onUpdateNote,
  onSortColumn, onGroupColumn, onSetSource,
}: DataTableProps) {
  const allSelected = data.length > 0 && data.every((r) => selectedRows.has(r.id as number));
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [hoverNote, setHoverNote] = useState<{ text: string; x: number; y: number } | null>(null);

  // Inline rename state
  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Header menu state
  const [menu, setMenu] = useState<{ x: number; y: number; col: DisplayColumn } | null>(null);

  // Note edit popup
  const [noteEditingCol, setNoteEditingCol] = useState<string | null>(null);
  const [noteEditValue, setNoteEditValue] = useState('');

  // Source edit popup
  const [sourceEditingCol, setSourceEditingCol] = useState<string | null>(null);
  const [sourceIconValue, setSourceIconValue] = useState('');
  const [sourceLabelValue, setSourceLabelValue] = useState('');

  // Resize
  const resizeState = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, key: string, currentWidth: string) => {
    e.preventDefault();
    e.stopPropagation();
    const px = parseInt(currentWidth) || 100;
    resizeState.current = { key, startX: e.clientX, startWidth: px };
    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizeState.current) return;
      const delta = ev.clientX - resizeState.current.startX;
      const newWidth = Math.max(40, resizeState.current.startWidth + delta);
      onResizeColumn(resizeState.current.key, newWidth);
    };
    const handleMouseUp = () => {
      resizeState.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [onResizeColumn]);

  // Drag reorder
  const handleDragStart = (e: React.DragEvent, originalIndex: number) => {
    e.dataTransfer.setData('text/plain', String(originalIndex));
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(dropIndex);
  };
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromOriginalIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (!isNaN(fromOriginalIndex)) {
      onReorderColumn(fromOriginalIndex, columns[dropIndex]?._originalIndex ?? dropIndex);
    }
    setDragOverIndex(null);
  };

  // Double-click rename
  const handleDoubleClick = (col: DisplayColumn) => {
    setRenamingCol(col.key);
    setRenameValue(col.label);
  };
  const finishRename = (key: string) => {
    if (renameValue.trim()) onRenameColumn(key, renameValue.trim());
    setRenamingCol(null);
  };

  // Single-click menu
  const handleHeaderClick = (e: React.MouseEvent, col: DisplayColumn) => {
    if (renamingCol) return; // Don't open menu while renaming
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: rect.left, y: rect.bottom + 4, col });
  };

  // Start note edit from menu
  const startNoteEdit = (col: DisplayColumn) => {
    setNoteEditingCol(col.key);
    setNoteEditValue(col._note || '');
  };

  const saveNoteEdit = (key: string) => {
    onUpdateNote(key, noteEditValue.trim());
    setNoteEditingCol(null);
  };

  // Start source edit from menu
  const startSourceEdit = (col: DisplayColumn) => {
    setSourceEditingCol(col.key);
    setSourceIconValue(col._source?.sourceIcon || '');
    setSourceLabelValue(col._source?.sourceLabel || '');
  };

  const saveSourceEdit = (key: string) => {
    onSetSource(key, sourceIconValue, sourceLabelValue.trim());
    setSourceEditingCol(null);
  };

  // Render source icon for a column
  const renderSourceIcon = (col: DisplayColumn) => {
    if (!col._source || !col._source.sourceIcon) {
      return <span title="No source set"><CloudOff className="w-3 h-3 text-slate-300 flex-shrink-0" /></span>;
    }
    const IconComp = sourceIconMap[col._source.sourceIcon];
    if (!IconComp) {
      return <span title={col._source.sourceLabel || ''}><CloudOff className="w-3 h-3 text-slate-300 flex-shrink-0" /></span>;
    }
    const option = sourceIconOptions.find((o) => o.value === col._source!.sourceIcon);
    return (
      <span title={col._source.sourceLabel || option?.label || ''}>
        <IconComp className={`w-3 h-3 ${option?.color || 'text-slate-400'} flex-shrink-0`} />
      </span>
    );
  };

  if (data.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center py-16">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">No Data Available</h3>
          <p className="text-xs text-slate-400">Try adjusting your filters or add new data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-6 pb-4 relative">
      {/* Hover note tooltip */}
      {hoverNote && (
        <div className="fixed z-[60] max-w-[240px] p-2.5 bg-slate-800 text-white text-[11px] rounded-lg shadow-lg pointer-events-none"
          style={{ left: hoverNote.x + 10, top: hoverNote.y - 10 }}>
          {hoverNote.text}
        </div>
      )}

      {/* Click menu */}
      {menu && (
        <HeaderMenu
          x={menu.x} y={menu.y} col={menu.col}
          onClose={() => setMenu(null)}
          onEditNote={() => startNoteEdit(menu.col)}
          onSortAsc={() => onSortColumn(menu.col.key, 'asc')}
          onSortDesc={() => onSortColumn(menu.col.key, 'desc')}
          onGroupBy={() => onGroupColumn(menu.col.key)}
          onSetSource={() => startSourceEdit(menu.col)}
        />
      )}

      {/* Inline note edit modal */}
      {noteEditingCol && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setNoteEditingCol(null)}>
          <div className="absolute inset-0 bg-slate-900/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-[360px] animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[13px] font-semibold text-slate-700 mb-3">
              Edit Field Description — {columns.find((c) => c.key === noteEditingCol)?.label}
            </h3>
            <textarea
              autoFocus
              value={noteEditValue}
              onChange={(e) => setNoteEditValue(e.target.value)}
              placeholder="Enter field description..."
              className="w-full h-20 px-3 py-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 resize-none"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setNoteEditingCol(null)} className="px-3 py-1.5 text-[12px] text-slate-500 hover:bg-slate-50 rounded-lg">Cancel</button>
              <button onClick={() => saveNoteEdit(noteEditingCol)} className="px-3 py-1.5 text-[12px] text-white bg-sky-400 hover:bg-sky-500 rounded-lg">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Source indicator edit modal */}
      {sourceEditingCol && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setSourceEditingCol(null)}>
          <div className="absolute inset-0 bg-slate-900/20" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-5 w-[380px] animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold text-slate-700">
                Set Source Indicator — {columns.find((c) => c.key === sourceEditingCol)?.label}
              </h3>
              <button onClick={() => setSourceEditingCol(null)} className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Icon selector */}
            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Icon</label>
              <div className="grid grid-cols-6 gap-2">
                {sourceIconOptions.map((opt) => {
                  const IconComp = opt.value ? sourceIconMap[opt.value] : CloudOff;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSourceIconValue(opt.value)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                        sourceIconValue === opt.value
                          ? 'border-sky-400 bg-sky-50 shadow-sm'
                          : 'border-gray-100 hover:border-gray-200 hover:bg-slate-50'
                      }`}
                      title={opt.label}
                    >
                      {IconComp && <IconComp className={`w-4 h-4 ${opt.color}`} />}
                      <span className="text-[9px] text-slate-500">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Label input */}
            <div className="mb-4">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tooltip Label</label>
              <input
                autoFocus
                value={sourceLabelValue}
                onChange={(e) => setSourceLabelValue(e.target.value)}
                placeholder="e.g. Sync from Supabase, Manual input..."
                className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setSourceEditingCol(null)} className="px-3 py-1.5 text-[12px] text-slate-500 hover:bg-slate-50 rounded-lg">Cancel</button>
              <button onClick={() => saveSourceEdit(sourceEditingCol)} className="px-3 py-1.5 text-[12px] text-white bg-sky-400 hover:bg-sky-500 rounded-lg">Save</button>
            </div>
          </div>
        </div>
      )}

      <table className={cn('w-full border-separate border-spacing-0 text-[13px]', rowHeightClasses[rowHeight])}>
        <thead>
          <tr className="border-b border-gray-200">
            <th className="w-9 px-4 py-2.5 text-left bg-white sticky top-0 z-10">
              <button onClick={onToggleAll} className={cn('w-[15px] h-[15px] rounded-[4px] border flex items-center justify-center transition-all', allSelected ? 'bg-sky-400 border-sky-400' : 'border-gray-300 hover:border-gray-400')}>
                {allSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </button>
            </th>
            {columns.map((col, ci) => {
              const sortForCol = sorts.find((s) => s.field === col.key);
              return (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider bg-white sticky top-0 z-10 whitespace-nowrap select-none relative group cursor-pointer',
                    dragOverIndex === ci && 'bg-sky-50',
                    menu?.col.key === col.key && 'bg-sky-50',
                  )}
                  style={{ minWidth: col.width, width: col.width }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, col._originalIndex)}
                  onDragOver={(e) => handleDragOver(e, ci)}
                  onDrop={(e) => handleDrop(e, ci)}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDoubleClick={() => handleDoubleClick(col)}
                  onClick={(e) => handleHeaderClick(e, col)}
                >
                  <div className="flex items-center gap-1.5">
                    {/* Source icon - user-defined */}
                    {renderSourceIcon(col)}

                    {/* Label or inline rename input */}
                    {renamingCol === col.key ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => finishRename(col.key)}
                        onKeyDown={(e) => { if (e.key === 'Enter') finishRename(col.key); if (e.key === 'Escape') setRenamingCol(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-5 px-1 text-[11px] bg-white border border-sky-300 rounded outline-none w-[100px]"
                      />
                    ) : (
                      <span className={cn('text-slate-400', menu?.col.key === col.key && 'text-sky-600')}>{col.label}</span>
                    )}

                    {/* Sort indicator */}
                    {sortForCol && (
                      <span className="text-sky-500">
                        {sortForCol.dir === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />}
                      </span>
                    )}

                    {/* Note icon */}
                    {col._note && (
                      <StickyNote
                        className="w-3 h-3 text-amber-400 cursor-help flex-shrink-0"
                        onMouseEnter={(e) => setHoverNote({ text: col._note!, x: e.clientX, y: e.clientY })}
                        onMouseMove={(e) => setHoverNote({ text: col._note!, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHoverNote(null)}
                      />
                    )}

                    {/* Dropdown chevron on hover */}
                    {!renamingCol && <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </div>

                  {/* Resize handle */}
                  <div
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-[4px] h-4 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-sky-300 rounded-full transition-opacity"
                    onMouseDown={(e) => handleResizeMouseDown(e, col.key, col.width)}
                  />
                </th>
              );
            })}
            <th className="w-[80px] px-4 py-2.5 text-left bg-white sticky top-0 z-10" />
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const isSelected = selectedRows.has(row.id as number);
            const condClass = getRowCondColor(row, condColors);
            return (
              <tr key={row.id as number}
                className={cn('group cursor-pointer transition-colors duration-100 border-b border-gray-100/80 last:border-b-0', isSelected ? 'bg-sky-50/60' : condClass || 'hover:bg-slate-50')}
                onClick={() => onViewDetail(row.id as number)}>
                <td className="px-4" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => onToggleRow(row.id as number)}
                    className={cn('w-[15px] h-[15px] rounded-[4px] border flex items-center justify-center transition-all', isSelected ? 'bg-sky-400 border-sky-400' : 'border-gray-300 hover:border-gray-400')}>
                    {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </button>
                </td>
                {columns.map((col) => {
                  const value = row[col.key];
                  let cellContent: React.ReactNode = String(value ?? '-');
                  if (col.format === 'currency') cellContent = formatCurrency(value);
                  else if (col.format === 'percent') cellContent = `${value}%`;
                  if (col.badge) {
                    const badgeVariant = getBadgeClass(value);
                    cellContent = <span className={cn('inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold leading-none', getBadgeStyles(badgeVariant))}>{String(value)}</span>;
                  }
                  return (
                    <td key={col.key} className="px-4 whitespace-nowrap text-slate-700" style={{ textAlign: col.align || 'left' }}>
                      {cellContent}
                    </td>
                  );
                })}
                <td className="px-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onViewDetail(row.id as number)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="View">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {editable && (
                      <>
                        <button onClick={() => onEditDetail(row.id as number)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => onDeleteRow(row.id as number)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
