import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PermanentDeleteDialog } from '@/components/Modals/PermanentDeleteDialog';
import { canPermanentlyDelete } from '@/lib/permissions';
import type { PermanentDeleteResult } from '@/types/permanentDeletion';
import { AddVendorDialog } from '@/components/Modals/AddVendorDialog';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton } from '@/components/Table/ColumnSettings';
import { DataTable } from '@/components/Table/DataTable';
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import { T_WRAP, softBadgeClass } from '@/lib/tableStyles';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchAll,
  type VendorRow,
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

  const canDelete = canPermanentlyDelete(profile.role);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<readonly string[]>([]);

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

  const prepareBulkDelete = () => {
    if (!canDelete || selectedRows.size === 0) return;
    setDeleteIds(vendors.filter((vendor) => selectedRows.has(vendor.id)).map((vendor) => String(vendor.id)));
    setDeleteDialogOpen(true);
  };

  const handleDeleted = async (result: PermanentDeleteResult) => {
    if (editTarget && result.deletedIds.includes(String(editTarget.id))) {
      setEditTarget(null);
      setDialogOpen(false);
    }
    setSelectedRows(new Set());
    setDeleteDialogOpen(false);
    setErrorMessage(null);
    await refresh();
    setMessage(`${result.deletedIds.length} vendor dihapus permanen.${result.cleanupPending > 0 || result.cleanupError ? ' Pembersihan media masih tertunda; periksa status pembersihan.' : ''}`);
  };

  if (loading && vendors.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Vendor...</p>
      </div>
    );
  }


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
          {canDelete && selectedRows.size > 0 && (
            <Button onClick={prepareBulkDelete} variant="destructive" size="sm">
              <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
            </Button>
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

      {canDelete && (
        <PermanentDeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}
          module="vendors" ids={deleteIds} onDeleted={handleDeleted} />
      )}

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
