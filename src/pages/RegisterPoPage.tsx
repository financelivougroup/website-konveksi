import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, RefreshCw, Search, Pencil, Trash2 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { formatDate } from '@/data/pipelineData';
import { T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, rowClass } from '@/lib/tableStyles';
import {
  fetchAllRegisterPo,
  createRegisterPo,
  updateRegisterPo,
  removeRegisterPo,
  type RegisterPoListItem,
} from '@/services/registerPo';
import { fetchProductionOrdersWaitingRegisterPo } from '@/services/productionOrders';

interface ComponentForm {
  localId: string;
  key: string;
  label: string;
  value: string;
}

const DEFAULT_COMPONENTS: ComponentForm[] = [
  { localId: crypto.randomUUID(), key: 'potong', label: 'Potong', value: '' },
  { localId: crypto.randomUUID(), key: 'jahit', label: 'Jahit', value: '' },
  { localId: crypto.randomUUID(), key: 'obras', label: 'Obras', value: '' },
  { localId: crypto.randomUUID(), key: 'finishing', label: 'Finishing', value: '' },
  { localId: crypto.randomUUID(), key: 'operational', label: 'Operational', value: '' },
  { localId: crypto.randomUUID(), key: 'material_basic', label: 'Material Basic', value: '' },
  { localId: crypto.randomUUID(), key: 'margin', label: 'Margin', value: '' },
  { localId: crypto.randomUUID(), key: 'jasa_pasang_kancing', label: 'Jasa Pasang Kancing', value: '' },
];

function freshComponents(): ComponentForm[] {
  return DEFAULT_COMPONENTS.map((c) => ({ ...c, localId: crypto.randomUUID(), value: '' }));
}

