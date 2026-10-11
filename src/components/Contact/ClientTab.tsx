import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddClientDialog } from '@/components/Modals/AddClientDialog';
import { T_WRAP, softBadgeClass} from '@/lib/tableStyles';
import { DataTable } from '@/components/Table/DataTable';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton } from '@/components/Table/ColumnSettings';
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
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import { type ClientUsage } from '@/lib/clientCode';
import {
  fetchAll as fetchAllClient,
  remove as removeClient,
  fetchClientUsage,
  type RegisterClientRow,
} from '@/services/registerClient';

// Badge status soft (lihat `softBadgeClass` di '@/lib/tableStyles'). Nilai
// disimpan sebagai nama warna, bukan kelas penuh, supaya tidak ada kelas
// setengah jadi yang tertinggal saat polanya berubah.
const STATUS_BADGE: Record<string, string> = {
  'Aktif': 'emerald',
  'Non-Aktif': 'slate',
};

const EMPTY_CELL = <span className="text-gray-300">—</span>;

/**
 * Tab Client di halaman Contact.
 *
 * Isinya dipindah apa adanya dari `RegisterClientPage` — hanya `<main>` dan
 * `<h1>` yang naik ke shell `ContactPage`. Kunci `useColumnSettings` sengaja
 * tidak diubah supaya pengaturan kolom user tidak kembali ke awal.
 */
