import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, RefreshCw, Search, Trash2, X, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, rowClass } from '@/lib/tableStyles';
import { FilterButton, SortButton } from '@/components/Table/TableTools';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import {
  fetchAll as fetchAllKaryawan,
  create as createKaryawan,
  update as updateKaryawan,
  remove as removeKaryawan,
  POSISI_OPTIONS,
  type RegisterPenjahitRow,
} from '@/services/registerPenjahit';

const STATUS_BADGE: Record<string, string> = {
  'Aktif': 'bg-emerald-600',
  'Non-Aktif': 'bg-slate-500',
};

const POSISI_BADGE: Record<string, string> = {
  'Leader': 'bg-blue-600',
  'Penjahit': 'bg-amber-500',
  'Finishing': 'bg-violet-600',
};

interface KaryawanForm {
  picPenjahit: string;
  posisi: string;
  status: string;
}

const EMPTY_FORM: KaryawanForm = { picPenjahit: '', posisi: '', status: 'Aktif' };

export function RegisterKaryawanPage() {
  const [items, setItems] = useState<RegisterPenjahitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RegisterPenjahitRow | null>(null);
  const [form, setForm] = useState<KaryawanForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchAllKaryawan();
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((item: RegisterPenjahitRow) => {
    setEditTarget(item);
    setForm({
      picPenjahit: item.picPenjahit,
      posisi: item.posisi ?? '',
      status: item.status ?? 'Aktif',
    });
    setModalOpen(true);
  }, []);

  const isValid = form.picPenjahit.trim() && form.posisi;

  async function handleSave() {
    if (!isValid) {
      setMessage('❌ Lengkapi Nama Karyawan dan Posisi.');
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    setSaving(true);
    const payload = {
      picPenjahit: form.picPenjahit.trim(),
      posisi: form.posisi,
      status: form.status,
    };
    if (editTarget) {
      const { error } = await updateKaryawan(editTarget.id, payload);
      if (error) {
        setMessage(`❌ Error: ${error.message}`);
      } else {
        setMessage(`✅ Karyawan "${form.picPenjahit}" berhasil diupdate!`);
        setModalOpen(false);
        refresh();
      }
    } else {
      const { error } = await createKaryawan(payload);
      if (error) {
        setMessage(`❌ Error: ${error.message}`);
      } else {
        setMessage(`✅ Karyawan "${form.picPenjahit}" berhasil ditambahkan!`);
        setModalOpen(false);
        refresh();
      }
    }
    setSaving(false);
    setTimeout(() => setMessage(null), 3500);
  }

  const filtered = useMemo(() => {
    return items.filter((d) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return [d.picPenjahit, d.posisi ?? '', d.status].some((v) => String(v).toLowerCase().includes(q));
    });
  }, [items, search]);

  const KARYAWAN_FIELDS: FieldOption[] = [
    { key: 'picPenjahit', label: 'Nama Karyawan' },
    { key: 'posisi', label: 'Posisi' },
    { key: 'status', label: 'Status' },
  ];
  const rows = useMemo(() => applySorts(applyFilters(filtered.map((r) => ({ ...r } as unknown as Record<string, unknown>)), filters), sorts) as unknown as RegisterPenjahitRow[], [filtered, filters, sorts]);

  // Multi-select + toolbar (same pattern as Production Monitoring RAW DATA).
  const handleToggleRow = (id: number) => setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleToggleAll = () => { if (selectedRows.size === rows.length) setSelectedRows(new Set()); else setSelectedRows(new Set(rows.map(r => r.id))); };
  const handleImport = () => { if (selectedRows.size === 0) { alert('Pilih minimal 1!'); return; } alert(`✅ ${selectedRows.size} karyawan di-import`); setSelectedRows(new Set()); };
  const handleExport = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Nama Karyawan', 'Posisi', 'Status'];
    const lines = filtered.map((r) => [r.picPenjahit, r.posisi ?? '', r.status].map(esc).join(','));
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n'); // BOM for Excel UTF-8
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `register-karyawan-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    if (!confirm(`Hapus ${selectedRows.size} karyawan terpilih?\n\nRiwayat planning/jahit/finishing/kancing mereka tetap tersimpan di database.`)) return;
    let deleted = 0;
    for (const id of selectedRows) {
      const { error } = await removeKaryawan(Number(id));
      if (!error) deleted++;
    }
    setItems(prev => prev.filter(r => !selectedRows.has(r.id)));
    setSelectedRows(new Set());
    setMessage(`✅ ${deleted} karyawan berhasil dihapus!`);
    setTimeout(() => setMessage(null), 3000);
  };

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Register Karyawan...</p>
      </main>
    );
  }

  const setField = (k: keyof KaryawanForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="px-8 pt-4 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Register Karyawan Tim Jahit</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={refresh} className="h-8 px-3.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200 transition-all flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={openCreate} className="h-8 px-3.5 text-[12px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-md hover:shadow-blue-200 transition-all flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" /> Tambah Karyawan
            </button>
          </div>
        </div>
        {message && <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-[12px] text-blue-700">{message}</div>}
      </div>

      <div className="flex-1 px-8 pt-5 pb-6 overflow-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" placeholder="Cari nama karyawan..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
          </div>
          <FilterButton fields={KARYAWAN_FIELDS} value={filters} onChange={setFilters} />
          <SortButton fields={KARYAWAN_FIELDS} value={sorts} onChange={setSorts} />
          <button onClick={handleExport} className="h-8 px-2.5 text-[11px] border border-gray-200 rounded-lg flex items-center gap-1.5 text-slate-600 hover:bg-gray-50"><Download className="w-3 h-3" /> Export</button>
          <button onClick={handleImport} className={cn('h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium transition-colors', selectedRows.size > 0 ? 'bg-blue-500 text-white hover:bg-blue-600' : 'border border-gray-200 text-slate-400')}>📥 Import ({selectedRows.size})</button>
          {selectedRows.size > 0 && (
            <button onClick={handleBulkDelete} className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
              <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
            </button>
          )}
          <span className="text-[11px] text-slate-400 ml-auto">{rows.length} karyawan</span>
        </div>

        <div className={T_WRAP}>
          <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
            <thead><tr className={T_HEAD_ROW}>
              <th className={cn(T_TH, 'w-12 text-center')}><input type="checkbox" checked={selectedRows.size === rows.length && rows.length > 0} onChange={handleToggleAll} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></th>
              <th className={cn(T_TH, 'text-left')}>Nama Karyawan</th>
              <th className={cn(T_TH, 'text-left')}>Posisi</th>
              <th className={cn(T_TH, 'text-left')}>Status</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-[13px] text-gray-400">{filtered.length === 0 ? 'Belum ada karyawan terdaftar' : 'Tidak ada hasil yang cocok dengan filter'}</td></tr>}
              {rows.map((item, i) => {
                const selected = selectedRows.has(item.id);
                return (
                  <tr key={item.id} className={cn(rowClass(i, selected), 'cursor-pointer')} onClick={() => openEdit(item)} title="Klik untuk edit">
                    <td className={cn(T_TD, 'text-center')} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => handleToggleRow(item.id)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></td>
                    <td className={cn(T_TD, 'text-gray-700')}>{item.picPenjahit}</td>
                    <td className={T_TD}>
                      {item.posisi ? (
                        <span className={cn('inline-block px-2.5 py-1 rounded-md text-[11px] font-medium text-white whitespace-nowrap', POSISI_BADGE[item.posisi] || 'bg-gray-500')}>{item.posisi}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className={T_TD}>
                      <span className={cn('inline-block px-2.5 py-1 rounded-md text-[11px] font-medium text-white whitespace-nowrap', STATUS_BADGE[item.status] || 'bg-gray-500')}>{item.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[86vh] flex flex-col overflow-hidden border border-gray-100" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-[14px] font-semibold text-slate-800">{editTarget ? 'Edit Karyawan' : 'Tambah Karyawan Baru'}</h2>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nama Karyawan *</label>
                <input type="text" value={form.picPenjahit} onChange={(e) => setField('picPenjahit', e.target.value)} placeholder="e.g. Budi Santoso" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Posisi *</label>
                <select value={form.posisi} onChange={(e) => setField('posisi', e.target.value)} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300">
                  <option value="">— Pilih Posisi —</option>
                  {POSISI_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</label>
                <select value={form.status} onChange={(e) => setField('status', e.target.value)} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300">
                  <option value="Aktif">Aktif</option>
                  <option value="Non-Aktif">Non-Aktif</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1.5">Karyawan Non-Aktif tidak muncul di dropdown Planning Produksi, tapi riwayatnya tetap tersimpan.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setModalOpen(false)} className="h-8 px-4 text-[12px] text-slate-600 border border-gray-200 rounded-lg hover:bg-slate-50 transition-colors">Batal</button>
              <button onClick={handleSave} disabled={!isValid || saving} className={cn('h-8 px-4 text-[12px] font-medium rounded-lg transition-colors flex items-center gap-1.5', isValid && !saving ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed')}>
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default RegisterKaryawanPage;
