import { useState, useMemo, useEffect, type ComponentType } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  ArrowRight,
  Download,
  Image,
  Trash2,
  Scissors,
  PackageCheck,
  X,
  Table2,
  Shirt,
  CircleDot,
  Kanban,
  DownloadCloud,
  User,
} from 'lucide-react';

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
import * as productionOrderSvc from '@/services/productionOrders';
import type { WorkOrder, SewingRecord, CuttingRecord, FinishingRecord, KancingRecord, ProductionStatus } from '@/types/pipeline';
import { productionStatusLabel, productionStatusColor } from '@/types/pipeline';
import { STATUS_ORDER, deriveStatus, validateStatusTransition } from '@/lib/productionStatus';

type TabType = 'raw' | 'cutting' | 'sewing' | 'finishing' | 'kancing' | 'kanban';

// ===== Status Badge =====
function StatusBadge({ status }: { status: ProductionStatus }) {
  return (
    <span className={cn('inline-block px-2 py-0.5 rounded text-[10px] font-semibold', productionStatusColor[status] || 'bg-gray-100 text-gray-700')}>
      {productionStatusLabel[status] || status}
    </span>
  );
}

// ===== KanbanCard (per product note) =====
interface KanbanGroup {
  productNote: string;
  product: string;
  brand: string;
  totalQty: number;
  status: ProductionStatus;
  workOrders: WorkOrder[];
}

const STATUS_RANK: Record<ProductionStatus, number> = {
  NEW: 0,
  CUTTING: 1,
  PROGRESS: 2,
  FINISHED: 3,
  INVOICED: 4,
};

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
        <span className="text-[12px] font-bold text-slate-900">Total qty: {group.totalQty} pcs</span>
      </div>
    </div>
  );
}

