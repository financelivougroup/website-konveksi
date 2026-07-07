import { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  ArrowRight,
  Download,
  Eye,
  Lock,
  Image,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  mockWorkOrders,
  mockCuttingRecords,
  mockSewingRecords,
  mockProductionOrders,
  getCuttingForWO,
  getSewingTotal,
  formatDate,
  nextWOId,
} from '@/data/pipelineData';
import type { WorkOrder } from '@/types/pipeline';
import type { ProductionStatus } from '@/types/pipeline';
import { productionStatusLabel, productionStatusColor } from '@/types/pipeline';

type TabType = 'raw' | 'cutting' | 'sewing' | 'kanban';


// ===== Status Badge =====
function StatusBadge({ status }: { status: ProductionStatus }) {
  const colorClass = productionStatusColor[status] || 'bg-gray-100 text-gray-700';
  const label = productionStatusLabel[status] || status;
  return (
    <span className={cn('inline-block px-2 py-0.5 rounded text-[10px] font-semibold', colorClass)}>
      {label}
    </span>
  );
}

// ===== Kanban Card =====
function KanbanCard({ wo, statusOverride }: { wo: WorkOrder; statusOverride?: { label: string; color: string } }) {
  const cutting = getCuttingForWO(wo.id);
  const jahit = getSewingTotal(wo.id);
  const cuttingTotal = cutting?.totalCutting ?? 0;
  const jahitTotal = jahit;
  const sisa = cuttingTotal - jahitTotal;

  return (
    <div className="bg-white rounded-[14px] border border-[#E5E7EB] shadow-sm p-[14px] hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-md transition-all duration-200 ease-out cursor-pointer w-full max-w-[350px]">
      {/* Header: Product Note + Status Badge */}
      <div className="flex items-start justify-between gap-2 mb-[10px]">
        <span className="text-[12px] font-bold leading-[1.3] text-slate-900 truncate flex-1 min-w-0">{wo.productNoteFull}</span>
        {statusOverride ? (
          <span className={cn('inline-block shrink-0 rounded-full text-[11px] font-semibold leading-none px-2 py-1', statusOverride.color)}>
            {statusOverride.label}
          </span>
        ) : (
          <span className={cn('inline-block shrink-0 rounded-full text-[11px] font-semibold leading-none px-2 py-1', productionStatusColor[wo.productionStatus] || 'bg-gray-100 text-gray-700')}>
            {productionStatusLabel[wo.productionStatus] || wo.productionStatus}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-[#6B7280]">{wo.brand}</span>
        <span className="text-[12px] font-semibold leading-[1.4] text-slate-800">{wo.product}</span>
        {/* Cutting | Jahit | Sisa */}
        <div className="flex items-center gap-3 text-[12px]">
          <span className="text-slate-600">C: <span className="font-semibold text-slate-800">{cuttingTotal}</span></span>
          <span className="text-slate-600">J: <span className="font-semibold text-slate-800">{jahitTotal}</span></span>
          <span className="text-slate-600">S: <span className="font-semibold text-slate-800">{sisa}</span></span>
        </div>
        {/* Qty (Finish Good) */}
        <span className="text-[12px] text-slate-600">Qty: <span className="font-bold text-slate-900">{wo.quantity} pcs</span></span>
      </div>
    </div>
  );
}

// ===== Production Monitoring Page =====
export default function ProductionMonitoring({ onOpenSewingEntry }: { onOpenSewingEntry?: () => void }) {
  const [activeTab, setActiveTab] = useState<TabType>('raw');
  const [searchQuery, setSearchQuery] = useState('');
  const [cuttingInputs, setCuttingInputs] = useState<Record<string, string>>({});
  const [cuttingMessage, setCuttingMessage] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showPullModal, setShowPullModal] = useState(false);
  const [pullMessage, setPullMessage] = useState<string | null>(null);

  // Filtered work orders based on search
  const filteredWO = useMemo(() => {
    if (!searchQuery) return mockWorkOrders;
    const q = searchQuery.toLowerCase();
    return mockWorkOrders.filter(w =>
      w.workCode.toLowerCase().includes(q) ||
      w.product.toLowerCase().includes(q) ||
      w.brand.toLowerCase().includes(q) ||
      w.warna.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // ===== CUTTING LOG =====
  const cuttingQueueWO = filteredWO.filter(w =>
    w.productionStatus === 'CUTTING_PENDING'
  );
  const cuttingDoneWO = filteredWO.filter(w =>
    w.productionStatus === 'CUTTING_COMPLETE' ||
    w.productionStatus === 'SEWING_IN_PROGRESS' ||
    w.productionStatus === 'SEWING_COMPLETE' ||
    w.productionStatus === 'FINISHING_IN_PROGRESS' ||
    w.productionStatus === 'FINISHING_COMPLETE'
  );

  const handleInputCutting = (woId: string) => {
    const val = cuttingInputs[woId];
    if (!val || isNaN(Number(val)) || Number(val) <= 0) {
      setCuttingMessage('Masukkan jumlah cutting yang valid!');
      return;
    }
    const qty = Number(val);
    const wo = mockWorkOrders.find(w => w.id === woId);
    if (!wo) return;

    // Create cutting record
    mockCuttingRecords.push({
      id: `CR-${String(mockCuttingRecords.length + 1).padStart(3, '0')}`,
      workOrderId: woId,
      totalCutting: qty,
      inputBy: 'Budi (Gudang)',
      inputAt: new Date().toISOString().split('T')[0],
      locked: true,
      sisaCutting: qty - wo.quantity,
    });

    // Update work order status
    wo.productionStatus = 'CUTTING_COMPLETE';

    setCuttingMessage(`✅ Cutting ${qty} pcs untuk "${wo.product}" berhasil disimpan dan LOCKED!`);
    setCuttingInputs(prev => ({ ...prev, [woId]: '' }));
    setTimeout(() => setCuttingMessage(null), 3000);
  };

  // ===== ROW SELECTION =====
  const handleToggleRow = (woId: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(woId)) next.delete(woId);
      else next.add(woId);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedRows.size === filteredWO.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredWO.map((w) => w.id)));
    }
  };

  const handleImport = () => {
    if (selectedRows.size === 0) {
      alert('Pilih minimal 1 work order untuk di-import!');
      return;
    }
    const names = selectedRows
      .map((id) => mockWorkOrders.find((w) => w.id === id)?.product)
      .filter(Boolean)
      .join(', ');
    alert(`✅ ${selectedRows.size} work order berhasil di-import:\n${names}`);
    setSelectedRows(new Set());
  };

  // ===== PULL ORDER ENTRY =====
  const planningOrders = mockProductionOrders.filter((p) => p.status === 'PLANNING');

  const handlePullOrder = (poId: string) => {
    const po = mockProductionOrders.find((p) => p.id === poId);
    if (!po || po.status !== 'PLANNING') return;

    po.status = 'PULLED';
    po.pulledAt = new Date().toISOString().split('T')[0];
    po.pulledBy = 'Owner';

    const newId = nextWOId();
    const productId = `${po.brand.substring(0, 3).toUpperCase()}-${po.product.replace(/\s/g, '-').toUpperCase().substring(0, 5)}`;
    const wo: WorkOrder = {
      id: newId,
      workCode: po.workCode,
      sourceOrderId: po.id,
      productNote: po.productNote,
      productNoteFull: `PDFF_${productId}_${po.productNote}_PRDN`,
      product: po.product,
      productId,
      variationId: `${productId}-${po.warna.toUpperCase().substring(0, 3)}-${po.size}`,
      informationVariation: po.informationVariation,
      warna: po.warna,
      size: po.size,
      brand: po.brand,
      quantity: po.quantity,
      productionStatus: 'CUTTING_PENDING',
      invoiceStatus: 'NONE',
      createdBy: 'Owner',
      createdAt: po.createdAt,
      pulledAt: po.pulledAt,
    };
    mockWorkOrders.push(wo);
    setPullMessage(`✅ "${po.product}" berhasil di-pull! (${newId})`);
    if (planningOrders.length <= 1) setShowPullModal(false);
    setTimeout(() => setPullMessage(null), 3000);
  };

  // ===== SEWING LOG =====
  const sewingData = useMemo(() => {
    return mockSewingRecords.filter(s =>
      !searchQuery ||
      s.workCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.picPenjahit.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => b.tanggalLaporan.localeCompare(a.tanggalLaporan));
  }, [searchQuery]);

  // ===== DATA VIEW TABS =====
  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'raw', label: 'RAW DATA', icon: '📋' },
    { id: 'cutting', label: 'Cutting Log', icon: '✂️' },
    { id: 'sewing', label: 'Sewing Log', icon: '🧵' },
    { id: 'kanban', label: 'Kanban', icon: '📊' },
  ];

  return (
    <>
    <div className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="p-4 sm:p-5 pb-0">
        {/* Title */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Production Monitoring</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Pipeline: Work Order → Cutting → Sewing → Finishing
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPullModal(true)}
              className="h-7 px-3 text-[10px] font-semibold bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-1.5"
            >
              📥 Pull Order Entry
            </button>
            <div className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              👤 Role: <strong>Owner</strong>
            </div>
          </div>
        </div>

        {/* Pull Message */}
        {pullMessage && (
          <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-[12px] text-green-700">
            {pullMessage}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-[12px] font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'text-blue-600 border-blue-600'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              )}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ==================== */}
      {/* TAB CONTENT          */}
      {/* ==================== */}
      <div className="flex-1 p-4 sm:p-5 pt-3 overflow-auto">

        {/* ===== RAW DATA ===== */}
        {activeTab === 'raw' && (
          <div>
            {/* Search + Filter */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari work order..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <button className="h-8 px-2.5 text-[11px] border border-gray-200 rounded-lg flex items-center gap-1.5 text-slate-600 hover:bg-gray-50">
                <Filter className="w-3 h-3" /> Filter
              </button>
              <button className="h-8 px-2.5 text-[11px] border border-gray-200 rounded-lg flex items-center gap-1.5 text-slate-600 hover:bg-gray-50">
                <ArrowUpDown className="w-3 h-3" /> Sort
              </button>
              <button className="h-8 px-2.5 text-[11px] border border-gray-200 rounded-lg flex items-center gap-1.5 text-slate-600 hover:bg-gray-50">
                <Download className="w-3 h-3" /> Export
              </button>
              <button
                onClick={handleImport}
                className={cn(
                  'h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium transition-colors',
                  selectedRows.size > 0
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'border border-gray-200 text-slate-400'
                )}
              >
                📥 Import ({selectedRows.size})
              </button>
              <span className="text-[11px] text-slate-400 ml-auto">
                {filteredWO.length} work orders
              </span>
            </div>

            {/* RAW DATA TABLE */}
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200">
                    <th className="w-8 py-2 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedRows.size === filteredWO.length && filteredWO.length > 0}
                        onChange={handleToggleAll}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                      />
                    </th>
                    <th className="text-left py-2 px-2.5 font-semibold text-slate-600 whitespace-nowrap">Product</th>
                    <th className="text-left py-2 px-2.5 font-semibold text-slate-600 whitespace-nowrap">Work Code</th>
                    <th className="text-left py-2 px-2.5 font-semibold text-slate-600 whitespace-nowrap">Product Note</th>
                    <th className="text-left py-2 px-2.5 font-semibold text-slate-600 whitespace-nowrap">Product ID</th>
                    <th className="text-left py-2 px-2.5 font-semibold text-slate-600 whitespace-nowrap">Variation ID</th>
                    <th className="text-left py-2 px-2.5 font-semibold text-slate-600">Warna</th>
                    <th className="text-left py-2 px-2.5 font-semibold text-slate-600">Size</th>
                    <th className="text-left py-2 px-2.5 font-semibold text-slate-600">Brand</th>
                    <th className="text-right py-2 px-2.5 font-semibold text-slate-600">Qty</th>
                    <th className="text-right py-2 px-2.5 font-semibold text-slate-600">Cutting</th>
                    <th className="text-right py-2 px-2.5 font-semibold text-slate-600">Sisa</th>
                    <th className="text-right py-2 px-2.5 font-semibold text-slate-600">Jahit</th>
                    <th className="text-center py-2 px-2.5 font-semibold text-slate-600">Prod. Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWO.length === 0 && (
                    <tr>
                      <td colSpan={14} className="py-8 text-center text-slate-400">Tidak ada work order ditemukan</td>
                    </tr>
                  )}
                  {filteredWO.map((wo) => {
                    const cutting = getCuttingForWO(wo.id);
                    const sewingTotal = getSewingTotal(wo.id);
                    return (
                      <tr key={wo.id} className={cn('border-b border-gray-100 hover:bg-slate-50/50', selectedRows.has(wo.id) && 'bg-blue-50/40')}>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedRows.has(wo.id)}
                            onChange={() => handleToggleRow(wo.id)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                          />
                        </td>
                        <td className="py-2 px-2.5 font-medium text-slate-800">{wo.product}</td>
                        <td className="py-2 px-2.5 text-slate-500 max-w-[160px] truncate" title={wo.workCode}>{wo.workCode}</td>
                        <td className="py-2 px-2.5 text-slate-600 text-[10px] font-mono">{wo.productNoteFull}</td>
                        <td className="py-2 px-2.5 text-slate-600 text-[10px]">{wo.productId}</td>
                        <td className="py-2 px-2.5 text-slate-500 text-[10px]">{wo.variationId}</td>
                        <td className="py-2 px-2.5 text-slate-600">{wo.warna}</td>
                        <td className="py-2 px-2.5 text-slate-600">{wo.size}</td>
                        <td className="py-2 px-2.5 text-slate-600">{wo.brand}</td>
                        <td className="py-2 px-2.5 text-right font-semibold">{wo.quantity}</td>
                        <td className="py-2 px-2.5 text-right">
                          {cutting ? (
                            <span className="text-green-600 font-semibold">{cutting.totalCutting} ✓</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-right text-slate-500">
                          {cutting ? cutting.sisaCutting : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          {sewingTotal > 0 ? (
                            <span className={cn('font-semibold', sewingTotal >= wo.quantity ? 'text-green-600' : 'text-amber-600')}>
                              {sewingTotal}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          <StatusBadge status={wo.productionStatus} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Empty state */}
            {filteredWO.length === 0 && searchQuery && (
              <div className="text-center py-8 text-slate-400 text-[13px]">
                Tidak ada work order yang cocok dengan "{searchQuery}"
              </div>
            )}
          </div>
        )}

        {/* ===== CUTTING LOG ===== */}
        {activeTab === 'cutting' && (
          <div>
            {/* Success message */}
            {cuttingMessage && (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-[12px] text-green-700">
                {cuttingMessage}
              </div>
            )}

            {/* Cutting Queue */}
            <div className="mb-4">
              <h3 className="text-[13px] font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Antrian Cutting — {cuttingQueueWO.length} WO menunggu
              </h3>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {cuttingQueueWO.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-[12px]">
                    ✅ Semua work order sudah di-cutting
                  </div>
                ) : (
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-semibold text-slate-600">Work Code</th>
                        <th className="text-left py-2 px-3 font-semibold text-slate-600">Brand</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-600">Qty Order</th>
                        <th className="text-center py-2 px-3 font-semibold text-slate-600">Input Cutting</th>
                        <th className="text-center py-2 px-3 font-semibold text-slate-600 w-[100px]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuttingQueueWO.map((wo) => (
                        <tr key={wo.id} className="border-b border-gray-100 hover:bg-blue-50/30">
                          <td className="py-2 px-3">
                            <div className="font-medium">{wo.product}</div>
                            <div className="text-[10px] text-slate-400">{wo.workCode}</div>
                          </td>
                          <td className="py-2 px-3 text-slate-600">{wo.brand}</td>
                          <td className="py-2 px-3 text-right font-semibold">{wo.quantity}</td>
                          <td className="py-2 px-3 text-center">
                            <input
                              type="number"
                              placeholder="Total cutting..."
                              value={cuttingInputs[wo.id] || ''}
                              onChange={(e) => setCuttingInputs(prev => ({ ...prev, [wo.id]: e.target.value }))}
                              className="w-24 h-7 px-2 text-[11px] border border-gray-200 rounded outline-none focus:border-blue-300 text-center"
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => handleInputCutting(wo.id)}
                              className="px-3 py-1 text-[10px] font-semibold bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                            >
                              Simpan 🔒
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Cutting History */}
            <div>
              <h3 className="text-[13px] font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Riwayat Cutting ({cuttingDoneWO.length} WO)
              </h3>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">Work Code</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Qty</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Total Cutting</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Sisa</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">Input By</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">Tanggal</th>
                      <th className="text-center py-2 px-3 font-semibold text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuttingDoneWO.map((wo) => {
                      const cutting = getCuttingForWO(wo.id);
                      return (
                        <tr key={wo.id} className="border-b border-gray-100 hover:bg-slate-50/30">
                          <td className="py-2 px-3">
                            <div className="font-medium">{wo.product}</div>
                            <div className="text-[10px] text-slate-400">{wo.workCode}</div>
                          </td>
                          <td className="py-2 px-3 text-right">{wo.quantity}</td>
                          <td className="py-2 px-3 text-right font-semibold text-green-600">
                            {cutting?.totalCutting || '—'}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-500">
                            {cutting?.sisaCutting || '—'}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{cutting?.inputBy || '—'}</td>
                          <td className="py-2 px-3 text-slate-600">{cutting ? formatDate(cutting.inputAt) : '—'}</td>
                          <td className="py-2 px-3 text-center">
                            <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-medium">
                              <Lock className="w-2.5 h-2.5" /> Locked
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===== SEWING LOG ===== */}
        {activeTab === 'sewing' && (
          <div>
            {/* Header + Action */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] text-slate-500">
                Database hasil jahitan yang sudah <strong>LULUS QC</strong> — read-only
              </p>
              <button
                onClick={() => onOpenSewingEntry?.()}
                className="px-3 py-1.5 text-[11px] font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1.5"
              >
                ➕ Entry Jahitan Baru
              </button>
            </div>

            {/* Search */}
            <div className="relative max-w-xs mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Cari work code atau PIC..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Sewing Log Table */}
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200">
                    <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Tanggal</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Work Code</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-slate-600">PIC Penjahit</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-slate-600">Qty Selesai</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-slate-600">Bukti</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Input By</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-slate-600"></th>
                  </tr>
                </thead>
                <tbody>
                  {sewingData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">Belum ada entry jahitan</td>
                    </tr>
                  )}
                  {sewingData.map((sr) => {
                    const wo = mockWorkOrders.find(w => w.id === sr.workOrderId);
                    return (
                      <tr key={sr.id} className="border-b border-gray-100 hover:bg-slate-50/30">
                        <td className="py-2.5 px-3 text-slate-600">{formatDate(sr.tanggalLaporan)}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-800">{wo?.product || '—'}</div>
                          <div className="text-[10px] text-slate-400">{sr.workCode}</div>
                        </td>
                        <td className="py-2.5 px-3">{sr.picPenjahit}</td>
                        <td className="py-2.5 px-3 text-right font-semibold">{sr.qtySelesai}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-block text-blue-500 cursor-pointer hover:text-blue-700" title={sr.imageName || 'No image'}>
                            <Image className="w-3.5 h-3.5" />
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{sr.inputBy}</td>
                        <td className="py-2.5 px-3 text-center">
                          <button className="text-slate-400 hover:text-slate-600">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Progress by WO */}
            <div className="mt-4 space-y-2">
              <h3 className="text-[13px] font-semibold text-slate-700">📈 Sewing Progress per Work Order</h3>
              {mockWorkOrders.filter(w =>
                w.productionStatus === 'SEWING_IN_PROGRESS' ||
                w.productionStatus === 'SEWING_COMPLETE'
              ).map(wo => {
                const total = getSewingTotal(wo.id);
                const pct = Math.min(Math.round((total / wo.quantity) * 100), 100);
                const records = mockSewingRecords.filter(s => s.workOrderId === wo.id);
                const picSummary = records.reduce<Record<string, number>>((acc, r) => {
                  acc[r.picPenjahit] = (acc[r.picPenjahit] || 0) + r.qtySelesai;
                  return acc;
                }, {});
                return (
                  <div key={wo.id} className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-medium">{wo.product}</span>
                      <span className="text-[10px] text-slate-400">{wo.workCode}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-green-500' : 'bg-amber-500')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-600 w-12 text-right">{pct}%</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      Total: {total}/{wo.quantity} pcs
                      {Object.entries(picSummary).length > 0 && (
                        <span> — PIC: {Object.entries(picSummary).map(([name, qty]) => `${name} (${qty})`).join(', ')}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== KANBAN VIEW ===== */}
        {activeTab === 'kanban' && (
          <div className="h-full overflow-x-auto">
            <div className="grid grid-cols-7 gap-4 min-w-max pb-4">
              {([
                { status: 'CUTTING_PENDING' as const, label: productionStatusLabel.CUTTING_PENDING, color: productionStatusColor.CUTTING_PENDING },
                { status: 'CUTTING_COMPLETE' as const, label: productionStatusLabel.CUTTING_COMPLETE, color: productionStatusColor.CUTTING_COMPLETE },
                { status: 'SEWING_IN_PROGRESS' as const, label: productionStatusLabel.SEWING_IN_PROGRESS, color: productionStatusColor.SEWING_IN_PROGRESS },
                { status: 'SEWING_COMPLETE' as const, label: productionStatusLabel.SEWING_COMPLETE, color: productionStatusColor.SEWING_COMPLETE },
                { status: 'FINISHING_IN_PROGRESS' as const, label: productionStatusLabel.FINISHING_IN_PROGRESS, color: productionStatusColor.FINISHING_IN_PROGRESS },
                { status: 'FINISHING_COMPLETE' as const, label: productionStatusLabel.FINISHING_COMPLETE, color: productionStatusColor.FINISHING_COMPLETE },
              ] as const).map((col) => {
                const columnWOs = filteredWO.filter(w => w.productionStatus === col.status);
                return (
                  <div key={col.status} className="w-[350px] flex flex-col">
                    <div className={cn('rounded-t-lg px-4 py-3 flex items-center justify-between', col.color)}>
                      <span className="text-[13px] font-semibold">{col.label}</span>
                      <span className="text-[11px] font-bold bg-white/30 px-2 py-0.5 rounded-full">{columnWOs.length}</span>
                    </div>
                    <div className="flex-1 bg-slate-50 rounded-b-lg p-3 space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
                      {columnWOs.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-[12px]">No work orders</div>
                      ) : (
                        columnWOs.map(wo => <KanbanCard key={wo.id} wo={wo} />)
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Invoiced Column */}
              {(() => {
                const invoicedWOs = filteredWO.filter(w =>
                  w.productionStatus === 'FINISHING_COMPLETE' &&
                  w.invoiceStatus !== 'NONE'
                );
                return (
                  <div className="w-[350px] flex flex-col">
                    <div className="rounded-t-lg px-4 py-3 flex items-center justify-between bg-gray-100 text-gray-700">
                      <span className="text-[13px] font-semibold">Invoiced</span>
                      <span className="text-[11px] font-bold bg-white/30 px-2 py-0.5 rounded-full">{invoicedWOs.length}</span>
                    </div>
                    <div className="flex-1 bg-slate-50 rounded-b-lg p-3 space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
                      {invoicedWOs.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-[12px]">No work orders</div>
                      ) : (
                        invoicedWOs.map(wo => <KanbanCard key={wo.id} wo={wo} statusOverride={{ label: 'Invoiced', color: 'bg-gray-100 text-gray-700' }} />)
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>

      {/* ===== PULL ORDER ENTRY MODAL ===== */}
      {showPullModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={() => setShowPullModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold">📥 Pull Order Entry</h3>
              <button onClick={() => setShowPullModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {planningOrders.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-[13px]">
                  ✅ Semua order sudah di-pull. Tidak ada order PLANNING.
                </div>
              ) : (
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">Product</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">Work Code</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">Brand</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Qty</th>
                      <th className="text-center py-2 px-3 font-semibold text-slate-600">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planningOrders.map((po) => (
                      <tr key={po.id} className="border-b border-gray-100 hover:bg-blue-50/30">
                        <td className="py-2 px-3 font-medium">{po.product}</td>
                        <td className="py-2 px-3 text-slate-500 max-w-[180px] truncate" title={po.workCode}>{po.workCode}</td>
                        <td className="py-2 px-3 text-slate-600">{po.brand}</td>
                        <td className="py-2 px-3 text-right font-semibold">{po.quantity}</td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => handlePullOrder(po.id)}
                            className="px-3 py-1 text-[10px] font-semibold bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1 mx-auto"
                          >
                            <ArrowRight className="w-3 h-3" /> Pull
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 text-[11px] text-slate-400">
              Data bersumber dari <strong>Production Module</strong> (external). Klik Pull untuk menarik order ke pipeline Konveksi.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
