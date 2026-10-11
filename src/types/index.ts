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
  | 'selesai-jahit'
  | 'target-jahit'
  | 'planning-produksi'
  | 'complain-penalti'
  | 'register-jahit'
  | 'daftar-libur'
  | 'register-penjahit'
  | 'register-client'
  | 'register-harga'
  | 'kategori-biaya'
  | 'expense'
  | 'vendor'
  | 'contact'
  | 'master-product'
  | 'raw-monitoring'
  | 'master-import'
  | 'order-entry'
  | 'production-data'
  | 'production-monitoring'
  | 'sewing-entry'
  | 'finishing-entry'
  | 'kancing-entry'
  | 'invoicing'
  | 'laporan-target-jahit'
  | 'stock-monitoring'
  | 'profit-loss';

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Muatan lompatan antar-halaman yang dipicu dari nomor PO.
 *
 * Dipakai Register Harga untuk membuka Production Order / Invoicing / Order
 * Entry dengan hasil sudah tersaring ke satu PO — seperti klik nomor dokumen di
 * software akuntansi.
 *
 * Dua-duanya dibawa karena **kuncinya berbeda** dan masing-masing tidak cukup
 * sendiri:
 *
 * - `orderId` — primary key `production_orders.id`, berbentuk `PO-9fdfe041`.
 *   Ini kunci join yang andal: `work_orders.source_order_id` dan
 *   `invoices.production_order_id` sama-sama menunjuk ke sini.
 * - `code` — nomor yang DILIHAT user, berbentuk `PO/001-LVU/09/2026/002`.
 *   Diperlukan sebagai cadangan karena invoice lama bisa punya
 *   `production_order_id` NULL sehingga hanya bisa ditemukan lewat nomor PO di
 *   `work_code`. Tanpa ini, invoice lama tidak akan ikut tersaring.
 */
export interface PoJump {
  orderId: string;
  /** Nomor PO yang tampil ke user; `null` bila barisnya tidak punya nomor. */
  code: string | null;
}

export interface NavItem {
  id: ModuleId | 'dashboard' | 'reports' | 'settings';
  label: string;
  icon: string;
  dot?: string;
  locked?: boolean;
}
