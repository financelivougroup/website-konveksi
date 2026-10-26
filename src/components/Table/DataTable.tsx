import { Fragment, Children, cloneElement, isValidElement, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  Eye, Pencil, Trash2,
  Cloud, CloudOff, Calculator, Lock, Star, Heart, Zap, AlertCircle,
  Database, RefreshCw, StickyNote, SortAsc, SortDesc,
  FolderTree, ChevronDown, X, GripVertical as GripVerticalIcon,
} from 'lucide-react';
import { flexRender, useTable } from '@tanstack/react-table';
import type {
  Cell,
  ColumnDef,
  ColumnSizingState,
  Header,
  PaginationState,
  Row,
  RowSelectionState,
} from '@tanstack/react-table';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, Modifier } from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties } from 'react';

import { Button } from '@/components/ui/button';
import {
  DataGrid,
  DataGridContainer,
  dataGridFeatures,
} from '@/components/reui/data-grid/data-grid';
import type { DataGridFeatures } from '@/components/reui/data-grid/data-grid';
import { DataGridPagination } from '@/components/reui/data-grid/data-grid-pagination';
import { DataGridScrollArea } from '@/components/reui/data-grid/data-grid-scroll-area';
import {
  DataGridTableBase,
  DataGridTableBody,
  DataGridTableBodyRowCell,
  DataGridTableEmpty,
  DataGridTableFillBodyCell,
  DataGridTableFillHeadCell,
  DataGridTableFoot,
  DataGridTableHead,
  DataGridTableHeadRow,
  DataGridTableHeadRowCell,
  DataGridTableHeadRowCellResize,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
  DataGridTableViewport,
} from '@/components/reui/data-grid/data-grid-table';

import { cn, formatCurrency, getBadgeClass, getBadgeStyles, getRowCondColor } from '@/lib/utils';
import type { ColumnDef as ProjectColumnDef, CondColorRule, SortRule, ColumnSource } from '@/types';

/** Row shape the grid is driven with: the raw service records. */
type GridRow = Record<string, unknown>;

/** The header object TanStack hands a column's `header` template. */
type GridHeader = Header<DataGridFeatures, GridRow, unknown>;
type GridCell = Cell<DataGridFeatures, GridRow, unknown>;

interface DisplayColumn extends ProjectColumnDef {
  _note?: string;
  /** Position in the caller's full column list; drives drag-to-reorder. */
  _originalIndex?: number;
  _source?: ColumnSource;
  /**
   * Plain variant only: full control over the cell. Overrides the built-in
   * `badge` / `format` rendering, so a page can put a link, a menu, or an
   * inline editor in a cell without the grid needing to know about it.
   */
  render?: (row: GridRow) => React.ReactNode;
}

/**
 * `app` (the default) keeps the full App-view chrome: source indicator, note
 * tooltip, double-click rename, header menu, drag-to-reorder, and the built-in
 * View/Edit/Delete actions on selection. `plain` renders bare headers and only the
 * columns the caller describes — that is what the per-page tables use.
 */
type DataTableVariant = 'app' | 'plain';

type RowHeight = 'short' | 'medium' | 'tall' | 'extra';

interface DataTableProps<TId extends string | number = number> {
  columns: DisplayColumn[];
  data: GridRow[];
  /**
   * Selected rows. Omit it entirely to render no selection column at all — a
   * page with no bulk actions does not want a checkbox that does nothing.
   *
   * Ids are generic because the pages disagree: App keys rows by numeric id,
   * while Invoicing selects invoices by UUID string. Coercing one to the other
   * would either break UUIDs or lose type safety, so the caller's id type is
   * carried through instead.
   */
  selectedRows?: Set<TId>;
  rowHeight?: RowHeight;
  condColors?: CondColorRule[];
  editable?: boolean;
  canDelete?: boolean;
  sorts?: SortRule[];
  onToggleRow?: (id: TId) => void;
  /** Retained for API compatibility; selection flows through `onToggleRow`. */
  onToggleAll?: () => void;
  onViewDetail?: (id: TId) => void;
  onEditDetail?: (id: TId) => void;
  onDeleteRow?: (id: TId) => void;
  onResizeColumn?: (key: string, width: number) => void;
  onReorderColumn?: (fromIndex: number, toIndex: number) => void;
  onRenameColumn?: (key: string, newName: string) => void;
  onUpdateNote?: (key: string, note: string) => void;
  onSortColumn?: (field: string, dir: 'asc' | 'desc') => void;
  onGroupColumn?: (field: string) => void;
  onSetSource?: (key: string, icon: string, label: string) => void;
  /** Rows across every page — drives the pagination footer. Defaults to `data.length`. */
  totalCount?: number;
  /** 1-based current page, owned by the caller. */
  page?: number;
  pageSize?: number;
  /** Omit to render every supplied row and hide the pagination footer. */
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  variant?: DataTableVariant;
  /** Actions shown above the table when exactly one row is selected. */
  rowActions?: (row: GridRow) => React.ReactNode;
  /** Legacy compatibility; actions are no longer rendered as a column. */
  actionsLabel?: string;
  /** Plain variant: whole-row click. */
  onRowClick?: (row: GridRow) => void;
  /** Column keys to hide — the page tables' own show/hide-columns setting. */
  hiddenColumns?: Set<string>;
  /**
   * Column keys frozen to the left edge (sticky while scrolling horizontally).
   *
   * The caller's set is treated as a SET, not as an order: the list handed to
   * TanStack is rebuilt from `columns` order, because `column.getStart('start')`
   * is a running sum over `state.columnPinning.start` — an array whose order
   * decides both the sticky offsets AND where the pinned columns render. A set
   * has no stable order to give, so deriving it from `columns` is the only way
   * the offsets and the visible order can agree.
   *
   * Gaps are ignored rather than fatal: `normalizeFrozen` in
   * `src/lib/columnFreeze.ts` (which the caller applies before handing the set
   * over) already keeps the list a dense prefix, and this component re-derives
   * the same prefix so a stale localStorage entry cannot shift the columns.
   *
   * While any column is frozen the table also switches to `table-fixed`, so the
   * declared widths — which are the only source of the sticky offsets — are
   * exactly the widths the browser renders. Without that, a `table-auto` column
   * grows past its declared size and the next frozen column slides under it.
   * Tables with nothing frozen are untouched: layout stays `table-auto`.
   */
  frozenColumns?: Set<string>;
  /**
   * Whether the header row sticks while scrolling vertically. Defaults to
   * `true`, which is what the grid has always done — pass `false` to let it
   * scroll away.
   */
  headerFrozen?: boolean;
  /** Replaces the default "No Data Available" illustration. */
  emptyMessage?: React.ReactNode;
  /**
   * Plain variant: a full-width detail panel rendered directly under a row.
   *
   * Deliberately NOT wired to TanStack's own expansion state. The pages that
   * need this (Target Jahit's "Belum Jahit" tab) already own an
   * `expandedKeys` set keyed by their own grouping key, which is not the row
   * id — routing the gesture through the grid would mean keeping two sources
   * of truth in sync for no benefit. The page keeps its state and tells the
   * grid which rows are open via `isRowExpanded`.
   */
  expandedRow?: (row: GridRow) => React.ReactNode;
  /** Plain variant: which rows currently show `expandedRow`. */
  isRowExpanded?: (row: GridRow) => boolean;
  /**
   * Plain variant: a `<tfoot>` row pinned under the body.
   *
   * The caller supplies the whole `<tr>` — the totals differ per table (the log
   * panel sums one column and leaves the rest empty, spanning them by
   * `colSpan`), and this grid has no way to guess which columns carry a total.
   */
  footer?: React.ReactNode;
}