export function RegisterPoPage() {
  const [items, setItems] = useState<RegisterPoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RegisterPoListItem | null>(null);
  const [poId, setPoId] = useState('');
  const [components, setComponents] = useState<ComponentForm[]>(freshComponents());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [pendingPOs, setPendingPOs] = useState<Array<{ id: string; workCode: string; product: string; brand: string; quantity: number }>>([]);
  const [loadingPOs, setLoadingPOs] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await fetchAllRegisterPo();
    setItems(list);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loadPendingPOs = useCallback(async () => {
    setLoadingPOs(true);
    const pos = await fetchProductionOrdersWaitingRegisterPo();
    setPendingPOs(pos);
    setLoadingPOs(false);
  }, []);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setPoId('');
    setComponents(freshComponents());
    loadPendingPOs();
    setModalOpen(true);
  }, [loadPendingPOs]);

  const openEdit = useCallback((item: RegisterPoListItem) => {
    setEditTarget(item);
    setPoId(item.po.productionOrderId);
    setComponents(
      item.components.map((c) => ({
        localId: crypto.randomUUID(),
        key: c.key,
        label: c.label,
        value: String(c.value),
      })),
    );
    setPendingPOs([]);
    setModalOpen(true);
  }, []);

  const componentsTotal = components.reduce((sum, c) => sum + (Number(c.value) || 0), 0);
  const totalPerPcs = componentsTotal;
  const isValid = poId !== '' && componentsTotal > 0;

  async function handleSave() {
    if (!poId) {
      setMessage('❌ Pilih Production Order dulu.');
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    const validComps = components.filter((c) => Number(c.value) > 0);
    if (validComps.length === 0) {
      setMessage('❌ Minimal satu komponen harus diisi.');
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setSaving(true);
    if (editTarget) {
      const { error } = await updateRegisterPo(editTarget.po.id, {
        components: validComps.map((c) => ({ key: c.key, label: c.label, value: Number(c.value) })),
      });
      if (error) {
        setMessage(`❌ Error: ${error.message}`);
      } else {
        setMessage(`✅ Register PO untuk "${editTarget.productionOrder.product}" berhasil diupdate!`);
        setModalOpen(false);
        refresh();
      }
    } else {
      const result = await createRegisterPo({
        productionOrderId: poId,
        components: validComps.map((c) => ({ key: c.key, label: c.label, value: Number(c.value) })),
      });
      if ('error' in result) {
        setMessage(`❌ Error: ${result.error.message}`);
      } else {
        setMessage(`✅ Register PO berhasil dibuat! Total/PCS: Rp ${totalPerPcs.toLocaleString('id-ID')}`);
        setModalOpen(false);
        refresh();
      }
    }
    setSaving(false);
    setTimeout(() => setMessage(null), 3500);
  }

  async function handleDelete(id: string) {
    if (!confirm('Yakin ingin hapus Register PO ini?')) return;
    console.log('[RegisterPo] deleting id:', id);
    const { error } = await removeRegisterPo(id);
    console.log('[RegisterPo] delete result, error:', error);
    if (error) {
      setMessage(`❌ Error: ${error.message}`);
    } else {
      setMessage('✅ Register PO berhasil dihapus.');
      await refresh();
    }
    setTimeout(() => setMessage(null), 3000);
  }

  const displayData = useMemo(() => {
    return items.map((item) => ({
      id: item.po.id,
      productionOrderId: `${item.productionOrder.workCode} (${item.productionOrder.brand} · ${item.productionOrder.product})`,
      totalPerPcs: item.components.reduce((sum, c) => sum + c.value, 0) || item.po.totalPerPcs,
      createdAt: item.po.createdAt?.split('T')[0] ?? '-',
      _raw: item,
    }));
  }, [items]);

  const filtered = useMemo(() => {
    if (!search) return displayData;
    const q = search.toLowerCase();
    return displayData.filter((d) => String(d.productionOrderId).toLowerCase().includes(q));
  }, [displayData, search]);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Register PO...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="px-8 pt-4 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Register PO</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={refresh} className="h-8 px-3.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200 transition-all flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={openCreate} className="h-8 px-3.5 text-[12px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-md hover:shadow-blue-200 transition-all flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" /> New Register PO
            </button>
          </div>
        </div>
        {message && (
          <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-[12px] text-blue-700">{message}</div>
        )}
      </div>

      <div className="flex-1 px-8 pt-5 pb-6 overflow-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" placeholder="Cari Register PO..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
          </div>
          <span className="text-[11px] text-slate-400 ml-auto">{filtered.length} register PO</span>
        </div>

        <div className={T_WRAP}>
          <table className={T_TABLE}>
            <thead><tr className={T_HEAD_ROW}>
              <th className={cn(T_TH, 'text-left')}>PO ID</th>
              <th className={cn(T_TH, 'text-right')}>Total/PCS</th>
              <th className={cn(T_TH, 'text-left')}>Created</th>
              <th className={cn(T_TH, 'text-right')}>Action</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-[13px] text-gray-400">Belum ada Register PO</td></tr>}
              {filtered.map((row, i) => {
                const item = items.find((it) => it.po.id === row.id);
                if (!item) return null;
                return (
                  <tr key={row.id} className={rowClass(i)}>
                    <td className={cn(T_TD, 'font-medium text-gray-900')} title={String(row.productionOrderId)}>{String(row.productionOrderId)}</td>
                    <td className={cn(T_TD, 'text-right tabular-nums font-medium text-gray-900')}>{formatCurrency(row.totalPerPcs)}</td>
                    <td className={cn(T_TD, 'text-gray-500 whitespace-nowrap')}>{formatDate(String(row.createdAt))}</td>
                    <td className={cn(T_TD, 'text-right')}>
                      <div className="inline-flex gap-1">
                        <button onClick={() => openEdit(item)} title="Edit" className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(String(row.id))} title="Hapus" className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h3 className="text-[14px] font-semibold text-slate-900">{editTarget ? '✏️ Edit Register PO' : '➕ New Register PO'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {!editTarget && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Production Order *</label>
                  <select value={poId} onChange={(e) => setPoId(e.target.value)} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300" disabled={loadingPOs}>
                    <option value="">— Pilih PO (sudah PULLED & belum punya Register PO) —</option>
                    {pendingPOs.map((p) => (
                      <option key={p.id} value={p.id}>{p.workCode} — {p.brand} · {p.product} · {p.quantity} pcs</option>
                    ))}
                  </select>
                  {loadingPOs && <p className="text-[10px] text-slate-400 mt-1">Loading...</p>}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Komponen Biaya (isi nominal per PCS)</label>
                <div className="space-y-2">
                  {components.map((comp, idx) => (
                    <div key={comp.localId} className="flex items-center gap-3">
                      <span className="w-24 text-[11px] font-medium text-slate-600 text-right flex-shrink-0">{comp.label}</span>
                      <input type="number" min={0} value={comp.value} onChange={(e) => { setComponents((prev) => prev.map((c) => (c.localId === comp.localId ? { ...c, value: e.target.value } : c))); }} placeholder="0" className="flex-1 h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white text-right focus:border-blue-300" />
                      <span className="text-[10px] text-slate-400 w-12 text-right flex-shrink-0">{idx === 0 ? '/pcs' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <span className="text-[13px] font-bold text-blue-800">Total/PCS</span>
                  <span className="text-[16px] font-bold text-blue-800">Rp {totalPerPcs.toLocaleString('id-ID')}</span>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
              <button onClick={() => setModalOpen(false)} className="px-4 py-1.5 text-[11px] text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50" disabled={saving}>Cancel</button>
              <button onClick={handleSave} disabled={!isValid || saving} className="px-4 py-1.5 text-[11px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Saving…' : editTarget ? 'Update Register PO' : 'Save Register PO'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default RegisterPoPage;
