import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  Trash2,
  Table2,
  Kanban,
  MoreHorizontal,
  Pencil,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogEntryDialog } from '@/components/Modals/LogEntryDialog';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/data/pipelineData';
import * as workOrderSvc from '@/services/workOrders';
import * as cuttingRecordSvc from '@/services/cuttingRecords';
import * as sewingRecordSvc from '@/services/sewingRecords';
import * as finishingRecordSvc from '@/services/finishingRecords';
import * as kancingRecordSvc from '@/services/kancingRecords';
import { fetchAll as fetchAllKaryawan, activePenjahitNames } from '@/services/registerPenjahit';
import type { WorkOrder, SewingRecord, CuttingRecord, FinishingRecord, KancingRecord, ProductionStatus, VariasiStatus } from '@/types/pipeline';
import { productionStatusLabel, productionStatusColor } from '@/types/pipeline';
import { STATUS_ORDER, deriveStatus, validateStatusTransition, deriveVariasiStatuses, variasiStatusText, needsUpPos, NEED_UP_POS_LABEL } from '@/lib/productionStatus';
import { VariasiStatusBadge } from '@/components/Production/VariasiStatusBadge';
import { buildKanbanGroups, type KanbanGroup } from '@/lib/kanban';
import { matchesPoJump } from '@/lib/poJump';
import { PoFilterBanner } from '@/components/Table/PoFilterBanner';
import type { PoJump } from '@/types';
import {
  LAPORAN_KIND_BY_TAB,
  buildKodeList,
  buildLogRows,
  scopedLaporanRows,
  sumLogQty,
  type LogTab,
} from '@/lib/logDashboard';
import { PillTabs, type PillTabItem } from '@/components/Production/PillTabs';
import { StatusBadge } from '@/components/Production/StatusBadge';
import { KodeProduksiList } from '@/components/Production/KodeProduksiList';
import { LogTable } from '@/components/Production/LogTable';
import { LogDashboardPanel } from '@/components/Production/LogDashboardPanel';
import { KanbanCardDetail } from '@/components/Production/KanbanCardDetail';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import {
  EMPTY_FILTERS,
  PIC_LABEL,
  applyLaporanFilters,
  type LaporanKind,
  type LaporanRow,
  type LaporanFilters,
} from '@/lib/laporanCompute';
import { canEditProductionLog, PRODUCTION_LOG_EDIT_HINT } from '@/lib/permissions';
import { T_WRAP, T_SUB_LABEL, T_ROW_BTN, softBadgeClass } from '@/lib/tableStyles';
import { DataTable } from '@/components/Table/DataTable';
import { FilterButton, SortButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton, type ColumnOption } from '@/components/Table/ColumnSettings';
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';

// Tabel log kini punya kontrol pagination di bawahnya, jadi tingginya dikurangi
// agar tabel + kontrol itu masih muat di satu layar. (Dipakai LogTable.)

// Tab: Raw Data dan Kanban digabung menjadi satu tab ALL (default Kanban,
// dengan toggle ke List), sedangkan tiga tab log punya panel dashboard.
type TabType = 'all' | 'cutting' | 'sewing' | 'finishing' | 'kancing';

// Tab yang punya panel dua-kolom (daftar kode produksi + dashboard).
const LOG_TABS: LogTab[] = ['sewing', 'kancing', 'finishing'];

function isLogTab(tab: TabType): tab is LogTab {
  return (LOG_TABS as TabType[]).includes(tab);
}

// Pilihan tampilan untuk tab ALL. Diingat selama sesi (state React), bukan
// localStorage — keputusan user.
type AllView = 'board' | 'list';

// Shared data-table design system — see src/lib/tableStyles.ts
// (zebra rows, sticky header, horizontal-only borders, formal typography).

// ===== Status Badge =====
// Dipindah ke '@/components/Production/StatusBadge' supaya panel kiri Kode
// Produksi bisa memakainya tanpa mengimpor halaman ini.

// ===== KanbanCard (per Kode Produksi Konveksi) =====
// KanbanGroup & aturan status kartunya tinggal di '@/lib/kanban' supaya bisa
// diuji tanpa merender halaman ini.

function KanbanCard({
  group,
  isDragging,
  onOpen,
}: {
  group: KanbanGroup;
  isDragging?: boolean;
  onOpen: (g: KanbanGroup) => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: group.productNote });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onOpen(group);
  };

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style}
      onClick={handleClick}
      className={cn('bg-white rounded-[14px] border border-[#E5E7EB] shadow-sm p-[14px] hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-md transition-all duration-200 ease-out cursor-pointer w-full max-w-[350px] touch-none', isDragging && 'opacity-50 scale-105 shadow-lg')}>
      <div className="flex items-start justify-between gap-2 mb-[10px]">
        <span className="text-[11px] font-mono font-bold leading-[1.3] text-slate-900 truncate flex-1 min-w-0">{group.productNote}</span>
        <StatusBadge status={group.status} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold leading-[1.4] text-slate-800">{group.product} · {group.brand}</span>
        {/* Kode Produksi Client adalah identitas yang dicari user, sedangkan
            judul kartu = Kode Produksi Konveksi (product note). */}
        <span className="text-[11px] font-mono text-slate-500 truncate" title={group.clientProductionCode ?? undefined}>
          {group.clientProductionCode || '—'}
        </span>
        {/* Total qty = 0 berarti "belum diterima dari POS client" (input qty
            manual sudah dihapus dari Order Entry), bukan order kosong. Karena
            kartu ini menjumlahkan seluruh variasi kode produksi, angka 0 akan
            terbaca salah — jadi ditampilkan sebagai tanda pisah. */}
        <span className="text-[12px] font-bold text-slate-900">
          {group.totalQty > 0 ? `Total qty: ${group.totalQty} pcs` : 'Qty: belum dari POS'}
        </span>
      </div>
    </div>
  );
}