export function ClientTab() {
  const [items, setItems] = useState<RegisterClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RegisterClientRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<RegisterClientRow[]>([]);
  const [deleteUsage, setDeleteUsage] = useState<ClientUsage[]>([]);
  const [checkingUsage, setCheckingUsage] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchAllClient();
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetchAllClient().then(({ data }) => {
      if (cancelled) return;
      setItems(data ?? []);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((item: RegisterClientRow) => {
    setEditTarget(item);
    setModalOpen(true);
  }, []);

  /**
   * Dipanggil setelah AddClientDialog menyimpan.
   *
   * Dialog yang sama dipakai untuk tambah dan edit (sama dengan yang dipakai
   * Order Entry), jadi penyimpanan terjadi di dalam dialog dan tab ini hanya
   * perlu menyegarkan tabel.
   */
  const handleSaved = useCallback((client: RegisterClientRow) => {
    setModalOpen(false);
    setEditTarget(null);
    setMessage(`✅ Client "${client.namaClient}" berhasil disimpan!`);
    setTimeout(() => setMessage(null), 3500);
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    return items.filter((d) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return [d.namaClient, d.kodeClient, d.noHp, d.alamat, d.status].some((v) => String(v).toLowerCase().includes(q));
    });
  }, [items, search]);

  const CLIENT_FIELDS: FieldOption[] = [
    { key: 'namaClient', label: 'Nama Client' },
    { key: 'kodeClient', label: 'Kode Client' },
    { key: 'noHp', label: 'No HP' },
    { key: 'alamat', label: 'Alamat' },
    { key: 'status', label: 'Status' },
  ];
  const rows = useMemo(() => applySorts(applyFilters(filtered.map((r) => ({ ...r } as unknown as Record<string, unknown>)), filters), sorts) as unknown as RegisterClientRow[], [filtered, filters, sorts]);

  // Bentuk kolom untuk DataGrid (variant "plain"). Sel yang butuh badge atau
  // pemotongan teks memakai `render` supaya tabel bersama tidak perlu tahu.
  const clientColumns = useMemo(() => [
    { key: 'namaClient', label: 'Nama Client', width: '200px' },
    { key: 'kodeClient', label: 'Kode Client', width: '140px' },
    {
      key: 'noHp', label: 'No HP', width: '150px',
      render: (row: Record<string, unknown>) => (row.noHp as string) || EMPTY_CELL,
    },
    {
      key: 'alamat', label: 'Alamat', width: '280px',
      // Alamat bisa panjang; dipotong supaya tidak melebarkan tabel, teks
      // lengkapnya tetap terbaca lewat tooltip.
      render: (row: Record<string, unknown>) => {
        const alamat = row.alamat as string | null;
        if (!alamat) return EMPTY_CELL;
        return <span className="block truncate" title={alamat}>{alamat}</span>;
      },
    },
    {
      key: 'status', label: 'Status', width: '110px',
      render: (row: Record<string, unknown>) => (
        <span className={softBadgeClass(STATUS_BADGE[row.status as string])}>{String(row.status)}</span>
      ),
    },
  ], []);

  // Pengaturan kolom (tampil/sembunyi + freeze) dipanggil di sini, bukan di blok
  // state di atas, karena butuh urutan kolom yang baru lengkap setelah
  // `clientColumns` selesai disusun. Tidak ada `return` lebih awal di antaranya,
  // jadi urutan hook tetap stabil.
  const columnKeys = useMemo(() => clientColumns.map((c) => c.key), [clientColumns]);
  const {
    hidden: hiddenCols, toggle: toggleCol,
    frozen: frozenCols, toggleFreeze: toggleFreezeCol, toggleFreezeAll: toggleFreezeAllCols,
    headerFrozen, setHeaderFrozen,
  } = useColumnSettings('register-client', columnKeys);

  // Multi-select + toolbar (same pattern as Production Monitoring RAW DATA).
  // "Select all" is owned by the grid now — it toggles every visible row and
  // replays the difference through `handleToggleRow`.
  const handleToggleRow = (id: number) => setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleExport = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Nama Client', 'Kode Client', 'No HP', 'Alamat', 'Status'];
    const lines = filtered.map((r) => [r.namaClient, r.kodeClient, r.noHp, r.alamat, r.status].map(esc).join(','));
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n'); // BOM for Excel UTF-8
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `register-client-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const prepareBulkDelete = async () => {
    if (selectedRows.size === 0 || checkingUsage) return;

    const targets = items.filter((item) => selectedRows.has(item.id));
    if (targets.length === 0) return;

    setCheckingUsage(true);
    const { data: usage, error } = await fetchClientUsage(targets);
    setCheckingUsage(false);

    if (error || !usage) {
      setMessage(`❌ Pemakaian client gagal diperiksa: ${error?.message ?? 'Unknown error'}. Penghapusan dibatalkan.`);
      setTimeout(() => setMessage(null), 4000);
      return;
    }

    // Snapshot target + dampaknya. Dialog berikutnya tidak bergantung pada
    // checkbox yang mungkin berubah setelah pemeriksaan selesai.
    setDeleteTargets(targets);
    setDeleteUsage(usage);
    setDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (deleteTargets.length === 0 || deleting) return;

    setDeleting(true);
    const deletedIds = new Set<number>();
    const failedNames: string[] = [];

    for (const client of deleteTargets) {
      const { error } = await removeClient(client.id);
      if (error) failedNames.push(client.namaClient);
      else deletedIds.add(client.id);
    }

    setItems(prev => prev.filter(r => !deletedIds.has(r.id)));
    setSelectedRows(prev => {
      const next = new Set(prev);
      for (const id of deletedIds) next.delete(id);
      return next;
    });
    setDeleting(false);
    setDeleteDialogOpen(false);
    setDeleteTargets([]);
    setDeleteUsage([]);

    if (failedNames.length > 0) {
      setMessage(`⚠️ ${deletedIds.size} client dihapus; gagal menghapus: ${failedNames.join(', ')}.`);
    } else {
      setMessage(`✅ ${deletedIds.size} client berhasil dihapus!`);
    }
    setTimeout(() => setMessage(null), 4000);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Client...</p>
      </div>
    );
  }

  const totalActiveWorkOrders = deleteUsage.reduce((sum, usage) => sum + usage.activeWorkOrders, 0);
  const totalInvoices = deleteUsage.reduce((sum, usage) => sum + usage.invoices, 0);

  return (
    <>
      <div className="px-6 pt-3 pb-0">
        <div className="flex items-center justify-end gap-2.5 mb-4">
          <button onClick={refresh} className="h-8 px-3.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200 transition-all flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={openCreate} className="h-8 px-3.5 text-[12px] font-medium bg-primary text-white rounded-lg hover:bg-primary/90 hover:shadow-md hover:shadow-slate-300 transition-all flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" /> Tambah Client
          </button>
        </div>
        {message && <div className="mb-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[12px] text-blue-700">{message}</div>}
      </div>

      <div className="flex-1 px-6 pt-2 pb-5 overflow-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" placeholder="Cari client..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
          </div>
          <FilterButton fields={CLIENT_FIELDS} value={filters} onChange={setFilters} />
          <SortButton fields={CLIENT_FIELDS} value={sorts} onChange={setSorts} />
          <ColumnSettingsButton fields={CLIENT_FIELDS} hidden={hiddenCols} onToggle={toggleCol} frozen={frozenCols} onToggleFreeze={toggleFreezeCol} onToggleFreezeAll={toggleFreezeAllCols} headerFrozen={headerFrozen} onToggleHeaderFrozen={setHeaderFrozen} />
          <ExportButton onClick={handleExport} />
          {selectedRows.size > 0 && (
            <button onClick={prepareBulkDelete} disabled={checkingUsage} className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-60 disabled:cursor-wait transition-colors">
              <Trash2 className="w-3 h-3" /> {checkingUsage ? 'Memeriksa...' : `Delete (${selectedRows.size})`}
            </button>
          )}
          <span className="text-[11px] text-slate-400 ml-auto">{rows.length} client</span>
        </div>

        <div className={T_WRAP}>
          <DataTable
            variant="plain"
            columns={clientColumns}
            data={rows as unknown as Record<string, unknown>[]}
            selectedRows={selectedRows}
            onToggleRow={handleToggleRow}
            onRowClick={(row) => openEdit(row as unknown as RegisterClientRow)}
            hiddenColumns={hiddenCols}
            frozenColumns={frozenCols}
            headerFrozen={headerFrozen}
            emptyMessage={
              <div className="py-10 text-center text-[13px] text-gray-400">
                {filtered.length === 0 ? 'Belum ada client terdaftar' : 'Tidak ada hasil yang cocok dengan filter'}
              </div>
            }
          />
        </div>
      </div>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleting) return;
          setDeleteDialogOpen(open);
          if (!open) {
            setDeleteTargets([]);
            setDeleteUsage([]);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                totalActiveWorkOrders > 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600',
              )}>
                <TriangleAlert className="h-5 w-5" />
              </div>
              <div>
                <AlertDialogTitle>Hapus {deleteTargets.length} client?</AlertDialogTitle>
                <AlertDialogDescription className="mt-1">
                  Periksa dampak penghapusan berikut sebelum melanjutkan.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-slate-50 text-black">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">Client</th>
                  <th className="px-3 py-2 text-right font-bold">WO Belum Invoice</th>
                  <th className="px-3 py-2 text-right font-bold">Invoice Lama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deleteUsage.map((usage) => (
                  <tr key={usage.namaClient}>
                    <td className="px-3 py-2 text-slate-700">{usage.namaClient}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', usage.activeWorkOrders > 0 ? 'font-semibold text-red-600' : 'text-slate-500')}>
                      {usage.activeWorkOrders}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{usage.invoices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalActiveWorkOrders > 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] leading-relaxed text-red-700">
              <strong>{totalActiveWorkOrders} Work Order belum memiliki invoice.</strong> Setelah client dihapus, pembuatan invoice untuk WO tersebut akan terblokir sampai client dengan nama yang sama didaftarkan kembali.
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
              Tidak ada Work Order yang masih membutuhkan client ini untuk pembuatan invoice.
            </div>
          )}

          {totalInvoices > 0 && (
            <p className="text-[11px] leading-relaxed text-slate-500">
              {totalInvoices} invoice lama tetap aman karena Nama Client dan Kode Client tersimpan sebagai snapshot pada masing-masing invoice.
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmBulkDelete();
              }}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
            >
              {deleting ? 'Menghapus...' : 'Tetap Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Popup tambah/edit client — komponen yang SAMA dengan yang dipakai
          Order Entry, supaya keduanya tidak bisa menyimpang. `key` me-remount
          tiap dialog dibuka, jadi formnya selalu terisi dari awal (baik
          kosong maupun dari baris yang diedit). */}
      <AddClientDialog
        key={String(modalOpen)}
        open={modalOpen}
        initial={editTarget}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditTarget(null);
        }}
        onSaved={handleSaved}
      />
    </>
  );
}