// ===== KanbanColumn =====
function KanbanColumn({ status, label, color, groups, searchQuery, onOpen }: { status: string; label: string; color: string; groups: KanbanGroup[]; searchQuery: string; onOpen: (g: KanbanGroup) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const filtered = searchQuery ? groups.filter(g => {
    const q = searchQuery.toLowerCase();
    return g.productNote.toLowerCase().includes(q) || g.product.toLowerCase().includes(q) || g.brand.toLowerCase().includes(q);
  }) : groups;
  return (
    <div className="w-[350px] flex flex-col">
      <div className={cn('rounded-t-lg px-4 py-3 flex items-center justify-between', color, isOver && 'ring-2 ring-blue-400')}>
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="text-[11px] font-bold bg-white/30 px-2 py-0.5 rounded-full">{groups.length}</span>
      </div>
      <div ref={setNodeRef} className="flex-1 bg-slate-50 rounded-b-lg p-3 space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto min-h-[80px]">
        {filtered.length === 0 ? <div className="text-center py-8 text-slate-400 text-[12px]">No work orders</div> : filtered.map(g => <KanbanCard key={g.productNote} group={g} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

// ===== Full-Screen Report Bubbles (product note scope) =====
function FullScreenReports({ group, sewingList, finishingList }: { group: KanbanGroup; sewingList: SewingRecord[]; finishingList: FinishingRecord[] }) {
  const [openBubble, setOpenBubble] = useState<'sewing' | 'finishing' | null>(null);
  const woIds = new Set(group.workOrders.map(w => w.id));

  const sewing = sewingList
    .filter(s => woIds.has(s.workOrderId))
    .sort((a, b) => b.tanggalLaporan.localeCompare(a.tanggalLaporan));
  const finishing = finishingList
    .filter(f => woIds.has(f.workOrderId))
    .sort((a, b) => (b.syncedAt || '').localeCompare(a.syncedAt || ''));

  return (
    <div>
      <h3 className="text-[12px] font-bold text-slate-700 mb-2">Laporan</h3>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setOpenBubble(prev => (prev === 'sewing' ? null : 'sewing'))}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors',
            openBubble === 'sewing' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600 hover:bg-sky-50 hover:text-sky-700',
          )}
        >
          <Scissors className="w-3.5 h-3.5" /> Laporan Jahit
        </button>
        <button
          type="button"
          onClick={() => setOpenBubble(prev => (prev === 'finishing' ? null : 'finishing'))}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors',
            openBubble === 'finishing' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700',
          )}
        >
          <PackageCheck className="w-3.5 h-3.5" /> Laporan Finishing
        </button>
      </div>

      {openBubble === 'sewing' && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Laporan Jahit — {group.productNote}</p>
          {sewing.length === 0 ? (
            <p className="text-[12px] text-slate-400">Belum ada laporan jahit.</p>
          ) : (
            <ul className="space-y-2">
              {sewing.map(s => (
                <li key={s.id} className="text-[12px] text-slate-700 bg-white rounded-lg border border-gray-100 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{s.picPenjahit}</span>
                    <span className="font-bold shrink-0">{s.qtySelesai} pcs</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 mt-0.5">
                    <span>{formatDate(s.tanggalLaporan)}</span>
                    {s.imageName ? <span className="inline-flex items-center gap-1"><Image className="w-3 h-3" />{s.imageName}</span> : <span>—</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {openBubble === 'finishing' && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Laporan Finishing — {group.productNote}</p>
          {finishing.length === 0 ? (
            <p className="text-[12px] text-slate-400">Belum ada laporan finishing.</p>
          ) : (
            <ul className="space-y-2">
              {finishing.map(f => (
                <li key={f.id} className="text-[12px] text-slate-700 bg-white rounded-lg border border-gray-100 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{f.qtyFinishing} pcs</span>
                    <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold', f.syncStatus === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>{f.syncStatus}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {formatDate(f.tanggalImport)} · {f.source || '—'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ===== Main Page =====
export default function ProductionMonitoring({ onOpenSewingEntry, onOpenFinishingEntry, onOpenKancingEntry }: { onOpenSewingEntry?: () => void; onOpenFinishingEntry?: () => void; onOpenKancingEntry?: () => void }) {
  const [activeTab, setActiveTab] = useState<TabType>('raw');
  const [searchQuery, setSearchQuery] = useState('');
  const [cuttingInputs, setCuttingInputs] = useState<Record<string, string>>({});
  const [cuttingMessage, setCuttingMessage] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showPullModal, setShowPullModal] = useState(false);
  const [pullMessage, setPullMessage] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [cuttingRecords, setCuttingRecords] = useState<CuttingRecord[]>([]);
  const [sewingRecords, setSewingRecords] = useState<SewingRecord[]>([]);
  const [finishingRecords, setFinishingRecords] = useState<import('@/types/pipeline').FinishingRecord[]>([]);
  const [kancingRecords, setKancingRecords] = useState<KancingRecord[]>([]);
  const [planningOrders, setPlanningOrders] = useState<import('@/types/pipeline').ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<KanbanGroup | null>(null);

  const { profile } = useAuth();
  const currentDisplayName = profile.displayName;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [wo, cr, sr, fr, kr, po] = await Promise.all([workOrderSvc.fetchAll(), cuttingRecordSvc.fetchAll(), sewingRecordSvc.fetchAll(), finishingRecordSvc.fetchAll(), kancingRecordSvc.fetchAll(), productionOrderSvc.fetchAll()]);
      if (wo.data) setWorkOrders(wo.data);
      if (cr.data) setCuttingRecords(cr.data);
      if (sr.data) setSewingRecords(sr.data);
      if (fr.data) setFinishingRecords(fr.data);
      if (kr.data) setKancingRecords(kr.data);
      if (po.data) setPlanningOrders(po.data.filter(p => p.status === 'PLANNING'));
      setLoading(false);
    })();
  }, []);

  const filteredWO = useMemo(() => {
    if (!searchQuery) return workOrders;
    const q = searchQuery.toLowerCase();
    return workOrders.filter(w => w.workCode.toLowerCase().includes(q) || w.product.toLowerCase().includes(q) || w.brand.toLowerCase().includes(q) || w.warna.toLowerCase().includes(q));
  }, [workOrders, searchQuery]);

  function getCuttingForWO(woId: string) { return cuttingRecords.find(c => c.workOrderId === woId); }
  function getSewingTotalLocal(woId: string) { return sewingRecords.filter(s => s.workOrderId === woId).reduce((sum, r) => sum + r.qtySelesai, 0); }
  function getFinishingTotalLocal(woId: string) { return finishingRecords.filter(f => f.workOrderId === woId).reduce((sum, r) => sum + (Number(r.qtyFinishing) || 0), 0); }

  // Decorate each WO with cutting/sewing totals and derived status so filters + Kanban
  // reflect actual production progress even when prod_status in DB is stale.
  // Sort oldest first → newest at bottom (natural reading order)
  const decoratedWO = useMemo(() => {
    return filteredWO
      .map((wo) => {
        const cuttingTotal = getCuttingForWO(wo.id)?.totalCutting ?? 0;
        const sewingTotal = getSewingTotalLocal(wo.id);
        const finishingTotal = getFinishingTotalLocal(wo.id);
        const orderQty = Number(wo.quantity) || 0;
        const status = deriveStatus(cuttingTotal, sewingTotal, orderQty);
        return { ...wo, cuttingTotal, sewingTotal, finishingTotal, derivedStatus: status };
      })
      .sort((a, b) => {
        const da = a.createdAt || a.pulledAt || '';
        const db = b.createdAt || b.pulledAt || '';
        return da.localeCompare(db); // oldest first → newest at bottom
      });
  }, [filteredWO, cuttingRecords, sewingRecords, finishingRecords]);

  // Group decorated WOs by product note for the Kanban. Card status = highest
  // among the group's WOs; totalQty = sum of all quantities (incl. FINISHED/INVOICED).
  const kanbanGroups = useMemo<KanbanGroup[]>(() => {
    const map = new Map<string, KanbanGroup>();
    for (const wo of decoratedWO) {
      const note = wo.productNote?.trim();
      if (!note) continue; // product_note never null (user); skip safety
      const existing = map.get(note);
      const rank = STATUS_RANK[wo.derivedStatus as ProductionStatus] ?? 0;
      if (existing) {
        existing.totalQty += Number(wo.quantity) || 0;
        if (rank > STATUS_RANK[existing.status]) existing.status = wo.derivedStatus as ProductionStatus;
        existing.workOrders.push(wo);
      } else {
        map.set(note, {
          productNote: note,
          product: wo.product,
          brand: wo.brand,
          totalQty: Number(wo.quantity) || 0,
          status: wo.derivedStatus as ProductionStatus,
          workOrders: [wo],
        });
      }
    }
    return Array.from(map.values());
  }, [decoratedWO]);

  // ===== CUTTING =====
  const cuttingQueueWO = decoratedWO.filter(w => w.derivedStatus === 'NEW');
  const cuttingDoneWO = decoratedWO.filter(w => w.derivedStatus !== 'NEW');

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
    await workOrderSvc.updateProdStatus(woId, 'CUTTING');
    if (newCR) setCuttingRecords(prev => [...prev, newCR]);
    setWorkOrders(prev => prev.map(w => w.id === woId ? { ...w, productionStatus: 'CUTTING' } : w));
    setCuttingMessage(`✅ Cutting ${qty} pcs berhasil disimpan!`);
    setCuttingInputs(prev => ({ ...prev, [woId]: '' }));
    setTimeout(() => setCuttingMessage(null), 3000);
  };

  // ===== FINISHING & KANCING LOGS =====
  // Entry dilakukan lewat form terpisah (FinishingEntryForm / KancingEntryForm).
  const finishingLogData = useMemo(
    () => [...finishingRecords].sort((a, b) => (b.syncedAt || '').localeCompare(a.syncedAt || '')),
    [finishingRecords],
  );
  const kancingLogData = useMemo(
    () => kancingRecords.filter(k => !searchQuery || k.workCode.toLowerCase().includes(searchQuery.toLowerCase()) || k.picKancing.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => (b.inputAt || '').localeCompare(a.inputAt || '')),
    [kancingRecords, searchQuery],
  );

  // ===== SELECTION =====
  const handleToggleRow = (woId: string) => setSelectedRows(prev => { const n = new Set(prev); n.has(woId) ? n.delete(woId) : n.add(woId); return n; });
  const handleToggleAll = () => { if (selectedRows.size === filteredWO.length) setSelectedRows(new Set()); else setSelectedRows(new Set(filteredWO.map(w => w.id))); };
  const handleImport = () => { if (selectedRows.size === 0) { alert('Pilih minimal 1!'); return; } alert(`✅ ${selectedRows.size} WO di-import`); setSelectedRows(new Set()); };

  // ===== PULL =====
  const handlePullOrder = async (poId: string) => {
    const po = planningOrders.find(p => p.id === poId);
    if (!po || po.status !== 'PLANNING') return;
    const pid = `${po.brand.substring(0, 3).toUpperCase()}-${po.product.replace(/\s/g, '-').toUpperCase().substring(0, 5)}`;
    const { data: newWO, error } = await workOrderSvc.create({
      workCode: po.workCode, sourceOrderId: po.id, productNote: po.productNote,
      product: po.product, productId: pid,
      variationId: `${pid}-${po.warna.toUpperCase().substring(0, 3)}-${po.size}`,
      informationVariation: po.informationVariation, warna: po.warna, size: po.size, brand: po.brand,
      quantity: po.quantity, productionStatus: 'NEW', invoiceStatus: 'NONE',
      createdBy: currentDisplayName, createdAt: po.createdAt, pulledAt: new Date().toISOString(),
    });
    if (error) { setPullMessage(`❌ ${error.message}`); return; }
    await productionOrderSvc.pullToKonveksi(po.id, currentDisplayName);
    if (newWO) setWorkOrders(prev => [...prev, newWO]);
    setPlanningOrders(prev => prev.filter(p => p.id !== poId));
    setPullMessage(`✅ "${po.product}" berhasil di-pull!`);
    if (planningOrders.length <= 1) setShowPullModal(false);
    setTimeout(() => setPullMessage(null), 3000);
  };

  // ===== SEWING =====
  const sewingData = useMemo(() => sewingRecords.filter(s => !searchQuery || s.workCode.toLowerCase().includes(searchQuery.toLowerCase()) || s.picPenjahit.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => b.tanggalLaporan.localeCompare(a.tanggalLaporan)), [sewingRecords, searchQuery]);

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
    const err = validateStatusTransition(first.productionStatus, newStatus, st, ct, first.quantity);
    if (err) { showToast(`⚠️ ${err}`); return; }
    // Update every WO in the group.
    setWorkOrders(prev => prev.map(w => (group.workOrders.some(gw => gw.id === w.id) ? { ...w, productionStatus: newStatus as ProductionStatus } : w)));
    const results = await Promise.all(group.workOrders.map(gw => workOrderSvc.updateProdStatus(gw.id, newStatus)));
    const failed = results.some(r => r.error);
    if (failed) { setWorkOrders(prev => prev.map(w => (group.workOrders.some(gw => gw.id === w.id) ? { ...w, productionStatus: group.workOrders.find(gw => gw.id === w.id)?.productionStatus as ProductionStatus } : w))); showToast('❌ Gagal update status'); }
    else showToast(`✅ Status updated ke "${productionStatusLabel[newStatus as ProductionStatus] || newStatus}"`);
  };

  const TAB_ICONS: Record<TabType, ComponentType<{ className?: string }>> = {
    raw: Table2, cutting: Scissors, sewing: Shirt, finishing: PackageCheck, kancing: CircleDot, kanban: Kanban,
  };
  const tabs: { id: TabType; label: string; desc: string }[] = [
    { id: 'raw', label: 'Raw Data', desc: 'Daftar work order beserta progress cutting, jahit, dan finishing.' },
    { id: 'cutting', label: 'Cutting Log', desc: 'Riwayat pemotongan per work order.' },
    { id: 'sewing', label: 'Sewing Log', desc: 'Database hasil jahitan yang telah lulus QC.' },
    { id: 'finishing', label: 'Finishing Log', desc: 'Database hasil finishing per work order.' },
    { id: 'kancing', label: 'Pasang Kancing Log', desc: 'Database hasil pasang kancing manual — lubangi dan jahit kancing.' },
    { id: 'kanban', label: 'Kanban', desc: 'Papan produksi per product note.' },
  ];
  const activeTabInfo = tabs.find(t => t.id === activeTab);
  const activeDragGroup = activeDragId ? kanbanGroups.find(g => g.productNote === activeDragId) : null;

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading production data...</div></div>;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="px-6 pt-5 pb-0">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Production Monitoring</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">Work Order → Cutting → Sewing → Finishing</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPullModal(true)} className="h-8 px-3.5 text-[12px] font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 hover:shadow-md transition-all flex items-center gap-1.5">
              <DownloadCloud className="w-3.5 h-3.5" /> Pull Order Entry
            </button>
            <div className="h-8 px-3 text-[12px] text-slate-500 bg-white border border-slate-200 rounded-lg flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" /> {currentDisplayName}
            </div>
          </div>
        </div>
        {toast && <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-[12px] text-blue-700">{toast}</div>}
        {pullMessage && <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-[12px] text-green-700">{pullMessage}</div>}
        <div className="inline-flex items-center gap-1 max-w-full overflow-x-auto bg-white border border-slate-200/80 rounded-xl p-1.5 shadow-sm shadow-slate-200/60">
          {tabs.map(t => {
            const Icon = TAB_ICONS[t.id];
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                aria-pressed={active}
                className={cn(
                  'shrink-0 h-9 px-3.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-2 whitespace-nowrap transition-all duration-200 ease-out',
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 hover:-translate-y-px hover:shadow-md hover:shadow-slate-200',
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', active ? 'text-white' : 'text-slate-400')} />
                {t.label}
              </button>
            );
          })}
        </div>
        {activeTabInfo && <p className="mt-2 text-[11px] text-slate-400">{activeTabInfo.desc}</p>}
      </div>

      <div className="flex-1 px-6 pt-4 pb-5 overflow-auto">
        {/* RAW DATA */}
        {activeTab === 'raw' && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1 max-w-xs"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" /><input type="text" placeholder="Cari work order..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" /></div>
              <button className="h-8 px-2.5 text-[11px] border border-gray-200 rounded-lg flex items-center gap-1.5 text-slate-600 hover:bg-gray-50"><Filter className="w-3 h-3" /> Filter</button>
              <button className="h-8 px-2.5 text-[11px] border border-gray-200 rounded-lg flex items-center gap-1.5 text-slate-600 hover:bg-gray-50"><ArrowUpDown className="w-3 h-3" /> Sort</button>
              <button className="h-8 px-2.5 text-[11px] border border-gray-200 rounded-lg flex items-center gap-1.5 text-slate-600 hover:bg-gray-50"><Download className="w-3 h-3" /> Export</button>
              <button onClick={handleImport} className={cn('h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium transition-colors', selectedRows.size > 0 ? 'bg-blue-500 text-white hover:bg-blue-600' : 'border border-gray-200 text-slate-400')}>📥 Import ({selectedRows.size})</button>
              {selectedRows.size > 0 && (
                <button
                  onClick={async () => {
                    if (!confirm(`Hapus ${selectedRows.size} Work Order terpilih? Semua cutting & sewing records terkait juga akan dihapus.`)) return;
                    let deleted = 0;
                    for (const woId of selectedRows) {
                      const cr = cuttingRecords.find(c => c.workOrderId === woId);
                      if (cr) await cuttingRecordSvc.remove(cr.id);
                      const srs = sewingRecords.filter(s => s.workOrderId === woId);
                      for (const sr of srs) await sewingRecordSvc.remove(sr.id);
                      const { error } = await workOrderSvc.remove(String(woId));
                      if (!error) deleted++;
                    }
                    setWorkOrders(prev => prev.filter(w => !selectedRows.has(w.id)));
                    setSelectedRows(new Set());
                    showToast(`✅ ${deleted} WO berhasil dihapus!`);
                  }}
                  className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
                </button>
              )}
              <span className="text-[11px] text-slate-400 ml-auto">{filteredWO.length} work orders</span>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead><tr className="bg-slate-50 border-b border-gray-200">
                  <th className="w-8 py-2 px-2"><input type="checkbox" checked={selectedRows.size === filteredWO.length && filteredWO.length > 0} onChange={handleToggleAll} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500" /></th>
                  <th className="text-left py-2 px-2.5 font-semibold text-slate-600">Product</th>
                  <th className="text-left py-2 px-2.5 font-semibold text-slate-600">Work Code</th>
                  <th className="text-left py-2 px-2.5 font-semibold text-slate-600">Brand</th>
                  <th className="text-right py-2 px-2.5 font-semibold text-slate-600">Qty</th>
                  <th className="text-right py-2 px-2.5 font-semibold text-slate-600">Cutting</th>
                  <th className="text-right py-2 px-2.5 font-semibold text-slate-600">Jahit</th>
                  <th className="text-right py-2 px-2.5 font-semibold text-slate-600">Finishing</th>
                  <th className="text-right py-2 px-2.5 font-semibold text-slate-600">Sisa</th>
                  <th className="text-center py-2 px-2.5 font-semibold text-slate-600">Status</th>
                </tr></thead>
                <tbody>
                  {decoratedWO.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-slate-400">Tidak ada</td></tr>}
                  {decoratedWO.map(wo => {
                    const sisa = Math.max(0, wo.cuttingTotal - wo.sewingTotal);
                    return <tr key={wo.id} className={cn('border-b border-gray-100 hover:bg-slate-50/50', selectedRows.has(wo.id) && 'bg-blue-50/40')}>
                      <td className="py-2 px-2 text-center"><input type="checkbox" checked={selectedRows.has(wo.id)} onChange={() => handleToggleRow(wo.id)} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500" /></td>
                      <td className="py-2 px-2.5 font-medium text-slate-800">{wo.product}</td>
                      <td className="py-2 px-2.5 text-slate-500 max-w-[160px] truncate" title={wo.workCode}>{wo.workCode}</td>
                      <td className="py-2 px-2.5 text-slate-600">{wo.brand}</td>
                      <td className="py-2 px-2.5 text-right font-semibold">{wo.quantity}</td>
                      <td className="py-2 px-2.5 text-right">{wo.cuttingTotal > 0 ? <span className="text-green-600 font-semibold">{wo.cuttingTotal} ✓</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="py-2 px-2.5 text-right">{wo.sewingTotal > 0 ? <span className={cn('font-semibold', wo.sewingTotal >= wo.quantity ? 'text-green-600' : 'text-amber-600')}>{wo.sewingTotal}</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="py-2 px-2.5 text-right">{wo.finishingTotal > 0 ? <span className={cn('font-semibold', wo.finishingTotal >= wo.quantity ? 'text-green-600' : 'text-amber-600')}>{wo.finishingTotal}</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="py-2 px-2.5 text-right">{wo.cuttingTotal > 0 ? <span className={cn('font-semibold', sisa === 0 ? 'text-green-600' : 'text-amber-600')}>{sisa}</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="py-2 px-2.5 text-center"><StatusBadge status={wo.derivedStatus} /></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CUTTING LOG */}
        {activeTab === 'cutting' && (
          <div>
            {cuttingMessage && <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-[12px] text-green-700">{cuttingMessage}</div>}
            <div className="mb-4"><h3 className="text-[13px] font-semibold text-slate-700 mb-2">🔵 Antrian Cutting — {cuttingQueueWO.length} WO</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {cuttingQueueWO.length === 0 ? <div className="py-6 text-center text-slate-400 text-[12px]">✅ Semua sudah di-cutting</div> :
                  <table className="w-full text-[11px] border-collapse">
                    <thead><tr className="bg-slate-50 border-b border-gray-200"><th className="text-left py-2 px-3 font-semibold">Work Code</th><th className="text-left py-2 px-3 font-semibold">Brand</th><th className="text-right py-2 px-3 font-semibold">Qty</th><th className="text-center py-2 px-3 font-semibold">Cutting</th><th className="text-center py-2 px-3 font-semibold">Action</th></tr></thead>
                    <tbody>{cuttingQueueWO.map(wo => <tr key={wo.id} className="border-b border-gray-100 hover:bg-blue-50/30"><td className="py-2 px-3"><div className="font-medium">{wo.product}</div><div className="text-[10px] text-slate-400">{wo.workCode}</div></td><td className="py-2 px-3 text-slate-600">{wo.brand}</td><td className="py-2 px-3 text-right font-semibold">{wo.quantity}</td><td className="py-2 px-3 text-center"><input type="number" value={cuttingInputs[wo.id] || ''} onChange={e => setCuttingInputs(prev => ({ ...prev, [wo.id]: e.target.value }))} className="w-24 h-7 px-2 text-[11px] border border-gray-200 rounded text-center" /></td><td className="py-2 px-3 text-center"><button onClick={() => handleInputCutting(wo.id)} className="px-3 py-1 text-[10px] font-semibold bg-blue-500 text-white rounded-md hover:bg-blue-600">Simpan 🔒</button></td></tr>)}</tbody>
                  </table>}
              </div>
            </div>
            <div><h3 className="text-[13px] font-semibold text-slate-700 mb-2">🟢 Riwayat Cutting ({cuttingDoneWO.length} WO)</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-[11px] border-collapse">
                  <thead><tr className="bg-slate-50 border-b border-gray-200"><th className="text-left py-2 px-3 font-semibold">Work Code</th><th className="text-right py-2 px-3 font-semibold">Qty</th><th className="text-right py-2 px-3 font-semibold">Cutting</th><th className="text-right py-2 px-3 font-semibold">Sisa</th><th className="text-left py-2 px-3 font-semibold">Input By</th><th className="text-left py-2 px-3 font-semibold">Tanggal</th></tr></thead>
                  <tbody>{cuttingDoneWO.map(wo => { const cr = getCuttingForWO(wo.id); return <tr key={wo.id} className="border-b border-gray-100 hover:bg-slate-50/30"><td className="py-2 px-3"><div className="font-medium">{wo.product}</div><div className="text-[10px] text-slate-400">{wo.workCode}</div></td><td className="py-2 px-3 text-right">{wo.quantity}</td><td className="py-2 px-3 text-right font-semibold text-green-600">{cr?.totalCutting || '—'}</td><td className="py-2 px-3 text-right text-slate-500">{cr?.sisaCutting || '—'}</td><td className="py-2 px-3 text-slate-600">{cr?.inputBy || '—'}</td><td className="py-2 px-3 text-slate-600">{cr ? formatDate(cr.inputAt) : '—'}</td></tr>; })}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SEWING LOG */}
        {activeTab === 'sewing' && (
          <div>
            <div className="flex items-center justify-between mb-3"><p className="text-[12px] text-slate-500">Database hasil jahitan <strong>LULUS QC</strong></p><button onClick={() => onOpenSewingEntry?.()} className="px-3 py-1.5 text-[11px] font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600">➕ Entry Jahitan Baru</button></div>
            <div className="relative max-w-xs mb-3"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" /><input type="text" placeholder="Cari..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg" /></div>
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead><tr className="bg-slate-50 border-b border-gray-200"><th className="text-left py-2.5 px-3 font-semibold">Tanggal</th><th className="text-left py-2.5 px-3 font-semibold">Work Code</th><th className="text-left py-2.5 px-3 font-semibold">PIC</th><th className="text-right py-2.5 px-3 font-semibold">Qty</th><th className="text-center py-2.5 px-3 font-semibold">Bukti</th></tr></thead>
                <tbody>{sewingData.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-slate-400">Belum ada</td></tr> : sewingData.map(sr => <tr key={sr.id} className="border-b border-gray-100 hover:bg-slate-50/30"><td className="py-2.5 px-3">{formatDate(sr.tanggalLaporan)}</td><td className="py-2.5 px-3"><div className="font-medium">{workOrders.find(w => w.id === sr.workOrderId)?.product || '—'}</div><div className="text-[10px] text-slate-400">{sr.workCode}</div></td><td className="py-2.5 px-3">{sr.picPenjahit}</td><td className="py-2.5 px-3 text-right font-semibold">{sr.qtySelesai}</td><td className="py-2.5 px-3 text-center">{sr.imageName ? <Image className="w-3.5 h-3.5 text-blue-500" /> : '—'}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* FINISHING LOG */}
        {activeTab === 'finishing' && (
          <div>
            <div className="flex items-center justify-between mb-3"><p className="text-[12px] text-slate-500">Database hasil <strong>finishing</strong></p><button onClick={() => onOpenFinishingEntry?.()} className="px-3 py-1.5 text-[11px] font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">➕ Entry Finishing Baru</button></div>
            <div className="relative max-w-xs mb-3"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" /><input type="text" placeholder="Cari..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg" /></div>
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead><tr className="bg-slate-50 border-b border-gray-200"><th className="text-left py-2.5 px-3 font-semibold">Tanggal</th><th className="text-left py-2.5 px-3 font-semibold">Work Code</th><th className="text-left py-2.5 px-3 font-semibold">PIC</th><th className="text-right py-2.5 px-3 font-semibold">Qty</th><th className="text-center py-2.5 px-3 font-semibold">Bukti</th></tr></thead>
                <tbody>{finishingLogData.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-slate-400">Belum ada</td></tr> : finishingLogData.map(fr => <tr key={fr.id} className="border-b border-gray-100 hover:bg-slate-50/30"><td className="py-2.5 px-3">{fr.tanggalImport ? formatDate(fr.tanggalImport) : '—'}</td><td className="py-2.5 px-3"><div className="font-medium">{workOrders.find(w => w.id === fr.workOrderId)?.product || '—'}</div><div className="text-[10px] text-slate-400">{workOrders.find(w => w.id === fr.workOrderId)?.workCode || fr.workOrderId}</div></td><td className="py-2.5 px-3">{fr.picFinishing || fr.inputBy || '—'}</td><td className="py-2.5 px-3 text-right font-semibold">{fr.qtyFinishing}</td><td className="py-2.5 px-3 text-center">{fr.imageName ? <Image className="w-3.5 h-3.5 text-emerald-500" /> : '—'}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* PASANG KANCING LOG */}
        {activeTab === 'kancing' && (
          <div>
            <div className="flex items-center justify-between mb-3"><p className="text-[12px] text-slate-500">Database hasil <strong>pasang kancing manual</strong> (lubangi + jahit kancing)</p><button onClick={() => onOpenKancingEntry?.()} className="px-3 py-1.5 text-[11px] font-semibold bg-violet-500 text-white rounded-lg hover:bg-violet-600">➕ Entry Pasang Kancing Baru</button></div>
            <div className="relative max-w-xs mb-3"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" /><input type="text" placeholder="Cari..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg" /></div>
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead><tr className="bg-slate-50 border-b border-gray-200"><th className="text-left py-2.5 px-3 font-semibold">Tanggal</th><th className="text-left py-2.5 px-3 font-semibold">Work Code</th><th className="text-left py-2.5 px-3 font-semibold">PIC</th><th className="text-right py-2.5 px-3 font-semibold">Qty</th><th className="text-center py-2.5 px-3 font-semibold">Bukti</th></tr></thead>
                <tbody>{kancingLogData.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-slate-400">Belum ada</td></tr> : kancingLogData.map(kr => <tr key={kr.id} className="border-b border-gray-100 hover:bg-slate-50/30"><td className="py-2.5 px-3">{formatDate(kr.tanggalLaporan)}</td><td className="py-2.5 px-3"><div className="font-medium">{workOrders.find(w => w.id === kr.workOrderId)?.product || '—'}</div><div className="text-[10px] text-slate-400">{kr.workCode}</div></td><td className="py-2.5 px-3">{kr.picKancing}</td><td className="py-2.5 px-3 text-right font-semibold">{kr.qtyKancing}</td><td className="py-2.5 px-3 text-center">{kr.imageName ? <Image className="w-3.5 h-3.5 text-violet-500" /> : '—'}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* KANBAN */}
        {activeTab === 'kanban' && (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="h-full overflow-x-auto">
              <div className="grid grid-cols-[repeat(5,350px)] gap-4 min-w-max pb-4">
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
        {selectedGroup && (
          <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={() => setSelectedGroup(null)}>
            <div
              className="relative bg-white rounded-2xl shadow-2xl w-[min(1100px,96vw)] h-[min(86vh,900px)] flex flex-col overflow-hidden border border-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[11px] font-mono font-bold text-slate-900 truncate">{selectedGroup.productNote}</span>
                  <StatusBadge status={selectedGroup.status} />
                </div>
                <button onClick={() => setSelectedGroup(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="Tutup">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {/* Identity */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Product</p>
                    <p className="text-[13px] font-semibold text-slate-800 mt-0.5">{selectedGroup.product}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Brand</p>
                    <p className="text-[13px] font-semibold text-slate-800 mt-0.5">{selectedGroup.brand}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Qty</p>
                    <p className="text-[13px] font-semibold text-slate-800 mt-0.5">{selectedGroup.totalQty} pcs</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Work Code</p>
                    <p className="text-[13px] font-semibold text-slate-800 mt-0.5">{selectedGroup.workOrders.length}</p>
                  </div>
                </div>

                {/* Work code list */}
                <h3 className="text-[12px] font-bold text-slate-700 mb-2">Daftar Work Code</h3>
                <div className="border border-gray-200 rounded-lg overflow-x-auto mb-5">
                  <table className="w-full text-[11px] border-collapse">
                    <thead><tr className="bg-slate-50 border-b border-gray-200"><th className="text-left py-2.5 px-3 font-semibold">Work Code</th><th className="text-left py-2.5 px-3 font-semibold">Warna</th><th className="text-left py-2.5 px-3 font-semibold">Size</th><th className="text-right py-2.5 px-3 font-semibold">Qty</th><th className="text-right py-2.5 px-3 font-semibold">Cutting</th><th className="text-right py-2.5 px-3 font-semibold">Jahit</th><th className="text-center py-2.5 px-3 font-semibold">Status</th></tr></thead>
                    <tbody>
                      {selectedGroup.workOrders.map(wo => (
                        <tr key={wo.id} className="border-b border-gray-100 hover:bg-slate-50/30">
                          <td className="py-2.5 px-3 font-mono text-[10px] text-slate-600">{wo.workCode}</td>
                          <td className="py-2.5 px-3">{wo.warna}</td>
                          <td className="py-2.5 px-3">{wo.size}</td>
                          <td className="py-2.5 px-3 text-right font-semibold">{wo.quantity}</td>
                          <td className="py-2.5 px-3 text-right">{(wo as WorkOrder & { cuttingTotal?: number }).cuttingTotal ?? '—'}</td>
                          <td className="py-2.5 px-3 text-right">{(wo as WorkOrder & { sewingTotal?: number }).sewingTotal ?? '—'}</td>
                          <td className="py-2.5 px-3 text-center"><StatusBadge status={(wo as WorkOrder & { derivedStatus: ProductionStatus }).derivedStatus} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Report bubbles — one at a time */}
                <FullScreenReports group={selectedGroup} sewingList={sewingRecords} finishingList={finishingRecords} />
              </div>
            </div>
          </div>
        )}

        {/* PULL MODAL */}
        {showPullModal && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={() => setShowPullModal(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between"><h3 className="text-[14px] font-semibold">📥 Pull Order Entry</h3><button onClick={() => setShowPullModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button></div>
              <div className="flex-1 overflow-auto p-5">
                {planningOrders.length === 0 ? <div className="py-8 text-center text-slate-400">✅ Semua sudah di-pull</div> :
                  <table className="w-full text-[11px]">
                    <thead><tr className="bg-slate-50 border-b"><th className="text-left py-2 px-3 font-semibold">Product</th><th className="text-left py-2 px-3 font-semibold">Work Code</th><th className="text-left py-2 px-3 font-semibold">Brand</th><th className="text-right py-2 px-3 font-semibold">Qty</th><th className="text-center py-2 px-3 font-semibold">Action</th></tr></thead>
                    <tbody>{planningOrders.map(po => <tr key={po.id} className="border-b hover:bg-blue-50/30"><td className="py-2 px-3 font-medium">{po.product}</td><td className="py-2 px-3 text-slate-500 max-w-[180px] truncate">{po.workCode}</td><td className="py-2 px-3 text-slate-600">{po.brand}</td><td className="py-2 px-3 text-right font-semibold">{po.quantity}</td><td className="py-2 px-3 text-center"><button onClick={() => handlePullOrder(po.id)} className="px-3 py-1 text-[10px] font-semibold bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1 mx-auto"><ArrowRight className="w-3 h-3" /> Pull</button></td></tr>)}</tbody>
                  </table>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
