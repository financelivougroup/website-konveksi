import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchAllInvoices } from '@/services/invoices'
import { fetchPaymentsByInvoiceIds } from '@/services/invoicePayments'
import { fetchByIds as fetchWorkOrdersByIds } from '@/services/workOrders'
import { backfillMissingInvoices } from '@/services/autoInvoice'
import { computeFinanceValidation, computeOutstanding } from '@/lib/invoiceCompute'
import { useAuth } from '@/contexts/AuthContext'
import { PermanentDeleteDialog } from '@/components/Modals/PermanentDeleteDialog'
import { canPermanentlyDelete } from '@/lib/permissions'
import type { PermanentDeleteResult } from '@/types/permanentDeletion'
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools'
import { ColumnSettingsButton } from '@/components/Table/ColumnSettings'
import { DataTable } from '@/components/Table/DataTable'
import { PaymentModal } from '@/components/Modals/PaymentModal'
import { InvoiceImage } from '@/components/Invoice/InvoiceImage'
import { useColumnSettings } from '@/lib/columnSettings'
import { applyFilters, applySorts } from '@/lib/tableQuery'
import type { FieldOption, FilterRule, SortRule } from '@/lib/tableQuery'
import { T_WRAP, T_CODE, softBadgeClass } from '@/lib/tableStyles'
import { matchesPoJump, poCodeFromWorkCode } from '@/lib/poJump'
import { PoFilterBanner } from '@/components/Table/PoFilterBanner'
import type { InvoiceRow, InvoicePaymentRow, WorkOrder } from '@/types/pipeline'
import type { PoJump } from '@/types'

interface PaymentBundle {
  payments: InvoicePaymentRow[]
  totalPayment: number
}

type PaymentStatus = 'Paid' | 'Partial Paid' | 'Collect Payment' | 'Need Register Invoice' | 'Unavailable'

type InvoiceTableRow = InvoiceRow & {
  totalPayment: number | null
  outstanding: number | null
  paymentStatus: PaymentStatus
}

const PAGE_SIZE = 10

// Badge status pembayaran soft (lihat `softBadgeClass` di '@/lib/tableStyles').
//
// `hover:` SENGAJA DIHAPUS. Sebelumnya badge ini solid dengan hover yang lebih
// gelap, tetapi baris tabelnya sendiri tidak punya hover/aksi apa pun — jadi
// hover itu menandakan interaktivitas yang tidak ada. Kelas soft tidak punya
// varian hover, dan menghapusnya justru memperbaiki sinyalnya.
// Nilainya nama warna, bukan kelas penuh.
const STATUS_BADGE: Record<PaymentStatus, string> = {
  Paid: 'emerald',
  'Partial Paid': 'emerald',
  'Collect Payment': 'amber',
  'Need Register Invoice': 'slate',
  Unavailable: 'slate',
}

const STATUS_LABEL: Record<PaymentStatus, string> = {
  Paid: 'Paid',
  'Partial Paid': 'Partial Paid',
  'Collect Payment': 'Collect Payment',
  'Need Register Invoice': 'Need Register Invoice',
  Unavailable: 'Tidak tersedia',
}

