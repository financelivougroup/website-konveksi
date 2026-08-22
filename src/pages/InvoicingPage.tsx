import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { fetchAllInvoices } from '@/services/invoices'
import { fetchPaymentsByInvoiceId } from '@/services/invoicePayments'
import { backfillMissingInvoices } from '@/services/autoInvoice'
import { computeOutstanding } from '@/lib/invoiceCompute'
import { useToast } from '@/hooks/useToast'
import { ExportButton } from '@/components/Table/TableTools'
import { ColumnSettingsButton, HiddenColgroup } from '@/components/Table/ColumnSettings'
import { useColumnSettings } from '@/lib/columnSettings'
import type { FieldOption } from '@/lib/tableQuery'
import { T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, rowClass } from '@/lib/tableStyles'
import type { InvoiceRow, InvoicePaymentRow } from '@/types/pipeline'

interface PaymentBundle {
  payments: InvoicePaymentRow[]
  totalPayment: number
}

const PAGE_SIZE = 10

// Status badge - solid pill, white text (matches Production Monitoring)
const STATUS_BADGE = {
  Paid: 'bg-green-600 hover:bg-green-700',
  Outstanding: 'bg-amber-500 hover:bg-amber-600',
}

export function InvoicingPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Record<string, PaymentBundle>>({})
  const [page, setPage] = useState(1)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const invoiceImageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const { showToast } = useToast()

  // Column settings for invoice table
  const { hidden: hiddenCols, toggle: toggleCol } = useColumnSettings('invoicing')

  // Field options for filter/sort UI
  const filterFields: FieldOption[] = [
    { key: 'monthYear', label: 'Bulan' },
    { key: 'clientName', label: 'Client' },
    { key: 'invoiceCode', label: 'Kode Invoice' },
    { key: 'financeValidation', label: 'Status' },
  ]

  const refresh = useCallback(async () => {
    const { data, error } = await fetchAllInvoices()
    if (error) {
      showToast(`Gagal load invoice: ${error.message}`, 'error')
      return
    }
    const list = data ?? []
    setInvoices(list)
    setPage(1)

    const bundles: Record<string, PaymentBundle> = {}
    for (const inv of list) {
      const { data: pays } = await fetchPaymentsByInvoiceId(inv.id)
      const payments = pays ?? []
      const totalPayment = payments.reduce((s, p) => s + p.amount, 0)
      bundles[inv.id] = { payments, totalPayment }
    }
    setPaymentsByInvoice(bundles)
  }, [showToast])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Apply column settings to headers
  const columns = [
    { key: 'status', label: '', width: '32px' },
    { key: 'monthYear', label: 'Bulan', width: '100px' },
    { key: 'clientName', label: 'Client', width: '150px' },
    { key: 'workCode', label: 'Work Code', width: '120px' },
    { key: 'pcsLinked', label: 'Total Qty', align: 'right' as const, width: '90px' },
    { key: 'unitPrice', label: 'Nominal/PCS', align: 'right' as const, width: '110px' },
    { key: 'invoiceCode', label: 'Kode Invoice', width: '140px' },
    { key: 'totalAmount', label: 'Total', align: 'right' as const, width: '120px' },
    { key: 'financeValidation', label: 'Status', width: '120px' },
    { key: 'createdAt', label: 'Created At', width: '130px' },
    { key: 'actions', label: 'Action', width: '160px', align: 'center' as const },
  ]

  // Filter invoices by search query
  const filteredInvoices = useMemo(() => {
    if (!searchQuery) return invoices
    const q = searchQuery.toLowerCase()
    return invoices.filter(inv =>
      inv.monthYear.toLowerCase().includes(q) ||
      inv.clientName.toLowerCase().includes(q) ||
      inv.workCode.toLowerCase().includes(q) ||
      inv.invoiceCode.toLowerCase().includes(q),
    )
  }, [invoices, searchQuery])

  const paginatedInvoices = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredInvoices.slice(start, start + PAGE_SIZE)
  }, [filteredInvoices, page])

  const handleSelectAll = useCallback(() => {
    if (selectedRows.size === paginatedInvoices.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(paginatedInvoices.map(inv => inv.id)))
    }
  }, [selectedRows.size, paginatedInvoices])

  const handleSelectRow = useCallback((id: string) => {
    const newSet = new Set(selectedRows)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedRows(newSet)
  }, [selectedRows])

  async function handleDownload(invoice: InvoiceRow) {
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
    } catch (e) {
      showToast(`Gagal download: ${e instanceof Error ? e.message : 'unknown'}`, 'error')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleBackfill = useCallback(async () => {
    setBackfilling(true)
    try {
      const { data: woRows } = await supabase
        .from('work_orders')
        .select('id, prod_status, source_order_id, work_code')
        .in('prod_status', ['FINISHED', 'INVOICED'])

      if (!woRows || woRows.length === 0) {
        showToast('❌ Ga ada WO FINISHED. Cek prod_status WO.', 'error')
        setBackfilling(false)
        return
      }

      const woIds = woRows.map((w: any) => w.id)
      const { data: invData } = await supabase
        .from('invoices')
        .select('work_order_id')
        .in('work_order_id', woIds)
      const existingIds = new Set((invData as any[] | null)?.map((r: any) => r.work_order_id) ?? [])
      const missing = woRows.filter((w: any) => !existingIds.has(w.id))

      if (missing.length === 0) {
        showToast('⚠️ Semua WO sudah punya invoice.', 'info')
        setBackfilling(false)
        return
      }

      const n = await backfillMissingInvoices()

      if (n > 0) {
        showToast(`✅ ${n} invoice baru dibuat!`, 'success')
      } else {
        showToast(`⚠️ Gagal. ${missing.length} WO missing, tapi backfill return 0.`, 'error')
      }
      refresh()
    } catch (e: any) {
      showToast(`❌ Error: ${e?.message || JSON.stringify(e)}`, 'error')
    } finally {
      setBackfilling(false)
    }
  }, [showToast, refresh])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-auto">
      {/* Search Bar */}
      <div className="relative max-w-xs mb-4">
        <input
          type="text"
          placeholder="Search invoice..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg"
        />
      </div>

      {/* Toolbar section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ColumnSettingsButton fields={filterFields} hidden={hiddenCols} onToggle={toggleCol} />
            <ExportButton onClick={() => showToast('Export feature coming soon!', 'info')} />
          </div>
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="h-8 px-3.5 text-[12px] font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 hover:shadow-md hover:shadow-amber-200 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" /> Generate Missing Invoices
          </button>
        </div>
      </div>

      {/* ===== TABLE MATCHING PRODUCTION MONITORING RAW DATA ===== */}
      <div className={T_WRAP}>
        <table className={T_TABLE}>
          <HiddenColgroup
            hidden={hiddenCols}
            cols={['status', 'createdAt', 'clientName', 'action', 'pcsLinked', 'monthYear', 'invoiceCode', 'creditDueDate', 'totalAmount', 'workCode', 'unitPrice']}
          />
          <thead>
            <tr className={T_HEAD_ROW}>
              <th className={cn(T_TH, 'text-center w-[32px]')}>
                <input
                  type="checkbox"
                  checked={paginatedInvoices.length > 0 && selectedRows.size === paginatedInvoices.length}
                  onChange={handleSelectAll}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </th>
              <th className={cn(T_TH, 'text-left min-w-[100px]')}>Bulan</th>
              <th className={cn(T_TH, 'text-left min-w-[150px]')}>Client</th>
              <th className={cn(T_TH, 'text-left min-w-[120px]')}>Work Code</th>
              <th className={cn(T_TH, 'text-right min-w-[90px]')}>Total Qty</th>
              <th className={cn(T_TH, 'text-right min-w-[110px]')}>Nominal/PCS</th>
              <th className={cn(T_TH, 'text-left min-w-[140px]')}>Kode Invoice</th>
              <th className={cn(T_TH, 'text-right min-w-[120px]')}>Total</th>
              <th className={cn(T_TH, 'text-center min-w-[120px]')}>Status</th>
              <th className={cn(T_TH, 'text-left min-w-[130px]')}>Created At</th>
              <th className={cn(T_TH, 'text-center min-w-[160px]')}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedInvoices.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-10 text-center text-[13px] text-gray-400">
                  Belum ada invoice
                </td>
              </tr>
            )}
            {paginatedInvoices.map((inv, i) => {
              const bundle = paymentsByInvoice[inv.id]
              const totPayment = bundle?.totalPayment ?? 0
              const outstanding = computeOutstanding(inv.totalAmount, totPayment)
              const isDownloading = downloadingId === inv.id
              const status = outstanding === 0 ? 'Paid' : 'Outstanding'
              const statusBadgeClass = STATUS_BADGE[status as keyof typeof STATUS_BADGE]
              const isSelected = selectedRows.has(inv.id)

              return (
                <tr key={inv.id} className={rowClass(i, isSelected)}>
                  <td className={cn(T_TD, 'text-center')}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectRow(inv.id)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className={cn(T_TD, 'whitespace-nowrap text-left text-gray-700')}>{inv.monthYear}</td>
                  <td className={cn(T_TD, 'whitespace-nowrap text-left text-gray-700')}>{inv.clientName}</td>
                  <td className={cn(T_TD, 'whitespace-nowrap text-left text-gray-700 font-mono text-sm')}>{inv.workCode}</td>
                  <td className={cn(T_TD, 'whitespace-nowrap text-right tabular-nums text-gray-700')}>{inv.pcsLinked}</td>
                  <td className={cn(T_TD, 'whitespace-nowrap text-right tabular-nums text-gray-700')}>{formatCurrency(inv.unitPrice)}</td>
                  <td className={cn(T_TD, 'whitespace-nowrap text-left text-gray-700 font-mono text-sm')}>{inv.invoiceCode}</td>
                  <td className={cn(T_TD, 'whitespace-nowrap text-right tabular-nums text-gray-700')}>{formatCurrency(inv.totalAmount)}</td>
                  <td className={cn(T_TD, 'text-center whitespace-nowrap')}>
                    <span className={cn('inline-block px-2.5 py-1 rounded-md text-[11px] font-medium text-white', statusBadgeClass)}>
                      {status}
                    </span>
                  </td>
                  <td className={cn(T_TD, 'whitespace-nowrap text-left text-gray-700')}>{formatDate(inv.createdAt || new Date().toISOString())}</td>
                  <td className={cn(T_TD, 'text-center')}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          showToast('Payment detail coming soon!', 'info')
                        }}
                        className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                        title="Payment"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDownload(inv)
                        }}
                        className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
                        title="Download Invoice"
                        disabled={isDownloading}
                      >
                        <Zap className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between mt-4 px-4">
        <div className="text-sm text-gray-500">
          Page {page} of {Math.ceil(filteredInvoices.length / PAGE_SIZE) || 1}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="h-8 px-3 text-[12px] font-medium border border-gray-200 rounded-lg hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:text-gray-500"
          >
            Previous
          </button>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= Math.ceil(filteredInvoices.length / PAGE_SIZE)}
            className="h-8 px-3 text-[12px] font-medium border border-gray-200 rounded-lg hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:text-gray-500"
          >
            Next
          </button>
        </div>
      </div>

    </div>
  )
}

export default InvoicingPage
