import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddVendorDialog } from '@/components/Modals/AddVendorDialog';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton } from '@/components/Table/ColumnSettings';
import { DataTable } from '@/components/Table/DataTable';
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
import { T_WRAP, softBadgeClass } from '@/lib/tableStyles';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchAll,
  fetchUsageMany,
  remove,
  type VendorRow,
  type VendorUsageDetail,
} from '@/services/vendors';

// Badge status soft (lihat `softBadgeClass` di '@/lib/tableStyles'). Nilai
// disimpan sebagai nama warna, bukan kelas penuh.
const STATUS_BADGE: Record<string, string> = {
  Aktif: 'emerald',
  'Non-Aktif': 'slate',
};

const EMPTY_CELL = <span className="text-gray-300">—</span>;

/** Escape satu sel CSV, sama seperti halaman lain di repo. */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Tab Vendor di halaman Contact.
 *
 * Isinya dipindah apa adanya dari `VendorPage` — hanya `<main>` dan `<h1>` yang
 * naik ke shell `ContactPage`. Kunci `useColumnSettings` sengaja tidak diubah
 * supaya pengaturan kolom user tidak kembali ke awal.
 *
 * Tabelnya memakai `DataTable` bersama (variant "plain") seperti ClientTab dan
 * KaryawanTab: checkbox paling kiri, kolom "#" tidak lagi dipakai, dan lebar
 * kolom mengisi penuh halamannya.
 */