/**
 * Four legacy row heights, mapped onto the grid's body cells.
 *
 * Each one also pins the cell's `height`, not just its padding. Without it the
 * row height is decided by whichever cell happens to be tallest, and that
 * varies by the FONT inside the cell: a `font-mono` span (the PO code, Product
 * ID, and Client Code columns) reports a 15px box on a 19.5px line, so its
 * line box grows 1px past a plain text cell's. Measured on the real grid, that
 * made Register Harga's rows 33.5px while a plain-text table's were 32.5px —
 * the same table looking "beda sendiri" from page to page.
 *
 * `height` on a `td` is a MINIMUM, so a taller cell (a 19px icon button, a
 * 17px badge) still wins and nothing gets clipped; it only absorbs that 1px of
 * font-dependent slack, making every row identical.
 *
 * The pin values are measured on the real grid, not derived: a single-line row
 * settles at 33.5px for `medium` because that is where the pin holds it once
 * the content (19.5px line + 12px `py-1.5`) and the separator are accounted for.
 * The separator is an inset shadow rather than a border (see ROW_SEPARATOR), so
 * it never adds to that figure — a bordered cell that outgrows its pin would
 * otherwise measure 1px taller than one that fits.
 */
const ROW_HEIGHT_CLASSES: Record<RowHeight, string> = {
  short: '[&_td]:py-1 [&_td]:h-[29.5px]',
  medium: '[&_td]:py-1.5 [&_td]:h-[33.5px]',
  tall: '[&_td]:py-3.5 [&_td]:h-[49.5px]',
  extra: '[&_td]:py-5 [&_td]:h-[61.5px]',
};

/**
 * The separator between body rows, painted as an inset shadow instead of a
 * `border-b`.
 *
 * The table is `border-separate` and every cell is `border-box`, so a cell's own
 * bottom border comes OUT of its pinned height only while the content still fits
 * inside the pin. The moment a cell's content is taller than the pin, the border
 * is added on top of the content box instead: the cutting tables stack a product
 * name over its work code (36px against the 33.5px medium pin), so every row
 * that carried a separator measured 49px while the last row, which has none,
 * measured 48px — the "row heights aren't all the same" complaint, in a single
 * table.
 *
 * A shadow paints inside the cell's own box and costs no layout height, so the
 * line stays visible without ever moving a row's edge.
 *
 * Applied to the `<tr>`, `:not(:last-child)` also covers a row followed by an
 * expanded detail row — that row is no longer last, so it keeps its separator
 * and the panel below it needs none of its own. (A border declared on `<tr>` is
 * not painted at all under `border-separate`, so the detail row could not have
 * drawn one.)
 */
const ROW_SEPARATOR = '[&:not(:last-child)>td]:shadow-[inset_0_-1px_0_0_hsl(var(--border))]';

const SELECT_COLUMN_ID = '__select';

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

/**
 * The header callbacks, passed down as plain props: the header is rendered by
 * this component's own `<thead>`, so it re-renders with the parent and never
 * needs a ref to see fresh values.
 */
