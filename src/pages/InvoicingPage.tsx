import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, RefreshCw, Search, Sparkles, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchAllInvoices } from '@/services/invoices'
import { fetchPaymentsByInvoiceIds } from '@/services/invoicePayments'
import { fetchByIds as fetchWorkOrdersByIds } from '@/services/workOrders'
import { backfillMissingInvoices } from '@/services/autoInvoice'
import { computeFinanceValidation, computeOutstanding } from '@/lib/invoiceCompute'
import { useToast } from '@/hooks/useToast'
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools'
import { ColumnSettingsButton, HiddenColgroup } from '@/components/Table/ColumnSettings'
import { PaymentModal } from '@/components/Modals/PaymentModal'
import { InvoiceImage } from '@/components/Invoice/InvoiceImage'
import { useColumnSettings } from '@/lib/columnSettings'
import { applyFilters, applySorts } from '@/lib/tableQuery'
import type { FieldOption, FilterRule, SortRule } from '@/lib/tableQuery'
import { T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, rowClass } from '@/lib/tableStyles'
import type { InvoiceRow, InvoicePaymentRow, WorkOrder } from '@/types/pipeline'

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

const STATUS_BADGE: Record<PaymentStatus, string> = {
  Paid: 'bg-green-600 hover:bg-green-700',
  'Partial Paid': 'bg-emerald-500 hover:bg-emerald-600',
  'Collect Payment': 'bg-amber-500 hover:bg-amber-600',
  'Need Register Invoice': 'bg-slate-500 hover:bg-slate-600',
  Unavailable: 'bg-slate-400 hover:bg-slate-500',
}

const STATUS_LABEL: Record<PaymentStatus, string> = {
  Paid: 'Paid',
  'Partial Paid': 'Partial Paid',
  'Collect Payment': 'Collect Payment',
  'Need Register Invoice': 'Need Register Invoice',
  Unavailable: 'Tidak tersedia',
}

