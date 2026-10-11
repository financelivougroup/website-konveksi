import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Copy,
  ExternalLink,
  Eye,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExpenseDialog } from '@/components/Modals/ExpenseDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AttachReceiptDialog } from '@/components/Modals/AttachReceiptDialog';
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { useColumnSettings } from '@/lib/columnSettings';
import { useAuth } from '@/contexts/AuthContext';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import { T_WRAP, T_ROW_BTN, T_SOFT_BADGE } from '@/lib/tableStyles';
import { canEditSalary, SALARY_EDIT_HINT } from '@/lib/permissions';
import { formatDate } from '@/data/pipelineData';
import { formatCurrency } from '@/lib/utils';
import { formatRupiahRingkas } from '@/lib/targetJahitReport';
import { LAST_PAGE, LOG_PAGE_SIZE, clampPage } from '@/lib/pagination';
import {
  buildMonthlyTrend,
  expensesToCsv,
  filterExpenses,
  monthFilterOptions,
  summarizeExpenses,
  valueOptions,
  type ExpenseEntry,
} from '@/lib/expenseEntries';
import type { ExpenseCategory } from '@/lib/expenseCategories';
import { fetchAll as fetchCategories } from '@/services/expenseCategories';
import { fetchActive as fetchActiveVendors, type VendorRow } from '@/services/vendors';
import { fetchAll as fetchStaff, type RegisterPenjahitRow } from '@/services/registerPenjahit';
import * as expenseSvc from '@/services/expenseEntries';

// Urutan kolom mengikuti daftar yang ditulis user, apa adanya:
// Date Invoice → Main Category → Sub Category → Item → Nama Barang → Vendor →
// Jumlah → Harga/Item → Total → Ongkir + Admin → Discount/Cashback →
// Total Payment → Flow Transaction → Invoice → Proof Payment → PIC.
//
// `Type` dan `Keterangan` SENGAJA tidak dirender (permintaan user) — datanya
// tetap disimpan dan tetap bisa diisi lewat form, hanya tidak ditampilkan.
// Daftar kolomnya kini ada di `expenseColumns` (useMemo di dalam komponen),
// karena sel-selnya butuh badge dan format milik halaman ini.

const EMPTY_CELL = <span className="text-gray-300">—</span>;

/**
 * Warna badge untuk beberapa kolom Expense.
 *
 * **Satu warna tetap per jenis**, bukan per nama: Main selalu biru, Sub dan
 * Vendor sama-sama ungu, Item hijau, Flow Transaction jingga. Tujuannya supaya
 * posisi warnanya bisa dihafal — setelah beberapa kali memakai halaman ini,
 * jenis sebuah nilai langsung terbaca dari warnanya tanpa membaca header
 * kolomnya. Kalau warnanya ditentukan per nama kategori, jumlah warnanya jadi
 * tak terbatas dan tidak ada yang bisa dihafal.
 *
 * **Gaya SOFT, bukan solid** (permintaan user, mengikuti referensi): latar
 * sangat muda + teks sewarna yang lebih tua + garis tepi tipis. Ini juga pola
 * badge soft yang sudah dipakai proyek ini — lihat `OrderEntry.tsx:68`
 * (`border-blue-200 bg-blue-50 text-blue-700`) dan
 * `ConditionalColorModal.tsx:105` (`bg-violet-50 text-violet-600 border-violet-100`).
 *
 * Warnanya memakai kelas Tailwind mentah, BUKAN token tema `--primary`/`--info`:
 * `--primary` di tema ini bernilai `240 5.9% 10%` — hampir hitam, bukan biru —
 * dan proyek ini tidak punya token biru sama sekali, sehingga badge akan tampak
 * kelabu.
 */
const SOFT_BADGE: Record<'main' | 'sub' | 'item' | 'vendor' | 'flow', string> = {
  main: 'border-blue-200 bg-blue-50 text-blue-700',
  sub: 'border-violet-200 bg-violet-50 text-violet-700',
  // Vendor sengaja memakai warna yang SAMA dengan Sub Category (permintaan user).
  vendor: 'border-violet-200 bg-violet-50 text-violet-700',
  item: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  flow: 'border-amber-200 bg-amber-50 text-amber-700',
};

