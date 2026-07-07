export interface ColumnDef {
  key: string;
  label: string;
  width: string;
  align?: 'left' | 'right' | 'center';
  format?: 'currency' | 'percent';
  badge?: boolean;
  icon?: string;
}

export interface ViewConfig {
  title: string;
  editable: boolean;
  sync: boolean;
  columns: ColumnDef[];
}

export interface FilterRule {
  field: string;
  operator: 'contains' | 'equals' | 'starts' | 'ends';
  value: string;
}

export interface GroupRule {
  field: string;
}

export interface SortRule {
  field: string;
  dir: 'asc' | 'desc';
}

export interface CondColorRule {
  field: string;
  operator: 'contains' | 'equals';
  value: string;
  color: 'red' | 'yellow' | 'green' | 'blue' | 'purple';
}

export interface SavedView {
  name: string;
  icon: string;
}

/** Per-column note */
export interface ColumnNote {
  columnKey: string;
  note: string;
}

/** Column rename: original key → custom display name */
export interface ColumnRename {
  columnKey: string;
  customName: string;
}

/** Column source indicator: user-defined per column */
export interface ColumnSource {
  columnKey: string;
  /** Which icon to show: cloud, pencil, calculator, lock, star, heart, zap, alert-circle, or empty string for none */
  sourceIcon: string;
  /** Tooltip label for the icon */
  sourceLabel: string;
}

export interface ViewTabSettings {
  visibleColumns: number[];
  columnOrder: number[];       // drag-reorder: indices into viewConfig.columns
  columnWidths: Record<string, number>; // resize: key → pixel width
  columnNotes: ColumnNote[];   // notes per column
  columnRenames: ColumnRename[]; // renamed column titles
  columnSources: ColumnSource[]; // user-defined source indicators
  filters: FilterRule[];
  groups: GroupRule[];
  sorts: SortRule[];
  rowHeight: 'short' | 'medium' | 'tall' | 'extra';
  condColors: CondColorRule[];
}

export interface ModuleViews {
  views: SavedView[];
  tabSettings: Record<number, ViewTabSettings>;
}

export interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

export type ModuleId =
  | 'selesai-finishing'
  | 'selesai-jahit'
  | 'target-jahit'
  | 'register-jahit'
  | 'daftar-libur'
  | 'register-penjahit'
  | 'master-product'
  | 'raw-monitoring'
  | 'master-import'
  | 'production-data'
  | 'production-monitoring'
  | 'sewing-entry'
  | 'invoicing';

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface NavItem {
  id: ModuleId | 'dashboard' | 'reports' | 'settings';
  label: string;
  icon: string;
  dot?: string;
  locked?: boolean;
}
