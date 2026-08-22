import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { formatDate } from '@/data/pipelineData';
import { T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, rowClass } from '@/lib/tableStyles';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton, HiddenColgroup } from '@/components/Table/ColumnSettings';
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const { hidden: hiddenCols, toggle: toggleCol } = useColumnSettings('register-po');

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

  const displayData = useMemo(() => {
    return items.map((item) => ({
      id: item.po.id,
      productionOrderId: `${item.productionOrder.workCode} (${item.productionOrder.brand} · ${item.productionOrder.product})`,
      workCode: item.productionOrder.workCode,
      brand: item.productionOrder.brand,
      product: item.productionOrder.product,
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

  const PO_FIELDS: FieldOption[] = [
    { key: 'productionOrderId', label: 'PO ID' },
    { key: 'workCode', label: 'Work Code' },
    { key: 'brand', label: 'Brand' },
    { key: 'product', label: 'Product' },
    { key: 'totalPerPcs', label: 'Total/PCS' },
    { key: 'createdAt', label: 'Created' },
  ];
  const rows = useMemo(() => applySorts(applyFilters(filtered.map((d) => ({ ...d } as unknown as Record<string, unknown>)), filters), sorts) as unknown as typeof displayData, [filtered, filters, sorts]);

  // Multi-select + toolbar (same pattern as Production Monitoring RAW DATA).
  const handleToggleRow = (id: string) => setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleToggleAll = () => { if (selectedRows.size === rows.length) setSelectedRows(new Set()); else setSelectedRows(new Set(rows.map(r => String(r.id)))); };
  const handleImport = () => { if (selectedRows.size === 0) { alert('Pilih minimal 1!'); return; } alert(`✅ ${selectedRows.size} Register PO di-import`); setSelectedRows(new Set()); };
  const handleExport = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['PO ID', 'Total/PCS', 'Created'];
    const lines = filtered.map((r) => [r.productionOrderId, r.totalPerPcs, r.createdAt].map(esc).join(','));
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n'); // BOM for Excel UTF-8
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `register-po-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    if (!confirm(`Hapus ${selectedRows.size} Register PO terpilih?`)) return;
    let deleted = 0;
    for (const id of selectedRows) {
      const { error } = await removeRegisterPo(String(id));
      if (!error) deleted++;
    }
    setItems(prev => prev.filter(it => !selectedRows.has(it.po.id)));
    setSelectedRows(new Set());
    setMessage(`✅ ${deleted} Register PO berhasil dihapus!`);
    setTimeout(() => setMessage(null), 3000);
  };

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
            <Button onClick={refresh} variant="outline" size="sm" className="h-8 px-3.5">
              <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh
            </Button>
            <Button onClick={openCreate} size="sm" className="h-8 px-3.5 bg-blue-600 hover:bg-blue-700">
              <Plus className="w-3.5 h-3.5 mr-2" /> New Register PO
            </Button>
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
          <FilterButton fields={PO_FIELDS} value={filters} onChange={setFilters} />
          <SortButton fields={PO_FIELDS} value={sorts} onChange={setSorts} />
          <ColumnSettingsButton fields={[{ key: 'productionOrderId', label: 'PO ID' }, { key: 'totalPerPcs', label: 'Total/PCS' }, { key: 'createdAt', label: 'Created' }]} hidden={hiddenCols} onToggle={toggleCol} />
          <ExportButton onClick={handleExport} />
          <button onClick={handleImport} className={cn('h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium transition-colors', selectedRows.size > 0 ? 'bg-blue-500 text-white hover:bg-blue-600' : 'border border-gray-200 text-slate-400')}>📥 Import ({selectedRows.size})</button>
          {selectedRows.size > 0 && (
            <button onClick={handleBulkDelete} className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
              <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
            </button>
          )}
          <span className="text-[11px] text-slate-400 ml-auto">{rows.length} register PO</span>
        </div>

        <div className={T_WRAP}>
          <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
            <HiddenColgroup hidden={hiddenCols} cols={['__sel', 'productionOrderId', 'totalPerPcs', 'createdAt']} />
            <thead><tr className={T_HEAD_ROW}>
              <th className={cn(T_TH, 'w-12 text-center')}><input type="checkbox" checked={selectedRows.size === rows.length && rows.length > 0} onChange={handleToggleAll} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></th>
              <th className={cn(T_TH, 'text-left')}>PO ID</th>
              <th className={cn(T_TH, 'text-right')}>Total/PCS</th>
              <th className={cn(T_TH, 'text-left')}>Created</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-[13px] text-gray-400">{filtered.length === 0 ? 'Belum ada Register PO' : 'Tidak ada hasil yang cocok dengan filter'}</td></tr>}
              {rows.map((row, i) => {
                const item = items.find((it) => it.po.id === row.id);
                if (!item) return null;
                const selected = selectedRows.has(String(row.id));
                return (
                  <tr key={row.id} className={cn(rowClass(i, selected), 'cursor-pointer')} onClick={() => openEdit(item)} title="Klik untuk edit">
                    <td className={cn(T_TD, 'text-center')} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => handleToggleRow(String(row.id))} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></td>
                    <td className={cn(T_TD, 'text-gray-700')} title={String(row.productionOrderId)}>{String(row.productionOrderId)}</td>
                    <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatCurrency(row.totalPerPcs)}</td>
                    <td className={cn(T_TD, 'text-gray-700 whitespace-nowrap')}>{formatDate(String(row.createdAt))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? '✏️ Edit Register PO' : '➕ New Register PO'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!editTarget && (
              <div>
                <Label htmlFor="production-order">Production Order *</Label>
                <select
                  id="production-order"
                  value={poId}
                  onChange={(e) => setPoId(e.target.value)}
                  disabled={loadingPOs}
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 mt-1"
                >
                  <option value="">— Pilih PO (sudah PULLED & belum punya Register PO) —</option>
                  {pendingPOs.map((p) => (
                    <option key={p.id} value={p.id}>{p.workCode} — {p.brand} · {p.product} · {p.quantity} pcs</option>
                  ))}
                </select>
                {loadingPOs && <p className="text-xs text-slate-400 mt-1">Loading...</p>}
              </div>
            )}

            <div>
              <Label>Komponen Biaya (isi nominal per PCS)</Label>
              <div className="space-y-2 mt-2">
                {components.map((comp, idx) => (
                  <div key={comp.localId} className="flex items-center gap-3">
                    <span className="w-24 text-sm font-medium text-slate-600 text-right flex-shrink-0">{comp.label}</span>
                    <Input
                      type="number"
                      min={0}
                      value={comp.value}
                      onChange={(e) => { setComponents((prev) => prev.map((c) => (c.localId === comp.localId ? { ...c, value: e.target.value } : c))); }}
                      placeholder="0"
                      className="flex-1 text-right"
                    />
                    <span className="text-xs text-slate-400 w-12 text-right flex-shrink-0">{idx === 0 ? '/pcs' : ''}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-200 pt-3">
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <span className="text-sm font-bold text-blue-800">Total/PCS</span>
                <span className="text-base font-bold text-blue-800">Rp {totalPerPcs.toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setModalOpen(false)} variant="outline" disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={!isValid || saving} className="bg-blue-600 hover:bg-blue-700">{saving ? 'Saving…' : editTarget ? 'Update Register PO' : 'Save Register PO'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default RegisterPoPage;