/**
 * Satu sel badge.
 *
 * `uppercase` hanya dipakai kolom Item (permintaan user) — kolom lain
 * menampilkan nilainya apa adanya.
 *
 * Nilai kosong TIDAK dijadikan badge netral: yang kosong tetap "—" abu-abu
 * biasa seperti sel lain, karena badge berwarna untuk nilai yang tidak ada
 * justru menarik mata ke tempat yang tidak ada isinya.
 */
function SoftBadge({
  value,
  tone,
  uppercase = false,
}: {
  value: string;
  tone: keyof typeof SOFT_BADGE;
  uppercase?: boolean;
}) {
  if (!value) return <span className="text-gray-300">—</span>;
  return (
    <span
      className={cn(
        // Paddingnya dari `T_SOFT_BADGE` bersama (`py-0.5 leading-none`), bukan
        // `py-1` seperti sebelumnya. Baris tabel setinggi isi sel tertinggi, jadi
        // badge `py-1` setinggi 26.5px mendorong barisnya ke 38.5px — sedangkan
        // tabel acuan (Register Harga) 31.5px. Warna tetap milik halaman ini
        // karena tone-nya semantik (main/sub/item/vendor/flow) dan Vendor
        // sengaja memakai warna yang sama dengan Sub Category.
        T_SOFT_BADGE,
        uppercase && 'uppercase',
        SOFT_BADGE[tone],
      )}
    >
      {value}
    </span>
  );
}

/**
 * Nama karyawan yang layak jadi PIC: hanya yang **Aktif**, unik, urut abjad.
 *
 * Karyawan non-aktif disembunyikan supaya tidak terpilih lagi, mengikuti pola
 * yang sudah dipakai `PlanningProduksiPage`. Nama yang sudah ada tetap tampil
 * di baris lama karena PIC disalin ke baris, bukan dirujuk lewat id.
 */