export function VendorTab() {
  const { profile } = useAuth();
  // Hanya owner dan finance yang boleh mengubah master vendor; role lain
  // tetap bisa melihat. Mengikuti pola yang sudah dipakai InvoicingPage.
  const canManage = profile.role === 'owner' || profile.role === 'finance';

  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VendorRow | null>(null);

  // Penghapusan massal lewat checkbox: periksa pemakaian dulu, baru konfirmasi.
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<VendorRow[]>([]);
  const [deleteUsage, setDeleteUsage] = useState<VendorUsageDetail[]>([]);
  const [checkingUsage, setCheckingUsage] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Pemuatan awal memakai `.then()`, bukan `await` — `await` membuat setState
  // berjalan sinkron di dalam badan effect, yang ditolak
  // `react-hooks/set-state-in-effect` (pola RegisterClientPage).
  useEffect(() => {
    let cancelled = false;

    void fetchAll().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setErrorMessage(`Gagal memuat vendor: ${error.message}`);
      } else {
        setVendors(data ?? []);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchAll();
    if (error) {
      setErrorMessage(`Gagal memuat vendor: ${error.message}`);
    } else {
      setVendors(data ?? []);
    }
    setLoading(false);
  }, []);

  const filterFields: FieldOption[] = [
    { key: 'nama', label: 'Nama Vendor' },
    { key: 'kontak', label: 'Kontak' },
    { key: 'catatan', label: 'Catatan' },
    { key: 'status', label: 'Status' },
  ];

  const visibleRows = useMemo(() => {
    let result = applyFilters(vendors as unknown as Record<string, unknown>[], filters);
    result = applySorts(result, sorts);
    const query = search.trim().toLocaleLowerCase('id-ID');
    if (query) {
      result = result.filter((row) =>
        [row.nama, row.kontak, row.catatan, row.status]
          .some((value) => String(value ?? '').toLocaleLowerCase('id-ID').includes(query)),
      );
    }
    return result as unknown as VendorRow[];
  }, [vendors, filters, sorts, search]);

  // Bentuk kolom untuk DataTable (variant "plain"). Sel yang butuh badge atau
  // pemotongan teks memakai `render` supaya tabel bersama tidak perlu tahu.
  const columns = useMemo(() => [
    { key: 'nama', label: 'Nama Vendor', width: '220px' },
    {
      key: 'kontak', label: 'Kontak', width: '180px',
      render: (row: Record<string, unknown>) => (row.kontak as string) || EMPTY_CELL,
    },
    {
      key: 'catatan', label: 'Catatan', width: '220px',
      // Catatan bisa panjang; dipotong supaya tidak melebarkan tabel, teks
      // lengkapnya tetap terbaca lewat tooltip.
      render: (row: Record<string, unknown>) => {
        const catatan = row.catatan as string | null;
        if (!catatan) return EMPTY_CELL;
        return <span className="block truncate" title={catatan}>{catatan}</span>;
      },
    },
    {
      key: 'status', label: 'Status', align: 'center' as const, width: '110px',
      render: (row: Record<string, unknown>) => (
        <span className={softBadgeClass(STATUS_BADGE[row.status as string])}>{String(row.status)}</span>
      ),
    },
  ], []);

  // Pengaturan kolom (tampil/sembunyi + freeze) dipanggil di sini, bukan di blok
  // state di atas, karena butuh urutan kolom yang baru lengkap setelah `columns`
  // selesai disusun. Tidak ada `return` lebih awal di antaranya, jadi urutan
  // hook tetap stabil.
  const columnKeys = useMemo(() => columns.map((c) => c.key), [columns]);
  const {
    hidden: hiddenCols, toggle: toggleCol,
    frozen: frozenCols, toggleFreeze: toggleFreezeCol, toggleFreezeAll: toggleFreezeAllCols,
    headerFrozen, setHeaderFrozen,
  } = useColumnSettings('vendor', columnKeys);

  const handleExport = useCallback(() => {
    const header = ['Nama Vendor', 'Kontak', 'Catatan', 'Status'];
    const lines = visibleRows.map((row) =>
      [row.nama, row.kontak ?? '', row.catatan ?? '', row.status].map(csvCell).join(','),
    );
    const csv = [header.join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendor-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [visibleRows]);

  // Multi-select: "pilih semua" milik grid, yang memutar selisihnya lewat
  // `handleToggleRow` — pola yang sama dengan ClientTab/KaryawanTab.
  const handleToggleRow = (id: number) => setSelectedRows(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /**
   * Periksa dulu mana yang boleh dihapus, baru tanya.
   *
   * Vendor tidak bisa dihapus selama masih dipakai catatan biaya
   * (`expense_entries.vendor_id` adalah FK `ON DELETE RESTRICT`). Memeriksanya
   * lebih dulu membuat user tahu alasannya sebelum menekan Hapus, bukan
   * setelah ditolak database.
   */
  const prepareBulkDelete = async () => {
    if (selectedRows.size === 0 || checkingUsage) return;

    const targets = vendors.filter((vendor) => selectedRows.has(vendor.id));
    if (targets.length === 0) return;

    setCheckingUsage(true);
    setMessage(null);
    setErrorMessage(null);
    const { data: usage, error } = await fetchUsageMany(targets.map((vendor) => vendor.id));
    setCheckingUsage(false);

    if (error || !usage) {
      setErrorMessage(`Pemakaian vendor gagal diperiksa: ${error?.message ?? 'Unknown error'}. Penghapusan dibatalkan.`);
      return;
    }

    setDeleteTargets(targets);
    setDeleteUsage(usage);
    setDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (deleteTargets.length === 0 || deleting) return;

    const blocked = new Set(deleteUsage.filter((u) => u.entryCount > 0).map((u) => u.id));
    const deletable = deleteTargets.filter((vendor) => !blocked.has(vendor.id));

    setDeleting(true);
    const deletedIds = new Set<number>();
    const failedNames: string[] = [];

    for (const vendor of deletable) {
      const { error } = await remove(vendor.id);
      if (error) failedNames.push(vendor.nama);
      else deletedIds.add(vendor.id);
    }

    setVendors(prev => prev.filter((vendor) => !deletedIds.has(vendor.id)));
    setSelectedRows(prev => {
      const next = new Set(prev);
      for (const id of deletedIds) next.delete(id);
      return next;
    });
    setDeleting(false);
    setDeleteDialogOpen(false);
    setDeleteTargets([]);
    setDeleteUsage([]);

    const skipped = blocked.size;
    if (failedNames.length > 0) {
      setErrorMessage(`${deletedIds.size} vendor dihapus; gagal menghapus: ${failedNames.join(', ')}.`);
    } else if (deletedIds.size === 0) {
      setMessage(null);
      setErrorMessage('Tidak ada vendor yang bisa dihapus — semuanya masih dipakai catatan biaya. Nonaktifkan saja supaya riwayat lama tetap utuh.');
    } else {
      setMessage(
        skipped > 0
          ? `${deletedIds.size} vendor dihapus. ${skipped} dilewati karena sudah dipakai catatan biaya.`
          : `${deletedIds.size} vendor dihapus.`,
      );
    }
  };

  if (loading && vendors.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Vendor...</p>
      </div>
    );
  }

  const blockedCount = deleteUsage.filter((u) => u.entryCount > 0).length;
  const deletableCount = deleteTargets.length - blockedCount;

  return (
    <>
      <div className="px-6 pt-3 pb-0">
        <div className="flex items-center justify-end gap-2.5 mb-4">
          <button
            onClick={() => void refresh()}
            className="h-8 px-3.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200 transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {canManage && (
            <button
              onClick={() => { setEditTarget(null); setDialogOpen(true); }}
              className="h-8 px-3.5 text-[12px] font-medium bg-primary text-white rounded-lg hover:bg-primary/90 hover:shadow-md hover:shadow-slate-300 transition-all flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Vendor
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 px-6 pt-2 pb-5 overflow-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari vendor..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <FilterButton fields={filterFields} value={filters} onChange={setFilters} />
          <SortButton fields={filterFields} value={sorts} onChange={setSorts} />
          <ColumnSettingsButton fields={filterFields} hidden={hiddenCols} onToggle={toggleCol} frozen={frozenCols} onToggleFreeze={toggleFreezeCol} onToggleFreezeAll={toggleFreezeAllCols} headerFrozen={headerFrozen} onToggleHeaderFrozen={setHeaderFrozen} />
          <ExportButton onClick={handleExport} />
          {canManage && selectedRows.size > 0 && (
            <button
              onClick={() => void prepareBulkDelete()}
              disabled={checkingUsage}
              className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-60 disabled:cursor-wait transition-colors"
            >
              <Trash2 className="w-3 h-3" /> {checkingUsage ? 'Memeriksa...' : `Delete (${selectedRows.size})`}
            </button>
          )}
          <span className="text-[11px] text-slate-400 ml-auto">
            {visibleRows.length} dari {vendors.length} vendor
          </span>
        </div>

        {message && (
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-blue-700">
            {message}
          </div>
        )}
        {errorMessage && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {errorMessage}
          </div>
        )}

        <div className={T_WRAP}>
          <DataTable
            variant="plain"
            columns={columns}
            data={visibleRows as unknown as Record<string, unknown>[]}
            selectedRows={selectedRows}
            onToggleRow={handleToggleRow}
            onRowClick={canManage
              ? (row) => { setEditTarget(row as unknown as VendorRow); setDialogOpen(true); }
              : undefined}
            hiddenColumns={hiddenCols}
            frozenColumns={frozenCols}
            headerFrozen={headerFrozen}
            emptyMessage={
              <div className="py-10 text-center text-[13px] text-gray-400">
                {vendors.length === 0 ? 'Belum ada vendor' : 'Tidak ada hasil yang cocok dengan filter'}
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
                blockedCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600',
              )}>
                <TriangleAlert className="h-5 w-5" />
              </div>
              <div>
                <AlertDialogTitle>
                  Hapus {deletableCount} dari {deleteTargets.length} vendor terpilih?
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-1">
                  Periksa pemakaian berikut sebelum melanjutkan.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-slate-50 text-black">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">Vendor</th>
                  <th className="px-3 py-2 text-right font-bold">Catatan Biaya</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deleteUsage.map((usage) => {
                  const isBlocked = usage.entryCount > 0;
                  return (
                    <tr key={usage.id} className={isBlocked ? 'bg-amber-50/60' : undefined}>
                      <td className="px-3 py-2 text-slate-700">
                        {usage.nama}
                        {isBlocked && (
                          <span className="ml-2 text-[11px] font-medium text-amber-700">dilewati</span>
                        )}
                      </td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', isBlocked ? 'font-semibold text-amber-700' : 'text-slate-500')}>
                        {usage.entryCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {blockedCount > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-800">
              <strong>{blockedCount} vendor tidak bisa dihapus</strong> karena sudah dipakai catatan biaya lama.
              Baris itu dilewati; nonaktifkan saja supaya riwayatnya tetap utuh.
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
              Tidak ada catatan biaya yang memakai vendor ini — semuanya bisa dihapus.
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmBulkDelete();
              }}
              disabled={deleting || deletableCount === 0}
              className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
            >
              {deleting ? 'Menghapus...' : `Hapus ${deletableCount} vendor`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddVendorDialog
        key={editTarget?.id ?? 'new'}
        open={dialogOpen}
        initial={editTarget}
        onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditTarget(null); } }}
        onSaved={(vendor) => {
          setDialogOpen(false);
          setEditTarget(null);
          setErrorMessage(null);
          setMessage(`"${vendor.nama}" tersimpan.`);
          void refresh();
        }}
      />
    </>
  );
}
