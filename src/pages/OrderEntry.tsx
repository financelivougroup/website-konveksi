import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { generateWorkCode } from '@/data/pipelineData';
import * as productionOrderSvc from '@/services/productionOrders';
import * as workOrderSvc from '@/services/workOrders';
import type { ProductionOrder } from '@/types/pipeline';

// Warna abbreviation map (for Variation ID)
const WARNA_ABBR: Record<string, string> = {
  black: 'BLK', white: 'WHT', navy: 'NVY', red: 'RED',
  grey: 'GRY', gray: 'GRY', beige: 'BEG', blue: 'BLU',
  green: 'GRN', brown: 'BRN', pink: 'PNK', yellow: 'YLW',
  orange: 'ORG', purple: 'PRP', cream: 'CRM', khaki: 'KHK',
  maroon: 'MRN', silver: 'SLV', gold: 'GLD',
};

function getWarnaAbbr(warna: string): string {
  const key = warna.toLowerCase().trim();
  if (WARNA_ABBR[key]) return WARNA_ABBR[key];
  // fallback: remove vowels, uppercase, max 3 chars
  const noVowels = key.replace(/[aeiou]/gi, '');
  return noVowels.toUpperCase().substring(0, 3) || key.toUpperCase().substring(0, 3);
}

// Variation ID = productId-warna-size (e.g. LVU-TOP-05-BLK-M)
function buildVariationId(productId: string, warna: string, size: string): string {
  if (!productId || !warna || !size) return '';
  return `${productId}-${getWarnaAbbr(warna)}-${size}`;
}

