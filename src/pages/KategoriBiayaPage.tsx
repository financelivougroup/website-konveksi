import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddCategoryDialog } from '@/components/Modals/AddCategoryDialog';
import { FilterButton, SortButton } from '@/components/Table/TableTools';
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
import {
  levelLabel,
  pathOf,
  type CategoryLevel,
  type ExpenseCategory,
} from '@/lib/expenseCategories';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchAll,
  fetchUsageMany,
  remove,
  setActive,
  type CategoryUsageDetail,
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

  // Penghapusan massal lewat checkbox: periksa pemakaian dulu, baru konfirmasi.
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<CategoryTableRow[]>([]);
  const [deleteUsage, setDeleteUsage] = useState<CategoryUsageDetail[]>([]);
  const [checkingUsage, setCheckingUsage] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        <span className="font-mono text-gray-700">{(row.type as string) || EMPTY_CELL}</span>
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

  /**
   * Periksa dulu mana yang boleh dihapus, baru tanya.
   *
   * Kategori tidak bisa dihapus selama masih menaungi anak (`parent_id`) atau
   * sudah dipakai catatan biaya (`category_id` / `item_id`) — ketiga FK-nya
   * `ON DELETE RESTRICT`. Memeriksanya lebih dulu membuat user tahu alasannya
   * sebelum menekan Hapus, bukan setelah ditolak database.
   */
  const prepareBulkDelete = async () => {
    if (selectedRows.size === 0 || checkingUsage) return;

    const targets = tableRows.filter((row) => selectedRows.has(row.id));
    if (targets.length === 0) return;

    setCheckingUsage(true);
    setMessage(null);
    setErrorMessage(null);
    const { data: usage, error } = await fetchUsageMany(targets.map((row) => row.id));
    setCheckingUsage(false);

    if (error || !usage) {
      setErrorMessage(`Pemakaian kategori gagal diperiksa: ${error?.message ?? 'Unknown error'}. Penghapusan dibatalkan.`);
      return;
    }

    // Snapshot target + dampaknya: dialog tidak boleh bergantung pada checkbox
    // yang mungkin berubah setelah pemeriksaan selesai.
    setDeleteTargets(targets);
    setDeleteUsage(usage);
    setDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (deleteTargets.length === 0 || deleting) return;

    const blocked = new Set(
      deleteUsage.filter((u) => u.childCount > 0 || u.entryCount > 0).map((u) => u.id),
    );
    const deletable = deleteTargets.filter((row) => !blocked.has(row.id));

    setDeleting(true);
    const deletedIds = new Set<number>();
    const failedNames: string[] = [];

    for (const category of deletable) {
      const { error } = await remove(category.id);
      if (error) failedNames.push(category.name);
      else deletedIds.add(category.id);
    }

    setRows(prev => prev.filter((row) => !deletedIds.has(row.id)));
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
      setErrorMessage(`${deletedIds.size} kategori dihapus; gagal menghapus: ${failedNames.join(', ')}.`);
    } else if (deletedIds.size === 0) {
      setMessage(null);
      setErrorMessage('Tidak ada kategori yang bisa dihapus — semuanya masih dipakai. Nonaktifkan saja supaya riwayat lama tetap utuh.');
    } else {
      setMessage(
        skipped > 0
          ? `${deletedIds.size} kategori dihapus. ${skipped} dilewati karena masih punya anak atau sudah dipakai catatan biaya.`
          : `${deletedIds.size} kategori dihapus.`,
      );
    }
  };

  if (loading && rows.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Kategori Biaya...</p>
      </main>
    );
  }

  const blockedCount = deleteUsage.filter((u) => u.childCount > 0 || u.entryCount > 0).length;
  const deletableCount = deleteTargets.length - blockedCount;

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="px-6 pt-3 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Kategori Biaya</h1>
          </div>
          <div className="flex items-center gap-2.5">
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
                  Hapus {deletableCount} dari {deleteTargets.length} kategori terpilih?
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
                  <th className="px-3 py-2 text-left font-bold">Kategori</th>
                  <th className="px-3 py-2 text-right font-bold">Anak</th>
                  <th className="px-3 py-2 text-right font-bold">Catatan Biaya</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deleteUsage.map((usage) => {
                  const isBlocked = usage.childCount > 0 || usage.entryCount > 0;
                  return (
                    <tr key={usage.id} className={isBlocked ? 'bg-amber-50/60' : undefined}>
                      <td className="px-3 py-2 text-slate-700">
                        {usage.name}
                        {isBlocked && (
                          <span className="ml-2 text-[11px] font-medium text-amber-700">dilewati</span>
                        )}
                      </td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', usage.childCount > 0 ? 'font-semibold text-amber-700' : 'text-slate-500')}>
                        {usage.childCount}
                      </td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', usage.entryCount > 0 ? 'font-semibold text-amber-700' : 'text-slate-500')}>
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
              <strong>{blockedCount} kategori tidak bisa dihapus</strong> karena masih menaungi anak atau
              sudah dipakai catatan biaya lama. Baris itu dilewati; nonaktifkan saja supaya riwayatnya tetap utuh.
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
              Tidak ada yang memakai kategori ini — semuanya bisa dihapus.
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
              {deleting ? 'Menghapus...' : `Hapus ${deletableCount} kategori`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
