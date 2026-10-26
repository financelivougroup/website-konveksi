import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PermanentDeleteDialog } from '@/components/Modals/PermanentDeleteDialog';
import { canPermanentlyDelete } from '@/lib/permissions';
import type { PermanentDeleteResult } from '@/types/permanentDeletion';
import { cn } from '@/lib/utils';
import { AddCategoryDialog } from '@/components/Modals/AddCategoryDialog';
import { FilterButton, SortButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton } from '@/components/Table/ColumnSettings';
import { DataTable } from '@/components/Table/DataTable';
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import { T_WRAP, softBadgeClass } from '@/lib/tableStyles';
import {
  levelLabel,
  pathOf,
  type CategoryLevel,
  type ExpenseCategory,
} from '@/lib/expenseCategories';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchAll,
  setActive,
} from '@/services/expenseCategories';

/** Tingkat yang bisa ditambah dari halaman ini, berurutan. */
const ADDABLE_LEVELS: CategoryLevel[] = ['type', 'main', 'sub', 'item'];

/** Badge status soft (lihat `softBadgeClass` di '@/lib/tableStyles'). */
const STATUS_BADGE: Record<string, string> = {
  Aktif: 'emerald',
  'Non-Aktif': 'slate',
};

/** Satu baris tabel = satu kategori, dengan nama tiap tingkat di jalurnya. */
interface CategoryTableRow extends ExpenseCategory {
  type: string;
  main: string;
  sub: string;
  item: string;
  levelLabel: string;
  status: string;
}

const EMPTY_CELL = <span className="text-gray-300">—</span>;

