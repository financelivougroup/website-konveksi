import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, RefreshCw, Search, Sparkles, Download, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/data/pipelineData';
import { T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, rowClass } from '@/lib/tableStyles';
import { FilterButton, SortButton } from '@/components/Table/TableTools';
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
  product: string;
  warna: string;
  size: string;
  qty: string;
  bulanTarget: string;
}

const EMPTY_FORM: PlanningForm = {
  namaPenjahit: '',
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
      product: item.product,
      warna: item.warna ?? '',
      size: item.size ?? '',
      qty: String(item.qty),
      bulanTarget: item.bulanTarget,
    });
    loadPenjahit();
    setModalOpen(true);
  }, [loadPenjahit]);

  const isValid = form.namaPenjahit && form.product && form.qty && form.bulanTarget;

  async function handleSave() {
    if (!isValid) {
      setMessage('❌ Lengkapi Nama Penjahit, Produk, Qty, dan Bulan Target.');
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    setSaving(true);
    // 'status' is not user-editable (brief field list excludes it). Its only
    // documented value is 'draft' (DB default). Send it only on create to
    // satisfy the service input; omit it on update so it stays as stored.
    const payload = {
      namaPenjahit: form.namaPenjahit,
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
    setTimeout(() => setMessage(null), 3500);
  }

  // Status dropdown: draft → approved → (generate target jahit) / rejected.
  async function handleStatusChange(id: number, status: string) {
    const { error } = await updatePlanning(id, { status });
    if (error) {
      setMessage(`❌ Error: ${error.message}`);
    } else {
      setItems(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
      setMessage(`✅ Status planning diubah jadi "${status}".`);
    }
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleGenerate() {
    setGenerating(true);
    const { created, error, approvedFound } = await generateTargetsFromPlanning(genMonth);
    setGenerating(false);
    if (error) {
      setMessage(`❌ Error saat generate: ${error.message}`);
    } else if (created === 0 && approvedFound === 0) {
      setMessage(`ℹ️ Tidak ada planning berstatus "approved" untuk bulan ${genMonth}. Ubah dulu status planning jadi approved (atau cek bulan yang dipilih), lalu generate lagi.`);
    } else if (created === 0) {
      setMessage(`ℹ️ Ditemukan ${approvedFound} planning approved untuk ${genMonth}, tapi semua target staf di bulan itu sudah pernah digenerate.`);
    } else {
      setMessage(`✅ Generate selesai! ${created} target jahit dibuat dari ${approvedFound} planning approved untuk ${genMonth}.`);
    }
    setTimeout(() => setMessage(null), 6000);
  }

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((d) =>
      [d.namaPenjahit, d.product, d.warna ?? '', d.size ?? '', d.bulanTarget]
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, search]);

  const PLAN_FIELDS: FieldOption[] = [
    { key: 'namaPenjahit', label: 'Nama Penjahit' },
    { key: 'product', label: 'Product' },
    { key: 'warna', label: 'Warna' },
    { key: 'size', label: 'Size' },
    { key: 'qty', label: 'Qty' },
    { key: 'bulanTarget', label: 'Bulan Target' },
    { key: 'status', label: 'Status' },
  ];
  const rows = useMemo(() => applySorts(applyFilters(filtered.map((r) => ({ ...r } as unknown as Record<string, unknown>)), filters), sorts) as unknown as PlanningProduksiRow[], [filtered, filters, sorts]);

  // Multi-select (same pattern as Production Monitoring RAW DATA).
  const handleToggleRow = (id: number) => setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleToggleAll = () => { if (selectedRows.size === rows.length) setSelectedRows(new Set()); else setSelectedRows(new Set(rows.map(r => r.id))); };
  const handleImport = () => { if (selectedRows.size === 0) { alert('Pilih minimal 1!'); return; } alert(`✅ ${selectedRows.size} planning di-import`); setSelectedRows(new Set()); };
  const handleExport = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Nama Penjahit', 'Product', 'Warna', 'Size', 'Qty', 'Bulan Target', 'Status'];
    const lines = filtered.map((r) => [r.namaPenjahit, r.product, r.warna ?? '', r.size ?? '', r.qty, r.bulanTarget, r.status].map(esc).join(','));
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
            <button onClick={refresh} className="h-8 px-3.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200 transition-all flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={handleGenerate} disabled={generating} className="h-8 px-3.5 text-[12px] font-medium bg-violet-500 text-white rounded-lg hover:bg-violet-600 hover:shadow-md hover:shadow-violet-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <Sparkles className="w-3.5 h-3.5" /> {generating ? 'Generating…' : 'Generate Target'}
            </button>
            <button onClick={openCreate} className="h-8 px-3.5 text-[12px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-md hover:shadow-blue-200 transition-all flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" /> Tambah Planning Produksi
            </button>
          </div>
        </div>
        {message && <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-[12px] text-blue-700">{message}</div>}
      </div>

      <div className="flex-1 px-8 pt-5 pb-6 overflow-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" /><input type="text" placeholder="Cari planning..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" /></div>
          <FilterButton fields={PLAN_FIELDS} value={filters} onChange={setFilters} />
          <SortButton fields={PLAN_FIELDS} value={sorts} onChange={setSorts} />
          <ColumnSettingsButton fields={PLAN_FIELDS} hidden={hiddenCols} onToggle={toggleCol} />
          <button onClick={handleExport} className="h-8 px-2.5 text-[11px] border border-gray-200 rounded-lg flex items-center gap-1.5 text-slate-600 hover:bg-gray-50"><Download className="w-3 h-3" /> Export</button>
          <button onClick={handleImport} className={cn('h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium transition-colors', selectedRows.size > 0 ? 'bg-blue-500 text-white hover:bg-blue-600' : 'border border-gray-200 text-slate-400')}>📥 Import ({selectedRows.size})</button>
          {selectedRows.size > 0 && (
            <button onClick={handleBulkDelete} className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
              <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
            </button>
          )}
          <div className="flex items-center gap-1.5 ml-auto">
            {Array.from(new Set(items.filter((r) => r.status === 'approved').map((r) => r.bulanTarget))).sort().map((m) => (
              <button key={m} onClick={() => setGenMonth(m)} className={cn('h-8 px-2 text-[11px] font-medium rounded-lg border transition-colors', genMonth === m ? 'bg-violet-500 text-white border-violet-500' : 'bg-white text-slate-600 border-gray-200 hover:bg-violet-50')} title={`Ada planning approved di ${m}`}>
                {m} ✓
              </button>
            ))}
            <label className="text-[11px] text-slate-500">Generate untuk bulan</label>
            <input type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} className="h-8 px-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-violet-300" />
          </div>
          <span className="text-[11px] text-slate-400">{rows.length} planning produksi</span>
        </div>

        <div className={T_WRAP}>
          <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
            <HiddenColgroup hidden={hiddenCols} cols={['__sel', 'namaPenjahit', 'product', 'warna', 'size', 'qty', 'bulanTarget', 'status']} />
            <thead><tr className={T_HEAD_ROW}>
              <th className={cn(T_TH, 'w-12 text-center')}><input type="checkbox" checked={selectedRows.size === rows.length && rows.length > 0} onChange={handleToggleAll} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></th>
              <th className={cn(T_TH, 'text-left')}>Nama Penjahit</th>
              <th className={cn(T_TH, 'text-left')}>Product</th>
              <th className={cn(T_TH, 'text-left')}>Warna</th>
              <th className={cn(T_TH, 'text-left')}>Size</th>
              <th className={cn(T_TH, 'text-right')}>Qty</th>
              <th className={cn(T_TH, 'text-left')}>Bulan Target</th>
              <th className={cn(T_TH, 'text-center')}>Status</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-[13px] text-gray-400">{filtered.length === 0 ? 'Belum ada planning produksi' : 'Tidak ada hasil yang cocok dengan filter'}</td></tr>}
              {rows.map((r, i) => {
                const selected = selectedRows.has(r.id);
                return (
                  <tr key={r.id} className={cn(rowClass(i, selected), 'cursor-pointer')} onClick={() => openEdit(r)} title="Klik untuk edit">
                    <td className={cn(T_TD, 'text-center')} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => handleToggleRow(r.id)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></td>
                    <td className={cn(T_TD, 'text-gray-700')}>{r.namaPenjahit}</td>
                    <td className={cn(T_TD, 'text-gray-700')}>{r.product}</td>
                    <td className={cn(T_TD, 'text-gray-700')}>{r.warna || <span className="text-gray-300">—</span>}</td>
                    <td className={cn(T_TD, 'text-gray-700')}>{r.size || <span className="text-gray-300">—</span>}</td>
                    <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{r.qty}</td>
                    <td className={cn(T_TD, 'text-gray-500')}>{formatDate(r.bulanTarget + '-01')}</td>
                    <td className={cn(T_TD, 'text-center')} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={r.status || 'draft'}
                        onChange={(e) => void handleStatusChange(r.id, e.target.value)}
                        className={cn('h-7 px-2 rounded-md text-[11px] font-semibold border-0 outline-none cursor-pointer whitespace-nowrap', PLAN_STATUS_BADGE[r.status || ''] ?? 'bg-slate-100 text-slate-600')}
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

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h3 className="text-[14px] font-semibold text-slate-900">{editTarget ? '✏️ Edit Planning Produksi' : '➕ Tambah Planning Produksi'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nama Penjahit *</label>
                <select value={form.namaPenjahit} onChange={(e) => setField('namaPenjahit', e.target.value)} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300">
                  <option value="">— Pilih Penjahit —</option>
                  {/* Show the currently selected name even if that penjahit is now
                      Non-Aktif, so historical rows stay editable and readable. */}
                  {form.namaPenjahit && !penjahitList.some((p) => p.picPenjahit === form.namaPenjahit) && (
                    <option value={form.namaPenjahit}>{form.namaPenjahit} (Non-Aktif)</option>
                  )}
                  {penjahitList.map((p) => (
                    <option key={p.id} value={p.picPenjahit}>{p.picPenjahit}</option>
                  ))}
                </select>
                {penjahitList.length === 0 && <p className="text-[10px] text-slate-400 mt-1">Belum ada karyawan aktif dengan posisi Penjahit — daftarkan di Register Karyawan.</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Produk *</label>
                  <input type="text" value={form.product} onChange={(e) => setField('product', e.target.value)} placeholder="e.g. Dress" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Warna</label>
                  <input type="text" value={form.warna} onChange={(e) => setField('warna', e.target.value)} placeholder="e.g. Hitam" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Size</label>
                  <input type="text" value={form.size} onChange={(e) => setField('size', e.target.value)} placeholder="e.g. M" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Qty *</label>
                  <input type="number" min={0} value={form.qty} onChange={(e) => setField('qty', e.target.value)} placeholder="0" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Bulan Target *</label>
                  <input type="month" value={form.bulanTarget} onChange={(e) => setField('bulanTarget', e.target.value)} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300" />
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
              <button onClick={() => setModalOpen(false)} className="px-4 py-1.5 text-[11px] text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50" disabled={saving}>Cancel</button>
              <button onClick={handleSave} disabled={!isValid || saving} className="px-4 py-1.5 text-[11px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Saving…' : editTarget ? 'Update Planning' : 'Save Planning'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default PlanningProduksiPage;
