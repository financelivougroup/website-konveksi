import { useState } from 'react';
import { Search, Plus, ArrowRight, XCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  mockProductionOrders,
  mockWorkOrders,
  nextWOId,
  formatDate,
} from '@/data/pipelineData';
import type { WorkOrder } from '@/types/pipeline';

export default function OrderEntry() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'planning' | 'pulled' | 'cancelled'>('all');
  const [message, setMessage] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({ productNote: 'B-00', product: '', brand: 'Cassca', warna: '', size: '', quantity: '' });

  // Filter
  const filtered = mockProductionOrders.filter((po) => {
    if (filterStatus !== 'all' && po.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        po.product.toLowerCase().includes(q) ||
        po.brand.toLowerCase().includes(q) ||
        po.workCode.toLowerCase().includes(q) ||
        po.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handlePull = (poId: string) => {
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
    setMessage(`✅ "${po.product}" berhasil di-pull! Work Order ${newId} siap di-cutting.`);
    setTimeout(() => setMessage(null), 3500);
  };

  const handleCancel = (poId: string) => {
    const po = mockProductionOrders.find((p) => p.id === poId);
    if (!po || po.status !== 'PLANNING') return;
    po.status = 'CANCELLED';
    setMessage(`✅ Order "${po.product}" dibatalkan.`);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCreate = () => {
    const { productNote, product, brand, warna, size, quantity } = form;
    if (!product || !warna || !size || !quantity) {
      setMessage('⚠️ Harap isi semua field!');
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    const workCode = `${productNote.includes('B-00') ? 'Produksi - Awal' : `Restock-${productNote.substring(2, 4)}`} | ${product} | ${warna} | ${size}`;
    const id = `PO-${String(mockProductionOrders.length + 1).padStart(3, '0')}`;

    mockProductionOrders.push({
      id,
      workCode,
      productNote,
      product,
      informationVariation: `Colour: ${warna} Size: ${size}`,
      warna,
      size,
      brand,
      quantity: Number(quantity),
      status: 'PLANNING',
      createdBy: 'Owner',
      createdAt: new Date().toISOString().split('T')[0],
    });

    setShowCreateModal(false);
    setForm({ productNote: 'B-00', product: '', brand: 'Cassca', warna: '', size: '', quantity: '' });
    setMessage(`✅ Order "${product}" berhasil dibuat! (${id})`);
    setTimeout(() => setMessage(null), 3000);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'PLANNING': return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">PLANNING</span>;
      case 'PULLED': return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">PULLED</span>;
      case 'CANCELLED': return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">CANCELLED</span>;
      default: return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">📋 Order Entry</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Production Module — Create, Pull to Konveksi, or Cancel orders
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="h-8 px-3 text-[11px] font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> New Order
            </button>
            <div className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              👤 <strong>Owner</strong>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-[12px] text-blue-700 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-blue-500" />
            {message}
          </div>
        )}

        {/* Search + Filter tabs */}
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari order..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          {(['all', 'planning', 'pulled', 'cancelled'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={cn(
                'px-3 py-1 text-[11px] font-medium rounded-lg transition-colors',
                filterStatus === f
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              )}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && (
                <span className="ml-1 opacity-70">
                  ({mockProductionOrders.filter((p) => p.status === f.toUpperCase()).length})
                </span>
              )}
            </button>
          ))}
          <span className="text-[11px] text-slate-400 ml-auto">{filtered.length} orders</span>
        </div>

        {/* Table */}
        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200">
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Order ID</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Product</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Work Code</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Brand</th>
                <th className="text-right py-2.5 px-3 font-semibold text-slate-600">Qty</th>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Created</th>
                <th className="text-center py-2.5 px-3 font-semibold text-slate-600">Status</th>
                <th className="text-center py-2.5 px-3 font-semibold text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-slate-400">Tidak ada order ditemukan</td></tr>
              )}
              {filtered.map((po) => (
                <tr key={po.id} className="border-b border-gray-100 hover:bg-slate-50/50">
                  <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">{po.id}</td>
                  <td className="py-2.5 px-3 font-medium">{po.product}</td>
                  <td className="py-2.5 px-3 text-slate-500 max-w-[180px] truncate" title={po.workCode}>{po.workCode}</td>
                  <td className="py-2.5 px-3 text-slate-600">{po.brand}</td>
                  <td className="py-2.5 px-3 text-right font-semibold">{po.quantity}</td>
                  <td className="py-2.5 px-3 text-slate-500">{formatDate(po.createdAt)}</td>
                  <td className="py-2.5 px-3 text-center">{statusBadge(po.status)}</td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {po.status === 'PLANNING' && (
                        <>
                          <button
                            onClick={() => handlePull(po.id)}
                            className="px-2.5 py-1 text-[10px] font-semibold bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1"
                            title="Pull to Production"
                          >
                            <ArrowRight className="w-3 h-3" /> Pull
                          </button>
                          <button
                            onClick={() => handleCancel(po.id)}
                            className="px-2 py-1 text-[10px] text-red-500 border border-red-200 rounded hover:bg-red-50"
                            title="Cancel Order"
                          >
                            <XCircle className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      {po.status === 'PULLED' && (
                        <span className="text-[10px] text-amber-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Pulled
                        </span>
                      )}
                      {po.status === 'CANCELLED' && (
                        <span className="text-[10px] text-red-400">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Info */}
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-800">
          📋 <strong>Alur:</strong> Buat Order Baru (PLANNING) → <strong>Pull to Production</strong> → Work Order masuk ke <strong>Production Monitoring</strong> (RAW DATA) dengan status CUTTING_PENDING → Lanjut ke Cutting → Sewing → Finishing.
        </div>
      </div>

      {/* Create Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200">
              <h3 className="text-[14px] font-semibold">📋 Create New Order</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Product Note</label>
                  <input value={form.productNote} onChange={(e) => setForm({ ...form, productNote: e.target.value })} className="w-full h-8 px-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300" placeholder="B-00" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Product *</label>
                  <input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} className="w-full h-8 px-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300" placeholder="Rue Top" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Brand</label>
                  <select value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="w-full h-8 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white">
                    <option>Cassca</option>
                    <option>Livou</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Warna *</label>
                  <input value={form.warna} onChange={(e) => setForm({ ...form, warna: e.target.value })} className="w-full h-8 px-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300" placeholder="Black" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Size *</label>
                  <input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className="w-full h-8 px-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300" placeholder="M" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Quantity *</label>
                  <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full h-8 px-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300" placeholder="100" />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-1.5 text-[11px] text-slate-600 border border-gray-200 rounded-lg hover:bg-white">Batal</button>
              <button onClick={handleCreate} className="px-4 py-1.5 text-[11px] font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600">✅ Create Order</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
