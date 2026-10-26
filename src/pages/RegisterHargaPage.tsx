import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, RefreshCw, Search, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { T_WRAP, T_CODE } from '@/lib/tableStyles';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton } from '@/components/Table/ColumnSettings';
import { DataTable } from '@/components/Table/DataTable';
import { useColumnSettings } from '@/lib/columnSettings';
import {
  applyFilters,
  applySorts,
  type FieldOption,
  type FilterRule,
  type SortRule,
} from '@/lib/tableQuery';
import { fetchAll, type RegisterHargaAliased } from '@/services/registerHarga';
import { PermanentDeleteDialog } from '@/components/Modals/PermanentDeleteDialog';
import { useAuth } from '@/contexts/AuthContext';
import { canPermanentlyDelete } from '@/lib/permissions';
import type { PermanentDeleteResult } from '@/types/permanentDeletion';
import { ORDER_PRICE_COMPONENTS } from '@/types/pipeline';
import type { ModuleId, PoJump } from '@/types';

/**
 * Kolom untuk Filter/Sort/Atur kolom, dalam urutan tampilan.
 *
 * Nilai rupiahnya disimpan sebagai angka (bukan teks terformat): `applySorts`
 * mengurangkan `Number(nilai)` dan `applyFilters` memakai `parseFloat`, jadi
 * angka murni membuat "Lebih dari" dan urutan angka benar. Format "Rp ..."
 * hanya dilakukan saat menampilkan.
 */
const HARGA_FIELDS: FieldOption[] = [
  { key: 'savedAt', label: 'Tanggal' },
  { key: 'productionCode', label: 'Kode Produksi' },
  { key: 'clientProductionCode', label: 'Kode Produksi Client' },
  { key: 'productId', label: 'Product ID' },
  { key: 'brand', label: 'Client' },
  { key: 'product', label: 'Produk' },
  ...ORDER_PRICE_COMPONENTS.map((component) => ({ key: component.key, label: component.label })),
  { key: 'totalPerPiece', label: 'Total / pcs' },
  { key: 'actor', label: 'Diinput Oleh' },
];

// Urutan kolom untuk fitur freeze. HARGA_FIELDS sudah konstanta tingkat modul,
// jadi turunannya juga tingkat modul — identitasnya stabil antar render, jadi
// `useColumnSettings` tidak perlu memoisasinya ulang.
const HARGA_COLUMN_KEYS = HARGA_FIELDS.map((c) => c.key);

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Penanda nilai kosong, mengikuti pola Register Client. */
function Empty() {
  return <span className="text-gray-300">—</span>;
}

/**
 * Tujuan lompatan dari nomor PO.
 *
 * Daftarnya di satu tempat supaya urutan menu dan labelnya konsisten — kalau
 * tiap item ditulis terpisah, mudah ada yang tertinggal saat ditambah. `hint`
 * menjelaskan isi halaman tujuannya, karena "Production Order" dan "Order Entry"
 * mudah tertukar bagi user baru.
 */
const PO_DESTINATIONS: Array<{ id: ModuleId; label: string; hint: string }> = [
  { id: 'production-monitoring', label: 'Lihat di Production Order', hint: 'Work order & progres produksi' },
  { id: 'invoicing', label: 'Lihat di Invoicing', hint: 'Invoice milik PO ini' },
  { id: 'order-entry', label: 'Lihat di Order Entry', hint: 'Order & harga sumbernya' },
];

/**
 * Sel nomor PO yang bisa diklik.
 *
 * Meniru perilaku software akuntansi: nomor dokumen adalah pintu ke dokumen
 * terkait, jadi user tidak perlu pindah sidebar lalu mencari manual. Menu
 * (bukan klik-langsung) dipilih karena tujuannya ada tiga — klik-langsung akan
 * memaksa satu tujuan jadi "utama" dan menyembunyikan dua lainnya.
 *
 * `onOpenPo` opsional: bila tidak diberikan (mis. halaman ini dirender di tes),
 * selnya jatuh kembali jadi teks biasa, bukan tombol yang tidak bereaksi.
 */
