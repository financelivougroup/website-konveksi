import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { PermanentDeleteDialog } from '@/components/Modals/PermanentDeleteDialog';
import { useAuth } from '@/contexts/AuthContext';
import { canPermanentlyDelete } from '@/lib/permissions';
import type { PermanentDeleteResult } from '@/types/permanentDeletion';
import { AddClientDialog } from '@/components/Modals/AddClientDialog';
import { T_WRAP, softBadgeClass} from '@/lib/tableStyles';
import { DataTable } from '@/components/Table/DataTable';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton } from '@/components/Table/ColumnSettings';
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import {
  fetchAll as fetchAllClient,
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
export function ClientTab({ tabs }: { tabs?: ReactNode } = {}) {
  const { profile } = useAuth();
  const canDelete = canPermanentlyDelete(profile.role);
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
  const [deleteIds, setDeleteIds] = useState<readonly string[]>([]);

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
  const prepareBulkDelete = () => {
    if (!canDelete || selectedRows.size === 0) return;
    setDeleteIds(items.filter((item) => selectedRows.has(item.id)).map((item) => String(item.id)));
    setDeleteDialogOpen(true);
  };

  const handleDeleted = async (result: PermanentDeleteResult) => {
    const deleted = new Set(result.deletedIds);
    if (editTarget && deleted.has(String(editTarget.id))) {
      setEditTarget(null);
      setModalOpen(false);
    }
    setSelectedRows(new Set());
    setDeleteDialogOpen(false);
    await refresh();
    setMessage(`${result.deletedIds.length} client dihapus permanen.${result.cleanupPending > 0 || result.cleanupError ? ' Pembersihan media masih tertunda; periksa status pembersihan.' : ''}`);
  };

  if (loading) {
    return (
      <>
        <div className="px-6 pt-3">{tabs}</div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-400 text-sm">Loading Client...</p>
        </div>
      </>
    );
  }


  return (
    <>
      <div className="px-6 pt-3 pb-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          {tabs}
          <div className="ml-auto flex items-center gap-2.5">
            <button onClick={refresh} className="h-8 px-3.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200 transition-all flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={openCreate} className="h-8 px-3.5 text-[12px] font-medium bg-primary text-white rounded-lg hover:bg-primary/90 hover:shadow-md hover:shadow-slate-300 transition-all flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" /> Tambah Client
            </button>
          </div>
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
          {canDelete && selectedRows.size > 0 && (
            <Button onClick={prepareBulkDelete} variant="destructive" size="sm">
              <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
            </Button>
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

      {canDelete && (
        <PermanentDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          module="register_client"
          ids={deleteIds}
          onDeleted={handleDeleted}
        />
      )}

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
