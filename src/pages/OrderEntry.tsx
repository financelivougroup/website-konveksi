import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  OrderEntryDialog,
  type OrderDialogMode,
} from '@/components/OrderEntry/OrderEntryDialog';
import { useAuth } from '@/contexts/AuthContext';
import { orderEntryErrorMessage } from '@/lib/orderEntry';
import { cn } from '@/lib/utils';
import * as productionOrderSvc from '@/services/productionOrders';
import type { OrderEntryDetail, OrderEntryOverview, ProductionOrderLifecycle } from '@/types/pipeline';

const STATUS_OPTIONS: Array<{ value: 'all' | ProductionOrderLifecycle; label: string }> = [
  { value: 'all', label: 'Semua' },
  { value: 'PLANNING', label: 'Planning' },
  { value: 'PULLED', label: 'Pulled' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function rupiah(value: number): string {
  return value > 0 ? `Rp ${value.toLocaleString('id-ID')}` : '—';
}

function lifecycleBadge(status: ProductionOrderLifecycle) {
  const classes = {
    PLANNING: 'border-blue-200 bg-blue-50 text-blue-700',
    PULLED: 'border-amber-200 bg-amber-50 text-amber-700',
    CANCELLED: 'border-red-200 bg-red-50 text-red-700',
  }[status];
  return <Badge variant="outline" className={cn('h-5 px-2 text-[11px]', classes)}>{status}</Badge>;
}

interface DialogState {
  open: boolean;
  mode: OrderDialogMode;
  orderId: string | null;
}

export default function OrderEntry() {
  const { profile } = useAuth();
  const currentDisplayName = profile.displayName;
  const [orders, setOrders] = useState<OrderEntryOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | ProductionOrderLifecycle>('all');
  const [message, setMessage] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrderEntryOverview | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ open: false, mode: 'create', orderId: null });

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data, error } = await productionOrderSvc.fetchAll();
    if (error) setMessage(`Gagal memuat order: ${error.message}`);
    setOrders(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    void productionOrderSvc.fetchAll().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage(`Gagal memuat order: ${error.message}`);
      setOrders(data ?? []);
      setLoading(false);
    });

    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('id-ID');
    return orders.filter((order) => {
      if (filterStatus !== 'all' && order.status !== filterStatus) return false;
      if (!query) return true;
      return [
        order.productionCode,
        order.productId,
        order.product,
        order.brand,
        order.productionStatus,
      ].some((value) => value?.toLocaleLowerCase('id-ID').includes(query));
    });
  }, [filterStatus, orders, searchQuery]);

  function openDialog(mode: OrderDialogMode, orderId: string | null = null) {
    setDialog({ open: true, mode, orderId });
  }

  function handleSaved(detail: OrderEntryDetail) {
    setDialog({ open: false, mode: 'create', orderId: null });
    setMessage(`Order "${detail.productionCode}" berhasil disimpan.`);
    void fetchOrders();
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    const target = cancelTarget;
    const { error } = await productionOrderSvc.cancel(target.id, currentDisplayName);
    if (error) {
      setMessage(`Gagal membatalkan order: ${orderEntryErrorMessage(error)}`);
    } else {
      setMessage(`Order "${target.productionCode}" dibatalkan.`);
    }
    setCancelling(false);
    setCancelTarget(null);
    await fetchOrders();
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-auto bg-slate-50/40">
      <div className="p-5 sm:p-7">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-800">Order Entry</h1>
            <p className="mt-0.5 text-[12px] text-slate-500">Kelola kode produksi, variasi, dan harga dalam satu alur.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-8 px-3 text-[13px]" onClick={() => void fetchOrders()} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
            </Button>
            <Button className="h-8 px-3 text-[13px]" onClick={() => openDialog('create')}>
              <Plus className="h-3.5 w-3.5" /> Create New Order
            </Button>
          </div>
        </div>

        {message && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-[12px] text-blue-800">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 lg:flex-row lg:items-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cari kode produksi, buyer, article…"
                className="h-8 pl-9 text-[13px]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_OPTIONS.map((option) => {
                const count = option.value === 'all'
                  ? orders.length
                  : orders.filter((order) => order.status === option.value).length;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFilterStatus(option.value)}
                    className={cn(
                      'h-7 px-2.5 text-[12px]',
                      filterStatus === option.value && 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
                    )}
                  >
                    {option.label} <span className="text-[10px] opacity-70">{count}</span>
                  </Button>
                );
              })}
            </div>
            <span className="text-[12px] text-slate-400 lg:ml-auto">{filtered.length} order</span>
          </div>

          <div className="overflow-x-auto">
            <Table className="w-auto min-w-full whitespace-nowrap">
              <TableHeader className="bg-white">
                <TableRow className="border-b-2 border-[#D1D5DB]">
                  <TableHead className="h-9 px-4 text-[12px] font-semibold text-[#4B5563]">Kode produksi</TableHead>
                  <TableHead className="h-9 px-4 text-[12px] font-semibold text-[#4B5563]">Customer</TableHead>
                  <TableHead className="h-9 px-4 text-[12px] font-semibold text-[#4B5563]">Product</TableHead>
                  <TableHead className="h-9 px-4 text-right text-[12px] font-semibold text-[#4B5563]">Total qty</TableHead>
                  <TableHead className="h-9 px-4 text-right text-[12px] font-semibold text-[#4B5563]">Variasi</TableHead>
                  <TableHead className="h-9 px-4 text-right text-[12px] font-semibold text-[#4B5563]">Harga / pcs</TableHead>
                  <TableHead className="h-9 px-4 text-[12px] font-semibold text-[#4B5563]">Status order</TableHead>
                  <TableHead className="h-9 px-4 text-right text-[12px] font-semibold text-[#4B5563]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-[13px] text-slate-500">
                      <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> Memuat order…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <p className="text-[13px] text-slate-600">Belum ada order yang sesuai</p>
                      <p className="mt-1 text-[12px] text-slate-400">Buat order baru atau ubah pencarian dan filter.</p>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((order, index) => (
                  <TableRow
                    key={order.id}
                    onClick={() => openDialog(order.canEdit ? 'edit' : 'view', order.id)}
                    className={cn(
                      'cursor-pointer border-b border-[#E5E7EB] transition-colors hover:bg-[#F0F1F3]',
                      index % 2 === 1 && 'bg-[#F9FAFB]',
                    )}
                  >
                    <TableCell className="px-4 py-2 align-middle text-[13px] text-slate-700">{order.productionCode}</TableCell>
                    <TableCell className="px-4 py-2 align-middle text-[13px] text-slate-700">{order.brand}</TableCell>
                    <TableCell className="px-4 py-2 align-middle">
                      <p className="text-[13px] text-slate-700">{order.product}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{order.productId}</p>
                    </TableCell>
                    <TableCell className="px-4 py-2 text-right align-middle text-[13px] tabular-nums text-slate-700">{order.totalQuantity.toLocaleString('id-ID')}</TableCell>
                    <TableCell className="px-4 py-2 text-right align-middle text-[13px] tabular-nums text-slate-700">{order.variationCount}</TableCell>
                    <TableCell className="px-4 py-2 text-right align-middle text-[13px] tabular-nums text-slate-700">{rupiah(order.totalPerPiece)}</TableCell>
                    <TableCell className="px-4 py-2 align-middle">{lifecycleBadge(order.status)}</TableCell>
                    <TableCell className="px-4 py-2 align-middle">
                      <div className="flex items-center justify-end gap-0.5">
                        {order.canEdit && (
                          <span className="inline-flex items-center gap-1 text-[12px] text-blue-700">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </span>
                        )}
                        {order.status === 'PLANNING' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={(event) => { event.stopPropagation(); setCancelTarget(order); }}
                            aria-label={`Batalkan ${order.productionCode}`}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      <OrderEntryDialog
        open={dialog.open}
        mode={dialog.mode}
        orderId={dialog.orderId}
        actor={currentDisplayName}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        onSaved={handleSaved}
      />

      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(open) => !open && !cancelling && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan order?</AlertDialogTitle>
            <AlertDialogDescription>
              Order <strong>{cancelTarget?.productionCode}</strong> akan ditandai Cancelled. Tindakan ini hanya diizinkan sebelum order di-Pull dan sebelum ada progres produksi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Kembali</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleCancel(); }} disabled={cancelling} className="bg-red-600 hover:bg-red-700">
              {cancelling && <Loader2 className="animate-spin" />} Batalkan order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