export function KategoriBiayaPage() {
  const { profile } = useAuth();
  // Hanya owner dan finance yang boleh mengubah taksonomi; role lain tetap
  // bisa memakai kategorinya. Mengikuti pola yang sudah dipakai InvoicingPage.
  const canManage = profile.role === 'owner' || profile.role === 'finance';

  const [rows, setRows] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [dialogLevel, setDialogLevel] = useState<CategoryLevel | null>(null);
  const [editTarget, setEditTarget] = useState<ExpenseCategory | null>(null);

  const canDelete = canPermanentlyDelete(profile.role);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<readonly string[]>([]);

  // Pemuatan awal memakai `.then()`, bukan `await` — mengikuti pola
  // RegisterClientPage. Perbedaannya bukan gaya: `await` membuat `setState`
  // berjalan sinkron di dalam badan effect, yang ditolak
  // `react-hooks/set-state-in-effect` karena memicu render berantai.
  useEffect(() => {
    let cancelled = false;

    void fetchAll().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setErrorMessage(`Gagal memuat kategori: ${error.message}`);
      } else {
        setRows(data ?? []);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  /** Muat ulang setelah ada perubahan; dipanggil dari handler, bukan effect. */
  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchAll();
    if (error) {
      setErrorMessage(`Gagal memuat kategori: ${error.message}`);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
  }, []);

  // ===== Baris tabel: nama tiap tingkat diambil dari jalurnya =====
  const tableRows = useMemo<CategoryTableRow[]>(() => {
    return rows.map((row) => {
      const parts = pathOf(rows, row.id).split(' › ');
      return {
        ...row,
        type: parts[0] ?? '',
        main: parts[1] ?? '',
        sub: parts[2] ?? '',
        item: parts[3] ?? '',
        levelLabel: levelLabel(row.level),
        status: row.isActive ? 'Aktif' : 'Non-Aktif',
      };
    });
  }, [rows]);

  const filterFields: FieldOption[] = [
    { key: 'type', label: 'Type' },
    { key: 'main', label: 'Main Category' },
    { key: 'sub', label: 'Sub Category' },
    { key: 'item', label: 'Item' },
    { key: 'levelLabel', label: 'Level' },
    { key: 'status', label: 'Status' },
  ];

  const filteredRows = useMemo(() => {
    let result = applyFilters(tableRows as unknown as Record<string, unknown>[], filters);
    result = applySorts(result, sorts);
    const query = search.trim().toLocaleLowerCase('id-ID');
    if (query) {
      result = result.filter((row) =>
        [row.type, row.main, row.sub, row.item, row.status]
          .some((value) => String(value).toLocaleLowerCase('id-ID').includes(query)),
      );
    }
    return result as unknown as CategoryTableRow[];
  }, [tableRows, filters, sorts, search]);

  const handleToggleActive = useCallback(async (row: ExpenseCategory) => {
    setBusyId(row.id);
    setMessage(null);
    setErrorMessage(null);
    const { error } = await setActive(row.id, !row.isActive);
    setBusyId(null);
    if (error) {
      setErrorMessage(`Gagal mengubah status: ${error.message}`);
      return;
    }
    setMessage(
      row.isActive
        ? `"${row.name}" dinonaktifkan. Kategori ini tidak lagi muncul di pilihan baru, tetapi riwayat lama tetap utuh.`
        : `"${row.name}" diaktifkan kembali.`,
    );
    await refresh();
  }, [refresh]);

  // Bentuk kolom untuk DataTable (variant "plain"). Sel yang bukan teks polos
  // — nilai kosong dan badge status — memakai `render` supaya tabel bersama
  // tidak perlu tahu soal gaya halaman ini.
  //
  // Kolom "#" sudah tidak ada: barisnya dipilih lewat checkbox paling kiri,
  // sama seperti tabel lain. Kolom "Actions" juga sudah tidak ada — mengganti
  // nama lewat klik baris (pola yang sama dengan Contact/Complain/Planning),
  // dan menghapus lewat checkbox + tombol Delete.
  const columns = useMemo(() => [
    {
      key: 'type', label: 'Type', width: '110px',
      render: (row: Record<string, unknown>) => (
        <span className="text-gray-700">{(row.type as string) || EMPTY_CELL}</span>
      ),
    },
    {
      key: 'main', label: 'Main Category', width: '140px',
      render: (row: Record<string, unknown>) => (row.main as string) || EMPTY_CELL,
    },
    {
      key: 'sub', label: 'Sub Category', width: '150px',
      render: (row: Record<string, unknown>) => (row.sub as string) || EMPTY_CELL,
    },
    {
      key: 'item', label: 'Item', width: '180px',
      render: (row: Record<string, unknown>) => (
        <span className="uppercase text-gray-700">{(row.item as string) || EMPTY_CELL}</span>
      ),
    },
    {
      key: 'status', label: 'Status', align: 'center' as const, width: '110px',
      // Badge-nya sekaligus tombol aktif/non-aktif — pola yang sama dengan
      // kolom Status di Planning Produksi, yang juga mengubah status langsung
      // dari tabel. stopPropagation menjaga klik badge tidak ikut membuka
      // dialog ganti nama lewat onRowClick.
      render: (row: Record<string, unknown>) => {
        const category = row as unknown as CategoryTableRow;
        return (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); void handleToggleActive(category); }}
            disabled={!canManage || busyId === category.id}
            title={canManage
              ? (category.isActive ? 'Klik untuk nonaktifkan' : 'Klik untuk aktifkan kembali')
              : category.status}
            className={cn(
              softBadgeClass(STATUS_BADGE[category.status]),
              canManage ? 'cursor-pointer hover:brightness-95' : 'cursor-default',
              'disabled:opacity-60',
            )}
          >
            {category.status}
          </button>
        );
      },
    },
  ], [canManage, busyId, handleToggleActive]);

  // Pengaturan kolom (tampil/sembunyi + freeze) dipanggil di sini, bukan di
  // blok state di atas, karena butuh urutan kolom yang baru lengkap setelah
  // `columns` selesai disusun. Tidak ada `return` lebih awal di antaranya, jadi
  // urutan hook tetap stabil.
  const columnKeys = useMemo(() => columns.map((c) => c.key), [columns]);
  // Panel Kolom memakai daftar dari `columns`, bukan `filterFields`: filterFields
  // masih memuat "Level" (dipakai Filter/Sort), padahal kolom itu tidak pernah
  // dirender. Dulu barisnya cuma tidak berefek; sekarang tombol pin-nya juga
  // akan terlihat bisa diklik padahal tidak ada kolom yang dibekukan.
  const columnFields = useMemo(() => columns.map((c) => ({ key: c.key, label: c.label })), [columns]);
  const {
    hidden: hiddenCols, toggle: toggleCol,
    frozen: frozenCols, toggleFreeze: toggleFreezeCol, toggleFreezeAll: toggleFreezeAllCols,
    headerFrozen, setHeaderFrozen,
  } = useColumnSettings('kategori-biaya', columnKeys);

  // Multi-select: "pilih semua" milik grid, yang memutar selisihnya lewat
  // `handleToggleRow` — pola yang sama dengan ClientTab/KaryawanTab.
  const handleToggleRow = (id: number) => setSelectedRows(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const prepareBulkDelete = () => {
    if (!canDelete || selectedRows.size === 0) return;
    setDeleteIds(tableRows.filter((row) => selectedRows.has(row.id)).map((row) => String(row.id)));
    setDeleteDialogOpen(true);
  };
  const handleDeleted = async (result: PermanentDeleteResult) => {
    if (editTarget && result.deletedIds.includes(String(editTarget.id))) {
      setEditTarget(null);
      setDialogLevel(null);
    }
    setSelectedRows(new Set());
    setDeleteDialogOpen(false);
    setErrorMessage(null);
    await refresh();
    setMessage(`${result.deletedIds.length} kategori dihapus permanen.${result.cleanupPending > 0 || result.cleanupError ? ' Pembersihan media masih tertunda; periksa status pembersihan.' : ''}`);
  };

  if (loading && rows.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Kategori Biaya...</p>
      </main>
    );
  }


  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="px-6 pt-3 pb-0">
        <div className="mb-3">
          <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Kategori Biaya</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2.5 mb-1">
          <button
            onClick={() => void refresh()}
            className="h-8 px-3.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200 transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {canManage && ADDABLE_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => { setEditTarget(null); setDialogLevel(level); }}
              className="h-8 px-3.5 text-[12px] font-medium bg-primary text-white rounded-lg hover:bg-primary/90 hover:shadow-md hover:shadow-slate-300 transition-all flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" /> {levelLabel(level)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 pt-4 pb-5 overflow-auto">

        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari kategori..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <FilterButton fields={filterFields} value={filters} onChange={setFilters} />
          <SortButton fields={filterFields} value={sorts} onChange={setSorts} />
          <ColumnSettingsButton fields={columnFields} hidden={hiddenCols} onToggle={toggleCol} frozen={frozenCols} onToggleFreeze={toggleFreezeCol} onToggleFreezeAll={toggleFreezeAllCols} headerFrozen={headerFrozen} onToggleHeaderFrozen={setHeaderFrozen} />
          {canDelete && selectedRows.size > 0 && (
            <Button onClick={prepareBulkDelete} variant="destructive" size="sm">
              <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
            </Button>
          )}
          <span className="text-[11px] text-slate-400 ml-auto">
            {filteredRows.length} dari {tableRows.length} kategori
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
            data={filteredRows as unknown as Record<string, unknown>[]}
            selectedRows={selectedRows}
            onToggleRow={handleToggleRow}
            onRowClick={canManage
              ? (row) => {
                const category = row as unknown as CategoryTableRow;
                setEditTarget(category);
                setDialogLevel(category.level);
              }
              : undefined}
            hiddenColumns={hiddenCols}
            frozenColumns={frozenCols}
            headerFrozen={headerFrozen}
            emptyMessage={
              <div className="py-10 text-center text-[13px] text-gray-400">
                {tableRows.length === 0 ? 'Belum ada kategori' : 'Tidak ada hasil yang cocok dengan filter'}
              </div>
            }
          />
        </div>
      </div>

      {canDelete && (
        <PermanentDeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}
          module="expense_categories" ids={deleteIds} onDeleted={handleDeleted} />
      )}

      <AddCategoryDialog
        key={`${dialogLevel ?? 'none'}-${editTarget?.id ?? 'new'}`}
        open={dialogLevel !== null}
        rows={rows}
        level={dialogLevel ?? 'type'}
        initial={editTarget}
        onOpenChange={(open) => { if (!open) { setDialogLevel(null); setEditTarget(null); } }}
        onSaved={(category) => {
          setDialogLevel(null);
          setEditTarget(null);
          setMessage(`"${category.name}" tersimpan.`);
          void refresh();
        }}
      />
    </main>
  );
}

export default KategoriBiayaPage;
