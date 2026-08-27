import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMonthYearFromYm } from '@/lib/monthYear';
import { T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, rowClass } from '@/lib/tableStyles';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton, HiddenColgroup } from '@/components/Table/ColumnSettings';
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import {
  list as listPlanning,
  create as createPlanning,
  update as updatePlanning,
  remove as removePlanning,
  type PlanningProduksiRow,
} from '@/services/planningProduksi';
import { fetchAll as fetchAllPenjahit, type RegisterPenjahitRow } from '@/services/registerPenjahit';
import { generateTargetsFromPlanning } from '@/services/staffDebt';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

// Status planning: draft (baru) → approved (boleh di-generate ke target jahit)
// atau rejected. Badge: hijau = approved, merah = rejected, abu = draft.
const PLAN_STATUS_BADGE: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
};

interface PlanningForm {
  namaPenjahit: string;
  productNote: string;
  product: string;
  warna: string;
  size: string;
  qty: string;
  bulanTarget: string;
}

const EMPTY_FORM: PlanningForm = {
  namaPenjahit: '',
  productNote: '',
  product: '',
  warna: '',
  size: '',
  qty: '',
  bulanTarget: currentMonth(),
};

export function PlanningProduksiPage() {
  const [items, setItems] = useState<PlanningProduksiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const { hidden: hiddenCols, toggle: toggleCol } = useColumnSettings('planning-produksi');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PlanningProduksiRow | null>(null);
  const [form, setForm] = useState<PlanningForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Penjahit options for the Nama Penjahit select.
  const [penjahitList, setPenjahitList] = useState<RegisterPenjahitRow[]>([]);

  // Generate Target controls.
  const [genMonth, setGenMonth] = useState(currentMonth());
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await listPlanning();
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loadPenjahit = useCallback(async () => {
    const { data } = await fetchAllPenjahit();
    // Only employees with posisi "Penjahit" who are still Aktif are selectable.
    // Other positions (Leader, Finishing) and resigned employees are hidden,
    // but their historical planning rows remain in the database.
    setPenjahitList(
      (data ?? []).filter(
        (p) =>
          (p.status ?? 'Aktif').toLowerCase() === 'aktif' &&
          (p.posisi ?? '').toLowerCase() === 'penjahit',
      ),
    );
  }, []);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    loadPenjahit();
    setModalOpen(true);
  }, [loadPenjahit]);

  const openEdit = useCallback((item: PlanningProduksiRow) => {
    setEditTarget(item);
    setForm({
      namaPenjahit: item.namaPenjahit,
      productNote: item.productNote ?? '',
      product: item.product,
      warna: item.warna ?? '',
      size: item.size ?? '',
      qty: String(item.qty),
      bulanTarget: item.bulanTarget,
    });
    loadPenjahit();
    setModalOpen(true);
  }, [loadPenjahit]);

  const isValid = form.namaPenjahit && form.productNote.trim() && form.product && form.qty && form.bulanTarget;

  async function handleSave() {
    if (!isValid) {
      setMessage('❌ Lengkapi Nama Penjahit, Product Note, Produk, Qty, dan Bulan Target.');
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    setSaving(true);
    // 'status' is not user-editable (brief field list excludes it). Its only
    // documented value is 'draft' (DB default). Send it only on create to
    // satisfy the service input; omit it on update so it stays as stored.
    const payload = {
      namaPenjahit: form.namaPenjahit,
      productNote: form.productNote.trim(),
      product: form.product,
      warna: form.warna || null,
      size: form.size || null,
      qty: Number(form.qty),
      bulanTarget: form.bulanTarget,
    };
    if (editTarget) {
      const { error } = await updatePlanning(editTarget.id, payload);
      if (error) {
        setMessage(`❌ Error: ${error.message}`);
      } else {
        setMessage(`✅ Planning Produksi untuk "${form.namaPenjahit}" berhasil diupdate!`);
        setModalOpen(false);
        refresh();
      }
    } else {
      const { error } = await createPlanning({ ...payload, status: 'draft' });
      if (error) {
        setMessage(`❌ Error: ${error.message}`);
      } else {
        setMessage(`✅ Planning Produksi untuk "${form.namaPenjahit}" berhasil ditambahkan!`);
        setModalOpen(false);
        refresh();
      }
    }
    setSaving(false);
    setTimeout(() => setMessage(null), 3000);
  }

  const handleStatusChange = async (id: number, status: string) => {
    const { error } = await updatePlanning(id, { status });
    if (error) {
      setMessage(`❌ Error: ${error.message}`);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // Generate Target handler.
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const result = await generateTargetsFromPlanning(genMonth);
      if (result.error) {
        setMessage(`❌ ${result.error.message}`);
      } else if (result.created > 0 && result.approvedFound > 0) {
        setMessage(`✅ ${result.created} target jahit dibuat dari ${result.approvedFound} planning approved.`);
      } else if (result.approvedFound === 0) {
        setMessage('⚠️ Tidak ada planning approved di bulan ini.');
      } else {
        setMessage('ℹ️ Target Jahit sudah pernah digenerate untuk penjahit ini.');
      }
    } catch (e: any) {
      setMessage(`❌ Error: ${e?.message || e}`);
    } finally {
      setGenerating(false);
      setTimeout(() => setMessage(null), 4000);
    }
  }, [genMonth]);

  const PLAN_FIELDS: FieldOption[] = [
    { key: 'namaPenjahit', label: 'Nama Penjahit' },
    { key: 'productNote', label: 'Product Note' },
    { key: 'product', label: 'Product' },
    { key: 'warna', label: 'Warna' },
    { key: 'size', label: 'Size' },
    { key: 'qty', label: 'Qty' },
    { key: 'bulanTarget', label: 'Bulan Target' },
    { key: 'status', label: 'Status' },
  ];
  const filtered = items.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      return r.namaPenjahit.toLowerCase().includes(q) || r.productNote?.toLowerCase().includes(q) || r.product.toLowerCase().includes(q) || r.warna?.toLowerCase().includes(q) || r.size?.toLowerCase().includes(q);
    }
    return true;
  });
  const rows = useMemo(() => applySorts(applyFilters(filtered.map((r) => ({ ...r } as unknown as Record<string, unknown>)), filters), sorts) as unknown as PlanningProduksiRow[], [filtered, filters, sorts]);

  // Multi-select (same pattern as Production Monitoring RAW DATA).
  const handleToggleRow = (id: number) => setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleToggleAll = () => { if (selectedRows.size === rows.length) setSelectedRows(new Set()); else setSelectedRows(new Set(rows.map(r => r.id))); };
  const handleImport = () => { if (selectedRows.size === 0) { alert('Pilih minimal 1!'); return; } alert(`✅ ${selectedRows.size} planning di-import`); setSelectedRows(new Set()); };
  const handleExport = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Nama Penjahit', 'Product Note', 'Product', 'Warna', 'Size', 'Qty', 'Bulan Target', 'Status'];
    const lines = filtered.map((r) => [r.namaPenjahit, r.productNote ?? '', r.product, r.warna ?? '', r.size ?? '', r.qty, r.bulanTarget, r.status].map(esc).join(','));
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n'); // BOM for Excel UTF-8
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `planning-produksi-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    if (!confirm(`Hapus ${selectedRows.size} planning produksi terpilih?`)) return;
    let deleted = 0;
    for (const id of selectedRows) {
      const { error } = await removePlanning(Number(id));
      if (!error) deleted++;
    }
    setItems(prev => prev.filter(r => !selectedRows.has(r.id)));
    setSelectedRows(new Set());
    setMessage(`✅ ${deleted} planning berhasil dihapus!`);
    setTimeout(() => setMessage(null), 3000);
  };

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Planning Produksi...</p>
      </main>
    );
  }

  const setField = (k: keyof PlanningForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="px-8 pt-4 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Planning Produksi</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <Button onClick={refresh} variant="outline" size="sm" className="h-8 px-3.5">
              <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh
            </Button>
            <Button onClick={handleGenerate} disabled={generating} size="sm" className="h-8 px-3.5 bg-violet-500 hover:bg-violet-600">
              <Sparkles className="w-3.5 h-3.5 mr-2" /> {generating ? 'Generating…' : 'Generate Target'}
            </Button>
            <Button onClick={openCreate} size="sm" className="h-8 px-3.5 bg-blue-600 hover:bg-blue-700">
              <Plus className="w-3.5 h-3.5 mr-2" /> Tambah Planning
            </Button>
          </div>
        </div>
        {message && <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">{message}</div>}
      </div>

      <div className="flex-1 px-8 pt-5 pb-6 overflow-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" /><input type="text" placeholder="Cari planning..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-8 pl-8 pr-3 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" /></div>
          <FilterButton fields={PLAN_FIELDS} value={filters} onChange={setFilters} />
          <SortButton fields={PLAN_FIELDS} value={sorts} onChange={setSorts} />
          <ColumnSettingsButton fields={PLAN_FIELDS} hidden={hiddenCols} onToggle={toggleCol} />
          <ExportButton onClick={handleExport} />
          <Button onClick={handleImport} size="sm" className={cn(selectedRows.size > 0 ? 'bg-blue-500 hover:bg-blue-600' : 'border border-gray-200 text-slate-400')} disabled={selectedRows.size === 0}>📥 Import ({selectedRows.size})</Button>
          {selectedRows.size > 0 && (
            <Button onClick={handleBulkDelete} size="sm" className="h-8 px-2.5 bg-red-500 hover:bg-red-600">
              <Trash2 className="w-3 h-3 mr-1.5" /> Delete ({selectedRows.size})
            </Button>
          )}
          <div className="flex items-center gap-1.5 ml-auto">
            {Array.from(new Set(items.filter((r) => r.status === 'approved').map((r) => r.bulanTarget))).sort().map((m) => (
              <button key={m} onClick={() => setGenMonth(m)} className={cn('h-8 px-2 text-xs font-medium rounded-lg border transition-colors', genMonth === m ? 'bg-violet-500 text-white border-violet-500' : 'bg-white text-slate-600 border-gray-200 hover:bg-violet-50')} title={`Ada planning approved di ${formatMonthYearFromYm(m)}`}>
                {formatMonthYearFromYm(m)} ✓
              </button>
            ))}
            <Label className="text-xs text-slate-500">Generate untuk bulan</Label>
            <Input type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} className="h-8 px-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-violet-300" />
          </div>
          <span className="text-xs text-slate-400">{rows.length} planning produksi</span>
        </div>

        <div className={T_WRAP}>
          <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
            <HiddenColgroup hidden={hiddenCols} cols={['namaPenjahit', 'productNote', 'product', 'warna', 'size', 'qty', 'bulanTarget', 'status']} />
            <thead><tr className={T_HEAD_ROW}>
              <th className={cn(T_TH, 'w-12 text-center')}><input type="checkbox" checked={selectedRows.size === rows.length && rows.length > 0} onChange={handleToggleAll} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></th>
              <th className={cn(T_TH, 'text-left')}>Nama Penjahit</th>
              <th className={cn(T_TH, 'text-left')}>Product Note</th>
              <th className={cn(T_TH, 'text-left')}>Product</th>
              <th className={cn(T_TH, 'text-left')}>Warna</th>
              <th className={cn(T_TH, 'text-left')}>Size</th>
              <th className={cn(T_TH, 'text-right')}>Qty</th>
              <th className={cn(T_TH, 'text-left')}>Bulan Target</th>
              <th className={cn(T_TH, 'text-center')}>Status</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-sm text-gray-400">{filtered.length === 0 ? 'Belum ada planning produksi' : 'Tidak ada hasil yang cocok dengan filter'}</td></tr>}
              {rows.map((r, i) => {
                const selected = selectedRows.has(r.id);
                return (
                  <tr key={r.id} className={cn(rowClass(i, selected), 'cursor-pointer')} onClick={() => openEdit(r)} title="Klik untuk edit">
                    <td className={cn(T_TD, 'text-center')} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => handleToggleRow(r.id)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></td>
                    <td className={cn(T_TD, 'text-gray-700')}>{r.namaPenjahit}</td>
                    <td className={cn(T_TD, 'text-gray-700')}>
                      {r.productNote || <span className="text-gray-300">—</span>}
                    </td>
                    <td className={cn(T_TD, 'text-gray-700')}>{r.product}</td>
                    <td className={cn(T_TD, 'text-gray-700')}>{r.warna || <span className="text-gray-300">—</span>}</td>
                    <td className={cn(T_TD, 'text-gray-700')}>{r.size || <span className="text-gray-300">—</span>}</td>
                    <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{r.qty}</td>
                    <td className={cn(T_TD, 'text-gray-500')}>{formatMonthYearFromYm(r.bulanTarget)}</td>
                    <td className={cn(T_TD, 'text-center')} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={r.status || 'draft'}
                        onChange={(e) => void handleStatusChange(r.id, e.target.value)}
                        className={cn('h-7 px-2 rounded-md text-xs font-semibold border-0 outline-none cursor-pointer whitespace-nowrap', PLAN_STATUS_BADGE[r.status || ''] ?? 'bg-slate-100 text-slate-600')}
                      >
                        <option value="draft">draft</option>
                        <option value="approved">approved</option>
                        <option value="rejected">rejected</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editTarget ? '✏️ Edit Planning Produksi' : '➕ Tambah Planning Produksi'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="namaPenjahit">Nama Penjahit *</Label>
              <select id="namaPenjahit" value={form.namaPenjahit} onChange={(e) => setField('namaPenjahit', e.target.value)} className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 mt-1">
                <option value="">— Pilih Penjahit —</option>
                {/* Show the currently selected name even if that penjahit is now Non-Aktif */}
                {form.namaPenjahit && !penjahitList.some((p) => p.picPenjahit === form.namaPenjahit) && (
                  <option value={form.namaPenjahit}>{form.namaPenjahit} (Non-Aktif)</option>
                )}
                {penjahitList.map((p) => (
                  <option key={p.id} value={p.picPenjahit}>{p.picPenjahit}</option>
                ))}
              </select>
              {penjahitList.length === 0 && <p className="text-xs text-slate-400 mt-1">Belum ada karyawan aktif dengan posisi Penjahit — daftarkan di Register Karyawan.</p>}
            </div>

            <div>
              <Label htmlFor="productNote">Product Note *</Label>
              <Input
                id="productNote"
                type="text"
                value={form.productNote}
                onChange={(e) => setField('productNote', e.target.value)}
                placeholder="e.g. Produksi 2"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="product">Produk *</Label>
                <Input id="product" type="text" value={form.product} onChange={(e) => setField('product', e.target.value)} placeholder="e.g. Dress" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="warna">Warna</Label>
                <Input id="warna" type="text" value={form.warna} onChange={(e) => setField('warna', e.target.value)} placeholder="e.g. Hitam" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="size">Size</Label>
                <Input id="size" type="text" value={form.size} onChange={(e) => setField('size', e.target.value)} placeholder="e.g. M" className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="qty">Qty *</Label>
                <Input id="qty" type="number" min={0} value={form.qty} onChange={(e) => setField('qty', e.target.value)} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="bulanTarget">Bulan Target *</Label>
                <Input id="bulanTarget" type="month" value={form.bulanTarget} onChange={(e) => setField('bulanTarget', e.target.value)} className="mt-1" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setModalOpen(false)} variant="outline" disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={!isValid || saving} className="bg-blue-600 hover:bg-blue-700">{saving ? 'Saving…' : editTarget ? 'Update Planning' : 'Save Planning'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default PlanningProduksiPage;
