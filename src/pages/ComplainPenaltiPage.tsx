import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { DataTable } from '@/components/Table/DataTable';
import { Pagination } from '@/components/Table/Pagination';
import { viewConfig } from '@/data/mockData';
import {
  list as listComplain,
  create as createComplain,
  update as updateComplain,
  remove as removeComplain,
  type ComplainPenaltiRow,
} from '@/services/complainPenalti';
import { useAuth } from '@/contexts/AuthContext';

const PAGE_SIZE = 10;

const POSISI_OPTIONS = [
  { key: 'jahit', label: 'Jahit' },
  { key: 'obras', label: 'Obras' },
  { key: 'finishing', label: 'Finishing' },
  { key: 'kancing', label: 'Kancing' },
];

function today(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

interface ComplainForm {
  tanggal: string;
  product: string;
  warna: string;
  pcs: string;
  posisi: string;
  pic: string;
  detailComplain: string;
  potonganPerPcs: string;
  poin: string;
  buktiUrl: string;
}

const EMPTY_FORM: ComplainForm = {
  tanggal: today(),
  product: '',
  warna: '',
  pcs: '',
  posisi: '',
  pic: '',
  detailComplain: '',
  potonganPerPcs: '',
  poin: '',
  buktiUrl: '',
};

export function ComplainPenaltiPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<ComplainPenaltiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ComplainPenaltiRow | null>(null);
  const [form, setForm] = useState<ComplainForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await listComplain();
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((item: ComplainPenaltiRow) => {
    setEditTarget(item);
    setForm({
      tanggal: item.tanggal,
      product: item.product,
      warna: item.warna ?? '',
      pcs: String(item.pcs),
      posisi: item.posisi,
      pic: item.pic ?? '',
      detailComplain: item.detailComplain ?? '',
      potonganPerPcs: String(item.potonganPerPcs),
      poin: String(item.poin),
      buktiUrl: item.buktiUrl ?? '',
    });
    setModalOpen(true);
  }, []);

  const isValid =
    form.tanggal &&
    form.product &&
    form.pcs &&
    form.posisi;

  async function handleSave() {
    if (!isValid) {
      setMessage('❌ Lengkapi Tanggal, Produk, PCS, dan Posisi.');
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    setSaving(true);
    const fields = {
      tanggal: form.tanggal,
      product: form.product,
      warna: form.warna || null,
      pcs: Number(form.pcs),
      posisi: form.posisi,
      pic: form.pic || null,
      detailComplain: form.detailComplain || null,
      potonganPerPcs: Number(form.potonganPerPcs || 0),
      poin: Number(form.poin || 0),
      buktiUrl: form.buktiUrl || null,
      inputBy: profile.displayName,
    };
    if (editTarget) {
      const { error } = await updateComplain(editTarget.id, fields);
      if (error) {
        setMessage(`❌ Error: ${error.message}`);
      } else {
        setMessage(`✅ Complain untuk "${form.product}" berhasil diupdate!`);
        setModalOpen(false);
        refresh();
      }
    } else {
      const { error } = await createComplain(fields);
      if (error) {
        setMessage(`❌ Error: ${error.message}`);
      } else {
        setMessage(`✅ Complain untuk "${form.product}" berhasil ditambahkan!`);
        setModalOpen(false);
        refresh();
      }
    }
    setSaving(false);
    setTimeout(() => setMessage(null), 3500);
  }

  async function handleDelete(id: number) {
    if (!confirm('Yakin ingin hapus complain ini?')) return;
    const { error } = await removeComplain(id);
    if (error) {
      setMessage(`❌ Error: ${error.message}`);
    } else {
      setMessage('✅ Complain berhasil dihapus.');
      await refresh();
    }
    setTimeout(() => setMessage(null), 3000);
  }

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((d) =>
      [d.tanggal, d.product, d.warna ?? '', String(d.pcs), d.posisi, d.pic ?? '', d.detailComplain ?? '', String(d.poin), d.inputBy ?? '']
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, search]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const config = viewConfig['complain-penalti'];

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Complain & Penalti...</p>
      </main>
    );
  }

  const setField = (k: keyof ComplainForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <main className="flex-1 flex flex-col min-w-0">
      <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
        <div>
          <h1 className="text-lg font-bold text-slate-900">⚠️ Complain & Penalti</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Catat complain & potongan penalti per penjahit — input_by tercatat otomatis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="h-8 px-3 text-[11px] border border-gray-200 rounded-lg flex items-center gap-1.5 text-slate-600 hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={openCreate} className="h-8 px-3 text-[11px] font-semibold bg-sky-500 text-white rounded-lg hover:bg-sky-600 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Complain
          </button>
        </div>
      </div>

      {message && (
        <div className="mx-5 mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-[12px] text-blue-700">{message}</div>
      )}

      <div className="px-5 py-2">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input type="text" placeholder="Cari complain..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100" />
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
        <span className="text-[11px] text-slate-500">{filtered.length} complain</span>
        <Pagination total={filtered.length} currentPage={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h3 className="text-[14px] font-semibold text-slate-900">{editTarget ? '✏️ Edit Complain' : '➕ Add Complain'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tanggal *</label>
                  <input type="date" value={form.tanggal} onChange={(e) => setField('tanggal', e.target.value)} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Produk *</label>
                  <input type="text" value={form.product} onChange={(e) => setField('product', e.target.value)} placeholder="e.g. Dress" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Warna</label>
                  <input type="text" value={form.warna} onChange={(e) => setField('warna', e.target.value)} placeholder="e.g. Hitam" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">PCS *</label>
                  <input type="number" min={0} value={form.pcs} onChange={(e) => setField('pcs', e.target.value)} placeholder="0" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Posisi *</label>
                  <select value={form.posisi} onChange={(e) => setField('posisi', e.target.value)} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300">
                    <option value="">— Pilih Posisi —</option>
                    {POSISI_OPTIONS.map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">PIC</label>
                  <input type="text" value={form.pic} onChange={(e) => setField('pic', e.target.value)} placeholder="Nama penjahit" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Detail Complain</label>
                <textarea value={form.detailComplain} onChange={(e) => setField('detailComplain', e.target.value)} placeholder="Deskripsi keluhan / catatan" className="w-full h-20 px-3 py-2 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300 resize-none" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Potongan/PCS</label>
                  <input type="number" min={0} value={form.potonganPerPcs} onChange={(e) => setField('potonganPerPcs', e.target.value)} placeholder="0" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Poin</label>
                  <input type="number" min={0} value={form.poin} onChange={(e) => setField('poin', e.target.value)} placeholder="0" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Bukti URL</label>
                  <input type="text" value={form.buktiUrl} onChange={(e) => setField('buktiUrl', e.target.value)} placeholder="https://..." className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-sky-300" />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between bg-slate-50 border border-gray-200 rounded-lg px-4 py-2.5">
                  <span className="text-[12px] font-semibold text-slate-600">Input By (otomatis)</span>
                  <span className="text-[12px] font-bold text-slate-800">{profile.displayName}</span>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
              <button onClick={() => setModalOpen(false)} className="px-4 py-1.5 text-[11px] text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50" disabled={saving}>Cancel</button>
              <button onClick={handleSave} disabled={!isValid || saving} className="px-4 py-1.5 text-[11px] font-semibold bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Saving…' : editTarget ? 'Update Complain' : 'Save Complain'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default ComplainPenaltiPage;