export function InvoicingPage({ poJump, onClearPoJump }: { poJump?: PoJump | null; onClearPoJump?: () => void } = {}) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Record<string, PaymentBundle>>({})
  const [workOrdersById, setWorkOrdersById] = useState<Record<string, WorkOrder>>({})
  const [paymentLoadError, setPaymentLoadError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [paymentTarget, setPaymentTarget] = useState<InvoiceRow | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleteIds, setDeleteIds] = useState<readonly string[]>([])
  const invoiceImageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const downloadInFlight = useRef(false)
  const refreshRequestRef = useRef(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<FilterRule[]>([])
  const [sorts, setSorts] = useState<SortRule[]>([])
  const { profile } = useAuth()
  // `useToast` di sini adalah hook per-komponen, sedangkan satu-satunya
  // `ToastContainer` hidup di App dan memakai instance-nya sendiri — jadi
  // pesan dari halaman ini tidak pernah terlihat. Umpan balik karena itu
  // ditampilkan sebagai banner di dalam halaman, mengikuti pola yang sudah
  // dipakai Production Monitoring dan Complain & Penalti.
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const showFeedback = useCallback((tone: 'success' | 'error', message: string) => {
    setFeedback({ tone, message })
  }, [])

  // Hanya owner dan finance yang boleh membatalkan tagihan; role lain tidak
  // melihat tombolnya sama sekali.
  const canDeleteInvoice = canPermanentlyDelete(profile.role)

  const filterFields: FieldOption[] = [
    { key: 'monthYear', label: 'Bulan' },
    { key: 'clientName', label: 'Client' },
    { key: 'workCode', label: 'Kode Produksi Konveksi' },
    { key: 'clientProductionCode', label: 'Kode Produksi Client' },
    { key: 'pcsLinked', label: 'Total Qty' },
    { key: 'unitPrice', label: 'Nominal/PCS' },
    { key: 'invoiceCode', label: 'Kode Invoice' },
    { key: 'totalAmount', label: 'Total' },
    { key: 'totalPayment', label: 'Total Dibayar' },
    { key: 'outstanding', label: 'Sisa' },
    { key: 'paymentStatus', label: 'Status' },
    { key: 'createdAt', label: 'Created At' },
  ]

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestRef.current
    const { data, error } = await fetchAllInvoices()
    if (requestId !== refreshRequestRef.current) return
    if (error) {
      showFeedback('error', `Gagal load invoice: ${error.message}`)
      return
    }

    const list = data ?? []
    const { data: payments, error: paymentError } = await fetchPaymentsByInvoiceIds(list.map(inv => inv.id))
    if (requestId !== refreshRequestRef.current) return
    if (paymentError) {
      setInvoices(list)
      setPaymentsByInvoice({})
      setPaymentLoadError(paymentError.message)
      setPage(1)
      showFeedback('error', `Gagal load total pembayaran: ${paymentError.message}`)
      return
    }

    const bundles: Record<string, PaymentBundle> = Object.fromEntries(
      list.map(inv => [inv.id, { payments: [], totalPayment: 0 }]),
    )
    for (const payment of payments ?? []) {
      const bundle = bundles[payment.invoiceId]
      if (!bundle) continue
      bundle.payments.push(payment)
      bundle.totalPayment += payment.amount
    }

    // Detail item (produk/warna/size) untuk template invoice. Kegagalan fetch
    // work order menurunkan tampilan ke fallback aman, bukan memblokir tabel.
    const { data: workOrders, error: workOrderError } = await fetchWorkOrdersByIds(
      list.map(inv => inv.workOrderId),
    )
    if (requestId !== refreshRequestRef.current) return
    if (workOrderError) {
      showFeedback('error', `Gagal load detail work order: ${workOrderError.message}`)
    }

    const workOrderMap: Record<string, WorkOrder> = {}
    for (const workOrder of workOrders ?? []) {
      workOrderMap[workOrder.id] = workOrder
    }

    setInvoices(list)
    setPaymentsByInvoice(bundles)
    setWorkOrdersById(workOrderMap)
    setPaymentLoadError(null)
    setPage(1)
  }, [showFeedback])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setPage(1)
  }, [searchQuery, filters, sorts, poJump])

  // Bentuk kolom untuk DataGrid (variant "plain"). Sel yang butuh badge,
  // format mata uang, atau teks pengganti memakai `render` supaya tabel
  // bersama tidak perlu tahu soal status pembayaran.
  const invoiceColumns = useMemo(() => [
    { key: 'monthYear', label: 'Bulan', width: '100px' },
    { key: 'clientName', label: 'Client', width: '150px' },
    {
      key: 'workCode', label: 'Kode Produksi Konveksi', width: '170px',
      render: (row: Record<string, unknown>) => <span className={T_CODE}>{String(row.workCode)}</span>,
    },
    {
      key: 'clientProductionCode', label: 'Kode Produksi Client', width: '180px',
      render: (row: Record<string, unknown>) => (
        <span className={T_CODE}>{row.clientProductionCode ? String(row.clientProductionCode) : '—'}</span>
      ),
    },
    { key: 'pcsLinked', label: 'Total Qty', align: 'right' as const, width: '90px' },
    { key: 'unitPrice', label: 'Nominal/PCS', align: 'right' as const, width: '110px', format: 'currency' as const },
    {
      key: 'invoiceCode', label: 'Kode Invoice', width: '140px',
      render: (row: Record<string, unknown>) => <span className={T_CODE}>{String(row.invoiceCode)}</span>,
    },
    { key: 'totalAmount', label: 'Total', align: 'right' as const, width: '120px', format: 'currency' as const },
    {
      key: 'totalPayment', label: 'Total Dibayar', align: 'right' as const, width: '125px',
      render: (row: Record<string, unknown>) => (
        row.totalPayment === null ? 'Tidak tersedia' : formatCurrency(row.totalPayment as number)
      ),
    },
    {
      key: 'outstanding', label: 'Sisa', align: 'right' as const, width: '120px',
      render: (row: Record<string, unknown>) => (
        row.outstanding === null ? 'Tidak tersedia' : formatCurrency(row.outstanding as number)
      ),
    },
    {
      key: 'paymentStatus', label: 'Status', width: '120px',
      render: (row: Record<string, unknown>) => {
        const status = row.paymentStatus as PaymentStatus
        return <span className={softBadgeClass(STATUS_BADGE[status])}>{STATUS_LABEL[status]}</span>
      },
    },
    {
      key: 'createdAt', label: 'Created At', width: '130px',
      render: (row: Record<string, unknown>) => (
        row.createdAt ? formatDate(row.createdAt as string) : '—'
      ),
    },
  ], [])

  // Hide/show kolom + freeze (persist per tabel). Dipanggil setelah
  // `invoiceColumns` ada: urutan kolom itu yang dipakai hook untuk merapikan
  // daftar beku menjadi awalan yang rapat — mesin pinning mengangkat kolom yang
  // di-pin ke depan mengikuti urutan tersebut, jadi daftar yang berlubang akan
  // mengubah urutan kolom di layar. Tidak ada `return` lebih awal di antara
  // keduanya, jadi urutan hook-nya tetap sama di setiap render.
  const invoiceColumnKeys = useMemo(() => invoiceColumns.map((c) => c.key), [invoiceColumns])
  const { hidden: hiddenCols, toggle: toggleCol, frozen: frozenCols, toggleFreeze: toggleFreezeCol, toggleFreezeAll: toggleFreezeAllCols, headerFrozen, setHeaderFrozen } = useColumnSettings('invoicing', invoiceColumnKeys)

  const tableRows = useMemo<InvoiceTableRow[]>(() => invoices.map((invoice) => {
    const bundle = paymentsByInvoice[invoice.id]
    if (!bundle || paymentLoadError) {
      return {
        ...invoice,
        totalPayment: null,
        outstanding: null,
        paymentStatus: 'Unavailable',
      }
    }
    const outstanding = computeOutstanding(invoice.totalAmount, bundle.totalPayment)
    const computedStatus = computeFinanceValidation({
      hasAllRequiredInvoiceFields: Boolean(invoice.invoiceCode && invoice.workCode && invoice.totalAmount > 0),
      hasCompletePaymentDetail: bundle.totalPayment > 0,
      outstanding,
    })
    // Status persisten lebih berwenang untuk kasus data invoice belum lengkap.
    const paymentStatus: PaymentStatus = invoice.financeValidation === 'Need Register Invoice'
      ? 'Need Register Invoice'
      : computedStatus === 'Need Register Invoice'
        ? 'Collect Payment'
        : computedStatus
    return {
      ...invoice,
      totalPayment: bundle.totalPayment,
      outstanding,
      paymentStatus,
    }
  }), [invoices, paymentLoadError, paymentsByInvoice])

  const filteredInvoices = useMemo(() => {
    // Lompatan dari nomor PO di Register Harga disaring LEBIH DULU, saat
    // barisnya masih bertipe `InvoiceTableRow[]`. Kunci utamanya
    // `productionOrderId`; `poCodeFromWorkCode` jadi cadangan untuk invoice
    // lama yang kolom relasinya NULL (lihat catatan di `matchesPoJump`).
    const scoped = poJump
      ? tableRows.filter(inv =>
          matchesPoJump(poJump, {
            orderId: inv.productionOrderId,
            code: poCodeFromWorkCode(inv.workCode),
          }),
        )
      : tableRows

    let rows = applyFilters(scoped as unknown as Record<string, unknown>[], filters)
    rows = applySorts(rows, sorts)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(inv =>
        String(inv.monthYear ?? '').toLowerCase().includes(q) ||
        String(inv.clientName ?? '').toLowerCase().includes(q) ||
        String(inv.workCode ?? '').toLowerCase().includes(q) ||
        String(inv.clientProductionCode ?? '').toLowerCase().includes(q) ||
        String(inv.invoiceCode ?? '').toLowerCase().includes(q),
      )
    }
    return rows as unknown as InvoiceTableRow[]
  }, [tableRows, filters, sorts, searchQuery, poJump])

  const paginatedInvoices = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredInvoices.slice(start, start + PAGE_SIZE)
  }, [filteredInvoices, page])

  // "Select all" is owned by the grid now — it toggles every visible row and
  // replays the difference through `handleSelectRow`.
  const handleSelectRow = useCallback((id: string) => {
    setSelectedRows((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedRows(new Set()), [])
  const selectedInvoices = invoices.filter((invoice) => selectedRows.has(invoice.id))

  const openPermanentDelete = () => {
    if (!canDeleteInvoice || selectedRows.size === 0) return
    setDeleteIds(invoices.filter((invoice) => selectedRows.has(invoice.id)).map((invoice) => invoice.id))
    setConfirmDeleteOpen(true)
  }
  const handleDeleted = async (result: PermanentDeleteResult) => {
    const deleted = new Set(result.deletedIds)
    for (const id of deleted) delete invoiceImageRefs.current[id]
    setPaymentTarget((current) => current && deleted.has(current.id) ? null : current)
    setSelectedRows(new Set())
    setConfirmDeleteOpen(false)
    await refresh()
    showFeedback('success', `${result.deletedIds.length} invoice dihapus permanen.${result.cleanupPending > 0 || result.cleanupError ? ' Pembersihan media masih tertunda; periksa status pembersihan.' : ''}`)
  }

  async function handleDownload(invoice: InvoiceRow) {
    if (downloadInFlight.current) return
    if (!paymentsByInvoice[invoice.id] || paymentLoadError) {
      showFeedback('error', 'Data pembayaran belum tersedia. Refresh lalu coba lagi.')
      return
    }
    const target = invoiceImageRefs.current[invoice.id]
    if (!target) {
      showFeedback('error', 'Image element belum siap, coba lagi sebentar.')
      return
    }
    downloadInFlight.current = true
    setDownloadingId(invoice.id)
    try {
      const { downloadInvoicePng } = await import('@/lib/downloadInvoicePng')
      const { sanitizeInvoiceCodeForFile } = await import('@/lib/invoiceCode')
      const baseName = sanitizeInvoiceCodeForFile(invoice.invoiceCode)
      await downloadInvoicePng(target, baseName)
      showFeedback('success', `Invoice ${invoice.invoiceCode} didownload`)
    } catch (error) {
      showFeedback('error', `Gagal download: ${error instanceof Error ? error.message : 'unknown'}`)
    } finally {
      downloadInFlight.current = false
      setDownloadingId(null)
    }
  }

  const handleBackfill = useCallback(async () => {
    setBackfilling(true)
    try {
      const createdCount = await backfillMissingInvoices()
      if (createdCount > 0) {
        showFeedback('success', `✅ ${createdCount} invoice baru dibuat!`)
      } else {
        showFeedback('error', 'Tidak ada invoice baru yang dapat dibuat.')
      }
      await refresh()
    } catch (error) {
      showFeedback('error', `❌ Error: ${error instanceof Error ? error.message : JSON.stringify(error)}`)
    } finally {
      setBackfilling(false)
    }
  }, [showFeedback, refresh])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const formatCurrency = (amount: number) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="px-6 pt-3 pb-0">
        <div className="flex flex-col gap-3 mb-1">
          <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Invoicing</h1>
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              onClick={() => void refresh()}
              className="h-8 px-3.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200 transition-all flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={() => void handleBackfill()}
              disabled={backfilling}
              className="h-8 px-3.5 text-[12px] font-medium bg-violet-500 text-white rounded-lg hover:bg-violet-600 hover:shadow-md hover:shadow-violet-200 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" /> {backfilling ? 'Generating…' : 'Generate Missing Invoices'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 pt-4 pb-5 overflow-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari invoice..."
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <FilterButton fields={filterFields} value={filters} onChange={setFilters} />
          <SortButton fields={filterFields} value={sorts} onChange={setSorts} />
          <ColumnSettingsButton fields={filterFields} hidden={hiddenCols} onToggle={toggleCol} frozen={frozenCols} onToggleFreeze={toggleFreezeCol} onToggleFreezeAll={toggleFreezeAllCols} headerFrozen={headerFrozen} onToggleHeaderFrozen={setHeaderFrozen} />
          <ExportButton onClick={() => showFeedback('error', 'Fitur export belum tersedia.')} />
          <span className="text-[11px] text-slate-400 ml-auto">{filteredInvoices.length} invoice</span>
        </div>

        {paymentLoadError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            Total pembayaran tidak tersedia: {paymentLoadError}
          </div>
        )}

        {feedback && (
          <div
            role="status"
            className={cn(
              'mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]',
              feedback.tone === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-700',
            )}
          >
            <span className="flex-1">{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="shrink-0 font-medium underline underline-offset-2"
              aria-label="Tutup pesan"
            >
              Tutup
            </button>
          </div>
        )}

        {poJump && (
          <PoFilterBanner
            code={poJump.code}
            orderId={poJump.orderId}
            count={filteredInvoices.length}
            note="Invoice lama yang belum punya relasi ke order hanya bisa ditemukan lewat nomor PO-nya, jadi sebagian invoice lama mungkin tidak muncul di sini."
            onClear={() => onClearPoJump?.()}
          />
        )}

        {selectedRows.size > 0 && (
          <div role="toolbar" aria-label="Invoice terpilih" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <span className="text-[12px] font-medium">{selectedRows.size} invoice dipilih</span>
            {selectedInvoices.map((invoice) => (
              <button
                key={invoice.id}
                type="button"
                onClick={() => void handleDownload(invoice)}
                disabled={downloadingId !== null || !paymentsByInvoice[invoice.id] || Boolean(paymentLoadError)}
                className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium border bg-background hover:bg-accent disabled:opacity-50"
                title={!paymentsByInvoice[invoice.id] || paymentLoadError ? 'Data pembayaran belum tersedia. Refresh lalu coba lagi.' : undefined}
              >
                <Download className="w-3.5 h-3.5" />
                {downloadingId === invoice.id ? 'Mengunduh…' : `Download Gambar${selectedInvoices.length > 1 ? ` · ${invoice.invoiceCode}` : ''}`}
              </button>
            ))}
            {canDeleteInvoice && <button
              type="button"
              onClick={openPermanentDelete}
              className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
            </button>}
            <button
              type="button"
              onClick={clearSelection}
              className="h-8 px-2.5 text-[11px] rounded-lg font-medium text-red-700 hover:bg-red-100 transition-colors"
            >
              Bersihkan pilihan
            </button>
          </div>
        )}

        <div className={T_WRAP}>
          <DataTable
            variant="plain"
            columns={invoiceColumns}
            data={paginatedInvoices as unknown as Record<string, unknown>[]}
            selectedRows={selectedRows}
            onToggleRow={handleSelectRow}
            onRowClick={(row) => setPaymentTarget(row as unknown as InvoiceTableRow)}
            hiddenColumns={hiddenCols}
            frozenColumns={frozenCols}
            headerFrozen={headerFrozen}
            totalCount={filteredInvoices.length}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            emptyMessage={
              <div className="py-10 text-center text-[13px] text-gray-400">
                {invoices.length === 0 ? 'Belum ada invoice' : 'Tidak ada hasil yang cocok dengan filter'}
              </div>
            }
          />
        </div>
      </div>

      {/* Template sekarang murni data invoice + work order; riwayat pembayaran
          tidak lagi dicetak di dokumen klien, jadi render tidak perlu menunggu
          bundle pembayaran tersedia. */}
      {invoices.map((invoice) => (
        <InvoiceImage
          key={invoice.id}
          elementRef={(element) => {
            invoiceImageRefs.current[invoice.id] = element
          }}
          invoice={invoice}
          workOrder={workOrdersById[invoice.workOrderId] ?? null}
        />
      ))}

      <PaymentModal
        open={paymentTarget !== null}
        invoice={paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onSaved={() => {
          setPaymentTarget(null)
          void refresh()
        }}
        onError={message => showFeedback('error', message)}
        onSuccess={message => showFeedback('success', message)}
      />

      {canDeleteInvoice && (
        <PermanentDeleteDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}
          module="invoices" ids={deleteIds} onDeleted={handleDeleted} />
      )}
    </main>
  )
}

export default InvoicingPage
