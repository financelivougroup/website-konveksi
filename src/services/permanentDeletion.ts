import { supabase } from '@/lib/supabase'
import { PERMANENT_DELETION_MODULES } from '@/types/permanentDeletion'
import type {
  PermanentDeleteCleanupJob, PermanentDeleteCleanupResult, PermanentDeleteExecution,
  PermanentDeletePreview, PermanentDeleteResult, PermanentDeletionModule,
  PermanentDeletionResponse,
} from '@/types/permanentDeletion'

const CLEANUP_BASE = ((import.meta.env.VITE_R2_SIGN_ENDPOINT as string | undefined) ?? '').replace(/\/+$/, '')

function toError(value: unknown): Error {
  if (value instanceof Error) return value
  if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
    return new Error(value.message)
  }
  return new Error('Permintaan gagal. Silakan coba lagi.')
}

function selection(module: PermanentDeletionModule, ids: readonly string[]): string[] {
  if (!(PERMANENT_DELETION_MODULES as readonly string[]).includes(module)) {
    throw new Error('Modul tidak mendukung hapus permanen.')
  }
  if (!ids.length || ids.some(id => typeof id !== 'string' || !id.trim())) {
    throw new Error('Pilih setidaknya satu data dengan ID yang valid.')
  }
  return [...new Set(ids)]
}

export async function preview(
  module: PermanentDeletionModule,
  ids: readonly string[],
): Promise<PermanentDeletionResponse<PermanentDeletePreview>> {
  try {
    const requestedIds = selection(module, ids)
    const { data, error } = await supabase.rpc('permanent_delete_preview', {
      p_module: module, p_ids: requestedIds,
    })
    if (error) return { data: null, error: toError(error) }
    if (!data) throw new Error('Pratinjau penghapusan tidak tersedia.')
    const result = data as PermanentDeletePreview
    if (result.module !== module || !Array.isArray(result.requestedIds)
      || result.requestedIds.length !== requestedIds.length
      || requestedIds.some(id => !result.requestedIds.includes(id))
      || !Array.isArray(result.roots) || result.roots.some(root => !root || typeof root.id !== 'string' || typeof root.label !== 'string')
      || !Array.isArray(result.blocked) || result.blocked.some(reason => typeof reason !== 'string')
      || !result.counts || typeof result.counts !== 'object' || Array.isArray(result.counts)
      || Object.values(result.counts).some(count => !Number.isInteger(count) || count < 0)
      || typeof result.fingerprint !== 'string' || !result.fingerprint) {
      throw new Error('Pratinjau tidak sesuai pilihan. Muat ulang pratinjau.')
    }
    return { data: result, error: null }
  } catch (error) {
    return { data: null, error: toError(error) }
  }
}