export function InvoicingPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Record<string, PaymentBundle>>({})
  const [workOrdersById, setWorkOrdersById] = useState<Record<string, WorkOrder>>({})
  const [paymentLoadError, setPaymentLoadError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [paymentTarget, setPaymentTarget] = useState<InvoiceRow | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const invoiceImageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const refreshRequestRef = useRef(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<FilterRule[]>([])
  const [sorts, setSorts] = useState<SortRule[]>([])
  const { showToast } = useToast()

  const { hidden: hiddenCols, toggle: toggleCol } = useColumnSettings('invoicing')

  const filterFields: FieldOption[] = [
    { key: 'monthYear', label: 'Bulan' },
    { key: 'clientName', label: 'Client' },
    { key: 'workCode', label: 'Work Code' },
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
      showToast(`Gagal load invoice: ${error.message}`, 'error')
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
      showToast(`Gagal load total pembayaran: ${paymentError.message}`, 'error')
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
      showToast(`Gagal load detail work order: ${workOrderError.message}`, 'error')
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
  }, [showToast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setPage(1)
  }, [searchQuery, filters, sorts])

  const columns = [
    { key: '__sel', label: '', width: '32px' },
    { key: 'monthYear', label: 'Bulan', width: '100px' },
    { key: 'clientName', label: 'Client', width: '150px' },
    { key: 'workCode', label: 'Work Code', width: '120px' },
    { key: 'pcsLinked', label: 'Total Qty', align: 'right' as const, width: '90px' },
    { key: 'unitPrice', label: 'Nominal/PCS', align: 'right' as const, width: '110px' },
    { key: 'invoiceCode', label: 'Kode Invoice', width: '140px' },
    { key: 'totalAmount', label: 'Total', align: 'right' as const, width: '120px' },
    { key: 'totalPayment', label: 'Total Dibayar', align: 'right' as const, width: '125px' },
    { key: 'outstanding', label: 'Sisa', align: 'right' as const, width: '120px' },
    { key: 'paymentStatus', label: 'Status', width: '120px' },
    { key: 'createdAt', label: 'Created At', width: '130px' },
    { key: 'action', label: 'Action', width: '160px', align: 'center' as const },
  ]

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
    let rows = applyFilters(tableRows as unknown as Record<string, unknown>[], filters)
    rows = applySorts(rows, sorts)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(inv =>
        String(inv.monthYear ?? '').toLowerCase().includes(q) ||
        String(inv.clientName ?? '').toLowerCase().includes(q) ||
        String(inv.workCode ?? '').toLowerCase().includes(q) ||
        String(inv.invoiceCode ?? '').toLowerCase().includes(q),
      )
    }
    return rows as unknown as InvoiceTableRow[]
  }, [tableRows, filters, sorts, searchQuery])

  const paginatedInvoices = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredInvoices.slice(start, start + PAGE_SIZE)
  }, [filteredInvoices, page])

  const allPageSelected = paginatedInvoices.length > 0 && paginatedInvoices.every(inv => selectedRows.has(inv.id))

  const handleSelectAll = useCallback(() => {
    const pageIds = paginatedInvoices.map(inv => inv.id)
    setSelectedRows((previous) => {
      const next = new Set(previous)
      const shouldClear = pageIds.length > 0 && pageIds.every(id => next.has(id))
      for (const id of pageIds) {
        if (shouldClear) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }, [paginatedInvoices])

  const handleSelectRow = useCallback((id: string) => {
    setSelectedRows((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  async function handleDownload(invoice: InvoiceRow) {
    if (!paymentsByInvoice[invoice.id] || paymentLoadError) {
      showToast('Data pembayaran belum tersedia. Refresh lalu coba lagi.', 'error')
      return
    }
    const target = invoiceImageRefs.current[invoice.id]
    if (!target) {
      showToast('Image element belum siap, coba lagi sebentar.', 'error')
      return
    }
    setDownloadingId(invoice.id)
    try {
      const { downloadInvoicePng } = await import('@/lib/downloadInvoicePng')
      const { sanitizeInvoiceCodeForFile } = await import('@/lib/invoiceCode')
      const baseName = sanitizeInvoiceCodeForFile(invoice.invoiceCode)
      await downloadInvoicePng(target, baseName)
      showToast(`Invoice ${invoice.invoiceCode} didownload`, 'success')
    } catch (error) {
      showToast(`Gagal download: ${error instanceof Error ? error.message : 'unknown'}`, 'error')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleBackfill = useCallback(async () => {
    setBackfilling(true)
    try {
      const createdCount = await backfillMissingInvoices()
      if (createdCount > 0) {
        showToast(`✅ ${createdCount} invoice baru dibuat!`, 'success')
      } else {
        showToast('⚠️ Tidak ada invoice baru yang dapat dibuat.', 'info')
      }
      await refresh()
    } catch (error) {
      showToast(`❌ Error: ${error instanceof Error ? error.message : JSON.stringify(error)}`, 'error')
    } finally {
      setBackfilling(false)
    }
  }, [showToast, refresh])

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
      <div className="px-8 pt-4 pb-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Invoicing</h1>
          <div className="flex items-center gap-2.5">
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

      <div className="flex-1 px-8 pt-5 pb-6 overflow-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari invoice..."
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <FilterButton fields={filterFields} value={filters} onChange={setFilters} />
          <SortButton fields={filterFields} value={sorts} onChange={setSorts} />
          <ColumnSettingsButton fields={filterFields} hidden={hiddenCols} onToggle={toggleCol} />
          <ExportButton onClick={() => showToast('Export feature coming soon!', 'info')} />
          <span className="text-[11px] text-slate-400 ml-auto">{filteredInvoices.length} invoice</span>
        </div>

        {paymentLoadError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            Total pembayaran tidak tersedia: {paymentLoadError}
          </div>
        )}

        <div className={T_WRAP}>
          <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
            <HiddenColgroup
              hidden={hiddenCols}
              cols={['__sel', 'monthYear', 'clientName', 'workCode', 'pcsLinked', 'unitPrice', 'invoiceCode', 'totalAmount', 'totalPayment', 'outstanding', 'paymentStatus', 'createdAt', 'action']}
            />
            <thead>
              <tr className={T_HEAD_ROW}>
                <th className={cn(T_TH, 'text-center w-[32px]')}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle"
                  />
                </th>
                <th className={cn(T_TH, 'text-left')}>Bulan</th>
                <th className={cn(T_TH, 'text-left')}>Client</th>
                <th className={cn(T_TH, 'text-left')}>Work Code</th>
                <th className={cn(T_TH, 'text-right')}>Total Qty</th>
                <th className={cn(T_TH, 'text-right')}>Nominal/PCS</th>
                <th className={cn(T_TH, 'text-left')}>Kode Invoice</th>
                <th className={cn(T_TH, 'text-right')}>Total</th>
                <th className={cn(T_TH, 'text-right')}>Total Dibayar</th>
                <th className={cn(T_TH, 'text-right')}>Sisa</th>
                <th className={cn(T_TH, 'text-center')}>Status</th>
                <th className={cn(T_TH, 'text-left')}>Created At</th>
                <th className={cn(T_TH, 'text-center')}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInvoices.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="py-10 text-center text-[13px] text-gray-400">
                    {invoices.length === 0 ? 'Belum ada invoice' : 'Tidak ada hasil yang cocok dengan filter'}
                  </td>
                </tr>
              )}
              {paginatedInvoices.map((invoice, index) => {
                const isDownloading = downloadingId === invoice.id
                const isSelected = selectedRows.has(invoice.id)
                return (
                  <tr key={invoice.id} className={rowClass(index, isSelected)}>
                    <td className={cn(T_TD, 'text-center')}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectRow(invoice.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle"
                      />
                    </td>
                    <td className={cn(T_TD, 'text-left text-gray-700')}>{invoice.monthYear}</td>
                    <td className={cn(T_TD, 'text-left text-gray-700')}>{invoice.clientName}</td>
                    <td className={cn(T_TD, 'text-left text-gray-700')}>{invoice.workCode}</td>
                    <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{invoice.pcsLinked}</td>
                    <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatCurrency(invoice.unitPrice)}</td>
                    <td className={cn(T_TD, 'text-left text-gray-700')}>{invoice.invoiceCode}</td>
                    <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatCurrency(invoice.totalAmount)}</td>
                    <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>
                      {invoice.totalPayment === null ? 'Tidak tersedia' : formatCurrency(invoice.totalPayment)}
                    </td>
                    <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>
                      {invoice.outstanding === null ? 'Tidak tersedia' : formatCurrency(invoice.outstanding)}
                    </td>
                    <td className={cn(T_TD, 'text-center whitespace-nowrap')}>
                      <span className={cn('inline-block px-2.5 py-1 rounded-md text-[11px] font-medium text-white', STATUS_BADGE[invoice.paymentStatus])}>
                        {STATUS_LABEL[invoice.paymentStatus]}
                      </span>
                    </td>
                    <td className={cn(T_TD, 'text-left text-gray-700')}>
                      {invoice.createdAt ? formatDate(invoice.createdAt) : '—'}
                    </td>
                    <td className={cn(T_TD, 'text-center')}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            setPaymentTarget(invoice)
                          }}
                          className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                          title="Input atau edit pembayaran"
                        >
                          <Wallet className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleDownload(invoice)
                          }}
                          className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
                          title={invoice.paymentStatus === 'Unavailable' ? 'Data pembayaran belum tersedia' : 'Download Invoice'}
                          disabled={isDownloading || invoice.paymentStatus === 'Unavailable'}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-500">
            Page {page} of {Math.ceil(filteredInvoices.length / PAGE_SIZE) || 1}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(current => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="h-8 px-3 text-[12px] font-medium border border-gray-200 rounded-lg hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:text-gray-500"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(current => current + 1)}
              disabled={page >= Math.ceil(filteredInvoices.length / PAGE_SIZE)}
              className="h-8 px-3 text-[12px] font-medium border border-gray-200 rounded-lg hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:text-gray-500"
            >
              Next
            </button>
          </div>
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
        onError={message => showToast(message, 'error')}
        onSuccess={message => showToast(message, 'success')}
      />
    </main>
  )
}

export default InvoicingPage
