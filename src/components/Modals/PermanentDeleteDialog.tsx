import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import * as deletion from '@/services/permanentDeletion'
import type {
  PermanentDeleteCleanupJob, PermanentDeletePreview, PermanentDeleteResult,
  PermanentDeletionModule,
} from '@/types/permanentDeletion'

export interface PermanentDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  module: PermanentDeletionModule
  ids: readonly string[]
  onDeleted: (result: PermanentDeleteResult) => void
  title?: string
}

const COUNT_LABELS: Record<string, string> = {
  production_orders: 'Order produksi', production_order_variations: 'Variasi order',
  production_order_prices: 'Harga order', production_order_price_components: 'Komponen harga',
  work_orders: 'Work order', cutting_records: 'Laporan cutting', sewing_records: 'Laporan jahit',
  kancing_records: 'Laporan kancing', finishing_records: 'Laporan finishing',
  invoices: 'Invoice', invoice_payments: 'Alokasi pembayaran invoice', payments: 'Pembayaran',
  invoice_payment_files: 'Bukti pembayaran invoice', complain_penalti: 'Komplain dan penalti',
  complain_files: 'Bukti komplain', planning_produksi: 'Planning produksi',
  target_jahit: 'Target jahit', target_jahit_detail: 'Rincian target jahit',
  selesai_jahit: 'Register jahit', daftar_libur: 'Daftar libur', register_harga: 'Register harga',
  expense_entries: 'Transaksi biaya', register_client: 'Client', register_penjahit: 'Karyawan',
  vendors: 'Vendor', expense_categories: 'Kategori biaya', master_products: 'Master produk',
  raw_product_monitoring: 'Monitoring bahan baku', master_imports: 'Master impor',
}

/** Mount only for an authorized owner/finance. Server remains the permission authority. */
export function PermanentDeleteDialog(props: PermanentDeleteDialogProps) {
  // Unmount on close gives each opening a fresh immutable selection/session.
  return props.open ? <PermanentDeleteSession {...props} /> : null
}

