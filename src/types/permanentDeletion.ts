export const PERMANENT_DELETION_MODULES = [
  'production_orders', 'work_orders', 'cutting_records', 'sewing_records',
  'kancing_records', 'finishing_records', 'invoices', 'invoice_payments', 'payments',
  'complain_penalti', 'planning_produksi', 'target_jahit', 'target_jahit_detail',
  'selesai_jahit', 'daftar_libur', 'register_harga', 'expense_entries',
  'register_client', 'register_penjahit', 'vendors', 'expense_categories',
  'master_products', 'raw_product_monitoring', 'master_imports',
] as const

export type PermanentDeletionModule = typeof PERMANENT_DELETION_MODULES[number]

export interface PermanentDeletePreview {
  module: string
  /** Original deduplicated selection, not the expanded cascade roots. */
  requestedIds: string[]
  roots: { id: string; label: string }[]
  counts: Record<string, number>
  fingerprint: string
  blocked: string[]
}

/** The database response, before best-effort attachment cleanup. */
export interface PermanentDeleteExecution {
  deletedIds: string[]
  counts: Record<string, number>
  cleanupJobIds: string[]
  cleanupPending: number
}

export interface PermanentDeleteResult extends PermanentDeleteExecution {
  /** Nonfatal: database deletion has already committed when this is populated. */
  cleanupError: Error | null
}

export interface PermanentDeleteCleanupResult {
  completed: string[]
  pending: string[]
  errors: { id: string; message: string }[]
}

export interface PermanentDeleteCleanupJob {
  id: string
  createdAt: string
  remaining: number
  lastError?: string | null
}

export type PermanentDeletionResponse<T> =
  | { data: T; error: null }
  | { data: null; error: Error }