export default function OrderEntry() {
  const { profile } = useAuth();
  const currentDisplayName = profile.displayName;
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'PLANNING' | 'PULLED' | 'CANCELLED'>('PLANNING');
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ productId: '', productNote: 'B-00', product: '', brand: 'Cassca', warna: '', size: '' });
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const mountedRef = useRef(false);

  // Auto-computed values from form
  const computed = useMemo(() => {
    const varId = buildVariationId(form.productId, form.warna, form.size);
    const workCode = generateWorkCode(form.productNote, form.product, form.warna, form.size);
    return { varId, workCode };
  }, [form.productId, form.productNote, form.product, form.warna, form.size]);

  const fetchOrders = async () => {
    setLoading(true);
    const { data } = await productionOrderSvc.fetchAll();
    if (data) setOrders(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      fetchOrders();
    }
  }, []);

  const filtered = orders.filter((po) => {
    if (filterStatus !== 'all' && po.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return po.product.toLowerCase().includes(q) || po.brand.toLowerCase().includes(q) || po.workCode.toLowerCase().includes(q) || po.id.toLowerCase().includes(q);
    }
    return true;
  });

  const handlePull = async (poId: string) => {
    const po = orders.find((p) => p.id === poId);
    console.log('[Pull] attempting pull for po.id:', poId, 'found:', !!po, 'status:', po?.status);
    if (!po || po.status !== 'PLANNING') return;

    const pid = `${po.brand.substring(0, 3).toUpperCase()}-${po.product.replace(/\s/g, '-').toUpperCase().substring(0, 5)}`;
    const varId = buildVariationId(pid, po.warna, po.size);
    const now = new Date().toISOString().split('T')[0];

    // Update UI dulu — langsung hilang dari tab PLANNING
    setOrders((prev) => prev.map((p) => p.id === poId ? { ...p, status: 'PULLED' as const, pulledAt: now, pulledBy: currentDisplayName } : p));
    setMessage('⏳ Memproses Pull...');

    // Update PO di DB + tunggu hasilnya
    const { error: pullErr } = await productionOrderSvc.pullToKonveksi(po.id, currentDisplayName);
    console.log('[OrderEntry] pullToKonveksi result:', pullErr);

    if (pullErr) {
      // Rollback UI
      setOrders((prev) => prev.map((p) => p.id === poId ? { ...p, status: 'PLANNING' as const } : p));
      setMessage(`❌ Gagal update status PO: ${pullErr.message}`);
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    // Verify: refetch dari DB untuk pastiin beneran keupdate
    const { data: updatedPO } = await productionOrderSvc.fetchById(po.id);
    console.log('[OrderEntry] verifikasi status PO:', updatedPO?.status);

    // Create WO di DB
    const { data: newWO, error: woErr } = await workOrderSvc.create({
      workCode: po.workCode, sourceOrderId: po.id,
      productNote: po.productNote,
      product: po.product, productId: pid,
      variationId: varId,
      informationVariation: po.informationVariation, warna: po.warna, size: po.size, brand: po.brand,
      quantity: po.quantity, productionStatus: 'NEW', invoiceStatus: 'NONE',
      createdBy: currentDisplayName, createdAt: po.createdAt, pulledAt: now,
    });

    if (woErr) {
      setMessage(`⚠️ PO sudah PULLED, tapi WO gagal: ${woErr.message}. Hapus dari RAW DATA atau coba lagi.`);
    } else {
      setMessage(`✅ "${po.product}" berhasil di-pull! (WO: ${newWO?.id}) → Lanjut Register PO.`);
    }
    setTimeout(() => setMessage(null), 4000);
  };

  const handleCancel = async (poId: string) => {
    const po = orders.find((p) => p.id === poId);
    if (!po || po.status !== 'PLANNING') return;
    // Update UI dulu — langsung muncul di tab CANCELLED
    setOrders((prev) => prev.map((p) => (p.id === poId ? { ...p, status: 'CANCELLED' as const } : p)));
    setMessage('⏳ Membatalkan order...');

    try {
      const { error } = await productionOrderSvc.update(poId, { status: 'CANCELLED' });
      if (error) throw error;
      setMessage(`✅ Order "${po.product}" dibatalkan.`);
    } catch (e: any) {
      // Rollback UI kalau gagal
      setOrders((prev) => prev.map((p) => (p.id === poId ? { ...p, status: 'PLANNING' as const } : p)));
      setMessage(`❌ Gagal: ${e?.message || e}`);
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCreate = async () => {
    const { productId, productNote, product, brand, warna, size } = form;
    if (!productId || !product || !warna || !size) { setMessage('⚠️ Harap isi semua field!'); setTimeout(() => setMessage(null), 3000); return; }
    const workCode = generateWorkCode(productNote, product, warna, size);
    const { data: newPO, error } = await productionOrderSvc.create({
      workCode, productNote, product,
      informationVariation: `Colour: ${warna} Size: ${size}`, warna, size, brand, quantity: 0, status: 'PLANNING', createdBy: currentDisplayName, createdAt: new Date().toISOString().split('T')[0],
    });
    if (error) { setMessage(`❌ Error: ${error.message}`); return; }
    if (newPO) setOrders((prev) => [newPO, ...prev]);
    setForm({ productId: '', productNote: 'B-00', product: '', brand: 'Cassca', warna: '', size: '' });
    setMessage(`✅ Order "${product}" berhasil dibuat! Klik Pull untuk lanjut ke Register PO.`);
    setTimeout(() => setMessage(null), 3500);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'PLANNING': return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">PLANNING</span>;
      case 'PULLED': return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">PULLED</span>;
      case 'CANCELLED': return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">CANCELLED</span>;
      default: return null;
    }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading order data...</div></div>;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div><h1 className="text-lg font-bold text-slate-900">📋 Order Entry</h1></div>
          <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">👤 <strong>{currentDisplayName}</strong></div>
        </div>

        {message && <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-blue-500" />{message}</div>}

        {/* Create Order Card */}
        <button onClick={() => { setForm({ productId: '', productNote: 'B-00', product: '', brand: 'Cassca', warna: '', size: '' }); fetchOrders(); }} className="mb-2 text-xs text-sky-500 hover:text-sky-700 underline">🔄 Refresh list</button>
        <div className="mb-4 border-2 border-dashed border-sky-200 rounded-xl bg-gradient-to-br from-sky-50/50 to-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">➕ Buat Order Baru</h3>
              <p className="text-xs text-slate-500 mb-3">Quantity 0 — nanti sync dari Pancake.</p>

              {/* Input fields */}
              <div className="grid grid-cols-6 gap-2 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Product ID *</label>
                  <input value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className="w-full h-8 px-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 font-mono" placeholder="LVU-TOP-05" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Product *</label>
                  <input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} className="w-full h-8 px-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100" placeholder="Rue Top" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Brand</label>
                  <select value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="w-full h-8 px-2 text-sm border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300 focus:ring-2 focus:ring-sky-100">
                    <option>Cassca</option><option>Livou</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Warna *</label>
                  <input value={form.warna} onChange={(e) => setForm({ ...form, warna: e.target.value })} className="w-full h-8 px-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100" placeholder="Black" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Size *</label>
                  <input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className="w-full h-8 px-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100" placeholder="M" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Product Note</label>
                  <input value={form.productNote} onChange={(e) => setForm({ ...form, productNote: e.target.value })} className="w-full h-8 px-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100" placeholder="B-00" />
                </div>
              </div>

              {/* Auto-generated preview */}
              {form.productId && (
                <div className="grid grid-cols-3 gap-2 p-3 bg-white/70 rounded-lg border border-slate-100">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Work Code</label>
                    <span className="text-xs font-mono text-slate-600 truncate block">{computed.workCode || <span className="text-slate-300 italic">—</span>}</span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Variation ID</label>
                    <span className="text-xs font-mono text-slate-600 truncate block">{computed.varId || <span className="text-slate-300 italic">— isi warna & size</span>}</span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Qty</label>
                    <span className="text-xs text-slate-300 italic">0 (sync Pancake)</span>
                  </div>
                </div>
              )}
            </div>
            <button onClick={handleCreate} className="h-8 px-5 mt-5 text-sm font-semibold bg-sky-500 hover:bg-sky-600 text-white rounded-lg flex items-center gap-1.5 flex-shrink-0 shadow-sm">
              <Plus className="w-4 h-4" /> Create Order
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">📥 Daftar Order</h3>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1 max-w-xs"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" /><input type="text" placeholder="Cari order..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-8 pl-8 pr-3 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" /></div>
          {(['PLANNING', 'PULLED', 'CANCELLED', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilterStatus(f)} className={cn('px-3 py-1 text-xs font-medium rounded-lg transition-colors', filterStatus === f ? 'bg-blue-500 text-white' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100')}>{f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}{f !== 'all' && <span className="ml-1 opacity-70">({orders.filter((p) => p.status === f).length})</span>}</button>
          ))}
          <span className="text-xs text-slate-400 ml-auto">{filtered.length} orders</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 bg-white">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Product</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Brand</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Work Code</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Qty</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-400">Tidak ada order yang cocok dengan filter</td></tr>}
              {filtered.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-700">{order.product}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{order.brand}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-600">{order.workCode}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-700 tabular-nums">{order.quantity}</td>
                  <td className="px-4 py-3 text-center">{statusBadge(order.status)}</td>
                  <td className="px-4 py-3 text-center space-x-2">
                    {order.status === 'PLANNING' && (
                      <>
                        <button onClick={() => handlePull(order.id)} className="text-sky-600 hover:text-sky-700 text-sm font-medium underline">Pull</button>
                        <button onClick={() => handleCancel(order.id)} className="text-red-600 hover:text-red-700 text-sm font-medium underline">Cancel</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