/** Retry durable jobs only; never accept arbitrary file paths from the client. */
export async function retryCleanup(
  jobIds: readonly string[],
): Promise<PermanentDeletionResponse<PermanentDeleteCleanupResult>> {
  try {
    const ids = [...new Set(jobIds)]
    if (!ids.length) return { data: { completed: [], pending: [], errors: [] }, error: null }
    if (ids.some(id => !id.trim())) throw new Error('ID pembersihan tidak valid.')
    if (!CLEANUP_BASE) throw new Error('Endpoint pembersihan lampiran belum dikonfigurasi.')
    const { data: auth, error: authError } = await supabase.auth.getSession()
    if (authError) throw authError
    const token = auth.session?.access_token
    if (!token) throw new Error('Sesi tidak ditemukan — silakan masuk kembali.')
    const completed: string[] = []
    const errors: PermanentDeleteCleanupResult['errors'] = []
    // The Worker bounds requests to 50 jobs, independently of files per job.
    for (let offset = 0; offset < ids.length; offset += 50) {
      const batch = ids.slice(offset, offset + 50)
      try {
        const response = await fetch(`${CLEANUP_BASE}/cleanup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ jobIds: batch }),
        })
        if (!response.ok) {
          throw new Error(`Pembersihan lampiran gagal (HTTP ${response.status}).`)
        }
        const result = await response.json() as PermanentDeleteCleanupResult
        if (!result || !Array.isArray(result.completed) || !Array.isArray(result.pending)
          || !Array.isArray(result.errors)
          || result.completed.some(id => typeof id !== 'string')
          || result.pending.some(id => typeof id !== 'string')
          || result.errors.some(error => !error || typeof error.id !== 'string' || typeof error.message !== 'string')) {
          throw new Error('Respons pembersihan lampiran tidak valid.')
        }
        // Omitted or contradictory acknowledgements always remain pending.
        completed.push(...batch.filter(id => result.completed.includes(id) && !result.pending.includes(id)
          && !result.errors.some(error => error.id === id)))
        errors.push(...result.errors.filter(error => batch.includes(error.id)))
      } catch (error) {
        const message = toError(error).message
        errors.push(...batch.map(id => ({ id, message })))
      }
    }
    return { data: { completed, pending: ids.filter(id => !completed.includes(id)), errors }, error: null }
  } catch (error) {
    return { data: null, error: toError(error) }
  }
}

function executionResult(data: unknown, ids: readonly string[]): PermanentDeleteExecution {
  const result = data as PermanentDeleteExecution | null
  if (!result || !Array.isArray(result.deletedIds) || result.deletedIds.length !== ids.length
    || ids.some(id => !result.deletedIds.includes(id))
    || !result.counts || typeof result.counts !== 'object' || Array.isArray(result.counts)
    || !Object.keys(result.counts).length
    || Object.values(result.counts).some(count => !Number.isInteger(count) || count < 0)
    || !Array.isArray(result.cleanupJobIds) || result.cleanupJobIds.some(id => typeof id !== 'string' || !id.trim())
    || new Set(result.cleanupJobIds).size !== result.cleanupJobIds.length
    || result.cleanupPending !== result.cleanupJobIds.length) {
    throw new Error('Hasil penghapusan tidak valid. Muat ulang data untuk memeriksa hasil sebelum mencoba lagi.')
  }
  return result
}

/** DB commit first. Cleanup failure MUST NOT turn a successful deletion into failure. */
export async function execute(
  module: PermanentDeletionModule,
  ids: readonly string[],
  fingerprint: string,
): Promise<PermanentDeletionResponse<PermanentDeleteResult>> {
  let committed: PermanentDeleteExecution
  try {
    const requestedIds = selection(module, ids)
    if (!fingerprint.trim()) throw new Error('Muat pratinjau sebelum menghapus data.')
    const { data, error } = await supabase.rpc('permanent_delete_execute', {
      p_module: module, p_ids: requestedIds, p_fingerprint: fingerprint,
    })
    if (error) return { data: null, error: toError(error) }
    if (!data) throw new Error('Hasil penghapusan tidak tersedia. Periksa data sebelum mencoba lagi.')
    committed = executionResult(data, requestedIds)
  } catch (error) {
    return { data: null, error: toError(error) }
  }

  const cleanup = await retryCleanup(committed.cleanupJobIds)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('permanent-delete-completed'))
  return {
    data: {
      ...committed,
      cleanupPending: cleanup.data ? cleanup.data.pending.length : committed.cleanupPending,
      cleanupError: cleanup.error ?? (cleanup.data?.pending.length
        ? new Error('Data berhasil dihapus, tetapi sebagian lampiran masih menunggu pembersihan.')
        : null),
    },
    error: null,
  }
}

/** Existing proof-edit confirmation; file identity and cleanup are server-owned. */
export async function removeAttachment(module: 'invoice_payment_files' | 'complain_files', id: string) {
  try {
    if (!['invoice_payment_files', 'complain_files'].includes(module) || typeof id !== 'string' || !id.trim()) {
      throw new Error('Lampiran tidak valid.')
    }
    const { data, error } = await supabase.rpc('permanent_delete_attachment', { p_module: module, p_id: id })
    if (error) return { error: toError(error), cleanupError: null }
    const committed = executionResult(data, [id])
    const cleanup = await retryCleanup(committed.cleanupJobIds)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('permanent-delete-completed'))
    return { error: null, cleanupError: cleanup.error ?? (cleanup.data?.pending.length ? new Error('Lampiran menunggu pembersihan.') : null) }
  } catch (error) {
    return { error: toError(error), cleanupError: null }
  }
}

/** Durable cleanup status survives page reload; no current selection is required. */
export async function fetchPendingCleanup(): Promise<PermanentDeletionResponse<PermanentDeleteCleanupJob[]>> {
  try {
    const { data, error } = await supabase.rpc('permanent_delete_pending_cleanup')
    if (error) return { data: null, error: toError(error) }
    if (!Array.isArray(data)) throw new Error('Daftar pembersihan lampiran tidak tersedia.')
    return { data: data as PermanentDeleteCleanupJob[], error: null }
  } catch (error) {
    return { data: null, error: toError(error) }
  }
}