interface HeaderHandlers {
  sorts: SortRule[];
  onRenameColumn: (key: string, newName: string) => void;
  onSortColumn: (field: string, dir: 'asc' | 'desc') => void;
  onGroupColumn: (field: string) => void;
  onOpenNoteEdit: (col: DisplayColumn) => void;
  onOpenSourceEdit: (col: DisplayColumn) => void;
}

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
      className="fixed z-[70] min-w-[200px] bg-white dark:bg-popover dark:text-popover-foreground rounded-xl shadow-xl border border-gray-100 dark:border-border py-1.5 animate-scaleIn"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-gray-50 dark:border-border mb-1">
        {col.label}
      </div>
      <button onClick={() => { onEditNote(); onClose(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-600 dark:text-foreground hover:bg-slate-50 dark:hover:bg-accent transition-colors text-left">
        <StickyNote className="w-3.5 h-3.5 text-amber-400" /> Edit Field Description
      </button>
      <button onClick={() => { onSetSource(); onClose(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-600 dark:text-foreground hover:bg-slate-50 dark:hover:bg-accent transition-colors text-left">
        <Database className="w-3.5 h-3.5 text-cyan-400" /> Set Source Indicator
      </button>
      <div className="mx-3 my-1 border-t border-gray-50 dark:border-border" />
      <button onClick={() => { onSortAsc(); onClose(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-600 dark:text-foreground hover:bg-slate-50 dark:hover:bg-accent transition-colors text-left">
        <SortAsc className="w-3.5 h-3.5 text-sky-500" /> Sort Ascending
      </button>
      <button onClick={() => { onSortDesc(); onClose(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-600 dark:text-foreground hover:bg-slate-50 dark:hover:bg-accent transition-colors text-left">
        <SortDesc className="w-3.5 h-3.5 text-sky-500" /> Sort Descending
      </button>
      <div className="mx-3 my-1 border-t border-gray-50 dark:border-border" />
      <button onClick={() => { onGroupBy(); onClose(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-600 dark:text-foreground hover:bg-slate-50 dark:hover:bg-accent transition-colors text-left">
        <FolderTree className="w-3.5 h-3.5 text-emerald-500" /> Add Field to Group
      </button>
    </div>
  );
}

/** Render source icon for a column */
function SourceIcon({ col }: { col: DisplayColumn }) {
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
}

/**
 * A column header's content: source indicator, label (double-click to rename),
 * sort direction, note tooltip, and the click-through menu. Reordering is NOT
 * bound here — a dedicated grip handle owns the drag, so double-click and
 * click still reach this content.
 */
function HeaderCellContent({
  col, handlers,
}: {
  col: DisplayColumn;
  handlers: HeaderHandlers;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [hoverNote, setHoverNote] = useState<{ text: string; x: number; y: number } | null>(null);

  const h = handlers;
  const sortDir = h.sorts.find((s) => s.field === col.key)?.dir;

  const finishRename = () => {
    const next = renameValue.trim();
    if (next && next !== col.label) h.onRenameColumn(col.key, next);
    setRenaming(false);
  };

  const openMenu = (e: React.MouseEvent) => {
    if (renaming) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: rect.left, y: rect.bottom + 4 });
  };

  return (
    <>
      <div
        className="flex items-center gap-1.5 min-w-0 cursor-pointer select-none"
        onClick={openMenu}
      >
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={finishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-5 px-1 text-[11px] font-normal normal-case tracking-normal bg-white dark:bg-card dark:text-foreground border border-slate-400 dark:border-input rounded outline-none w-[100px]"
          />
        ) : (
          <span
            className={cn('truncate', menu ? 'text-sky-600' : undefined)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
              setRenameValue(col.label);
            }}
          >
            {col.label}
          </span>
        )}

        {/* The source indicator trails the label rather than leading it. It is
            the same 12px glyph with the same tooltip and the same menu entry,
            but while it sat in front the label was pushed 36px off the cell's
            left edge — the app variant's header was the one grid in the app
            whose first column did not start 12px from the checkbox. */}
        <SourceIcon col={col} />

        {sortDir && (
          <span className="text-sky-500 flex-shrink-0">
            {sortDir === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />}
          </span>
        )}

        {col._note && (
          <StickyNote
            className="w-3 h-3 text-amber-400 cursor-help flex-shrink-0"
            onMouseEnter={(e) => setHoverNote({ text: col._note!, x: e.clientX, y: e.clientY })}
            onMouseMove={(e) => setHoverNote({ text: col._note!, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHoverNote(null)}
          />
        )}

        {!renaming && <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover/head:opacity-100 transition-opacity flex-shrink-0" />}
      </div>

      {hoverNote && (
        <div
          className="fixed z-[60] max-w-[240px] p-2.5 bg-slate-800 text-white text-[11px] rounded-lg shadow-lg pointer-events-none"
          style={{ left: hoverNote.x + 10, top: hoverNote.y - 10 }}
        >
          {hoverNote.text}
        </div>
      )}

      {menu && (
        <HeaderMenu
          x={menu.x}
          y={menu.y}
          col={col}
          onClose={() => setMenu(null)}
          onEditNote={() => h.onOpenNoteEdit(col)}
          onSortAsc={() => h.onSortColumn(col.key, 'asc')}
          onSortDesc={() => h.onSortColumn(col.key, 'desc')}
          onGroupBy={() => h.onGroupColumn(col.key)}
          onSetSource={() => h.onOpenSourceEdit(col)}
        />
      )}
    </>
  );
}

/**
 * A data-column header. The grip handle carries the dnd-kit listeners — binding
 * them to the whole cell (as the old HTML5 drag did) would swallow the
 * double-click-rename and the header menu's click.
 */
function SortableHeaderCell({
  header, col, handlers,
}: {
  header: GridHeader;
  col: DisplayColumn;
  handlers: HeaderHandlers;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: header.column.id });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    ...dndPositionStyle(header.column.getIsPinned() !== false, isDragging),
  };

  return (
    <DataGridTableHeadRowCell header={header} dndRef={setNodeRef} dndStyle={style}>
      <div className="flex items-center gap-0.5">
        {/* The label leads the cell. The grip used to sit in front of it, and
            with the source indicator that pushed every app-variant header label
            36px right of its column's left edge — measured 48px from the
            checkbox to the label, against 12px in every page table and in this
            grid's own body cells, whose text starts at 12px. Trailing the grip
            puts the label back on the same 12px inset as the rest of the app,
            and lines the header up with the data underneath it. */}
        <div className="grow min-w-0">
          <HeaderCellContent col={col} handlers={handlers} />
        </div>
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'size-6 shrink-0',
            isDragging ? 'cursor-grabbing' : 'cursor-grab active:cursor-grabbing',
            // The resize handle is an absolutely positioned 20px strip at the
            // cell's end edge, so it reaches ~8px into the content box. Without
            // this the grip would sit under that strip and lose the right of
            // its 24px to a hit area belonging to something else.
            header.column.getCanResize() && 'me-4',
          )}
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${col.label}`}
        >
          <GripVerticalIcon className="size-3.5 opacity-40 hover:opacity-80" aria-hidden="true" />
        </Button>
        {header.column.getCanResize() && <DataGridTableHeadRowCellResize header={header} />}
      </div>
    </DataGridTableHeadRowCell>
  );
}

/**
 * Position/stacking for a dnd-sortable cell, which must not fight the freeze.
 *
 * `dndStyle` is spread onto the `<th>`/`<td>` AFTER ReUI's `getPinningStyles`,
 * so a bare `position: 'relative'` here silently cancels a frozen cell's
 * `position: sticky` — the header stays pinned while its body cells scroll
 * away underneath, which looks like a header/body misalignment rather than a
 * missing sticky. The same `zIndex: 0` would also drop the cell out of the
 * grid's pinned layer (z 30) and let neighbouring columns paint over it.
 *
 * So a pinned cell claims NOTHING but the drag lift. Returning an empty object
 * matters: a key present with an `undefined` value still overwrites what
 * `getPinningStyles` set, which is how `zIndex: undefined` was silently wiping
 * the pinned layer's `z-index: 30` and `transform: undefined` its
 * `translateZ(0)`.
 */
function dndPositionStyle(isPinned: boolean, isDragging: boolean): CSSProperties {
  if (isPinned) return isDragging ? { zIndex: 31 } : {};
  return { position: 'relative', zIndex: isDragging ? 1 : 0 };
}

/** A body cell that moves with its column during a reorder drag. */
function SortableBodyCell({ cell }: { cell: GridCell }) {
  const { isDragging, setNodeRef, transform, transition } = useSortable({ id: cell.column.id });

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    transform: CSS.Translate.toString(transform),
    transition,
    ...dndPositionStyle(cell.column.getIsPinned() !== false, isDragging),
  };

  return (
    <DataGridTableBodyRowCell cell={cell} dndRef={setNodeRef} dndStyle={style}>
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </DataGridTableBodyRowCell>
  );
}

export function DataTable<TId extends string | number = number>({
  columns, data,
  selectedRows, rowHeight = 'medium', condColors = [], editable = false, canDelete = false, sorts = [],
  onToggleRow, onViewDetail, onEditDetail, onDeleteRow,
  onResizeColumn, onReorderColumn, onRenameColumn, onUpdateNote,
  onSortColumn, onGroupColumn, onSetSource,
  totalCount, page = 1, pageSize = 10, onPageChange, onPageSizeChange,
  variant = 'app', rowActions, onRowClick, hiddenColumns, emptyMessage,
  expandedRow, isRowExpanded, footer, frozenColumns, headerFrozen = true,
}: DataTableProps<TId>) {
  // Per-row actions live in a selection toolbar, never in a table column.
  // Callers with no controlled selection receive local selection for their actions.
  const isPlain = variant === 'plain';
  const [actionSelection, setActionSelection] = useState<Set<TId>>(new Set());
  const hasControlledSelection = selectedRows !== undefined && onToggleRow !== undefined;
  const hasRowActions = Boolean(rowActions || onViewDetail || onEditDetail || onDeleteRow);
  const effectiveSelection = hasControlledSelection ? selectedRows : actionSelection;
  const toggleSelection = useCallback((id: TId) => {
    if (hasControlledSelection) {
      onToggleRow?.(id);
      return;
    }
    setActionSelection((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, [hasControlledSelection, onToggleRow]);
  const hasSelection = hasControlledSelection || hasRowActions;
  const footerWithSelection = hasSelection && !hasControlledSelection && isValidElement<{ children?: React.ReactNode }>(footer) && footer.type === 'tr'
    ? cloneElement(footer, {}, <td aria-hidden="true" />, ...Children.toArray(footer.props.children))
    : footer;
  const selectedActionRow = effectiveSelection?.size === 1
    ? data.find((row) => effectiveSelection.has(row.id as TId))
    : undefined;
  const isPaginated = onPageChange !== undefined;
  const effectiveRowHeight: RowHeight = rowHeight;
  // `?? []` produces a NEW array on every render, which would invalidate every
  // useMemo that lists it as a dependency. The props already default to `[]`,
  // so this only guards a caller that explicitly passes null/undefined.
  const effectiveCondColors = useMemo(() => condColors ?? [], [condColors]);
  const effectiveSorts = useMemo(() => sorts ?? [], [sorts]);
  const recordCount = totalCount ?? data.length;
  const currentPage = page ?? 1;
  const currentPageSize = pageSize ?? 10;

  // Note edit popup
  const [noteEditingCol, setNoteEditingCol] = useState<string | null>(null);
  const [noteEditValue, setNoteEditValue] = useState('');

  // Source edit popup
  const [sourceEditingCol, setSourceEditingCol] = useState<string | null>(null);
  const [sourceIconValue, setSourceIconValue] = useState('');
  const [sourceLabelValue, setSourceLabelValue] = useState('');

  const handleOpenNoteEdit = useCallback((col: DisplayColumn) => {
    setNoteEditingCol(col.key);
    setNoteEditValue(col._note || '');
  }, []);

  const handleOpenSourceEdit = useCallback((col: DisplayColumn) => {
    setSourceEditingCol(col.key);
    setSourceIconValue(col._source?.sourceIcon || '');
    setSourceLabelValue(col._source?.sourceLabel || '');
  }, []);

  // Lookup from a column id back to its display config, for the headers and
  // cells this component renders itself.
  const colById = useMemo(() => {
    const map = new Map<string, DisplayColumn>();
    for (const col of columns) map.set(col.key, col);
    return map;
  }, [columns]);

  const headerHandlers = useMemo<HeaderHandlers>(() => ({
    sorts: effectiveSorts,
    onRenameColumn: onRenameColumn ?? (() => {}),
    onSortColumn: onSortColumn ?? (() => {}),
    onGroupColumn: onGroupColumn ?? (() => {}),
    onOpenNoteEdit: handleOpenNoteEdit, onOpenSourceEdit: handleOpenSourceEdit,
  }), [effectiveSorts, onRenameColumn, onSortColumn, onGroupColumn, handleOpenNoteEdit, handleOpenSourceEdit]);

  const saveNoteEdit = (key: string) => {
    onUpdateNote?.(key, noteEditValue.trim());
    setNoteEditingCol(null);
  };

  const saveSourceEdit = (key: string) => {
    onSetSource?.(key, sourceIconValue, sourceLabelValue.trim());
    setSourceEditingCol(null);
  };

  // ---- column definitions -------------------------------------------------

  const columnDefs = useMemo<ColumnDef<DataGridFeatures, GridRow>[]>(() => {
    const selectColumn: ColumnDef<DataGridFeatures, GridRow> = {
      id: SELECT_COLUMN_ID,
      header: () => <DataGridTableRowSelectAll />,
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DataGridTableRowSelect row={row} />
        </div>
      ),
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,
      // 28px is the cell's actual content: 12px leading padding + a 16px
      // checkbox + no trailing padding (see `pe-0` below). The app variant takes
      // its width from this `size` through an inline custom property, so a
      // larger number would leave that much dead space after the box — at 36 it
      // measured 7.3px, all of it empty.
      size: 28,
      // Keep the checkbox tight against the column beside it.
      //
      // This is the one cell whose whole content is a single 16px control, so the
      // grid's normal `px-3` on BOTH sides leaves 12px of dead space after the
      // box before the next column's own 12px of leading padding even begins —
      // measured at 24px from the checkbox edge to the neighbouring text.
      // `pe-0` drops that trailing half.
      //
      // `w-0` is what stops the column from ballooning in the plain variant: that
      // variant is `table-auto` with resizing off, so no width is applied to the
      // cell at all and the select column absorbs a share of the page's spare
      // width — measured at 150px in a 2-column table against 40px on a
      // 23-column one. `w-0` sizes the column to its content instead. The app
      // variant is untouched by it: its width comes from the inline
      // `--col-…-size` custom property, and an inline style outranks a class.
      meta: {
        headerClassName: 'w-0 pe-0',
        cellClassName: 'w-0 pe-0',
      },
    };

    const dataColumns: ColumnDef<DataGridFeatures, GridRow>[] = columns.map((col) => ({
      id: col.key,
      // An accessor function keeps the column keyed by the raw field name while
      // avoiding deep-key typing against an open `Record<string, unknown>`.
      accessorFn: (row: GridRow) => row[col.key],
      // In the app variant the visible header chrome is rendered by this
      // component's own `<thead>` (see `SortableHeaderCell`), so this template
      // only has to exist for TanStack to build the column around. The plain
      // variant renders the label here, because it has no custom `<thead>`.
      header: isPlain ? () => col.label : () => null,
      cell: (ctx) => {
        // A caller-supplied renderer wins over everything: it is the escape
        // hatch for cells this grid has no business knowing about.
        if (col.render) return col.render(ctx.row.original);
        const value = ctx.getValue();
        if (col.badge) {
          const badgeVariant = getBadgeClass(value);
          return (
            <span className={cn('inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold leading-none', getBadgeStyles(badgeVariant))}>
              {String(value)}
            </span>
          );
        }
        if (col.format === 'currency') return formatCurrency(value);
        if (col.format === 'percent') return `${value}%`;
        return String(value ?? '-');
      },
      enableSorting: false,
      enableHiding: false,
      minSize: 40,
      size: parseInt(col.width, 10) || 100,
      meta: {
        headerTitle: col.label,
        headerClassName: col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : undefined,
        cellClassName: cn(
          'whitespace-nowrap text-slate-700 dark:text-foreground',
          col.align === 'right' && 'text-right',
          col.align === 'center' && 'text-center',
        ),
      },
    }));

    return [
      ...(hasSelection ? [selectColumn] : []),
      ...dataColumns,
    ];
  }, [columns, isPlain, hasSelection]);

  // ---- controlled table state --------------------------------------------

  // Widths live in the caller's view settings; the grid reads them as its
  // controlled column-sizing state and writes commits back through
  // `onResizeColumn`.
  const columnSizing = useMemo<ColumnSizingState>(() => {
    const out: ColumnSizingState = {};
    for (const col of columns) out[col.key] = parseInt(col.width, 10) || 100;
    return out;
  }, [columns]);

  const rowSelection = useMemo<RowSelectionState>(() => {
    const out: RowSelectionState = {};
    for (const id of effectiveSelection ?? []) out[String(id)] = true;
    return out;
  }, [effectiveSelection]);

  // The page tables keep their hide/show-columns choice in a `Set<string>`;
  // the grid wants a map of the hidden keys.
  const columnVisibility = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const key of hiddenColumns ?? []) out[key] = false;
    return out;
  }, [hiddenColumns]);

  // Frozen columns, as TanStack's pinning state.
  //
  // Rebuilt from `columns` order on purpose (see the `frozenColumns` prop
  // comment): the array order decides both the sticky offsets and where the
  // pinned columns render, and a `Set` has no order to give. Gaps are dropped
  // here as well, so a stale entry left in localStorage cannot hoist a column
  // out of place — the result is always the dense prefix of the caller's set.
  //
  // The select column joins the frozen group whenever anything else is frozen.
  // It is not a data column, so the caller never lists it, but pinning hoists
  // columns: leaving it unpinned would push the checkbox to the right of the
  // first frozen data column and break the "checkbox is the first cell" layout
  // every page table depends on. The action column is deliberately NOT pinned —
  // it keeps scrolling with the data, exactly as before.
  const frozenKeys = useMemo(() => {
    if (!frozenColumns || frozenColumns.size === 0) return [];
    const hidden = hiddenColumns ?? new Set<string>();
    const keys: string[] = [];
    for (const col of columns) {
      if (hidden.has(col.key)) continue;
      if (!frozenColumns.has(col.key)) break;
      keys.push(col.key);
    }
    return keys;
  }, [columns, frozenColumns, hiddenColumns]);

  const hasFrozen = frozenKeys.length > 0;

  const columnPinning = useMemo(
    () => ({
      start: hasFrozen && hasSelection ? [SELECT_COLUMN_ID, ...frozenKeys] : frozenKeys,
      end: [] as string[],
    }),
    [frozenKeys, hasFrozen, hasSelection],
  );

  // Without a page handler the caller is showing every row it passed, so ask
  // the row model for all of them rather than a 10-row first page.
  const pagination = useMemo<PaginationState>(
    () => (isPaginated
      ? { pageIndex: Math.max(0, currentPage - 1), pageSize: currentPageSize }
      : { pageIndex: 0, pageSize: Math.max(1, data.length) }),
    [isPaginated, currentPage, currentPageSize, data.length],
  );

  const pageCount = Math.max(1, Math.ceil(recordCount / Math.max(1, currentPageSize)));

  // Widths are only controlled when the caller can persist them; otherwise
  // TanStack keeps its own sizing state and resize still works, just unsaved.
  const sizingControlled = onResizeColumn !== undefined;

  const handleColumnSizingChange = useCallback((updater: unknown) => {
    if (!onResizeColumn) return;
    const next = typeof updater === 'function'
      ? (updater as (old: ColumnSizingState) => ColumnSizingState)(columnSizing)
      : (updater as ColumnSizingState);
    for (const [key, size] of Object.entries(next)) {
      if (columnSizing[key] !== size) onResizeColumn(key, size);
    }
  }, [columnSizing, onResizeColumn]);

  // ReUI's checkbox writes a whole RowSelectionState; the caller keeps a
  // `Set` of its own ids and toggles one at a time, so replay the difference
  // through its existing per-row handler. Ids are matched as strings (that is
  // what the grid keys rows by) but handed back in the caller's own type, so
  // numeric ids stay numbers and UUIDs stay strings.
  const handleRowSelectionChange = useCallback((updater: unknown) => {
    if (!toggleSelection) return;
    const current = effectiveSelection ?? new Set<TId>();
    const next = typeof updater === 'function'
      ? (updater as (old: RowSelectionState) => RowSelectionState)(rowSelection)
      : (updater as RowSelectionState);
    const nextIds = new Set(Object.keys(next).filter((k) => next[k]));
    // Recover the caller's original value for each selected key, preferring
    // the rows on screen; fall back to the key itself for a page that has
    // since changed.
    const byKey = new Map<string, TId>();
    for (const id of current) byKey.set(String(id), id);
    for (const row of data) {
      const id = row.id as TId | undefined;
      if (id !== undefined && id !== null) byKey.set(String(id), id);
    }
    const asId = (key: string): TId => byKey.get(key) ?? (key as TId);
    for (const key of nextIds) {
      if (!current.has(asId(key))) toggleSelection(asId(key));
    }
    for (const id of current) {
      if (!nextIds.has(String(id))) toggleSelection(id);
    }
  }, [rowSelection, effectiveSelection, toggleSelection, data]);

  // Pinning is fully controlled by the page's frozen-column set, so there is
  // nothing to write back. The handler exists only to keep TanStack from
  // keeping an uncontrolled copy; the state it would publish is discarded.
  const handleColumnPinningChange = useCallback(() => {}, []);

  const handlePaginationChange = useCallback((updater: unknown) => {    const next = typeof updater === 'function'
      ? (updater as (old: PaginationState) => PaginationState)(pagination)
      : (updater as PaginationState);
    if (next.pageSize !== pagination.pageSize) {
      onPageSizeChange?.(next.pageSize);
      return;
    }
    if (next.pageIndex !== pagination.pageIndex) onPageChange?.(next.pageIndex + 1);
  }, [pagination, onPageChange, onPageSizeChange]);

  const table = useTable({
    features: dataGridFeatures,
    columns: columnDefs,
    data,
    getRowId: (row: GridRow) => String(row.id),
    manualPagination: true,
    pageCount,
    state: {
      ...(sizingControlled ? { columnSizing } : {}),
      rowSelection,
      pagination,
      columnVisibility,
      columnPinning,
    },
    // The frozen set is owned by the page (it is persisted in its column
    // settings), so pinning is controlled: this component renders whatever it
    // is given and there is no in-grid pin affordance to write back. Without a
    // handler TanStack would keep a second, uncontrolled copy that immediately
    // diverges from the caller's.
    onColumnPinningChange: handleColumnPinningChange,
    onColumnSizingChange: handleColumnSizingChange,
    onRowSelectionChange: handleRowSelectionChange,
    onPaginationChange: handlePaginationChange,
  });

  // ---- column reordering --------------------------------------------------

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Column reordering is a pure gesture: the resulting order is written back
  // through `onReorderColumn` and returns as the `columns` prop order.
  const orderableIds = useMemo(() => columns.map((c) => c.key), [columns]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = columns.find((c) => c.key === active.id);
    const to = columns.find((c) => c.key === over.id);
    if (!from || !to) return;
    // Reordering needs both the caller's commit handler and each column's
    // position in its full list; the plain variant supplies neither.
    if (onReorderColumn === undefined) return;
    if (from._originalIndex === undefined || to._originalIndex === undefined) return;
    onReorderColumn(from._originalIndex, to._originalIndex);
  }, [columns, onReorderColumn]);

  // A column drag reads as horizontal; locking y keeps the ghost on its row.
  const restrictToHorizontal = useCallback<Modifier>(({ transform }) => ({ ...transform, y: 0 }), []);
  const modifiers = useMemo(() => [restrictToHorizontal], [restrictToHorizontal]);

  // ---- render -------------------------------------------------------------

  const headerGroup = table.getHeaderGroups()[0];
  const headers = headerGroup?.headers ?? [];
  // Resolve the three header groups BY ID, not by position.
  //
  // Position slicing (`headers[0]` is the checkbox, last is the action column)
  // only holds while no column is pinned: `table.getHeaderGroups()` hoists
  // pinned columns to the front (`[...left, ...center, ...right]`), so the
  // moment a data column is frozen, `headers[0]` stops being the checkbox and
  // every header shifts one cell left of its body column. Looking each one up
  // by its id keeps the mapping correct under pinning, and costs nothing when
  // nothing is pinned.
  //
  // The data headers then follow `columns` order rather than the hoisted header
  // order, which is what the body already does (`row.getVisibleCells()` returns
  // start-pinned cells first too, but the cells are rendered from the column
  // list). Both sides therefore agree on order without either having to know
  // about pinning.
  const headerById = new Map(headers.map((h) => [h.column.id, h]));
  const selectHeader = hasSelection ? headerById.get(SELECT_COLUMN_ID) : undefined;
  const dataHeaders = columns
    .map((col) => headerById.get(col.key))
    .filter((h): h is GridHeader => h !== undefined);
  const rows = table.getRowModel().rows;

  // The two variants replaced two different headers. The app variant is the
  // legacy grid's own header — small, uppercase, widely tracked. The plain
  // variant replaced page tables whose header was `T_TH`: 12px, sentence case.
  // Forcing the app treatment onto the plain header shrank every label and
  // spread its letters wider than the data underneath, which is what read as
  // "fontnya nggak fit".
  //
  // Match T_TH's softer semibold/slate treatment without changing either
  // variant's size, uppercase transform, tracking or dark-mode readability.
  const headerRowClass = isPlain
    ? '[&>th]:h-10 [&>th]:text-[12px] [&>th]:font-semibold [&>th]:text-slate-700 dark:[&>th]:text-foreground'
    : '[&>th]:h-10 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-slate-700 dark:[&>th]:text-foreground';

  // The app variant fills the viewport and carries its own page padding; the
  // plain variant is embedded in a page that already provides both.
  const containerClass = isPlain
    ? 'relative min-h-0 flex flex-col'
    : 'flex-1 min-h-0 flex flex-col px-6 pb-4 relative';

  const resolvedEmpty = emptyMessage ?? (
    <div className="py-10 text-center">
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-muted flex items-center justify-center">
        <svg className="w-7 h-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-foreground mb-1">No Data Available</h3>
      <p className="text-xs text-slate-400">Try adjusting your filters or add new data</p>
    </div>
  );

  return (
    <div className={containerClass}>
      {hasRowActions && effectiveSelection && effectiveSelection.size > 0 && (
        <div role="toolbar" aria-label="Tindakan baris terpilih" className="mb-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">{effectiveSelection.size} baris dipilih</span>
          {selectedActionRow ? rowActions ? rowActions(selectedActionRow) : (
            <>
              {onViewDetail && <Button type="button" variant="outline" size="sm" onClick={() => onViewDetail(selectedActionRow.id as TId)}><Eye /> Lihat</Button>}
              {editable && onEditDetail && <Button type="button" variant="outline" size="sm" onClick={() => onEditDetail(selectedActionRow.id as TId)}><Pencil /> Edit</Button>}
              {editable && canDelete && onDeleteRow && <Button type="button" variant="destructive" size="sm" onClick={() => onDeleteRow(selectedActionRow.id as TId)}><Trash2 /> Hapus permanen</Button>}
            </>
          ) : <span className="text-xs text-muted-foreground">Pilih satu baris untuk tindakan per catatan.</span>}
          <Button type="button" variant="ghost" size="sm" onClick={() => {
            for (const id of effectiveSelection) toggleSelection(id);
          }}>Bersihkan pilihan</Button>
        </div>
      )}
      {/* Inline note edit modal */}
      {noteEditingCol && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setNoteEditingCol(null)}>
          <div className="absolute inset-0 bg-slate-900/20" />
          <div className="relative bg-white dark:bg-popover dark:text-popover-foreground rounded-xl shadow-xl border border-gray-100 dark:border-border p-5 w-[360px] animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[13px] font-semibold text-slate-700 dark:text-foreground mb-3">
              Edit Field Description — {colById.get(noteEditingCol)?.label}
            </h3>
            <textarea
              autoFocus
              value={noteEditValue}
              onChange={(e) => setNoteEditValue(e.target.value)}
              placeholder="Enter field description..."
              className="w-full h-20 px-3 py-2 text-[12px] border border-gray-200 dark:border-input dark:bg-card dark:text-foreground rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-ring/30 resize-none"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setNoteEditingCol(null)} className="px-3 py-1.5 text-[12px] text-slate-500 dark:text-muted-foreground hover:bg-slate-50 dark:hover:bg-accent rounded-lg">Cancel</button>
              <button onClick={() => saveNoteEdit(noteEditingCol)} className="px-3 py-1.5 text-[12px] text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Source indicator edit modal */}
      {sourceEditingCol && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setSourceEditingCol(null)}>
          <div className="absolute inset-0 bg-slate-900/20" />
          <div className="relative bg-white dark:bg-popover dark:text-popover-foreground rounded-xl shadow-xl border border-gray-100 dark:border-border p-5 w-[380px] animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold text-slate-700 dark:text-foreground">
                Set Source Indicator — {colById.get(sourceEditingCol)?.label}
              </h3>
              <button onClick={() => setSourceEditingCol(null)} className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Icon</label>
              <div className="grid grid-cols-6 gap-2">
                {sourceIconOptions.map((opt) => {
                  const IconComp = opt.value ? sourceIconMap[opt.value] : CloudOff;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSourceIconValue(opt.value)}
                      className={cn(
                        'flex flex-col items-center gap-1 p-2 rounded-lg border transition-all',
                        sourceIconValue === opt.value
                          ? 'border-slate-400 bg-slate-50 dark:border-ring dark:bg-accent shadow-sm'
                          : 'border-gray-100 dark:border-border hover:border-gray-200 dark:hover:border-input hover:bg-slate-50 dark:hover:bg-accent',
                      )}
                      title={opt.label}
                    >
                      {IconComp && <IconComp className={cn('w-4 h-4', opt.color)} />}
                      <span className="text-[9px] text-slate-500">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tooltip Label</label>
              <input
                autoFocus
                value={sourceLabelValue}
                onChange={(e) => setSourceLabelValue(e.target.value)}
                placeholder="e.g. Sync from Supabase, Manual input..."
                className="w-full px-3 py-2 text-[12px] border border-gray-200 dark:border-input dark:bg-card dark:text-foreground rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-ring/30"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setSourceEditingCol(null)} className="px-3 py-1.5 text-[12px] text-slate-500 dark:text-muted-foreground hover:bg-slate-50 dark:hover:bg-accent rounded-lg">Cancel</button>
              <button onClick={() => saveSourceEdit(sourceEditingCol)} className="px-3 py-1.5 text-[12px] text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg">Save</button>
            </div>
          </div>
        </div>
      )}

      <DataGrid
        table={table}
        recordCount={recordCount}
        emptyMessage={resolvedEmpty}
        tableLayout={{
          // Column resizing is an app-variant feature: only `App.tsx` owns the
          // `columnWidths` view setting, and it is the only caller that passes
          // `onResizeColumn`. Leaving it on for the plain variant is what made
          // every page table look cramped: ReUI freezes each column at its
          // `size` and parks the leftover width in an empty filler column, so a
          // 5-column table on a wide page showed ~500-750px of dead space on
          // the right. The page tables it replaced were `w-auto min-w-full`
          // with auto layout, where the columns themselves absorbed the slack —
          // turning resizing off restores exactly that.
          columnsResizable: !isPlain,
          columnsResizeMode: 'onEnd',
          headerSticky: headerFrozen,
          rowBorder: true,
          headerBorder: true,
          // `columnsPinnable` and `width: 'fixed'` are switched on TOGETHER, and
          // only while something is frozen.
          //
          // Freezing needs fixed layout because the sticky offsets come from
          // `column.getStart('start')`, a running sum of the DECLARED `size`
          // values — TanStack never measures the DOM. Under `table-auto` a
          // width is only a hint, and the plain variant's cells are
          // `whitespace-nowrap` with no truncation (that is gated on
          // `columnsResizable`, which page tables turn off), so a long value
          // renders wider than its declared size and the next frozen column
          // slides underneath it. `table-fixed` makes the rendered widths equal
          // the declared ones, so the offsets are exact.
          //
          // The cost is real and was accepted: text longer than its column is
          // truncated, and a table with few columns no longer stretches to fill
          // the viewport. Both apply only while freeze is on — with nothing
          // frozen, layout is exactly the `table-auto` it has always been.
          columnsPinnable: hasFrozen,
          width: hasFrozen ? 'fixed' : 'auto',
        }}
        tableClassNames={{
          headerSticky: 'sticky top-0 z-40 bg-white dark:bg-card',
          headerRow: cn('group/head', headerRowClass),
          bodyRow: ROW_HEIGHT_CLASSES[effectiveRowHeight],
          // ReUI's own base class sets `text-sm` (14px). The app variant always
          // wanted 13px, and the plain variant replaced page tables whose
          // `T_TABLE` was 13px too — so both variants override it here rather
          // than letting the grid's default win.
          base: 'text-[13px]',
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2.5">
          <DataGridContainer className="flex-1 min-h-0 flex flex-col">
            <DataGridScrollArea className="h-full">
              <DndContext
                collisionDetection={closestCenter}
                modifiers={modifiers}
                onDragEnd={handleDragEnd}
                sensors={sensors}
              >
                <DataGridTableViewport>
                  <DataGridTableBase>
                    <DataGridTableHead>
                      <DataGridTableHeadRow rowId={headerGroup?.id ?? 'header'}>
                        {selectHeader && (
                          <DataGridTableHeadRowCell header={selectHeader}>
                            {flexRender(selectHeader.column.columnDef.header, selectHeader.getContext())}
                          </DataGridTableHeadRowCell>
                        )}

                        <SortableContext items={orderableIds} strategy={horizontalListSortingStrategy}>
                          {dataHeaders.map((header) => {
                            const col = colById.get(header.column.id);
                            if (!col) return null;
                            // The plain variant has no rename/note/menu chrome, so
                            // its header is just the label, aligned like the cells.
                            if (isPlain) {
                              return (
                                <DataGridTableHeadRowCell key={header.id} header={header}>
                                  <span
                                    className={cn(
                                      'truncate',
                                      col.align === 'right' && 'block text-right',
                                      col.align === 'center' && 'block text-center',
                                    )}
                                  >
                                    {col.label}
                                  </span>
                                </DataGridTableHeadRowCell>
                              );
                            }
                            return (
                              <Fragment key={header.id}>
                                <SortableHeaderCell header={header} col={col} handlers={headerHandlers} />
                              </Fragment>
                            );
                          })}
                        </SortableContext>

                        <DataGridTableFillHeadCell />
                      </DataGridTableHeadRow>
                    </DataGridTableHead>

                    <DataGridTableBody>
                      {rows.length === 0 && <DataGridTableEmpty />}
                      {rows.map((row: Row<DataGridFeatures, GridRow>) => {
                        const isSelected = row.getIsSelected();
                        const condClass = getRowCondColor(row.original, effectiveCondColors);
                        const id = row.original.id as TId;
                        const isExpanded = isRowExpanded?.(row.original) ?? false;
                        return (
                          <Fragment key={row.id}>
                          <tr
                            data-state={isSelected ? 'selected' : undefined}
                            onClick={onRowClick
                              ? () => onRowClick(row.original)
                              : (isPlain ? undefined : () => onViewDetail?.(id))}
                            className={cn(
                              'group transition-colors duration-100',
                              !isPlain && 'cursor-pointer',
                              onRowClick && 'cursor-pointer',
                              ROW_SEPARATOR,
                              ROW_HEIGHT_CLASSES[effectiveRowHeight],
                              isSelected ? 'bg-slate-50/60 dark:bg-accent/70' : condClass || 'hover:bg-slate-50 dark:hover:bg-muted',
                            )}
                          >
                            <SortableContext items={orderableIds} strategy={horizontalListSortingStrategy}>
                              {row.getVisibleCells().map((cell) => {
                                const isDataColumn = colById.has(cell.column.id);
                                if (isDataColumn) return <SortableBodyCell key={cell.id} cell={cell} />;
                                return (
                                  <DataGridTableBodyRowCell key={cell.id} cell={cell}>
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </DataGridTableBodyRowCell>
                                );
                              })}
                            </SortableContext>
                            <DataGridTableFillBodyCell />
                          </tr>
                          {isExpanded && expandedRow && (
                            <tr>
                              <td
                                colSpan={row.getVisibleCells().length + (isPlain ? 0 : 1)}
                                className="px-4 py-3"
                              >
                                {expandedRow(row.original)}
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}
                    </DataGridTableBody>
                    {footerWithSelection && <DataGridTableFoot>{footerWithSelection}</DataGridTableFoot>}
                  </DataGridTableBase>
                </DataGridTableViewport>
              </DndContext>
            </DataGridScrollArea>
          </DataGridContainer>

          {isPaginated && <DataGridPagination />}
        </div>
      </DataGrid>
    </div>
  );
}