function PoCodeCell({
  item,
  onOpenPo,
}: {
  item: RegisterHargaAliased;
  onOpenPo?: (target: ModuleId, jump: PoJump) => void;
}) {
  if (!item.productionCode) return <Empty />;

  // `onOpenPo` tidak diberikan → halaman ini dirender tanpa jalur navigasi
  // (mis. di tes). Selnya jatuh kembali jadi teks biasa, bukan tombol mati.
  //
  // Tidak ada pemeriksaan `productionOrderId` di sini: kolomnya `NOT NULL` di
  // database, jadi selalu ada. Pemeriksaan yang selalu benar hanya menambah
  // cabang yang tidak pernah terpakai.
  if (!onOpenPo) {
    return <span className={`${T_CODE} text-gray-700`}>{item.productionCode}</span>;
  }

  const jump: PoJump = { orderId: item.productionOrderId, code: item.productionCode };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Buka PO ini di halaman lain"
          className={`group inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded ${T_CODE}`}
        >
          {item.productionCode}
          <ChevronDown className="w-3 h-3 opacity-0 transition-opacity group-hover:opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[248px]">
        <DropdownMenuLabel className={`text-[11px] font-normal text-muted-foreground ${T_CODE}`}>
          {item.productionCode}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PO_DESTINATIONS.map((destination) => (
          <DropdownMenuItem
            key={destination.id}
            onSelect={() => onOpenPo?.(destination.id, jump)}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="text-[12px]">{destination.label}</span>
            <span className="text-[10px] text-muted-foreground">{destination.hint}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Register Harga — riwayat harga per order, baca-saja kecuali hapus massal.
 *
 * `onOpenPo` meneruskan lompatan ke `App.tsx`, yang memegang state halaman
 * aktif. Halaman ini sengaja tidak tahu apa-apa soal navigasi selain "user mau
 * lihat PO ini di sana" — sama seperti `onBack` di form entri.
 */
export function RegisterHargaPage({
  onOpenPo,
}: {
  onOpenPo?: (target: ModuleId, jump: PoJump) => void;
} = {}) {
  const [items, setItems] = useState<RegisterHargaAliased[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const { profile } = useAuth();
  const canDelete = canPermanentlyDelete(profile.role);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<readonly string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const {
    hidden: hiddenCols, toggle: toggleCol,
    frozen: frozenCols, toggleFreeze: toggleFreezeCol, toggleFreezeAll: toggleFreezeAllCols,
    headerFrozen, setHeaderFrozen,
  } = useColumnSettings('register-harga', HARGA_COLUMN_KEYS);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchAll();
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetchAll().then(({ data }) => {
      if (cancelled) return;
      setItems(data ?? []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((d) =>
      [
        d.productionCode,
        d.clientProductionCode,
        d.productId,
        d.brand,
        d.product,
        d.actor,
        d.totalPerPiece,
      ].some((v) => String(v ?? '').toLowerCase().includes(q)),
    );
  }, [items, search]);

  const rows = useMemo(
    () =>
      applySorts(
        applyFilters(
          filtered.map((r) => ({ ...r } as unknown as Record<string, unknown>)),
          filters,
        ),
        sorts,
      ) as unknown as RegisterHargaAliased[],
    [filtered, filters, sorts],
  );

  // Multi-select untuk aksi massal (pola sama dengan Planning Produksi &
  // RAW DATA di Production Monitoring). "Pilih semua" kini dimiliki grid: ia
  // menyalakan seluruh baris yang terlihat dan memutar selisihnya lewat
  // `toggleRow`, jadi tidak ada lagi state pilihan kedua di halaman ini.
  const toggleRow = (id: number) =>
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Bentuk kolom untuk DataGrid (variant "plain"). Kolom rupiah memakai `render`
  // supaya format "Rp ..." dan rata kanannya tetap milik halaman ini; nomor PO
  // tetap memakai `PoCodeCell` yang bisa diklik.
  const hargaColumns = useMemo(() => [
    {
      key: 'savedAt', label: 'Tanggal', width: '110px',
      render: (row: Record<string, unknown>) => (
        <span className="text-gray-700">{formatDate(row.savedAt as string)}</span>
      ),
    },
    {
      key: 'productionCode', label: 'Kode Produksi', width: '170px',
      render: (row: Record<string, unknown>) => (
        <PoCodeCell item={row as unknown as RegisterHargaAliased} onOpenPo={onOpenPo} />
      ),
    },
    {
      key: 'clientProductionCode', label: 'Kode Produksi Client', width: '220px',
      render: (row: Record<string, unknown>) => {
        const code = row.clientProductionCode as string | null;
        if (!code) return <Empty />;
        return <span className={`block max-w-[220px] truncate text-gray-700 ${T_CODE}`} title={code}>{code}</span>;
      },
    },
    {
      key: 'productId', label: 'Product ID', width: '130px',
      render: (row: Record<string, unknown>) => (
        <span className={`${T_CODE} text-gray-700`}>{(row.productId as string) || <Empty />}</span>
      ),
    },
    {
      key: 'brand', label: 'Client', width: '150px',
      render: (row: Record<string, unknown>) => (
        <span className="text-gray-700">{(row.brand as string) || <Empty />}</span>
      ),
    },
    {
      key: 'product', label: 'Produk', width: '160px',
      render: (row: Record<string, unknown>) => (
        <span className="text-gray-700">{(row.product as string) || <Empty />}</span>
      ),
    },
    ...ORDER_PRICE_COMPONENTS.map((component) => ({
      key: component.key, label: component.label, align: 'right' as const, width: '120px',
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums text-gray-700">{formatCurrency(row[component.key] as number)}</span>
      ),
    })),
    {
      key: 'totalPerPiece', label: 'Total / pcs', align: 'right' as const, width: '130px',
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums font-medium text-gray-900">{formatCurrency(row.totalPerPiece as number)}</span>
      ),
    },
    {
      key: 'actor', label: 'Diinput Oleh', width: '150px',
      render: (row: Record<string, unknown>) => (
        <span className="text-gray-700">{(row.actor as string) || <Empty />}</span>
      ),
    },
  ], [onOpenPo]);

  const handleBulkDelete = () => {
    if (!canDelete || selectedRows.size === 0) return;
    setDeleteIds(items.filter((item) => selectedRows.has(item.id)).map((item) => String(item.id)));
    setDeleteDialogOpen(true);
  };
  const handleDeleted = async (result: PermanentDeleteResult) => {
    setSelectedRows(new Set());
    setDeleteDialogOpen(false);
    await refresh();
    setMessage(`${result.deletedIds.length} harga dihapus permanen.${result.cleanupPending > 0 || result.cleanupError ? ' Pembersihan media masih tertunda; periksa status pembersihan.' : ''}`);
  };

  /**
   * Export CSV.
   *
   * Bila ada baris terpilih, hanya baris itu yang diekspor — mengikuti pola
   * ExportButton di Production Monitoring yang menghormati pilihan checkbox.
   * Tanpa pilihan, seluruh baris hasil filter yang diekspor.
   */
  const handleExport = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const exportRows = selectedRows.size > 0 ? rows.filter((r) => selectedRows.has(r.id)) : rows;
    const header = [
      'Tanggal',
      'Kode Produksi',
      'Kode Produksi Client',
      'Product ID',
      'Client',
      'Produk',
      ...ORDER_PRICE_COMPONENTS.map((component) => component.label),
      'Total / pcs',
      'Diinput Oleh',
    ];
    const lines = exportRows.map((r) =>
      [
        formatDateTime(r.savedAt),
        r.productionCode,
        r.clientProductionCode,
        r.productId,
        r.brand,
        r.product,
        ...ORDER_PRICE_COMPONENTS.map((component) => r[component.key]),
        r.totalPerPiece,
        r.actor,
      ]
        .map(esc)
        .join(','),
    );
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n'); // BOM for Excel UTF-8
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `register-harga-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Register Harga...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-auto">
      {canDelete && (
        <PermanentDeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}
          module="register_harga" ids={deleteIds} onDeleted={handleDeleted} />
      )}
      {message && <p role="status" className="mx-6 mt-3 text-sm text-muted-foreground">{message}</p>}
      <div className="px-6 pt-3 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">
              Register Harga
            </h1>
          </div>
          <button
            onClick={refresh}
            className="h-8 px-3.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200 transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 pt-4 pb-5 overflow-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari harga..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <FilterButton fields={HARGA_FIELDS} value={filters} onChange={setFilters} />
          <SortButton fields={HARGA_FIELDS} value={sorts} onChange={setSorts} />
          <ColumnSettingsButton fields={HARGA_FIELDS} hidden={hiddenCols} onToggle={toggleCol} frozen={frozenCols} onToggleFreeze={toggleFreezeCol} onToggleFreezeAll={toggleFreezeAllCols} headerFrozen={headerFrozen} onToggleHeaderFrozen={setHeaderFrozen} />
          <ExportButton onClick={handleExport} count={selectedRows.size} />
          {canDelete && selectedRows.size > 0 && (
            <Button onClick={handleBulkDelete} size="sm" variant="destructive">
              <Trash2 className="w-3 h-3 mr-1.5" /> Hapus ({selectedRows.size})
            </Button>
          )}
          <span className="text-[11px] text-slate-400 ml-auto">{rows.length} baris</span>
        </div>

        <div className={T_WRAP}>
          <DataTable
            variant="plain"
            columns={hargaColumns}
            data={rows as unknown as Record<string, unknown>[]}
            selectedRows={selectedRows}
            onToggleRow={toggleRow}
            hiddenColumns={hiddenCols}
            frozenColumns={frozenCols}
            headerFrozen={headerFrozen}
            emptyMessage={
              <div className="py-10 text-center text-[13px] text-gray-400">
                {filtered.length === 0
                  ? 'Belum ada harga tercatat. Harga muncul otomatis setelah order disimpan di Order Entry.'
                  : 'Tidak ada hasil yang cocok dengan filter'}
              </div>
            }
          />
        </div>
      </div>
    </main>
  );
}

export default RegisterHargaPage;
