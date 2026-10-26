import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
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
import { T_WRAP } from '@/lib/tableStyles';
import { DataTable } from '@/components/Table/DataTable';
import {
  OrderEntryDialog,
  type OrderDialogMode,
} from '@/components/OrderEntry/OrderEntryDialog';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/data/pipelineData';
import { orderEntryErrorMessage } from '@/lib/orderEntry';
import { matchesPoJump } from '@/lib/poJump';
import { PoFilterBanner } from '@/components/Table/PoFilterBanner';
import { cn } from '@/lib/utils';
import * as productionOrderSvc from '@/services/productionOrders';
import * as workOrderSvc from '@/services/workOrders';
import type { CancelSkipped } from '@/services/productionOrders';
import { PermanentDeleteDialog } from '@/components/Modals/PermanentDeleteDialog';
import { canPermanentlyDelete } from '@/lib/permissions';
import type { OrderEntryDetail, OrderEntryOverview, ProductionOrderLifecycle } from '@/types/pipeline';
import type { PoJump } from '@/types';

const STATUS_OPTIONS: Array<{ value: 'all' | ProductionOrderLifecycle; label: string }> = [
  { value: 'all', label: 'Semua' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PULLED', label: 'Pulled' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function rupiah(value: number): string {
  return value > 0 ? `Rp ${value.toLocaleString('id-ID')}` : '—';
}

function lifecycleBadge(status: ProductionOrderLifecycle) {
  const classes = {
    DRAFT: 'border-blue-200 bg-blue-50 text-blue-700',
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

export default function OrderEntry({ poJump, onClearPoJump }: { poJump?: PoJump | null; onClearPoJump?: () => void } = {}) {
  const { profile } = useAuth();
  const currentDisplayName = profile.displayName;
  const [orders, setOrders] = useState<OrderEntryOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | ProductionOrderLifecycle>('all');
  const [message, setMessage] = useState<string | null>(null);
  /** Order yang menunggu konfirmasi pembatalan satu baris (aksi di kolom Actions). */
  const [cancelTarget, setCancelTarget] = useState<OrderEntryOverview | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ open: false, mode: 'create', orderId: null });

  /** Id order yang dicentang. Set supaya toggle O(1) dan tidak ada duplikat. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkCancel, setConfirmBulkCancel] = useState(false);
  const [bulkCancelling, setBulkCancelling] = useState(false);
  /** Pull massal berjalan — dipakai menonaktifkan tombolnya. */
  const [bulkPulling, setBulkPulling] = useState(false);
  const [forceTargets, setForceTargets] = useState<CancelSkipped[]>([]);
  /** Order yang akan dihapus permanen, diisi saat dialog konfirmasi dibuka. */
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mayDelete = canPermanentlyDelete(profile.role);
  /** Daftar order yang dilewati pembatalan massal, ditampilkan di bawah pesan. */
  const [skippedReport, setSkippedReport] = useState<string[]>([]);

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
    // Lompatan dari nomor PO di Register Harga. Di halaman ini kuncinya
    // `order.id` sendiri, dengan `productionCode` sebagai cadangan.
    const scoped = orders.filter((order) =>
      matchesPoJump(poJump, { orderId: order.id, code: order.productionCode }),
    );
    return scoped.filter((order) => {
      if (filterStatus !== 'all' && order.status !== filterStatus) return false;
      if (!query) return true;
      return [
        order.productionCode,
        order.clientProductionCode,
        order.productId,
        order.product,
        order.brand,
        order.productionStatus,
        order.createdBy,
      ].some((value) => value?.toLocaleLowerCase('id-ID').includes(query));
    });
  }, [filterStatus, orders, searchQuery, poJump]);

  // "Pilih semua" kini milik grid: ia men-toggle seluruh baris yang tampil dan
  // memutar selisihnya lewat `toggleOne`, jadi tidak ada checkbox header manual
  // dan tidak ada state all/some di sini.
  const selectionCount = selectedIds.size;

  function toggleOne(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Bentuk kolom untuk DataTable (variant "plain"). Sel yang butuh foto,
  // badge, atau markup bersarang memakai `render` supaya tabel bersama tidak
  // perlu tahu soal bentuk order.
  const orderColumns = useMemo(() => [
    { key: 'productionCode', label: 'Kode produksi', width: '150px' },
    { key: 'clientProductionCode', label: 'Kode produksi client', width: '170px' },
    {
      key: 'productPhotoUrl', label: 'Foto', width: '70px',
      render: (row: Record<string, unknown>) => {
        const url = row.productPhotoUrl as string | null;
        return url ? (
          <img
            src={url}
            alt={String(row.productionCode)}
            className="h-8 w-8 rounded border border-gray-200 object-cover"
          />
        ) : (
          <span className="text-gray-300">—</span>
        );
      },
    },
    {
      key: 'variationPhotoUrl', label: 'Foto variasi', width: '100px',
      render: (row: Record<string, unknown>) => {
        const url = row.variationPhotoUrl as string | null;
        return url ? (
          <img
            src={url}
            alt={`Variasi ${String(row.productionCode)}`}
            className="h-8 w-8 rounded border border-gray-200 object-cover"
          />
        ) : (
          <span className="text-gray-300">—</span>
        );
      },
    },
    { key: 'brand', label: 'Client', width: '140px' },
    {
      key: 'product', label: 'Product', width: '200px',
      render: (row: Record<string, unknown>) => (
        <p className="text-[13px] text-slate-700">{String(row.product)}</p>
      ),
    },
    {
      key: 'totalQuantity', label: 'Total qty', width: '100px', align: 'right' as const,
      render: (row: Record<string, unknown>) => (row.totalQuantity as number).toLocaleString('id-ID'),
    },
    {
      key: 'variationCount', label: 'Variasi', width: '90px', align: 'right' as const,
      render: (row: Record<string, unknown>) => String(row.variationCount),
    },
    {
      key: 'totalPerPiece', label: 'Harga / pcs', width: '120px', align: 'right' as const,
      render: (row: Record<string, unknown>) => rupiah(row.totalPerPiece as number),
    },
    {
      key: 'createdBy', label: 'Created By', width: '140px',
      render: (row: Record<string, unknown>) => (row.createdBy as string) || <span className="text-gray-300">—</span>,
    },
    {
      key: 'createdAt', label: 'Date Created', width: '130px',
      render: (row: Record<string, unknown>) => formatDate(row.createdAt as string),
    },
    {
      key: 'status', label: 'Status order', width: '120px',
      render: (row: Record<string, unknown>) => lifecycleBadge(row.status as ProductionOrderLifecycle),
    },
  ], []);

  function clearSelection() {
    setSelectedIds(new Set());
  }

  /**
   * Batalkan satu order (tombol di kolom Actions).
   *
   * Berbeda dari `handleBulkCancel` yang menyapu seluruh baris tercentang, ini
   * membatalkan tepat satu baris. Dipakai saat user sudah tahu order mana yang
   * mau dibatalkan dan tidak perlu mencentangnya dulu.
   *
   * Memakai `cancelMany` dengan satu id, bukan RPC terpisah: guard-nya
   * (hanya boleh sebelum Pull / sebelum ada progres) sama persis, dan
   * `skipped[].reason` memberi tahu user kenapa order ini ditolak — sesuatu yang
   * tidak dimiliki varian satu-order.
   */
  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    const target = cancelTarget;
    const { data, error } = await productionOrderSvc.cancelMany([target.id], currentDisplayName);

    if (error) {
      setMessage(`Gagal membatalkan order: ${orderEntryErrorMessage(error)}`);
    } else if ((data?.cancelled ?? 0) > 0) {
      setMessage(`Order "${target.productionCode}" dibatalkan.`);
    } else {
      const reason = data?.skipped[0]?.reason;
      setMessage(
        `Order "${target.productionCode}" tidak bisa dibatalkan${reason ? `: ${reason}` : '.'}`,
      );
    }

    setCancelling(false);
    setCancelTarget(null);
    await fetchOrders();
  }

  function openDialog(mode: OrderDialogMode, orderId: string | null = null) {
    setDialog({ open: true, mode, orderId });
  }

  function handleSaved(detail: OrderEntryDetail, photoWarning: string | null) {
    setDialog({ open: false, mode: 'create', orderId: null });
    setMessage(
      photoWarning
        ?? `Order "${detail.productionCode}" berhasil disimpan.`,
    );
    setSkippedReport([]);
    void fetchOrders();
  }

  /**
   * Pull order terpilih ke Production Order.
   *
   * Dipanggil satu per satu, bukan satu panggilan massal, karena
   * `pull_production_order_to_konveksi` bekerja per order dan tidak punya
   * varian batch. Konsekuensinya batch bisa berhasil sebagian — karena itu
   * tiap kegagalan dikumpulkan dan dilaporkan per order. Menjumlahkan saja
   * akan menyembunyikan order mana yang gagal, dan user tidak punya cara
   * mengetahui mana yang masih perlu di-pull.
   *
   * Order yang belum lengkap harganya sengaja TIDAK dikirim ke RPC: guard
   * `ORDER_PRICE_INCOMPLETE` di database hanya mengembalikan pesan error tanpa
   * memberi tahu komponen mana yang kurang, sedangkan kita sudah punya
   * `priceComplete` di daftar. Ditolak di sini dengan alasan yang bisa
   * ditindaklanjuti.
   */
  async function handleBulkPull() {
    const targets = orders.filter((order) => selectedIds.has(order.id));
    if (targets.length === 0) return;

    setBulkPulling(true);
    setSkippedReport([]);

    const pulled: string[] = [];
    const failed: string[] = [];
    let priceIncomplete = 0;

    for (const order of targets) {
      if (!order.priceComplete) {
        priceIncomplete += 1;
        continue;
      }
      const { error } = await workOrderSvc.pullFromProductionOrder(order.id, currentDisplayName);
      if (error) failed.push(`${order.productionCode} — ${error.message}`);
      else pulled.push(order.productionCode);
    }

    const parts: string[] = [];
    if (pulled.length > 0) parts.push(`${pulled.length} order di-pull ke Production Order`);
    if (priceIncomplete > 0) parts.push(`${priceIncomplete} dilewati karena harga belum lengkap`);
    if (failed.length > 0) parts.push(`${failed.length} gagal`);
    setMessage(parts.length > 0 ? `${parts.join(' · ')}.` : 'Tidak ada order yang diproses.');

    // Alasan per order ditampilkan terpisah supaya bisa ditindaklanjuti.
    setSkippedReport([
      ...failed,
      ...(priceIncomplete > 0
        ? [`${priceIncomplete} order belum punya register komponen harga lengkap — lengkapi lewat Edit, lalu pull lagi.`]
        : []),
    ]);

    setBulkPulling(false);
    clearSelection();
    await fetchOrders();
  }

  async function handleBulkCancel() {
    setBulkCancelling(true);
    setSkippedReport([]);

    const { data, error } = await productionOrderSvc.cancelMany(
      [...selectedIds],
      currentDisplayName,
    );

    if (error) {
      setMessage(`Gagal membatalkan order: ${orderEntryErrorMessage(error)}`);
    } else {
      const cancelled = data?.cancelled ?? 0;
      const skipped = data?.skipped ?? [];
      setMessage(
        cancelled === 0 && skipped.length === 0
          ? 'Tidak ada order yang diproses.'
          : `${cancelled} order dibatalkan.`,
      );
      setSkippedReport(
        skipped.map((item) => `${item.productionCode || item.id} — ${item.reason}`),
      );
      // Sisa yang dilewati inilah yang bisa dihapus permanen. Batch yang
      // seluruhnya berhasil tidak memunculkan opsi ini.
      setForceTargets(cancelled > 0 || skipped.length > 0 ? skipped : []);
    }

    setBulkCancelling(false);
    setConfirmBulkCancel(false);
    clearSelection();
    await fetchOrders();
  }

  function openPermanentDelete(ids: string[]) {
    if (!mayDelete || cancelling || bulkCancelling || bulkPulling || confirmDelete) return;
    setDeleteTargets([...ids]);
    setConfirmDelete(true);
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-auto bg-slate-50/40">
      <div className="px-6 py-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-800">Order Entry</h1>
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
          <div className="mb-3 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12px] text-blue-800">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0">
              <span>{message}</span>
              {skippedReport.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 border-t border-slate-200 pt-1.5 text-[11px] text-blue-700">
                  {skippedReport.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              {mayDelete && forceTargets.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
                  <span className="text-[11px] text-blue-700">
                    Order di atas tidak bisa dibatalkan biasa karena sudah masuk proses.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 px-2.5 text-[11px] text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => openPermanentDelete(forceTargets.map(item => item.id))}
                    disabled={cancelling || bulkCancelling || bulkPulling || confirmDelete}
                  >
                    <Trash2 className="h-3 w-3" /> Hapus permanen ({forceTargets.length})
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 lg:flex-row lg:items-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cari kode produksi, kode client, buyer, article…"
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
                      filterStatus === option.value && 'border-slate-300 bg-slate-100 text-blue-700 hover:bg-slate-200',
                    )}
                  >
                    {option.label} <span className="text-[10px] opacity-70">{count}</span>
                  </Button>
                );
              })}
            </div>
            <span className="text-[12px] text-slate-400 lg:ml-auto">{filtered.length} order</span>
          </div>

          {/* Bilah aksi massal bergaya Odoo: hanya muncul bila ada baris terpilih,
              menggantikan kolom Actions per baris. */}
          {selectionCount > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-2">
              <span className="text-[12px] font-medium text-blue-800">
                {selectionCount} order dipilih
              </span>
              {/* Pull ke Production Order. Muncul bersama aksi massal lain
                  begitu ada baris terpilih — tidak ada tombol Pull per baris. */}
              <Button
                type="button"
                className="h-7 px-2.5 text-[12px] bg-primary text-white hover:bg-primary/90"
                onClick={() => void handleBulkPull()}
                disabled={bulkPulling || bulkCancelling}
              >
                {bulkPulling
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <ArrowRight className="h-3.5 w-3.5" />}
                Pull ke Production Order ({selectionCount})
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-7 px-2.5 text-[12px] text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setConfirmBulkCancel(true)}
                disabled={bulkCancelling}
              >
                <Ban className="h-3.5 w-3.5" /> Batalkan order
              </Button>
              {mayDelete && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-7 px-2.5 text-[12px] border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                  onClick={() => openPermanentDelete([...selectedIds])}
                  disabled={cancelling || bulkCancelling || bulkPulling || confirmDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Hapus ({selectionCount})
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="h-7 px-2.5 text-[12px] text-slate-500"
                onClick={clearSelection}
                disabled={bulkCancelling}
              >
                <X className="h-3.5 w-3.5" /> Bersihkan pilihan
              </Button>
            </div>
          )}

          {poJump && (
            <PoFilterBanner
              code={poJump.code}
              orderId={poJump.orderId}
              count={filtered.length}
              onClear={() => onClearPoJump?.()}
            />
          )}

          <div className={T_WRAP}>
            {loading ? (
              // Status memuat tetap milik halaman: grid tidak punya varian
              // loading sendiri, dan teksnya sudah dipakai sejak sebelum migrasi.
              <div className="py-16 text-center text-[13px] text-gray-400">
                <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> Memuat order…
              </div>
            ) : (
              <DataTable
                variant="plain"
                columns={orderColumns}
                data={filtered as unknown as Record<string, unknown>[]}
                selectedRows={selectedIds}
                onToggleRow={toggleOne}
                onRowClick={(row) => openDialog(
                  (row as unknown as OrderEntryOverview).canEdit ? 'edit' : 'view',
                  (row as unknown as OrderEntryOverview).id,
                )}
                rowActions={(row) => {
                  const order = row as unknown as OrderEntryOverview;
                  // Selection tools preserve edit and draft cancellation access.
                  return (
                    <div className="flex items-center justify-end gap-0.5">
                      {order.canEdit && (
                        <Button type="button" variant="outline" size="sm" onClick={() => openDialog('edit', order.id)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      )}
                      {order.status === 'DRAFT' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          // `h-[19px] w-[19px]`, bukan `h-7 w-7`: tinggi baris tabel
                          // ditentukan isi sel tertinggi, dan tombol 28px mendorong
                          // barisnya ke 40px — sedangkan tabel acuan (Register
                          // Harga) 31.5px. 19px + padding sel 12px = 31.5px.
                          className="h-[19px] w-[19px] text-red-600 hover:bg-red-50 hover:text-red-700"
                          // Tanpa stopPropagation, klik tombol ini juga membuka
                          // dialog edit lewat onRowClick — perilaku yang sama
                          // dijaga tabel lama.
                          onClick={(event) => { event.stopPropagation(); setCancelTarget(order); }}
                          aria-label={`Batalkan ${order.productionCode}`}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                }}
                actionsLabel="Actions"
                emptyMessage={
                  <div className="py-10 text-center">
                    <p className="text-[13px] text-gray-400">
                      {orders.length === 0 ? 'Belum ada order terdaftar' : 'Tidak ada hasil yang cocok dengan filter'}
                    </p>
                    <p className="mt-1 text-[12px] text-slate-400">Buat order baru atau ubah pencarian dan filter.</p>
                  </div>
                }
              />
            )}
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
              Order <strong>{cancelTarget?.productionCode}</strong> akan ditandai Cancelled. Pembatalan hanya diizinkan selama order masih Draft — belum di-Pull dan belum ada progres produksi.
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

      <AlertDialog open={confirmBulkCancel} onOpenChange={(open) => !open && !bulkCancelling && setConfirmBulkCancel(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan {selectionCount} order?</AlertDialogTitle>
            <AlertDialogDescription>
              Order terpilih akan ditandai Cancelled. Pembatalan hanya diizinkan sebelum order di-Pull dan sebelum ada progres produksi; sisanya akan dilewati dan dilaporkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkCancelling}>Kembali</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleBulkCancel(); }} disabled={bulkCancelling} className="bg-red-600 hover:bg-red-700">
              {bulkCancelling && <Loader2 className="animate-spin" />} Batalkan order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {mayDelete && <PermanentDeleteDialog
        open={confirmDelete}
        onOpenChange={(open) => { setConfirmDelete(open); if (!open) setDeleteTargets([]); }}
        module="production_orders"
        ids={deleteTargets}
        onDeleted={(result) => {
          setMessage(`${result.counts.production_orders ?? result.deletedIds.length} order dihapus permanen.${result.cleanupPending ? ' Lampiran masih menunggu pembersihan.' : ''}`);
          setForceTargets([]);
          setSkippedReport([]);
          clearSelection();
          void fetchOrders();
        }}
      />}
    </main>
  );
}