function activeStaffNames(rows: readonly RegisterPenjahitRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if ((row.status ?? 'Aktif').toLowerCase() !== 'aktif') continue;
    const nama = row.picPenjahit?.trim();
    if (nama) names.add(nama);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Karyawan aktif BESERTA id-nya, untuk pilihan penerima gaji.
 *
 * `activeStaffNames` di atas membuang id karena dropdown PIC hanya menyimpan
 * nama. Memilih penerima GAJI berbeda: `expense_entries.staff_id` menyimpan id,
 * jadi daftarnya harus membawa id. Id yang lebih kecil menang bila ada nama
 * kembar, supaya pilihannya stabil antar pemuatan.
 */
function activeStaffs(rows: readonly RegisterPenjahitRow[]): Array<{ id: number; nama: string }> {
  const byName = new Map<string, number>();
  for (const row of rows) {
    if ((row.status ?? 'Aktif').toLowerCase() !== 'aktif') continue;
    const nama = row.picPenjahit?.trim();
    if (!nama) continue;
    const existing = byName.get(nama);
    if (existing === undefined || row.id < existing) byName.set(nama, row.id);
  }
  return [...byName.entries()]
    .map(([nama, id]) => ({ id, nama }))
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

export function ExpensePage() {
  const { profile } = useAuth();
  // Hanya owner dan finance yang boleh mencatat biaya; role lain tetap bisa
  // melihat. Mengikuti pola yang sudah dipakai InvoicingPage dan KategoriBiayaPage.
  const canManage = profile.role === 'owner' || profile.role === 'finance';

  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  /**
   * Nama karyawan AKTIF untuk dropdown PIC.
   *
   * Diambil dari Contact → tab Karyawan, bukan daftar hardcoded seperti di form
   * Sewing/Kancing/Finishing — supaya PIC selalu mencerminkan karyawan yang
   * benar-benar terdaftar. Difilter `status === 'Aktif'` di klien, mengikuti
   * pola PlanningProduksiPage.
   */
  const [staffNames, setStaffNames] = useState<string[]>([]);
  /** Karyawan aktif + id-nya, untuk pilihan penerima gaji. */
  const [staffs, setStaffs] = useState<Array<{ id: number; nama: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const [month, setMonth] = useState('');
  const [type, setType] = useState('');
  const [mainCategory, setMainCategory] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpenseEntry | null>(null);
  /** Mode baca — dibuka oleh aksi "View" pada menu baris. */
  const [viewTarget, setViewTarget] = useState<ExpenseEntry | null>(null);
  /** Baris yang notanya sedang diunggah/diganti lewat aksi "Attach Receipt". */
  const [receiptTarget, setReceiptTarget] = useState<ExpenseEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Baris terpilih untuk aksi massal. id-nya number, mengikuti pola
   *  RegisterClientPage/TargetJahitPage. */
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // Kedua handler ini sama persis dengan tiga halaman lain yang sudah memakai
  // checkbox (RegisterClientPage, TargetJahitPage, ComplainPenaltiPage) — tidak
  // ada alasan membuat varian sendiri.
  const handleToggleRow = useCallback((id: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);


  // Pemuatan awal memakai `.then()`, bukan `await`, mengikuti pola
  // RegisterClientPage — `await` akan memanggil setState sinkron di dalam badan
  // effect, yang ditolak `react-hooks/set-state-in-effect`.
  useEffect(() => {
    let cancelled = false;

    void Promise.all([expenseSvc.fetchAll(), fetchCategories(), fetchActiveVendors(), fetchStaff()]).then(
      ([entriesResult, categoriesResult, vendorsResult, staffResult]) => {
        if (cancelled) return;
        if (entriesResult.error) {
          setErrorMessage(`Gagal memuat catatan biaya: ${entriesResult.error.message}`);
        } else {
          setEntries(entriesResult.data ?? []);
        }
        setCategories(categoriesResult.data ?? []);
        setVendors(vendorsResult.data ?? []);
        setStaffNames(activeStaffNames(staffResult.data ?? []));
        setStaffs(activeStaffs(staffResult.data ?? []));
        setLoading(false);
      },
    );

    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [entriesResult, categoriesResult, vendorsResult, staffResult] = await Promise.all([
      expenseSvc.fetchAll(),
      fetchCategories(),
      fetchActiveVendors(),
      fetchStaff(),
    ]);
    if (entriesResult.error) {
      setErrorMessage(`Gagal memuat catatan biaya: ${entriesResult.error.message}`);
    } else {
      setEntries(entriesResult.data ?? []);
    }
    setCategories(categoriesResult.data ?? []);
    setVendors(vendorsResult.data ?? []);
    setStaffNames(activeStaffNames(staffResult.data ?? []));
    setStaffs(activeStaffs(staffResult.data ?? []));
    setLoading(false);
  }, []);

  // ===== Slicer + pencarian, satu rantai =====
  // Pencarian ikut ke `filterExpenses` supaya vendor dan nominal tersaring di
  // rantai yang sama dengan slicer — persis pelajaran dari log dashboard:
  // KPI dan tabel tidak boleh menyaring dengan rantai yang berbeda.
  const visibleRows = useMemo(() => {
    const scoped = filterExpenses(entries, { month, type, mainCategory, query: search });
    let result = applyFilters(scoped as unknown as Record<string, unknown>[], filters);
    result = applySorts(result, sorts);
    return result as unknown as ExpenseEntry[];
  }, [entries, month, type, mainCategory, search, filters, sorts]);

  /** Halaman yang sudah dijepit — tanpa ini, filter yang mempersempit hasil di
   *  bawah halaman yang sedang dibuka membuat tabel tampak kosong. */
  const safePage = clampPage(page, visibleRows.length, LOG_PAGE_SIZE);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * LOG_PAGE_SIZE;
    return visibleRows.slice(start, start + LOG_PAGE_SIZE);
  }, [visibleRows, safePage]);

  // "Pilih semua" kini dimiliki grid: ia menyalakan seluruh baris yang terlihat
  // dan memutar selisihnya lewat `handleToggleRow`. Handler lama dihapus supaya
  // tidak ada dua sumber kebenaran untuk pilihan.
  const clearSelection = useCallback(() => setSelectedRows(new Set()), []);

  // Bentuk kolom untuk DataGrid (variant "plain"). Hanya kolom yang butuh badge,
  // format mata uang, tautan bukti, atau pemotongan teks yang memakai `render`;
  // sisanya teks polos.
  const expenseColumns = useMemo(() => [
    {
      key: 'entryDate', label: 'Date Invoice', width: '110px',
      render: (row: Record<string, unknown>) => (
        <span className="text-gray-700 whitespace-nowrap">
          {(row.entryDate as string) ? formatDate(row.entryDate as string) : EMPTY_CELL}
        </span>
      ),
    },
    {
      key: 'mainCategoryName', label: 'Main Category', width: '140px',
      render: (row: Record<string, unknown>) => <SoftBadge value={row.mainCategoryName as string} tone="main" />,
    },
    {
      key: 'subCategoryName', label: 'Sub Category', width: '140px',
      render: (row: Record<string, unknown>) => <SoftBadge value={row.subCategoryName as string} tone="sub" />,
    },
    {
      key: 'itemName', label: 'Item', width: '130px',
      // Item ditampilkan KAPITAL SEMUA (permintaan user) — seragam walau
      // sumbernya ditulis dengan huruf campur.
      render: (row: Record<string, unknown>) => <SoftBadge value={row.itemName as string} tone="item" uppercase />,
    },
    {
      key: 'namaBarang', label: 'Nama Barang', width: '200px',
      render: (row: Record<string, unknown>) => {
        const namaBarang = row.namaBarang as string | null;
        if (!namaBarang) return EMPTY_CELL;
        return <span className="block max-w-[200px] truncate text-gray-700" title={namaBarang}>{namaBarang}</span>;
      },
    },
    {
      // Satu kolom, dua kemungkinan pihak: nama vendor untuk pembelian biasa,
      // nama karyawan untuk baris gaji (lihat `vendorName` di ExpenseEntry).
      key: 'vendorName', label: 'Vendor / Karyawan', width: '160px',
      render: (row: Record<string, unknown>) => <SoftBadge value={row.vendorName as string} tone="vendor" />,
    },
    {
      key: 'quantity', label: 'Jumlah', align: 'right' as const, width: '80px',
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums text-gray-700">{String(row.quantity)}</span>
      ),
    },
    {
      key: 'unitPrice', label: 'Harga/Item', align: 'right' as const, width: '110px',
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums text-gray-700">{formatCurrency(row.unitPrice as number)}</span>
      ),
    },
    {
      key: 'total', label: 'Total', align: 'right' as const, width: '120px',
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums text-gray-700">{formatCurrency(row.total as number)}</span>
      ),
    },
    {
      key: 'shippingAdmin', label: 'Ongkir + Admin', align: 'right' as const, width: '120px',
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums text-gray-700">
          {(row.shippingAdmin as number) ? formatCurrency(row.shippingAdmin as number) : EMPTY_CELL}
        </span>
      ),
    },
    {
      key: 'discountCashback', label: 'Discount/Cashback', align: 'right' as const, width: '130px',
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums text-gray-700">
          {(row.discountCashback as number) ? formatCurrency(row.discountCashback as number) : EMPTY_CELL}
        </span>
      ),
    },
    {
      key: 'totalPayment', label: 'Total Payment', align: 'right' as const, width: '130px',
      // Nominal TIDAK bold — permintaan user.
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums text-gray-900">{formatCurrency(row.totalPayment as number)}</span>
      ),
    },
    {
      key: 'flowTransaction', label: 'Flow Transaction', width: '150px',
      render: (row: Record<string, unknown>) => <SoftBadge value={row.flowTransaction as string} tone="flow" />,
    },
    {
      key: 'proofPayment', label: 'Proof Payment from PIC', align: 'center' as const, width: '150px',
      render: (row: Record<string, unknown>) => {
        const url = row.proofPaymentUrl as string | null;
        if (!url) return EMPTY_CELL;
        return (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={cn(T_ROW_BTN, 'inline-flex text-slate-400 hover:bg-slate-50 hover:text-blue-700')}
            title="Lihat bukti pembayaran"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        );
      },
    },
    {
      key: 'pic', label: 'PIC', width: '140px',
      render: (row: Record<string, unknown>) => {
        const pic = row.pic as string | null;
        if (!pic) return EMPTY_CELL;
        return <span className="block max-w-[140px] truncate text-gray-700" title={pic}>{pic}</span>;
      },
    },
  ], []);

  // Hide/show kolom + freeze (persist per tabel). Dipanggil setelah
  // `expenseColumns` ada: urutan kolom itu yang dipakai hook untuk merapikan
  // daftar beku menjadi awalan yang rapat — mesin pinning mengangkat kolom yang
  // di-pin ke depan mengikuti urutan tersebut, jadi daftar yang berlubang akan
  // mengubah urutan kolom di layar. Tidak ada `return` lebih awal di antara
  // keduanya, jadi urutan hook-nya tetap sama di setiap render.
  const expenseColumnKeys = useMemo(() => expenseColumns.map((c) => c.key), [expenseColumns]);
  const { hidden: hiddenCols, toggle: toggleCol, frozen: frozenCols, toggleFreeze: toggleFreezeCol, toggleFreezeAll: toggleFreezeAllCols, headerFrozen, setHeaderFrozen } = useColumnSettings('expense', expenseColumnKeys);

  const [bulkDeleting, setBulkDeleting] = useState(false);

  /**
   * Hapus massal. Dipanggil satu per satu, bukan satu operasi massal, karena
   * `remove()` memang bekerja per baris dan harus menghapus lampiran Storage
   * lebih dulu.
   *
   * Karena itu batch bisa **berhasil sebagian**, dan itu dilaporkan jujur:
   * berapa yang terhapus dan berapa yang gagal **beserta alasannya**. Hanya
   * melaporkan angka akan menyembunyikan baris mana yang masih ada.
   */
  const handleBulkDelete = useCallback(async () => {
    setBulkDeleting(true);
    setMessage(null);
    setErrorMessage(null);

    const targets = entries.filter((entry) => selectedRows.has(entry.id));
    let deleted = 0;
    const failures: string[] = [];

    for (const entry of targets) {
      const { error } = await expenseSvc.remove(entry);
      if (error) {
        failures.push(`${entry.namaBarang || entry.categoryPath}: ${error.message}`);
        continue;
      }
      deleted += 1;
    }

    setBulkDeleting(false);
    setSelectedRows(new Set());
    await refresh();

    if (failures.length === 0) {
      setMessage(`${deleted} catatan biaya dihapus.`);
    } else {
      const summary = deleted > 0 ? `${deleted} terhapus, ${failures.length} gagal` : 'Tidak ada yang terhapus';
      setErrorMessage(`${summary} — ${failures[0]}`);
    }
  }, [entries, selectedRows, refresh]);

  const filterFields: FieldOption[] = [
    { key: 'entryDate', label: 'Tanggal' },
    { key: 'vendorName', label: 'Vendor' },
    { key: 'categoryPath', label: 'Kategori' },
    { key: 'typeName', label: 'Type' },
    { key: 'note', label: 'Keterangan' },
    { key: 'amount', label: 'Nominal' },
    { key: 'inputBy', label: 'Input By' },
  ];

  const summary = useMemo(() => summarizeExpenses(visibleRows), [visibleRows]);
  const trend = useMemo(() => buildMonthlyTrend(visibleRows), [visibleRows]);

  /** Total bulan berjalan, dihitung dari SELURUH data (bukan hasil filter). */
  const thisMonthTotal = useMemo(() => {
    const current = new Date().toISOString().slice(0, 7);
    return entries
      .filter((entry) => entry.entryDate.startsWith(current))
      .reduce((total, entry) => total + entry.totalPayment, 0);
  }, [entries]);

  const monthOptions = useMemo(() => monthFilterOptions(entries), [entries]);
  const typeOptions = useMemo(() => valueOptions(entries, 'type'), [entries]);
  const mainOptions = useMemo(() => valueOptions(entries, 'mainCategory'), [entries]);

  // Setiap penyaring mengembalikan ke halaman 1 lewat pembungkus ini, BUKAN
  // lewat `useEffect`. Menyetel state di dalam effect memicu render berantai
  // dan ditolak `react-hooks/set-state-in-effect`; mengubahnya di tempat
  // penyaring berubah juga lebih jelas maksudnya.
  //
  // Tanpa reset, user yang berada di halaman 5 lalu mempersempit hasil akan
  // melihat halaman melompat tanpa sebab — `clampPage` menahan tabel tetap
  // terisi, tetapi halaman yang ditampilkan berubah sendiri.
  const applyFilter = useCallback((change: () => void) => {
    change();
    setPage(1);
  }, []);

  const handleSearch = useCallback((value: string) => applyFilter(() => setSearch(value)), [applyFilter]);
  const handleFilters = useCallback((value: FilterRule[]) => applyFilter(() => setFilters(value)), [applyFilter]);
  const handleSorts = useCallback((value: SortRule[]) => applyFilter(() => setSorts(value)), [applyFilter]);
  const handleMonth = useCallback((value: string) => applyFilter(() => setMonth(value)), [applyFilter]);
  const handleType = useCallback((value: string) => applyFilter(() => setType(value)), [applyFilter]);
  const handleMainCategory = useCallback((value: string) => applyFilter(() => setMainCategory(value)), [applyFilter]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setMessage(null);
    setErrorMessage(null);

    const { error } = await expenseSvc.remove(deleteTarget);
    setDeleting(false);
    setDeleteTarget(null);

    if (error) {
      setErrorMessage(`Gagal menghapus: ${error.message}`);
      return;
    }
    setMessage(`Catatan ${formatCurrency(deleteTarget.totalPayment)} dihapus.`);
    await refresh();
  }, [deleteTarget, refresh]);

  /**
   * Duplicate: menyalin baris jadi catatan BARU bertanggal hari ini, lalu
   * membuka form terisi — TIDAK langsung menulis ke database.
   *
   * Menyalin catatan biaya tanpa pemeriksaan berisiko mencatat pengeluaran yang
   * tidak pernah terjadi; membuka form dulu membuat user melihat nominal dan
   * tanggalnya sebelum menerbitkan. `id: 0` menandai "belum tersimpan" sehingga
   * dialog tahu ini pembuatan baru, bukan pengubahan baris sumbernya.
   */
  const handleDuplicate = useCallback((row: ExpenseEntry) => {
    setMessage(null);
    setErrorMessage(null);
    setEditTarget({
      ...row,
      id: 0,
      entryDate: new Date().toISOString().slice(0, 10),
      // Nota tidak ikut disalin: berkasnya milik catatan asal, dan menunjuk
      // berkas yang sama dari dua baris akan membuat penghapusan salah satu
      // menghapus lampiran yang masih dipakai baris lain.
      proofPath: null,
      proofUrl: null,
    });
    setDialogOpen(true);
  }, []);

  if (loading && entries.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Expense...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="px-6 pt-3 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Expense</h1>
          </div>
          <div className="flex items-center gap-2.5">
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
                <Plus className="w-3.5 h-3.5" /> Catat Biaya
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 pt-4 pb-5 overflow-auto">
        {/* Kartu ringkasan. Angka mengikuti slicer + pencarian supaya yang
            terbaca di kartu selalu sama dengan yang terlihat di tabel. */}
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label="Total Bulan Ini" value={formatCurrency(thisMonthTotal)} />
          <SummaryTile label="Total (terlihat)" value={formatCurrency(summary.total)} />
          <SummaryTile label="Jumlah Catatan" value={String(summary.count)} />
          <SummaryTile
            label="Kategori Teratas"
            value={summary.byMainCategory[0]?.name ?? '—'}
            hint={summary.byMainCategory[0] ? formatCurrency(summary.byMainCategory[0].total) : undefined}
          />
        </div>

        {/* Grafik tren bulanan. Dengan data yang masih sedikit, grafiknya akan
            tampak kosong atau satu batang — itu keadaan data, bukan kerusakan.

            Permukaan grafik SENGAJA mengikuti tema kartu (`bg-card`), bukan
            putih mati: warna batangnya divalidasi terhadap permukaan kartu di
            KEDUA mode (lihat TREND_CONFIG), jadi memaksakan latar putih di mode
            gelap akan membatalkan validasi itu. */}
        {trend.length > 0 && (
          <div className="mb-4 rounded-lg border border-border bg-card p-3.5">
            <p className="mb-3 text-[12px] font-semibold text-slate-700">Tren Biaya per Bulan</p>
            <ChartContainer config={TREND_CONFIG} className="h-[220px] w-full">
              <BarChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(value: number) => formatRupiahRingkas(value)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                  }
                />
                <Bar dataKey="total" fill="var(--color-total)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        )}

        {/* Bilah aksi massal — muncul hanya saat ada baris terpilih, memakai
            bentuk yang sudah dipakai tiga halaman lain. */}
        {canManage && selectedRows.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <span className="text-[12px] font-medium text-red-800">
              {selectedRows.size} catatan dipilih
            </span>
            <button
              type="button"
              onClick={() => void handleBulkDelete()}
              disabled={bulkDeleting}
              className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="h-8 px-2.5 text-[11px] rounded-lg font-medium text-red-700 hover:bg-red-100 transition-colors"
            >
              Bersihkan pilihan
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari keterangan..."
              value={search}
              onChange={(event) => handleSearch(event.target.value)}
              className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <Select value={month} onChange={handleMonth} options={monthOptions} placeholder="Semua bulan" />
          <Select value={type} onChange={handleType} options={typeOptions.map((v) => ({ value: v, label: v }))} placeholder="Semua Type" />
          <Select value={mainCategory} onChange={handleMainCategory} options={mainOptions.map((v) => ({ value: v, label: v }))} placeholder="Semua Main" />
          <FilterButton fields={filterFields} value={filters} onChange={handleFilters} />
          <SortButton fields={filterFields} value={sorts} onChange={handleSorts} />
          <ColumnSettingsButton fields={filterFields} hidden={hiddenCols} onToggle={toggleCol} frozen={frozenCols} onToggleFreeze={toggleFreezeCol} onToggleFreezeAll={toggleFreezeAllCols} headerFrozen={headerFrozen} onToggleHeaderFrozen={setHeaderFrozen} />
          <ExportButton
            onClick={() => {
              const csv = expensesToCsv(visibleRows);
              const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
              const link = document.createElement('a');
              link.href = url;
              link.download = `expense-${new Date().toISOString().slice(0, 10)}.csv`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          />
          <span className="text-[11px] text-slate-400 ml-auto">
            {visibleRows.length} dari {entries.length} catatan
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
            columns={expenseColumns}
            data={pagedRows as unknown as Record<string, unknown>[]}
            selectedRows={selectedRows}
            onToggleRow={handleToggleRow}
            rowActions={canManage ? (row) => {
              const entry = row as unknown as ExpenseEntry;
              // Baris GAJI hanya boleh ditulis finance — owner melihat saja.
              // Tanpa gerbang ini, tombol Edit/Delete muncul untuk owner lalu
              // gagal senyap karena RLS menolaknya.
              const canWrite = entry.staffId === null || canEditSalary(profile.role);
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(T_ROW_BTN, 'text-slate-400 hover:bg-slate-100 hover:text-slate-700')}
                      title="Aksi"
                      aria-label={`Aksi untuk catatan ${entry.categoryPath}`}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setViewTarget(entry)} className="text-[12px] gap-2">
                      <Eye className="w-3.5 h-3.5" /> View
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => { setEditTarget(entry); setDialogOpen(true); }}
                      disabled={!canWrite}
                      title={canWrite ? undefined : SALARY_EDIT_HINT}
                      className="text-[12px] gap-2"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setReceiptTarget(entry)}
                      disabled={!canWrite}
                      title={canWrite ? undefined : SALARY_EDIT_HINT}
                      className="text-[12px] gap-2"
                    >
                      <Paperclip className="w-3.5 h-3.5" /> Attach Receipt
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDuplicate(entry)}
                      disabled={!canWrite}
                      title={canWrite ? undefined : SALARY_EDIT_HINT}
                      className="text-[12px] gap-2"
                    >
                      <Copy className="w-3.5 h-3.5" /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteTarget(entry)}
                      disabled={!canWrite}
                      title={canWrite ? undefined : SALARY_EDIT_HINT}
                      className="text-[12px] gap-2 text-rose-600 focus:text-rose-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            } : undefined}
            actionsLabel="Actions"
            hiddenColumns={hiddenCols}
            frozenColumns={frozenCols}
            headerFrozen={headerFrozen}
            totalCount={visibleRows.length}
            page={safePage}
            pageSize={LOG_PAGE_SIZE}
            onPageChange={setPage}
            emptyMessage={
              <div className="py-10 text-center text-[13px] text-gray-400">
                {entries.length === 0 ? 'Belum ada catatan biaya' : 'Tidak ada hasil yang cocok dengan filter'}
              </div>
            }
          />
        </div>
      </div>

      <ExpenseDialog
        key={editTarget ? `edit-${editTarget.id}` : 'new'}
        open={dialogOpen}
        categories={categories}
        vendors={vendors}
        staffNames={staffNames}
        staffs={staffs}
        initial={editTarget}
        actor={profile.displayName ?? null}
        onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditTarget(null); } }}
        onSaved={(savedMessage) => {
          // Dibaca SEBELUM state dibersihkan di bawah: `id: 0` adalah penanda
          // "belum tersimpan" yang dipakai jalur Duplicate, dan `null` adalah
          // jalur "Catat Biaya". Keduanya pembuatan baru; selain itu berarti
          // pengubahan baris yang sudah ada.
          const isNew = editTarget === null || editTarget.id === 0;
          setDialogOpen(false);
          setEditTarget(null);
          setErrorMessage(null);
          setMessage(savedMessage);
          // Tabel ini kronologis (terlama di atas), jadi baris yang baru
          // disimpan — bertanggal hari ini — ada di halaman TERAKHIR, bukan
          // halaman 1. Tanpa lompat ini user menyimpan lalu tidak melihat apa
          // pun berubah. Hanya untuk PEMBUATAN BARU: menyunting baris di tengah
          // daftar tidak boleh melempar user ke halaman terakhir.
          //
          // Catatan jujur: bila user sengaja memilih tanggal mundur, barisnya
          // masuk ke posisi kronologisnya, bukan ke paling bawah — jadi lompatan
          // ini bisa berhenti di halaman yang tidak memuatnya. Perilaku itu
          // memang konsekuensi urutan tanggal, dan user tetap bisa menavigasi.
          if (isNew) setPage(LAST_PAGE);
          void refresh();
        }}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[14px]">Hapus catatan biaya?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-[13px]">
                <p className="font-mono text-[12px]">
                  {deleteTarget?.categoryPath} — {deleteTarget ? formatCurrency(deleteTarget.totalPayment) : ''}
                </p>
                {deleteTarget?.proofUrl && (
                  <p>Foto nota yang terlampir ikut terhapus <strong>permanen</strong>.</p>
                )}
                <p>Catatan ini tidak bisa dikembalikan setelah dihapus.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Kembali</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); void handleDelete(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View — memakai dialog yang sama dengan mode baca, bukan dialog kedua,
          supaya keduanya tidak bisa berbeda soal cara menampilkan isi. */}
      <ExpenseDialog
        key={`view-${viewTarget?.id ?? 'none'}`}
        open={viewTarget !== null}
        categories={categories}
        vendors={vendors}
        staffNames={staffNames}
        staffs={staffs}
        initial={viewTarget}
        readOnly
        actor={profile.displayName ?? null}
        onOpenChange={(open) => { if (!open) setViewTarget(null); }}
        onSaved={() => setViewTarget(null)}
      />

      <AttachReceiptDialog
        key={`receipt-${receiptTarget?.id ?? 'none'}`}
        open={receiptTarget !== null}
        entry={receiptTarget}
        onOpenChange={(open) => { if (!open) setReceiptTarget(null); }}
        onDone={(receiptMessage) => {
          setReceiptTarget(null);
          setErrorMessage(null);
          setMessage(receiptMessage);
          void refresh();
        }}
        onError={(receiptError) => {
          setReceiptTarget(null);
          setErrorMessage(receiptError);
        }}
      />
    </main>
  );
}

