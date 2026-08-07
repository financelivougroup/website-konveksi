import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, RefreshCw, Search, Sparkles } from 'lucide-react';
import { DataTable } from '@/components/Table/DataTable';
import { Pagination } from '@/components/Table/Pagination';
import { viewConfig } from '@/data/mockData';
import {
  list as listPlanning,
  create as createPlanning,
  update as updatePlanning,
  remove as removePlanning,
  type PlanningProduksiRow,
} from '@/services/planningProduksi';
import { fetchAll as fetchAllPenjahit, type RegisterPenjahitRow } from '@/services/registerPenjahit';
import { generateTargetsFromPlanning } from '@/services/staffDebt';

const PAGE_SIZE = 10;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

interface PlanningForm {
  namaPenjahit: string;
  product: string;
  warna: string;
  qty: string;
  bulanTarget: string;
}

const EMPTY_FORM: PlanningForm = {
  namaPenjahit: '',
  product: '',
  warna: '',
  qty: '',
  bulanTarget: currentMonth(),
};

export function PlanningProduksiPage() {
  const [items, setItems] = useState<PlanningProduksiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

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
    setPenjahitList(data ?? []);
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

  async function handleDelete(id: number) {
    if (!confirm('Yakin ingin hapus planning produksi ini?')) return;
    const { error } = await removePlanning(id);
    if (error) {
      setMessage(`❌ Error: ${error.message}`);
    } else {
      setMessage('✅ Planning produksi berhasil dihapus.');
      await refresh();
    }
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleGenerate() {
    setGenerating(true);
    const { created, error } = await generateTargetsFromPlanning(genMonth);
    setGenerating(false);
    if (error) {
      setMessage(`❌ Error saat generate: ${error.message}`);
    } else {
      setMessage(`✅ Generate selesai! ${created} target jahit dibuat untuk ${genMonth}.`);
    }
    setTimeout(() => setMessage(null), 4000);
  }

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((d) =>
      [d.namaPenjahit, d.product, d.warna ?? '', d.bulanTarget]
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, search]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const config = viewConfig['planning-produksi'];

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Planning Produksi...</p>
      </main>
    );
  }

  const setField = (k: keyof PlanningForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <main className="flex-1 flex flex-col min-w-0">
      <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
        <div>
          <h1 className="text-lg font-bold text-slate-900">📐 Planning Produksi</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Rencana produksi bulanan per penjahit — dasar generate target jahit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="h-8 px-3 text-[11px] border border-gray-200 rounded-lg flex items-center gap-1.5 text-slate-600 hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={handleGenerate} disabled={generating} className="h-8 px-3 text-[11px] font-semibold bg-violet-500 text-white rounded-lg hover:bg-violet-600 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
            <Sparkles className="w-3.5 h-3.5" /> {generating ? 'Generating…' : 'Generate Target'}
          </button>
          <button onClick={openCreate} className="h-8 px-3 text-[11px] font-semibold bg-sky-500 text-white rounded-lg hover:bg-sky-600 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Tambah Planning Produksi
          </button>
        </div>
      </div>

      {message && (
        <div className="mx-5 mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-[12px] text-blue-700">{message}</div>
      )}

      <div className="px-5 py-2 flex items-center gap-2">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input type="text" placeholder="Cari planning..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100" />
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <label className="text-[11px] text-slate-500">Generate untuk bulan</label>
          <input type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} className="h-8 px-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-violet-300" />
        </div>
      </div>

      <DataTable
        columns={config.columns.map((c, i) => ({ ...c, _originalIndex: i }))}
        data={paginated as unknown as Record<string, unknown>[]}
        selectedRows={new Set()}
        rowHeight="medium"
        condColors={[]}
        editable={true}
        sorts={[]}
        onToggleRow={() => {}}
        onToggleAll={() => {}}
        onViewDetail={(id) => { const item = items.find((it) => it.id === Number(id)); if (item) openEdit(item); }}
        onEditDetail={(id) => { const item = items.find((it) => it.id === Number(id)); if (item) openEdit(item); }}
        onDeleteRow={(id) => handleDelete(Number(id))}
        onResizeColumn={() => {}}
        onReorderColumn={() => {}}
        onRenameColumn={() => {}}
        onUpdateNote={() => {}}
        onSortColumn={() => {}}
        onGroupColumn={() => {}}
        onSetSource={() => {}}
      />

      <div className="px-5 pb-4 flex items-center justify-between">
        <span className="text-[11px] text-slate-500">{filtered.length} planning produksi</span>
        <Pagination total={filtered.length} currentPage={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
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
                <select value={form.namaPenjahit} onChange={(e) => setField('namaPenjahit', e.target.value)} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300">
                  <option value="">— Pilih Penjahit —</option>
                  {penjahitList.map((p) => (
                    <option key={p.id} value={p.pic_penjahit}>{p.pic_penjahit}</option>
                  ))}
                </select>
                {penjahitList.length === 0 && <p className="text-[10px] text-slate-400 mt-1">Belum ada penjahit terdaftar — tambahkan di Register Penjahit.</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Produk *</label>
                  <input type="text" value={form.product} onChange={(e) => setField('product', e.target.value)} placeholder="e.g. Dress" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Warna</label>
                  <input type="text" value={form.warna} onChange={(e) => setField('warna', e.target.value)} placeholder="e.g. Hitam" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Qty *</label>
                  <input type="number" min={0} value={form.qty} onChange={(e) => setField('qty', e.target.value)} placeholder="0" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Bulan Target *</label>
                  <input type="month" value={form.bulanTarget} onChange={(e) => setField('bulanTarget', e.target.value)} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300" />
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
              <button onClick={() => setModalOpen(false)} className="px-4 py-1.5 text-[11px] text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50" disabled={saving}>Cancel</button>
              <button onClick={handleSave} disabled={!isValid || saving} className="px-4 py-1.5 text-[11px] font-semibold bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Saving…' : editTarget ? 'Update Planning' : 'Save Planning'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default PlanningProduksiPage;