function PermanentDeleteSession({ module, ids, onOpenChange, onDeleted, title }: PermanentDeleteDialogProps) {
  const [snapshot] = useState(() => ({ module, ids: [...new Set(ids)] }))
  const [preview, setPreview] = useState<PermanentDeletePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const operation = useRef(false)
  const generation = useRef(0)
  const inputId = useId()

  const loadPreview = useCallback(async () => {
    const request = ++generation.current
    const result = await deletion.preview(snapshot.module, snapshot.ids)
    if (request !== generation.current) return
    setPreview(result.data)
    setError(result.error?.message ?? null)
    setLoading(false)
  }, [snapshot])

  useEffect(() => {
    let active = true
    const pending = generation
    queueMicrotask(() => { if (active) void loadPreview() })
    return () => { active = false; pending.current++ }
  }, [loadPreview])

  function refreshPreview() {
    if (operation.current || loading) return
    setPreview(null)
    setConfirmation('')
    setError(null)
    setLoading(true)
    void loadPreview()
  }

  const valid = !loading && !busy && !!preview && preview.blocked.length === 0
    && preview.roots.length > 0 && Object.keys(preview.counts).length > 0 && confirmation === 'HAPUS'

  async function remove() {
    if (!valid || !preview || operation.current) return
    operation.current = true
    setBusy(true)
    setError(null)
    const result = await deletion.execute(snapshot.module, snapshot.ids, preview.fingerprint)
    if (result.error) {
      // Includes DELETE_PREVIEW_STALE: never silently accept a changed cascade.
      setPreview(null)
      setConfirmation('')
      setError(`${result.error.message} Muat ulang pratinjau dan konfirmasi kembali.`)
      operation.current = false
      setBusy(false)
      return
    }
    // Cleanup warnings travel with success, never masquerade as a failed DB deletion.
    onOpenChange(false)
    onDeleted(result.data)
  }

  return (
    <AlertDialog open onOpenChange={open => { if (!operation.current) onOpenChange(open) }}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" onEscapeKeyDown={event => { if (busy) event.preventDefault() }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? 'Hapus permanen data terpilih?'}</AlertDialogTitle>
          <AlertDialogDescription>
            Tindakan ini tidak dapat dibatalkan. Data terkait dan lampirannya juga akan dihapus sesuai rincian berikut.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 text-sm" aria-busy={loading || busy}>
          <p className="text-muted-foreground">{snapshot.ids.length} data dipilih.</p>
          {snapshot.module === 'work_orders' && (
            <p>Penghapusan work order mencakup order produksi induk dan seluruh variasi/work order saudaranya, bukan hanya baris yang dipilih.</p>
          )}
          {loading && <p role="status" className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" />Memuat dampak penghapusan…</p>}
          {error && <p role="alert" className="break-words text-destructive">{error}</p>}
          {preview && (
            <>
              <section aria-label="Data utama yang akan dihapus" className="space-y-2">
                <p className="font-medium">Data utama ({preview.roots.length})</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-3">
                  {preview.roots.map(root => <li key={root.id} className="break-all">{root.label || root.id}</li>)}
                </ul>
              </section>
              <section aria-label="Dampak penghapusan" className="space-y-2">
                <p className="font-medium">Dampak penghapusan</p>
                <dl className="space-y-1 rounded-md border p-3">
                  {Object.entries(preview.counts).map(([key, count]) => (
                    <div key={key} className="flex justify-between gap-4">
                      <dt className="min-w-0 break-words">{COUNT_LABELS[key] ?? key.replaceAll('_', ' ')}</dt>
                      <dd className="shrink-0 tabular-nums">{count.toLocaleString('id-ID')}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              {preview.blocked.length > 0 && (
                <div role="alert" className="space-y-2 text-destructive">
                  <p className="font-medium">Penghapusan diblokir</p>
                  <ul className="list-inside list-disc space-y-1">{preview.blocked.map((reason, index) => <li key={index} className="break-words">{reason}</li>)}</ul>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor={inputId}>Ketik HAPUS untuk mengonfirmasi</Label>
                <Input id={inputId} value={confirmation} onChange={event => setConfirmation(event.target.value)}
                  disabled={busy || preview.blocked.length > 0} autoComplete="off" spellCheck={false} />
              </div>
              <p className="text-muted-foreground">Jika pembersihan lampiran tertunda, data tetap terhapus. Pembersihan dapat dicoba kembali dari status lampiran.</p>
            </>
          )}
        </div>
        <AlertDialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Batal</Button>
          <Button variant="outline" disabled={loading || busy} onClick={refreshPreview}>Muat ulang pratinjau</Button>
          {/* Plain shadcn Button intentionally avoids AlertDialogAction's automatic close on error. */}
          <Button variant="destructive" disabled={!valid} onClick={() => void remove()}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {busy ? 'Menghapus…' : 'Hapus permanen'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export interface PermanentDeleteCleanupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Dialog coba-ulang pembersihan lampiran.
 *
 * Dulu ini blok `PermanentDeleteCleanupStatus` yang selalu ter-mount di dasar
 * aplikasi, sehingga muncul sebagai kotak nyasar di bawah SETIAP halaman
 * (termasuk halaman yang tidak ada hubungannya dengan penghapusan). Blok itu
 * dihapus atas permintaan user.
 *
 * Fungsinya tidak hilang: dialog ini dibuka hanya setelah penghapusan yang
 * masih menyisakan pekerjaan pembersihan, jadi tetap ada jalan mencoba ulang
 * tanpa menaruh UI permanen di dasar halaman. Job tetap tersimpan di database
 * (`permanent_delete_pending_cleanup`), jadi kegagalan R2 tidak pernah membuat
 * data "kembali" atau dihapus dua kali.
 */
export function PermanentDeleteCleanupDialog({ open, onOpenChange }: PermanentDeleteCleanupDialogProps) {
  return open ? <CleanupSession onOpenChange={onOpenChange} /> : null
}

function CleanupSession({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [jobs, setJobs] = useState<PermanentDeleteCleanupJob[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const operation = useRef(false)

  const load = useCallback(async () => {
    const result = await deletion.fetchPendingCleanup()
    setJobs(result.data ?? [])
    setError(result.error?.message ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void load() })
    return () => { active = false }
  }, [load])

  async function retry() {
    if (operation.current || !jobs.length) return
    operation.current = true
    setBusy(true)
    setError(null)
    const result = await deletion.retryCleanup(jobs.map(job => job.id))
    await load()
    if (result.error || result.data?.pending.length) {
      setError(result.error?.message ?? 'Sebagian lampiran masih tertunda. Coba lagi nanti.')
    }
    operation.current = false
    setBusy(false)
  }

  return (
    <AlertDialog open onOpenChange={next => { if (!operation.current) onOpenChange(next) }}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Pembersihan lampiran</AlertDialogTitle>
          <AlertDialogDescription>
            Data sudah terhapus permanen. Berkas lampiran yang masih tertunda dibersihkan terpisah karena penyimpanan file tidak ikut transaksi database.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 text-sm" aria-busy={loading || busy}>
          {loading && <p role="status">Memuat status lampiran…</p>}
          {error && <p role="alert" className="break-words text-destructive">{error}</p>}
          {!loading && jobs.length === 0 && !error && (
            <p className="text-muted-foreground">Tidak ada lampiran yang menunggu pembersihan.</p>
          )}
          {jobs.length > 0 && (
            <>
              <p>{jobs.length} pekerjaan pembersihan masih tertunda.</p>
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-3 text-muted-foreground">
                {jobs.map(job => (
                  <li key={job.id} className="break-words">
                    {job.remaining} lampiran tersisa{job.lastError ? ` — ${job.lastError}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <AlertDialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Tutup</Button>
          <Button variant="outline" disabled={busy || loading} onClick={() => { setLoading(true); void load() }}>
            Muat ulang status
          </Button>
          {jobs.length > 0 && (
            <Button disabled={busy || loading} onClick={() => void retry()}>
              {busy ? 'Membersihkan…' : 'Coba bersihkan'}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