const TREND_CONFIG = {
  /**
   * Warna batang tren — **satu-satunya seri**, jadi tidak ada legenda dan tidak
   * ada pasangan warna yang perlu dipisahkan.
   *
   * Warna ini BUKAN pilihan selera; ia dijalankan lewat validator palet
   * (dataviz) terhadap permukaan kartu proyek, dan hasilnya:
   *   #2a78d6 di permukaan putih  → SEMUA pemeriksaan lulus (kontras 3:1)
   *   #3987e5 di permukaan gelap  → SEMUA pemeriksaan lulus (kontras 3:1)
   * Nilainya juga sama dengan warna grafik yang sudah dipakai
   * `src/components/Laporan/TargetJahitCharts.tsx`, jadi kedua halaman
   * tampil sebagai satu sistem.
   *
   * TINGKAT YANG LEBIH MUDAH sudah dicoba dan DITOLAK, bukan dilewatkan:
   * `#7DD3FC` (sky-300) kontrasnya hanya 1,67:1 — batangnya nyaris tak terlihat;
   * `#5598E7` dan `#6DA7EC` lolos di mode terang tetapi **gagal di mode gelap**
   * (L 0,671 dan 0,717 melewati batas atas 0,67). Jadi tingkat ini adalah yang
   * paling muda yang masih sah di KEDUA mode.
   *
   * CATATAN UNTUK SESI BERIKUTNYA: jangan menambah seri kedua dengan violet
   * (aksen app ini). `#8B5CF6` terhadap `#3987E5` hanya berjarak ΔE 4,1
   * (deutan) dan 13,5 (penglihatan normal) — di bawah ambang 15, jadi pasangan
   * itu sulit dibedakan bahkan oleh mata normal. Kalau kelak perlu seri kedua
   * (mis. pemasukan vs pengeluaran), pakai pasangan biru/oranye yang sudah
   * divalidasi di TargetJahitCharts, bukan violet.
   */
  total: { label: 'Total Biaya', theme: { light: '#2a78d6', dark: '#3987e5' } },
} satisfies ChartConfig;

function SummaryTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-[15px] font-semibold tabular-nums text-slate-900" title={value}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

/** Dropdown kecil untuk slicer, memakai `<select>` native seperti Toolbar lain. */
function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 px-2 text-[11px] border border-gray-200 rounded-lg bg-white text-slate-600 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

export default ExpensePage;
