import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Zap, Download, Wallet } from 'lucide-react';
import { PaymentModal } from '@/components/Modals/PaymentModal';
import { InvoiceImage } from '@/components/Invoice/InvoiceImage';
import { supabase } from '@/lib/supabase';
import { fetchAllInvoices } from '@/services/invoices';
import { fetchPaymentsByInvoiceId } from '@/services/invoicePayments';
import { backfillMissingInvoices } from '@/services/autoInvoice';
import { downloadInvoicePng } from '@/lib/downloadInvoicePng';
import { sanitizeInvoiceCodeForFile } from '@/lib/invoiceCode';
import { computeOutstanding } from '@/lib/invoiceCompute';
import { useToast } from '@/hooks/useToast';
import { cn, formatCurrency as fmtCur } from '@/lib/utils';
import type { InvoicePaymentRow, InvoiceRow } from '@/types/pipeline';

const PAGE_SIZE = 10;

interface PaymentBundle {
  payments: InvoicePaymentRow[];
  totalPayment: number;
}

export function InvoicingPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Record<string, PaymentBundle>>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [paymentTarget, setPaymentTarget] = useState<InvoiceRow | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const { showToast } = useToast();
  const invoiceImageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const refresh = useCallback(async () => {
    const { data, error } = await fetchAllInvoices();
    if (error) {
      showToast(`Gagal load invoice: ${error.message}`, 'error');
      return;
    }
    const list = data ?? [];
    setInvoices(list);
    setPage(1);

    const bundles: Record<string, PaymentBundle> = {};
    for (const inv of list) {
      const { data: pays } = await fetchPaymentsByInvoiceId(inv.id);
      const payments = pays ?? [];
      const totalPayment = payments.reduce((s, p) => s + p.amount, 0);
      bundles[inv.id] = { payments, totalPayment };
    }
    setPaymentsByInvoice(bundles);
  }, [showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!search) return invoices;
    const q = search.toLowerCase();
    return invoices.filter((inv) =>
      Object.values(inv).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [invoices, search]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  async function handleDownload(invoice: InvoiceRow) {
    const target = invoiceImageRefs.current[invoice.id];
    if (!target) {
      showToast('Image element belum siap, coba lagi sebentar.', 'error');
      return;
    }
    setDownloadingId(invoice.id);
    try {
      const baseName = sanitizeInvoiceCodeForFile(invoice.invoiceCode);
      await downloadInvoicePng(target, baseName);
      showToast(`Invoice ${invoice.invoiceCode} didownload`, 'success');
    } catch (e) {
      showToast(`Gagal download: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <main className="flex-1 flex flex-col min-w-0">
      {/* Top Bar tanpa Add New */}
      <header className="h-[52px] bg-white/80 backdrop-blur-sm border-b border-gray-200/60 flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[15px] font-semibold text-slate-800">Invoicing</h1>
          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Auto-generated</span>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors border border-gray-200"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
        <button
          onClick={async () => {
            setBackfilling(true);
            const logs: string[] = [];

            try {
              // Step 1: cari WO finished
              const { data: woRows, error: woErr } = await supabase
                .from('work_orders')
                .select('id, prod_status, source_order_id, work_code')
                .in('prod_status', ['FINISHED', 'INVOICED']);
              logs.push(`WO finished: ${woRows?.length ?? 0} rows, err=${String(woErr)}`);

              if (!woRows || woRows.length === 0) {
                showToast('❌ Ga ada WO FINISHED. Cek prod_status WO.', 'error');
                console.log(logs.join('\n'));
                setBackfilling(false);
                return;
              }

              // Step 2: cek yang udah punya invoice
              const woIds = woRows.map((w: any) => w.id);
              const { data: invData } = await supabase
                .from('invoices')
                .select('work_order_id')
                .in('work_order_id', woIds);
              const existingIds = new Set((invData as any[] | null)?.map((r: any) => r.work_order_id) ?? []);
              const missing = woRows.filter((w: any) => !existingIds.has(w.id));
              logs.push(`Missing: ${missing.length} (${missing.map((m: any) => m.work_code).join(', ')})`);

              if (missing.length === 0) {
                showToast('⚠️ Semua WO sudah punya invoice.', 'info');
                console.log(logs.join('\n'));
                setBackfilling(false);
                return;
              }

              // Step 3: attempt generate
              const n = await backfillMissingInvoices();
              logs.push(`backfill result: ${n}`);

              if (n > 0) {
                showToast(`✅ ${n} invoice baru dibuat!`, 'success');
              } else {
                showToast(`⚠️ Gagal. ${missing.length} WO missing, tapi backfill return 0. Cek console.`, 'error');
              }
              console.log(logs.join('\n'));
              refresh();
            } catch (e: any) {
              logs.push(`EXCEPTION: ${e?.message || e}`);
              console.log(logs.join('\n'));
              showToast(`❌ Error: ${e?.message || JSON.stringify(e)}`, 'error');
            } finally {
              setBackfilling(false);
            }
          }}
          disabled={backfilling}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors border border-amber-200 disabled:opacity-50"
        >
          <Zap className="w-3.5 h-3.5" />
          Generate Missing Invoices
        </button>
      </header>

      <div className="px-6 py-3 flex items-center justify-between gap-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search invoice..."
          className="h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 w-72"
        />
        <span className="text-[10px] text-slate-400 italic">Invoice dibuat otomatis saat WO Finished + Register PO tersedia</span>
      </div>

      {/* ===== TABLE KUSTOM ===== */}
      <div className="flex-1 overflow-auto px-6 pb-4">
        <table className="w-full text-[12px] border-separate border-spacing-0">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider bg-white sticky top-0 z-10 text-slate-400">Bulan</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider bg-white sticky top-0 z-10 text-slate-400">Client</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider bg-white sticky top-0 z-10 text-slate-400">Work Code</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider bg-white sticky top-0 z-10 text-slate-400">Total Qty</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider bg-white sticky top-0 z-10 text-slate-400">Nominal/PCS</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider bg-white sticky top-0 z-10 text-slate-400">Kode Invoice</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider bg-white sticky top-0 z-10 text-slate-400">Total</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider bg-white sticky top-0 z-10 text-slate-400">Status</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider bg-white sticky top-0 z-10 text-slate-400 w-[160px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr><td colSpan={8} className="py-12 text-center text-slate-400 text-[13px]">Belum ada invoice</td></tr>
            )}
            {paginated.map((inv) => {
              const bundle = paymentsByInvoice[inv.id];
              const totPayment = bundle?.totalPayment ?? 0;
              const outstanding = computeOutstanding(inv.totalAmount, totPayment);
              const isDownloading = downloadingId === inv.id;
              return (
                <tr key={inv.id} className="border-b border-gray-100 hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-1.5 text-slate-700">{inv.monthYear}</td>
                  <td className="px-3 py-1.5 text-slate-700">{inv.clientName}</td>
                  <td className="px-3 py-1.5 max-w-[180px] truncate font-mono text-[11px] text-slate-500" title={inv.workCode}>{inv.workCode}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{inv.pcsLinked}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtCur(inv.unitPrice)}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">{inv.invoiceCode}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-slate-800">{fmtCur(inv.totalAmount)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={cn(
                      'inline-flex px-2 py-[3px] rounded-full text-[10px] font-semibold',
                      outstanding === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    )}>
                      {outstanding === 0 ? 'Paid' : 'Outstanding'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setPaymentTarget(inv)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-sky-50 hover:text-sky-600 transition-colors"
                        title="Payment"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDownload(inv)}
                        disabled={isDownloading}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
                        title="Download Invoice"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hidden invoice images for PNG download */}
      {invoices.map((inv) => {
        const bundle = paymentsByInvoice[inv.id];
        return (
          <div
            key={inv.id}
            ref={(el) => {
              invoiceImageRefs.current[inv.id] = el;
            }}
          >
            <InvoiceImage
              invoice={inv}
              payments={bundle?.payments ?? []}
              totalPayment={bundle?.totalPayment ?? 0}
              outstanding={computeOutstanding(inv.totalAmount, bundle?.totalPayment ?? 0)}
            />
          </div>
        );
      })}

      <PaymentModal
        open={paymentTarget !== null}
        invoice={paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onSaved={() => { setPaymentTarget(null); refresh(); }}
        onError={(m) => showToast(m, 'error')}
        onSuccess={(m) => showToast(m, 'success')}
      />
    </main>
  );
}

export default InvoicingPage;