// ===== KanbanColumn =====
function KanbanColumn({ status, label, color, groups, searchQuery, onOpen }: { status: string; label: string; color: string; groups: KanbanGroup[]; searchQuery: string; onOpen: (g: KanbanGroup) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const filtered = searchQuery ? groups.filter(g => {
    const q = searchQuery.toLowerCase();
    return g.productNote.toLowerCase().includes(q) || g.product.toLowerCase().includes(q) || g.brand.toLowerCase().includes(q) || (g.clientProductionCode || '').toLowerCase().includes(q);
  }) : groups;
  return (
    <div className="w-[350px] flex flex-col">
      <div className={cn('rounded-t-lg px-4 py-3 flex items-center justify-between', color, isOver && 'ring-2 ring-slate-500')}>
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="text-[11px] font-bold bg-white/30 px-2 py-0.5 rounded-full">{groups.length}</span>
      </div>
      <div ref={setNodeRef} className="flex-1 bg-slate-50 rounded-b-lg p-3 space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto min-h-[80px]">
        {filtered.length === 0 ? <div className="text-center py-8 text-slate-400 text-[12px]">No work orders</div> : filtered.map(g => <KanbanCard key={g.productNote} group={g} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

// ===== Filter & Sort (RAW master table) =====
// Urutan HARUS sama dengan urutan <th> di tabel — dipakai juga sebagai urutan
// dropdown Filter/Sort/Atur kolom.
// `key` adalah kunci kolom yang tersimpan di preferensi "atur kolom" user, jadi
// jangan diubah walau labelnya berganti: mengubahnya akan mengembalikan kolom
// yang sudah disembunyikan user.
//
// Tingkat modul, bukan di dalam komponen: isinya murni literal, dan array yang
// dibuat ulang tiap render akan membatalkan memo `rawColumnKeys` di bawah.
const RAW_FIELDS: FieldOption[] = [
  { key: 'productNote', label: 'Kode Produksi Konveksi' },
  { key: 'clientProductionCode', label: 'Kode Produksi Client' },
  { key: 'createdAt', label: 'Date Created' },
  { key: 'brand', label: 'Client' },
  { key: 'product', label: 'Product' },
  { key: 'productId', label: 'Product ID' },
  { key: 'variationId', label: 'Variation ID' },
  { key: 'informationVariation', label: 'Information Variation' },
  { key: 'warna', label: 'Warna' },
  { key: 'size', label: 'Size' },
  { key: 'cuttingTotal', label: 'Cutting' },
  { key: 'sewingTotal', label: 'Jahit' },
  { key: 'kancingTotal', label: 'Kancing' },
  { key: 'finishingTotal', label: 'Finishing' },
  { key: 'sisa', label: 'Sisa Cutting' },
  // Judul "Qty Diterima Client" (dulu "Qty", lalu sempat "Qty Order") —
  // permintaan user (verbatim): "Kolom QTY atau quantity itu jadi stok
  // diterima klien … soalnya ini tuh lebih kayak kuantitas yang udah diupload
  // ke sistem POS klien."
  //
  // Posisinya di ujung kanan blok produksi, tepat setelah "Sisa Cutting" —
  // permintaan user: "pindahkan ke samping kanan Sisa Cutting". Karena
  // RAW_FIELDS juga menjadi urutan dropdown Filter/Sort/Atur kolom, kolom ini
  // ikut pindah di ketiganya (memang itu yang diinginkan: satu urutan untuk
  // satu tabel). `key` sengaja TIDAK diubah, lihat catatan di atas.
  //
  // Sumber angkanya `work_orders.quantity`. Sejak input qty manual dihapus
  // dari Order Entry (permintaan user: "kOlOm quantity harusnya dihapus aja"),
  // kolom ini bernilai **0 untuk setiap order baru** sampai sinkronisasi
  // Pancake POS mengisinya — jadi 0 di sini berarti "belum diterima dari
  // client", bukan "nol pcs". Selnya menampilkan tanda pisah untuk 0, bukan
  // angka 0, supaya tidak terbaca sebagai order kosong.
  //
  // Kolom POS tersendiri belum ada di database (diverifikasi lewat Supabase
  // MCP: `work_orders` cuma punya satu kolom `quantity`, tidak ada
  // `qty_pos`/`synced_qty`/`stok`), jadi sinkronisasi nanti menimpa kolom ini
  // alih-alih menambah kolom baru.
  { key: 'quantity', label: 'Qty Diterima Client' },
  { key: 'derivedStatus', label: 'Status' },
  // Dua kolom turunan dari permintaan user: status level-1 per variasi, dan
  // alert "Need Up POS". Nilainya diambil dari field teks di `flatRows` (bukan
  // dari `variasiStatuses`/`upPos` mentah) supaya Filter & Sort bekerja pada
  // string yang sama dengan yang dilihat user.
  { key: 'variasiStatusLabel', label: 'Status Variasi' },
  { key: 'upPosLabel', label: 'Need Up POS' },
  { key: 'createdBy', label: 'Created By' },
];
// Kolom Foto ikut daftar "atur kolom" tetapi tidak ikut Filter/Sort: ia
// berisi <img>, bukan nilai yang bisa dibandingkan. Posisinya disisipkan
// sesuai urutan tampilan (setelah Client).
const RAW_COLUMNS: ColumnOption[] = [
  ...RAW_FIELDS.slice(0, 4),
  { key: 'photo', label: 'Foto' },
  ...RAW_FIELDS.slice(4),
];

// ===== Main Page =====
export default function ProductionMonitoring({ poJump, onClearPoJump, onOpenSewingEntry, onOpenFinishingEntry, onOpenKancingEntry }: { poJump?: PoJump | null; onClearPoJump?: () => void; onOpenSewingEntry?: () => void; onOpenFinishingEntry?: () => void; onOpenKancingEntry?: () => void }) {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  // Tampilan tab ALL: Kanban (default) atau List. Diingat selama sesi.
  const [allView, setAllView] = useState<AllView>('board');
  // Kode produksi yang dipilih di panel kiri tab log; null = seluruh kode.
  // Dipisah per tab agar pilihan di Sewing tidak terbawa ke Finishing —
  // kode yang ada di satu log belum tentu punya catatan di log lain.
  const [selectedKode, setSelectedKode] = useState<Record<string, string | null>>({});
  // Filter slicer panel log, juga dipisah per tab.
  //
  // Diangkat ke halaman (bukan state di dalam LogDashboardPanel) supaya tabel
  // di bawah panel memakai filter yang SAMA. Sebelumnya filter hanya hidup di
  // dalam panel, jadi mengubah bulan/PIC mengubah KPI tetapi tabelnya tetap
  // menampilkan semua baris.
  const [logFilters, setLogFilters] = useState<Record<string, LaporanFilters>>({});
  const [searchQuery, setSearchQuery] = useState('');
  // Halaman aktif untuk tabel log (Sewing / Kancing / Finishing). Satu state
  // dipakai bertiga karena cuma satu log yang tampil pada satu waktu; ia
  // direset setiap kali tab atau kata kunci pencarian berubah, supaya user
  // tidak berakhir di halaman 5 yang tiba-tiba kosong.
  const [logPage, setLogPage] = useState(1);
  const [cuttingInputs, setCuttingInputs] = useState<Record<string, string>>({});
  const [cuttingMessage, setCuttingMessage] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [rawFilters, setRawFilters] = useState<FilterRule[]>([]);
  const [rawSorts, setRawSorts] = useState<SortRule[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [cuttingRecords, setCuttingRecords] = useState<CuttingRecord[]>([]);
  const [sewingRecords, setSewingRecords] = useState<SewingRecord[]>([]);
  const [finishingRecords, setFinishingRecords] = useState<FinishingRecord[]>([]);
  const [kancingRecords, setKancingRecords] = useState<KancingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<KanbanGroup | null>(null);
  // Nama karyawan Aktif berposisi Penjahit (Register Karyawan → Contact →
  // Karyawan). Dipakai dialog ubah log sebagai pilihan PIC. Sumbernya helper
  // yang sama dengan Entry Jahitan (`activePenjahitNames`), jadi dropdown PIC
  // tidak bisa berbeda antara form input dan form ubah.
  const [penjahitNames, setPenjahitNames] = useState<string[]>([]);

  const { profile } = useAuth();
  const currentDisplayName = profile.displayName;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [wo, cr, sr, fr, kr] = await Promise.all([workOrderSvc.fetchAll(), cuttingRecordSvc.fetchAll(), sewingRecordSvc.fetchAll(), finishingRecordSvc.fetchAll(), kancingRecordSvc.fetchAll()]);
      if (wo.data) setWorkOrders(wo.data);
      if (cr.data) setCuttingRecords(cr.data);
      if (sr.data) setSewingRecords(sr.data);
      if (fr.data) setFinishingRecords(fr.data);
      if (kr.data) setKancingRecords(kr.data);
      setLoading(false);
    })();
  }, []);

  // Daftar nama penjahit untuk dialog ubah. Dimuat terpisah dari blok utama
  // supaya kegagalan memuatnya tidak menahan seluruh halaman di layar Loading —
  // dialog ubah tetap bisa dibuka dengan nama PIC dari baris log saja.
  useEffect(() => {
    fetchAllKaryawan().then(({ data }) => {
      setPenjahitNames(activePenjahitNames(data ?? []));
    });
  }, []);

  const filteredWO = useMemo(() => {
    // Lompatan dari nomor PO di Register Harga: saring ke satu order. Kunci
    // relasinya `sourceOrderId` (FK ke `production_orders.id`), dengan
    // `productNote` sebagai cadangan — lihat `matchesPoJump`.
    const scoped = workOrders.filter((w) =>
      matchesPoJump(poJump, { orderId: w.sourceOrderId, code: w.productNote }),
    );
    if (!searchQuery) return scoped;
    const q = searchQuery.toLowerCase();
    return scoped.filter(w =>
      w.workCode.toLowerCase().includes(q) ||
      w.product.toLowerCase().includes(q) ||
      w.brand.toLowerCase().includes(q) ||
      (w.warna || '').toLowerCase().includes(q) ||
      (w.productNote || '').toLowerCase().includes(q) ||
      (w.clientProductionCode || '').toLowerCase().includes(q) ||
      (w.productId || '').toLowerCase().includes(q) ||
      (w.variationId || '').toLowerCase().includes(q) ||
      (w.informationVariation || '').toLowerCase().includes(q) ||
      (w.size || '').toLowerCase().includes(q),
    );
  }, [workOrders, searchQuery, poJump]);

  // Stabil lewat useCallback: keempatnya dibaca `decoratedWO`, dan sebelum
  // dibungkus, dep array memo itu memang tidak lengkap. Warnanya dulu hanya
  // `exhaustive-deps`; setelah blok pull dihapus, komponen jadi cukup sederhana
  // sehingga React Compiler mencoba mengompilasinya dan ketidaklengkapan yang
  // sama naik menjadi error `preserve-manual-memoization`. Menstabilkan
  // fungsinya memperbaiki akarnya, bukan menekan gejalanya.
  const getCuttingForWO = useCallback(
    (woId: string) => cuttingRecords.find(c => c.workOrderId === woId),
    [cuttingRecords],
  );
  const getSewingTotalLocal = useCallback(
    (woId: string) => sewingRecords.filter(s => s.workOrderId === woId).reduce((sum, r) => sum + r.qtySelesai, 0),
    [sewingRecords],
  );
  const getFinishingTotalLocal = useCallback(
    (woId: string) => finishingRecords.filter(f => f.workOrderId === woId).reduce((sum, r) => sum + (Number(r.qtyFinishing) || 0), 0),
    [finishingRecords],
  );
  const getKancingTotalLocal = useCallback(
    (woId: string) => kancingRecords.filter(k => k.workOrderId === woId).reduce((sum, r) => sum + (Number(r.qtyKancing) || 0), 0),
    [kancingRecords],
  );

  // Decorate each WO with cutting/sewing totals and derived status so filters + Kanban
  // reflect actual production progress even when prod_status in DB is stale.
  // Sort oldest first → newest at bottom (natural reading order)
  const decoratedWO = useMemo(() => {
    return filteredWO
      .map((wo) => {
        const cuttingTotal = getCuttingForWO(wo.id)?.totalCutting ?? 0;
        const sewingTotal = getSewingTotalLocal(wo.id);
        const finishingTotal = getFinishingTotalLocal(wo.id);
        const kancingTotal = getKancingTotalLocal(wo.id);
        const orderQty = Number(wo.quantity) || 0;
        const status = deriveStatus(cuttingTotal, sewingTotal, orderQty, kancingTotal, finishingTotal);
        const variasiStatuses = deriveVariasiStatuses({ cuttingTotal, sewingTotal, finishingTotal, kancingTotal, orderQty });
        // Revisi 2026-09-28: alert ditentukan HANYA oleh finishing vs Qty —
        // jahit tidak lagi ikut dibandingkan. Lihat catatan di `needsUpPos`.
        const upPos = needsUpPos(finishingTotal, orderQty);
        return { ...wo, cuttingTotal, sewingTotal, finishingTotal, kancingTotal, derivedStatus: status, variasiStatuses, upPos };
      })
      .sort((a, b) => {
        const da = a.createdAt || a.pulledAt || '';
        const db = b.createdAt || b.pulledAt || '';
        return da.localeCompare(db); // oldest first → newest at bottom
      });
  }, [filteredWO, getCuttingForWO, getSewingTotalLocal, getFinishingTotalLocal, getKancingTotalLocal]);

  // Group decorated WOs by Kode Produksi Konveksi for the Kanban.
  // Aturan status kartu (status TERENDAH, bukan tertinggi) beserta alasannya
  // ada di src/lib/kanban.ts — diuji di tests/kanban.test.ts.
  const kanbanGroups = useMemo<KanbanGroup[]>(() => buildKanbanGroups(decoratedWO), [decoratedWO]);

  // ===== CUTTING =====
  const cuttingQueueWO = decoratedWO.filter(w => w.derivedStatus === 'NEW');
  const cuttingDoneWO = decoratedWO.filter(w => w.derivedStatus !== 'NEW');

  // Riwayat cutting menampilkan kolom cutting record, jadi record-nya
  // digabungkan ke baris WO di sini — sel tidak perlu lagi mencari sendiri ke
  // array cuttingRecords lewat `getCuttingForWO`.
  const cuttingHistoryRows = useMemo(
    () => cuttingDoneWO.map((wo) => {
      const cr = getCuttingForWO(wo.id);
      return {
        ...wo,
        totalCutting: cr?.totalCutting,
        sisaCutting: cr?.sisaCutting,
        inputBy: cr?.inputBy,
        inputAt: cr?.inputAt,
      };
    }),
    [cuttingDoneWO, getCuttingForWO],
  );

  // Kolom tabel Antrian Cutting. Kolom Cutting + Action memuat input dan tombol
  // simpan, jadi keduanya dirender sendiri lewat `render`; tabel bersama tidak
  // perlu tahu soal state input per-baris.
  const cuttingQueueColumns = useMemo(() => [
    {
      key: 'product', label: 'Produk', width: '260px',
      render: (row: Record<string, unknown>) => (
        <div className="min-w-[240px]">
          <div className="font-medium text-gray-900">{String(row.product ?? '')}</div>
          <div className={cn(T_SUB_LABEL, 'truncate')} title={String(row.workCode ?? '')}>{String(row.workCode ?? '')}</div>
        </div>
      ),
    },
    {
      key: 'brand', label: 'Client', width: '130px',
      render: (row: Record<string, unknown>) => <span className="text-gray-700">{String(row.brand ?? '')}</span>,
    },
    {
      // Judul "Qty Diterima Client" — angka ini qty pesanan/klien, bukan stok
      // dari POS. Lihat catatan lengkap di RAW_FIELDS. Lebar 150px karena
      // judulnya panjang dan `T_TH` memakai `whitespace-nowrap`.
      //
      // 0 = belum diterima dari POS client (input qty manual sudah dihapus dari
      // Order Entry), jadi ditampilkan sebagai "—", bukan "0".
      key: 'quantity', label: 'Qty Diterima Client', width: '150px', align: 'right' as const,
      render: (row: Record<string, unknown>) => {
        const qty = Number(row.quantity) || 0;
        if (qty <= 0) return <span className="text-gray-300">—</span>;
        return <span className="font-medium tabular-nums text-gray-900">{qty}</span>;
      },
    },
    {
      key: 'cutting', label: 'Cutting', width: '130px', align: 'center' as const,
      render: (row: Record<string, unknown>) => {
        const id = String(row.id);
        return (
          <input
            type="number"
            value={cuttingInputs[id] || ''}
            onChange={e => setCuttingInputs(prev => ({ ...prev, [id]: e.target.value }))}
            className="w-24 h-8 px-2 text-[13px] border border-gray-300 rounded-md text-center focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 tabular-nums"
          />
        );
      },
    },
    {
      key: 'action', label: 'Action', width: '100px', align: 'center' as const,
      render: (row: Record<string, unknown>) => (
        <button
          onClick={() => void handleInputCutting(String(row.id))}
          className="px-3.5 py-1.5 text-[12px] font-medium bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
        >
          Simpan
        </button>
      ),
    },
  // `handleInputCutting` is recreated every render, so listing it here would
  // rebuild the columns on every keystroke and remount the inputs mid-typing.
  // The columns only close over it to call it; the latest closure is always the
  // one on the page's own render, so the reference is deliberately not tracked.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [cuttingInputs]);

  // Kolom tabel Riwayat Cutting — baca-saja, semua dari cutting record.
  const cuttingHistoryColumns = useMemo(() => [
    {
      key: 'product', label: 'Produk', width: '260px',
      render: (row: Record<string, unknown>) => (
        <div className="min-w-[240px]">
          <div className="font-medium text-gray-900">{String(row.product ?? '')}</div>
          <div className={cn(T_SUB_LABEL, 'truncate')} title={String(row.workCode ?? '')}>{String(row.workCode ?? '')}</div>
        </div>
      ),
    },
    {
      // Judul "Qty Diterima Client" — angka ini qty pesanan/klien, bukan stok
      // dari POS. Lihat catatan lengkap di RAW_FIELDS. Lebar 150px karena
      // judulnya panjang dan `T_TH` memakai `whitespace-nowrap`.
      //
      // 0 = belum diterima dari POS client (input qty manual sudah dihapus dari
      // Order Entry), jadi ditampilkan sebagai "—", bukan "0".
      key: 'quantity', label: 'Qty Diterima Client', width: '150px', align: 'right' as const,
      render: (row: Record<string, unknown>) => {
        const qty = Number(row.quantity) || 0;
        if (qty <= 0) return <span className="text-gray-300">—</span>;
        return <span className="tabular-nums text-gray-700">{qty}</span>;
      },
    },
    {
      key: 'totalCutting', label: 'Cutting', width: '90px', align: 'right' as const,
      render: (row: Record<string, unknown>) => (
        <span className="font-medium tabular-nums text-emerald-600">{String(row.totalCutting ?? '—')}</span>
      ),
    },
    {
      key: 'sisaCutting', label: 'Sisa Cutting', width: '110px', align: 'right' as const,
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums text-gray-500">{String(row.sisaCutting ?? '—')}</span>
      ),
    },
    {
      key: 'inputBy', label: 'Input By', width: '130px',
      render: (row: Record<string, unknown>) => <span className="text-gray-700">{String(row.inputBy ?? '—')}</span>,
    },
    {
      key: 'inputAt', label: 'Tanggal', width: '120px',
      render: (row: Record<string, unknown>) => (
        <span className="whitespace-nowrap text-gray-700">{row.inputAt ? formatDate(String(row.inputAt)) : '—'}</span>
      ),
    },
  ], []);

  const handleInputCutting = async (woId: string) => {
    const val = cuttingInputs[woId];
    if (!val || isNaN(Number(val)) || Number(val) <= 0) { setCuttingMessage('Masukkan jumlah cutting yang valid!'); return; }
    const qty = Number(val);
    const wo = workOrders.find(w => w.id === woId);
    if (!wo) return;
    const { data: newCR, error } = await cuttingRecordSvc.create({
      workOrderId: woId, totalCutting: qty, sisaCutting: qty - wo.quantity, inputBy: currentDisplayName, inputAt: new Date().toISOString().split('T')[0], locked: true,
    });
    if (error) { setCuttingMessage(`❌ ${error.message}`); return; }
    // Cutting terisi → status langsung PROGRESS (tidak ada status CUTTING lagi).
    // Dihitung lewat deriveStatus, bukan hardcode, supaya WO yang jahitnya sudah
    // penuh tidak salah turun ke PROGRESS. Kancing & finishing ikut dihitung
    // karena FINISHED sekarang menunggu keduanya (revisi 2026-09-28).
    const nextStatus = deriveStatus(
      qty,
      getSewingTotalLocal(woId),
      wo.quantity,
      getKancingTotalLocal(woId),
      getFinishingTotalLocal(woId),
    );
    await workOrderSvc.updateProdStatus(woId, nextStatus);
    if (newCR) setCuttingRecords(prev => [...prev, newCR]);
    setWorkOrders(prev => prev.map(w => w.id === woId ? { ...w, productionStatus: nextStatus } : w));
    setCuttingMessage(`✅ Cutting ${qty} pcs berhasil disimpan!`);
    setCuttingInputs(prev => ({ ...prev, [woId]: '' }));
    setTimeout(() => setCuttingMessage(null), 3000);
  };

  // ===== FINISHING & KANCING LOGS =====
  // Penyaringan + pengurutan ketiga log kini ditangani `buildLogRows`
  // (@/lib/logDashboard), yang menormalkan catatan mentah menjadi satu bentuk
  // baris. Sebelumnya tiap log menyaring sendiri di sini — tiga salinan aturan
  // yang sama, dan finishing_records tidak punya `work_code` sehingga kodenya
  // harus di-join dari workOrders secara manual.


  // ===== SELECTION =====
  const handleToggleRow = (woId: string) => setSelectedRows(prev => {
    const next = new Set(prev);
    if (next.has(woId)) next.delete(woId);
    else next.add(woId);
    return next;
  });
  // "Pilih semua" kini milik grid: ia men-toggle seluruh baris yang tampil dan
  // memutar selisihnya lewat `handleToggleRow`, jadi tidak ada checkbox header
  // manual di sini lagi.

  // ===== Filter & Sort (RAW master table) =====
  // Urutan kolom tabel Raw Data sebagai daftar `key` datar.
  //
  // Dipakai `useColumnSettings` untuk merapikan kolom beku menjadi awalan yang
  // rapat — mesin pinning mengangkat kolom yang di-pin ke depan mengikuti
  // urutan itu, jadi daftar beku yang berlubang akan mengubah urutan kolom di
  // layar. RAW_COLUMNS sendiri ada di tingkat modul, jadi identitasnya stabil.
  const rawColumnKeys = useMemo(() => RAW_COLUMNS.map((c) => c.key), []);
  // Pengaturan kolom tabel Raw Data: sembunyikan, bekukan, dan header beku.
  const { hidden: hiddenCols, toggle: toggleCol, frozen: frozenCols, toggleFreeze: toggleFreezeCol, toggleFreezeAll: toggleFreezeAllCols, headerFrozen, setHeaderFrozen } = useColumnSettings('raw-data', rawColumnKeys);
  // Rows shaped for Filter/Sort: flat display values, uniform styling in cells.
  // `variasiStatusLabel` dan `upPosLabel` adalah bentuk TEKS dari dua kolom
  // baru — dipakai mesin Filter/Sort, yang membandingkan string. Selnya sendiri
  // tetap dirender sebagai badge lewat `rawColumns`; tabel ini tidak punya
  // ekspor CSV, jadi tidak ada konsumen lain dari field teks itu.
  const flatRows = useMemo(() => decoratedWO.map((wo) => ({
    ...wo,
    sisa: Math.max(0, wo.cuttingTotal - wo.sewingTotal),
    statusLabel: productionStatusLabel[wo.derivedStatus as ProductionStatus] ?? String(wo.derivedStatus),
    variasiStatusLabel: variasiStatusText(wo.variasiStatuses),
    upPosLabel: wo.upPos ? NEED_UP_POS_LABEL : '',
    createdAtLabel: formatDate(wo.createdAt),
  })), [decoratedWO]);
  const rawRows = useMemo(() => applySorts(applyFilters(flatRows, rawFilters), rawSorts), [flatRows, rawFilters, rawSorts]);

  // Bentuk kolom untuk DataTable (variant "plain") — sama seperti tabel lain di
  // aplikasi. Sel yang butuh foto, badge, atau warna angka memakai `render`
  // supaya tabel bersama tidak perlu tahu soal bentuk work order.
  //
  // Urutannya HARUS sama dengan RAW_COLUMNS: kunci kolom yang tersimpan di
  // preferensi "atur kolom" user adalah `key` di sini, jadi mengubahnya akan
  // mengembalikan kolom yang sudah disembunyikan user.
  const rawColumns = useMemo(() => [
    {
      key: 'productNote', label: 'Kode Produksi Konveksi', width: '180px',
      render: (row: Record<string, unknown>) => {
        const v = row.productNote as string | null;
        return v ? <span className="font-mono text-gray-700">{v}</span> : <span className="text-gray-300">—</span>;
      },
    },
    {
      key: 'clientProductionCode', label: 'Kode Produksi Client', width: '180px',
      render: (row: Record<string, unknown>) => {
        const v = row.clientProductionCode as string | null;
        return v ? <span className="font-mono text-gray-700">{v}</span> : <span className="text-gray-300">—</span>;
      },
    },
    {
      key: 'createdAt', label: 'Date Created', width: '120px',
      render: (row: Record<string, unknown>) => <span className="text-gray-700">{String(row.createdAtLabel ?? '')}</span>,
    },
    {
      key: 'brand', label: 'Client', width: '130px',
      render: (row: Record<string, unknown>) => <span className="text-gray-700">{String(row.brand ?? '')}</span>,
    },
    {
      key: 'photo', label: 'Foto', width: '70px',
      // Utamakan foto variasi; foto produk induk menjadi cadangan.
      render: (row: Record<string, unknown>) => {
        const url = (row.variationPhotoUrl ?? row.productPhotoUrl) as string | null;
        return url ? (
          <img src={url} alt={String(row.product)} className="h-8 w-8 rounded border border-gray-200 object-cover" />
        ) : (
          <span className="text-gray-300">—</span>
        );
      },
    },
    {
      key: 'product', label: 'Product', width: '160px',
      render: (row: Record<string, unknown>) => <span className="text-gray-700">{String(row.product ?? '')}</span>,
    },
    {
      key: 'productId', label: 'Product ID', width: '130px',
      render: (row: Record<string, unknown>) => (row.productId as string) || <span className="text-gray-300">—</span>,
    },
    {
      key: 'variationId', label: 'Variation ID', width: '130px',
      render: (row: Record<string, unknown>) => (row.variationId as string) || <span className="text-gray-300">—</span>,
    },
    {
      key: 'informationVariation', label: 'Information Variation', width: '160px',
      render: (row: Record<string, unknown>) => (row.informationVariation as string) || <span className="text-gray-300">—</span>,
    },
    {
      key: 'warna', label: 'Warna', width: '110px',
      render: (row: Record<string, unknown>) => (row.warna as string) || <span className="text-gray-300">—</span>,
    },
    {
      key: 'size', label: 'Size', width: '90px',
      render: (row: Record<string, unknown>) => (row.size as string) || <span className="text-gray-300">—</span>,
    },
    {
      key: 'cuttingTotal', label: 'Cutting', width: '90px', align: 'right' as const,
      render: (row: Record<string, unknown>) => {
        const n = Number(row.cuttingTotal ?? 0);
        return n > 0 ? <span className="tabular-nums text-emerald-600">{n}</span> : <span className="text-gray-300">—</span>;
      },
    },
    {
      key: 'sewingTotal', label: 'Jahit', width: '90px', align: 'right' as const,
      render: (row: Record<string, unknown>) => {
        const n = Number(row.sewingTotal ?? 0);
        if (n <= 0) return <span className="text-gray-300">—</span>;
        return <span className={cn('tabular-nums', n >= Number(row.quantity ?? 0) ? 'text-emerald-600' : 'text-red-600')}>{n}</span>;
      },
    },
    {
      key: 'kancingTotal', label: 'Kancing', width: '90px', align: 'right' as const,
      render: (row: Record<string, unknown>) => {
        const n = Number(row.kancingTotal ?? 0);
        if (n <= 0) return <span className="text-gray-300">—</span>;
        return <span className={cn('tabular-nums', n >= Number(row.quantity ?? 0) ? 'text-emerald-600' : 'text-red-600')}>{n}</span>;
      },
    },
    {
      key: 'finishingTotal', label: 'Finishing', width: '90px', align: 'right' as const,
      render: (row: Record<string, unknown>) => {
        const n = Number(row.finishingTotal ?? 0);
        if (n <= 0) return <span className="text-gray-300">—</span>;
        return <span className={cn('tabular-nums', n >= Number(row.quantity ?? 0) ? 'text-emerald-600' : 'text-red-600')}>{n}</span>;
      },
    },
    {
      key: 'sisa', label: 'Sisa Cutting', width: '100px', align: 'right' as const,
      render: (row: Record<string, unknown>) => {
        if (Number(row.cuttingTotal ?? 0) <= 0) return <span className="text-gray-300">—</span>;
        const sisa = Number(row.sisa ?? 0);
        return <span className={cn('tabular-nums', sisa === 0 ? 'text-emerald-600' : 'text-red-600')}>{sisa}</span>;
      },
    },
    {
      // Qty pesanan/klien, sengaja diletakkan SETELAH "Sisa Cutting" (ujung
      // kanan blok produksi) atas permintaan user. Lihat catatan lengkap di
      // RAW_FIELDS.
      //
      // Lebarnya 150px karena judulnya panjang dan `T_TH` memakai
      // `whitespace-nowrap` — kolom yang lebih sempit membuat judulnya terpotong,
      // bukan terlipat.
      //
      // 0 ditampilkan sebagai "—", bukan "0": sejak input qty manual dihapus
      // dari Order Entry, setiap order baru bernilai 0 sampai POS client
      // mengisinya. Angka 0 di sel akan terbaca sebagai "order ini nol pcs",
      // padahal artinya "belum diterima dari client".
      key: 'quantity', label: 'Qty Diterima Client', width: '150px', align: 'right' as const,
      render: (row: Record<string, unknown>) => {
        const qty = Number(row.quantity) || 0;
        if (qty <= 0) return <span className="text-gray-300">—</span>;
        return <span className="tabular-nums text-gray-700">{qty}</span>;
      },
    },
    {
      key: 'derivedStatus', label: 'Status', width: '120px', align: 'center' as const,
      render: (row: Record<string, unknown>) => <StatusBadge status={row.derivedStatus as ProductionStatus} />,
    },
    {
      // Status LEVEL-1 (per variasi) — bisa lebih dari satu badge sekaligus.
      // Lebarnya 190px karena baris paling lebar ("Cutting · Kancing ·
      // Finishing") memuat tiga badge; lebih sempit membuatnya terpotong.
      key: 'variasiStatusLabel', label: 'Status Variasi', width: '190px', align: 'center' as const,
      render: (row: Record<string, unknown>) => (
        <VariasiStatusBadge statuses={(row.variasiStatuses as VariasiStatus[]) ?? []} />
      ),
    },
    {
      // Alert "Need Up POS" (revisi 2026-09-28): finishing sudah melebihi Qty
      // Diterima Client, jadi angka di POS perlu dinaikkan. Jahit tidak lagi
      // ikut dibandingkan. Sel kosong (bukan badge abu-abu) bila tidak ada
      // masalah, supaya mata langsung tertuju ke baris yang bertanda.
      key: 'upPosLabel', label: 'Need Up POS', width: '130px', align: 'center' as const,
      render: (row: Record<string, unknown>) => (
        row.upPos
          ? <span className={softBadgeClass('rose')}>{NEED_UP_POS_LABEL}</span>
          : <span className="text-gray-300">—</span>
      ),
    },
    {
      key: 'createdBy', label: 'Created By', width: '130px',
      render: (row: Record<string, unknown>) => (row.createdBy as string) || <span className="text-gray-300">—</span>,
    },
  ], []);

  const handleImport = () => { if (selectedRows.size === 0) { alert('Pilih minimal 1!'); return; } alert(`✅ ${selectedRows.size} WO di-import`); setSelectedRows(new Set()); };
  // ===== KANBAN DND (drag id = product note; updates all WOs in the group) =====
  const handleDragStart = (e: DragStartEvent) => setActiveDragId(e.active.id as string);
  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveDragId(null);
    if (!over) return;
    const note = active.id as string, newStatus = over.id as string;
    const group = kanbanGroups.find(g => g.productNote === note);
    if (!group) return;
    // Validate against the group's most-advanced WO as a proxy.
    const first = group.workOrders[0];
    const st = getSewingTotalLocal(first.id);
    const ct = getCuttingForWO(first.id)?.totalCutting ?? 0;
    const err = validateStatusTransition(
      first.productionStatus,
      newStatus,
      st,
      ct,
      first.quantity,
      getKancingTotalLocal(first.id),
      getFinishingTotalLocal(first.id),
    );
    if (err) { showToast(`⚠️ ${err}`); return; }
    // Update every WO in the group.
    setWorkOrders(prev => prev.map(w => (group.workOrders.some(gw => gw.id === w.id) ? { ...w, productionStatus: newStatus as ProductionStatus } : w)));
    const results = await Promise.all(group.workOrders.map(gw => workOrderSvc.updateProdStatus(gw.id, newStatus)));
    const failed = results.some(r => r.error);
    if (failed) { setWorkOrders(prev => prev.map(w => (group.workOrders.some(gw => gw.id === w.id) ? { ...w, productionStatus: group.workOrders.find(gw => gw.id === w.id)?.productionStatus as ProductionStatus } : w))); showToast('❌ Gagal update status'); }
    else showToast(`✅ Status updated ke "${productionStatusLabel[newStatus as ProductionStatus] || newStatus}"`);
  };

  // Urutan mengikuti alur kerja: pasang kancing dikerjakan sebelum finishing.
  //
  // Tanpa ikon (permintaan user) — cukup tulisannya. Toggle Kanban/List di
  // bawah sengaja TETAP berikon: user hanya menyebut kelima tab ini.
  const tabs: PillTabItem<TabType>[] = [
    { id: 'all', label: 'ALL' },
    { id: 'cutting', label: 'Cutting' },
    { id: 'sewing', label: 'Sewing' },
    { id: 'kancing', label: 'Kancing' },
    { id: 'finishing', label: 'Finishing' },
  ];

  // ===== Data panel log (tab Sewing / Kancing / Finishing) =====
  const activeLogTab: LogTab | null = isLogTab(activeTab) ? activeTab : null;

  // Catatan mentah milik tab log yang sedang aktif — satu tempat, supaya
  // pemetaan tab → array tidak diulang di tiga tempat.
  const activeLogRecords = useMemo(
    () => (activeLogTab === 'sewing' ? sewingRecords
      : activeLogTab === 'kancing' ? kancingRecords
        : activeLogTab === 'finishing' ? finishingRecords
          : []),
    [activeLogTab, sewingRecords, kancingRecords, finishingRecords],
  );

  // Baris log tanpa saringan pencarian — dipakai panel kiri (yang justru jadi
  // alat pencariannya) dan panel kanan.
  const allLogRows = useMemo(
    () => (activeLogTab ? buildLogRows(activeLogTab, activeLogRecords, workOrders, '') : []),
    [activeLogTab, activeLogRecords, workOrders],
  );

  // Daftar kode produksi panel kiri + kode yang sedang dipilih.
  const kodeEntries = useMemo(
    () => (activeLogTab ? buildKodeList(kanbanGroups, allLogRows) : []),
    [activeLogTab, kanbanGroups, allLogRows],
  );
  const selectedKodeNote = activeLogTab ? selectedKode[activeLogTab] ?? null : null;
  const selectedKodeGroup = selectedKodeNote
    ? kanbanGroups.find(g => g.productNote === selectedKodeNote) ?? null
    : null;
  const selectKode = (note: string | null) => {
    if (!activeLogTab) return;
    setSelectedKode(prev => ({ ...prev, [activeLogTab]: note }));
    // Buang filter slicer saat kode berganti. Filter produk/bulan dari kode
    // sebelumnya bisa tidak cocok sama sekali dengan kode baru, sehingga panel
    // tampil kosong tanpa sebab yang terlihat. (Dulu ini ditangani `key`
    // remount di panel; sekarang filter hidup di halaman, jadi harus eksplisit.)
    setLogFilters(prev => ({ ...prev, [activeLogTab]: EMPTY_FILTERS }));
    setLogPage(1);
  };

  // Baris panel kanan: disaring ke kode terpilih (null = seluruh kode), lalu
  // diberi slicer. Dipakai bersama oleh KPI di panel DAN tabel di bawahnya —
  // satu rantai baris untuk keduanya, supaya filter tidak bisa mengenai salah
  // satu saja.
  const panelScopedRows = useMemo(
    () => (activeLogTab
      ? scopedLaporanRows(LAPORAN_KIND_BY_TAB[activeLogTab], activeLogRecords, workOrders, selectedKodeGroup)
      : []),
    [activeLogTab, activeLogRecords, workOrders, selectedKodeGroup],
  );
  const panelFilters = activeLogTab ? logFilters[activeLogTab] ?? EMPTY_FILTERS : EMPTY_FILTERS;
  const panelTableRows = useMemo(
    () => applyLaporanFilters(panelScopedRows, panelFilters),
    [panelScopedRows, panelFilters],
  );

  const activeDragGroup = activeDragId ? kanbanGroups.find(g => g.productNote === activeDragId) : null;

  // ===== Ubah / hapus baris log (khusus owner & finance) =====
  //
  // Aturan siapa yang berhak hidup di `src/lib/permissions.ts`, dan policy RLS
  // di database menegakkan aturan yang sama — jadi menyembunyikan tombol di sini
  // bukan satu-satunya pengaman, hanya supaya role lain tidak melihat aksi yang
  // pasti ditolak. Lihat
  // supabase/migrations/2026-09-24-production-log-role-restriction.sql.
  const canEditLog = canEditProductionLog(profile.role);
  const [editTarget, setEditTarget] = useState<LaporanRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LaporanRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Jenis log yang sedang ditampilkan — dipakai dialog ubah & hapus agar tahu
  // service mana yang dipanggil.
  const activeLogKind: LaporanKind | null = activeLogTab ? LAPORAN_KIND_BY_TAB[activeLogTab] : null;

  // Nama PIC yang ditawarkan saat mengubah: gabungan nama karyawan Aktif
  // berposisi Penjahit (sumber yang sama dengan Entry Jahitan) dengan nama yang
  // sudah ada di baris log.
  //
  // Nama lama sengaja ikut. Baris buatan masa lalu memakai nama dummy
  // ("Ani Wulandari", "Eka Prasetya") yang tidak ada di Register Karyawan;
  // tanpa menyertakannya, membuka dialog ubah pada baris itu akan menampilkan
  // dropdown kosong dan memaksa operator mengganti orangnya hanya untuk bisa
  // memperbaiki angka qty.
  const logPicOptions = useMemo(() => {
    const fromRows = allLogRows.map((row) => row.pic).filter(Boolean);
    return [...new Set([...penjahitNames, ...fromRows])].sort((a, b) => a.localeCompare(b));
  }, [allLogRows, penjahitNames]);

  /**
   * Muat ulang HANYA catatan log yang jenisnya berubah.
   *
   * Sengaja mengambil ulang dari server, bukan menambal state lokal: seluruh
   * angka turunan (baris tabel, KPI dashboard, daftar kode di panel kiri)
   * dihitung dari catatan mentah oleh `buildLogRows`, dan pemetaan
   * "kolom tabel → kolom catatan" sudah dimiliki `laporanCompute.ts`. Menyalin
   * pemetaan itu ke sini agar bisa menambal state lokal berarti membuat sumber
   * kebenaran kedua yang bisa berbeda diam-diam dari yang pertama.
   *
   * Tidak menyalakan `loading` — memuat ulang satu tabel tidak boleh membuat
   * seluruh halaman berkedip kembali ke layar Loading.
   */
  const refreshLogRecords = useCallback(async (kind: LaporanKind) => {
    if (kind === 'jahit') {
      const { data } = await sewingRecordSvc.fetchAll();
      if (data) setSewingRecords(data);
    } else if (kind === 'kancing') {
      const { data } = await kancingRecordSvc.fetchAll();
      if (data) setKancingRecords(data);
    } else {
      const { data } = await finishingRecordSvc.fetchAll();
      if (data) setFinishingRecords(data);
    }
  }, []);

  const handleLogSaved = useCallback(async () => {
    if (!activeLogKind) return;
    await refreshLogRecords(activeLogKind);
    setEditTarget(null);
    showToast('✅ Catatan berhasil diubah!');
  }, [activeLogKind, refreshLogRecords]);

  const handleLogDelete = useCallback(async () => {
    if (!deleteTarget || !activeLogKind) return;
    setDeleting(true);

    const { error } =
      activeLogKind === 'jahit' ? await sewingRecordSvc.remove(deleteTarget.id)
        : activeLogKind === 'kancing' ? await kancingRecordSvc.remove(deleteTarget.id)
          : await finishingRecordSvc.remove(deleteTarget.id);

    if (error) {
      setDeleting(false);
      // Sejak policy RLS dibatasi, penolakan datang sebagai error dari service
      // (0 baris terpengaruh) — jadi pesannya jujur, tidak menyebut "berhasil".
      console.error('[ProductionMonitoring] gagal hapus catatan log:', error);
      showToast(`⚠️ ${error.message}`);
      return;
    }

    await refreshLogRecords(activeLogKind);
    setDeleting(false);
    setDeleteTarget(null);
    showToast('🗑️ Catatan berhasil dihapus!');
  }, [deleteTarget, activeLogKind, refreshLogRecords]);

  // Akar halaman: tab log dua-panel butuh tinggi PASTI (bukan tinggi konten),
  // jadi `overflow-auto` hanya dipasang pada tab satu-panel. Scroll-nya pindah
  // ke dalam tiap panel.
  const isTwoPanel = activeLogTab !== null;

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading production data...</div></div>;

  return (
    <div className={cn('flex-1 flex flex-col min-w-0', isTwoPanel ? 'min-h-0' : 'overflow-auto')}>
      <div className="px-6 pt-3 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Production Order</h1>
          </div>
        </div>
        {toast && <div className="mb-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[12px] text-blue-700">{toast}</div>}
        <div className="flex items-center gap-3 flex-wrap">
          <PillTabs
            items={tabs}
            active={activeTab}
            aria-label="Tampilan Production Order"
            onChange={(id) => { setActiveTab(id); setLogPage(1); }}
          />
          {/* Toggle Kanban/List hanya muncul di tab ALL. */}
          {activeTab === 'all' && (
            <PillTabs
              items={[
                { id: 'board', label: 'Kanban', icon: Kanban },
                { id: 'list', label: 'List', icon: Table2 },
              ]}
              active={allView}
              aria-label="Pilih tampilan ALL"
              className="ml-auto"
              onChange={setAllView}
            />
          )}
        </div>
      </div>

      {/* Tab log dua-panel memakai tinggi penuh (tanpa pb) supaya tiap panel
          bisa menggulir sendiri; tab lain tetap seperti sebelumnya. */}
      <div className={cn('flex-1 px-6 pt-4 min-h-0', isTwoPanel ? 'pb-5 flex flex-col' : 'pb-5 overflow-auto')}>
        {/* Penanda lompatan dari Register Harga. Ditaruh di atas semua tab
            supaya berlaku juga untuk tampilan Kanban dan tab log, bukan hanya
            List — ketiganya memakai `filteredWO` yang sama. */}
        {poJump && (
          <PoFilterBanner
            code={poJump.code}
            orderId={poJump.orderId}
            count={filteredWO.length}
            onClear={() => onClearPoJump?.()}
          />
        )}
        {/* ALL — LIST VIEW (tabel Raw Data). Kanban ada di blok terpisah. */}
        {activeTab === 'all' && allView === 'list' && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1 max-w-xs"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" /><input type="text" placeholder="Cari work order..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" /></div>
              <FilterButton fields={RAW_FIELDS} value={rawFilters} onChange={setRawFilters} />
              <SortButton fields={RAW_FIELDS} value={rawSorts} onChange={setRawSorts} />
              <ColumnSettingsButton fields={RAW_COLUMNS} hidden={hiddenCols} onToggle={toggleCol} frozen={frozenCols} onToggleFreeze={toggleFreezeCol} onToggleFreezeAll={toggleFreezeAllCols} headerFrozen={headerFrozen} onToggleHeaderFrozen={setHeaderFrozen} />
              <button onClick={handleImport} className={cn('h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium transition-colors', selectedRows.size > 0 ? 'bg-primary text-white hover:bg-primary/90' : 'border border-gray-200 text-slate-400')}>📥 Import ({selectedRows.size})</button>
              {selectedRows.size > 0 && (
                <button
                  onClick={async () => {
                    if (!confirm(`Hapus ${selectedRows.size} Work Order terpilih? Semua cutting & sewing records terkait juga akan dihapus.`)) return;
                    let deleted = 0;
                    // Kumpulkan alasan gagal, jangan hanya menghitung yang berhasil:
                    // pesan "0 berhasil" tanpa sebab tidak bisa ditindaklanjuti.
                    const failures: string[] = [];
                    for (const woId of selectedRows) {
                      // Work order dihapus DULU, dan log anaknya hanya disentuh
                      // setelah induknya benar-benar terhapus. Urutan sebaliknya
                      // berbahaya: kalau penghapusan induk ditolak (mis. karena
                      // ada invoice), log cutting/sewing sudah terlanjur hilang
                      // tanpa bisa dikembalikan.
                      const { error } = await workOrderSvc.remove(String(woId));
                      if (error) {
                        failures.push(`${woId}: work order — ${error.message}`);
                        continue;
                      }
                      deleted++;
                      // Sisa log yang tidak ikut terhapus oleh cascade.
                      const cr = cuttingRecords.find(c => c.workOrderId === woId);
                      if (cr) {
                        const { error: cutErr } = await cuttingRecordSvc.remove(cr.id);
                        if (cutErr) failures.push(`${woId}: cutting — ${cutErr.message}`);
                      }
                      const srs = sewingRecords.filter(s => s.workOrderId === woId);
                      for (const sr of srs) {
                        const { error: sewErr } = await sewingRecordSvc.remove(sr.id);
                        if (sewErr) failures.push(`${woId}: sewing — ${sewErr.message}`);
                      }
                    }
                    // Hanya buang baris yang benar-benar terhapus. Sebelumnya
                    // seluruh baris terpilih dibuang walau gagal, sehingga tabel
                    // tampak berhasil padahal datanya masih ada di database.
                    setWorkOrders(prev => prev.filter(w => !(selectedRows.has(w.id) && !failures.some(f => f.startsWith(`${w.id}: work order`)))));
                    setSelectedRows(new Set());
                    if (failures.length === 0) {
                      showToast(`✅ ${deleted} WO berhasil dihapus!`);
                    } else {
                      console.error('[ProductionMonitoring] gagal hapus WO:', failures);
                      const first = failures[0].replace(/^[^:]+: /, '');
                      showToast(`⚠️ ${deleted} terhapus, ${failures.length} gagal — ${first}`);
                    }
                  }}
                  className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
                </button>
              )}
              <span className="text-[11px] text-slate-400 ml-auto">{rawRows.length} work orders</span>
            </div>
            <div className={T_WRAP}>
              <DataTable
                variant="plain"
                columns={rawColumns}
                data={rawRows as unknown as Record<string, unknown>[]}
                selectedRows={selectedRows}
                onToggleRow={handleToggleRow}
                hiddenColumns={hiddenCols}
                frozenColumns={frozenCols}
                headerFrozen={headerFrozen}
                emptyMessage={
                  <div className="py-10 text-center text-[13px] text-gray-400">
                    {decoratedWO.length === 0 ? 'Tidak ada data work order' : 'Tidak ada hasil yang cocok dengan filter'}
                  </div>
                }
              />
            </div>
          </div>
        )}

        {/* CUTTING LOG */}
        {activeTab === 'cutting' && (
          <div>
            {cuttingMessage && <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-[12px] text-green-700">{cuttingMessage}</div>}
            <div className="mb-4"><h3 className="text-[13px] font-semibold text-slate-700 mb-2">🔵 Antrian Cutting — {cuttingQueueWO.length} WO</h3>
              <div className={T_WRAP}>
                <DataTable
                  variant="plain"
                  columns={cuttingQueueColumns}
                  data={cuttingQueueWO as unknown as Record<string, unknown>[]}
                  emptyMessage={
                    <div className="py-8 text-center text-gray-400 text-[13px]">Semua work order sudah di-cutting</div>
                  }
                />
              </div>
            </div>
            <div><h3 className="text-[13px] font-semibold text-slate-700 mb-2">🟢 Riwayat Cutting ({cuttingDoneWO.length} WO)</h3>
              <div className={T_WRAP}>
                <DataTable
                  variant="plain"
                  columns={cuttingHistoryColumns}
                  data={cuttingHistoryRows as unknown as Record<string, unknown>[]}
                  emptyMessage={
                    <div className="py-8 text-center text-gray-400 text-[13px]">Belum ada riwayat cutting</div>
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB LOG DUA PANEL — Sewing / Kancing / Finishing.
            Kiri: daftar Kode Produksi Konveksi. Kanan: dashboard + tabel log
            yang ikut terfilter saat satu kode dipilih. */}
        {isTwoPanel && activeLogTab && (
          <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 rounded-lg border bg-card overflow-hidden">
            {/* Ukuran panel WAJIB berupa string persen ("26%"), bukan angka.
                Di react-resizable-panels v4, nilai NUMBER diartikan PIXEL —
                `defaultSize={26}` berarti 26px, dan `maxSize={44}` mengunci
                panel kiri selebar 44px sehingga tampilannya rusak. Di v2/v3
                angka berarti persen; proyek ini memakai v4. */}
            {/* Panel kiri dilebarkan dari 26% karena kini memuat thumbnail
                foto + tiga baris teks; pada 26% kode produksi seperti
                `PO/001-LVU/09/2026/002` terpotong. */}
            <ResizablePanel defaultSize="32%" minSize="20%" maxSize="50%" className="min-w-0">
              <KodeProduksiList
                entries={kodeEntries}
                selected={selectedKodeNote}
                onSelect={selectKode}
                totalRows={allLogRows.length}
                totalQty={sumLogQty(allLogRows)}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="68%" minSize="40%" className="min-w-0">
              <div className="h-full min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
                <LogDashboardPanel
                  // Filter kini milik halaman (lihat selectKode yang
                  // mengosongkannya saat kode berganti), jadi `key` di sini
                  // bukan lagi yang mengatur reset — dipertahankan supaya
                  // state internal panel (jika kelak ditambah) tetap bersih
                  // antar kode.
                  key={`${activeLogTab}:${selectedKodeNote ?? 'semua'}`}
                  kind={LAPORAN_KIND_BY_TAB[activeLogTab]}
                  scopedRows={panelScopedRows}
                  filters={panelFilters}
                  onFiltersChange={(next) =>
                    setLogFilters((prev) => ({ ...prev, [activeLogTab]: next }))
                  }
                  group={selectedKodeGroup}
                  searchQuery={searchQuery}
                  // Pencarian menyaring daftar Kode Produksi di panel kiri,
                  // yang punya halamannya sendiri — jadi halaman tabel ikut
                  // direset agar tidak mendarat di halaman yang sudah kosong.
                  onSearchChange={(value) => { setSearchQuery(value); setLogPage(1); }}
                  actions={
                    <button
                      onClick={
                        activeLogTab === 'sewing' ? () => onOpenSewingEntry?.()
                          : activeLogTab === 'kancing' ? () => onOpenKancingEntry?.()
                            : () => onOpenFinishingEntry?.()
                      }
                      className={cn(
                        'h-7 px-3 text-[11px] font-semibold text-white rounded-lg transition-colors',
                        activeLogTab === 'sewing' ? 'bg-primary hover:bg-primary/90'
                          : activeLogTab === 'kancing' ? 'bg-violet-500 hover:bg-violet-600'
                            : 'bg-emerald-500 hover:bg-emerald-600',
                      )}
                    >
                      ➕ Entry {LAPORAN_KIND_BY_TAB[activeLogTab] === 'jahit' ? 'Jahitan' : activeLogTab === 'kancing' ? 'Pasang Kancing' : 'Finishing'} Baru
                    </button>
                  }
                />

                <LogTable
                  rows={panelTableRows}
                  picLabel={PIC_LABEL[LAPORAN_KIND_BY_TAB[activeLogTab]]}
                  photoTone={activeLogTab === 'sewing' ? 'blue' : activeLogTab === 'kancing' ? 'violet' : 'emerald'}
                  emptyText={
                    activeLogTab === 'sewing' ? 'Belum ada data jahitan'
                      : activeLogTab === 'kancing' ? 'Belum ada data pasang kancing'
                        : 'Belum ada data finishing'
                  }
                  page={logPage}
                  onPageChange={setLogPage}
                  // Kolom Aksi hanya ada bila role-nya berhak. Untuk role lain
                  // `rowActions` tidak diisi sama sekali, sehingga kolomnya tidak
                  // dirender dan tabel tampil persis seperti sebelumnya.
                  rowActions={canEditLog ? (row) => (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={cn(T_ROW_BTN, 'text-slate-400 hover:bg-slate-100 hover:text-slate-700')}
                          title={PRODUCTION_LOG_EDIT_HINT}
                          aria-label={`Aksi untuk catatan ${row.produk || row.id}`}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={() => setEditTarget(row)}
                          className="text-[12px] gap-2"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Ubah
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(row)}
                          className="text-[12px] gap-2 text-rose-600 focus:text-rose-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hapus
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : undefined}
                  actionsLabel="Aksi"
                  trailingColumns={canEditLog ? 1 : 0}
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}

        {/* ALL — KANBAN VIEW (default tab ALL) */}
        {activeTab === 'all' && allView === 'board' && (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="h-full overflow-x-auto">
              <div className="grid grid-cols-[repeat(4,350px)] gap-4 min-w-max pb-4">
                {(STATUS_ORDER.map(s => ({ status: s, label: productionStatusLabel[s], color: productionStatusColor[s] }))).map(col => {
                  const groups = kanbanGroups.filter(g => g.status === col.status);
                  return <KanbanColumn key={col.status} status={col.status} label={col.label} color={col.color} groups={groups} searchQuery={searchQuery} onOpen={setSelectedGroup} />;
                })}
              </div>
            </div>
            <DragOverlay>{activeDragGroup ? <div className="opacity-90"><KanbanCard group={activeDragGroup} isDragging onOpen={() => {}} /></div> : null}</DragOverlay>
          </DndContext>
        )}

        {/* PRODUCT NOTE FULL-SCREEN OVERLAY */}
        <Dialog open={selectedGroup !== null} onOpenChange={(open) => { if (!open) setSelectedGroup(null); }}>
          {/* `sm:max-w-none` wajib, bukan hanya `max-w-none`: DialogContent
              bawaan shadcn memasang `sm:max-w-lg` (512px), dan `cn` memakai
              twMerge yang hanya menimpa kelas dalam GRUP dan AWALAN yang sama
              — jadi `max-w-none` tanpa awalan tidak akan menghapusnya.
              `min-h-0` di badan perlu agar panel resizable benar-benar
              menyusut, bukan mendorong tinggi dialog. Lebar 1280px karena
              badan kini terbagi dua panel (identitas + grafik). */}
          <DialogContent className="flex h-[min(86vh,900px)] w-[min(1280px,96vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none">
            {/* pr-12 memberi ruang bagi tombol tutup bawaan DialogContent. */}
            <DialogHeader className="shrink-0 border-b border-gray-100 px-6 py-4 pr-12">
              <DialogTitle className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-left text-[13px]">
                {selectedGroup && (
                  <>
                    <span className="break-all font-mono font-bold text-slate-900">{selectedGroup.productNote}</span>
                    {selectedGroup.clientProductionCode && (
                      <span className="min-w-0 max-w-full break-all font-mono font-bold text-slate-900 sm:border-l sm:border-border sm:pl-4">
                        {selectedGroup.clientProductionCode}
                      </span>
                    )}
                    <StatusBadge status={selectedGroup.status} />
                  </>
                )}
              </DialogTitle>
            </DialogHeader>

            {selectedGroup && (
              <KanbanCardDetail
                group={selectedGroup}
                cuttingRecords={cuttingRecords}
                sewingRecords={sewingRecords}
                kancingRecords={kancingRecords}
                finishingRecords={finishingRecords}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Dialog ubah + konfirmasi hapus baris log. Hanya bisa terbuka lewat
            aksi baris, dan aksi baris itu sendiri hanya dipasang untuk role
            owner/finance (`canEditLog`) — jadi keduanya tidak pernah muncul
            untuk role lain. */}
        <LogEntryDialog
          // `key` me-remount dialog setiap baris berganti, sehingga formulirnya
          // diisi ulang dari baris yang baru tanpa efek penyelarasan state.
          key={`log-edit-${editTarget?.id ?? 'none'}`}
          open={editTarget !== null}
          kind={activeLogKind ?? 'jahit'}
          row={editTarget}
          picOptions={logPicOptions}
          picLabel={activeLogKind ? PIC_LABEL[activeLogKind] : 'PIC'}
          onOpenChange={(next) => { if (!next) setEditTarget(null); }}
          onSaved={handleLogSaved}
        />

        <AlertDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[14px]">Hapus catatan ini?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-[13px]">
                  <p className="font-mono text-[12px]">
                    {deleteTarget?.produk || '—'} · {deleteTarget?.warna || '—'} · {deleteTarget?.size || '—'}
                  </p>
                  <p>
                    {deleteTarget ? `${deleteTarget.qty.toLocaleString('id-ID')} pcs` : ''}
                    {deleteTarget?.tanggal ? ` · ${formatDate(deleteTarget.tanggal)}` : ''}
                  </p>
                  <p>
                    Angka "sudah terjahit / terpasang / terfinishing" pada work
                    order ikut berkurang, dan catatan ini tidak bisa
                    dikembalikan setelah dihapus.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Kembali</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => { event.preventDefault(); void handleLogDelete(); }}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  );
}
