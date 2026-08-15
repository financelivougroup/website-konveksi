import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, RefreshCw, Search, Pencil, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, rowClass } from '@/lib/tableStyles';
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
  const [filterPosisi, setFilterPosisi] = useState<string>('all');

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

  async function handleDelete(item: RegisterPenjahitRow) {
    if (!confirm(`Hapus karyawan "${item.picPenjahit}" dari daftar?\n\nRiwayat planning/jahit/finishing/kancing miliknya tetap tersimpan di database.`)) return;
    const { error } = await removeKaryawan(item.id);
    if (error) {
      setMessage(`❌ Error: ${error.message}`);
    } else {
      setMessage('✅ Karyawan berhasil dihapus.');
      await refresh();
    }
    setTimeout(() => setMessage(null), 3000);
  }

  const filtered = useMemo(() => {
    return items.filter((d) => {
      if (filterPosisi !== 'all' && (d.posisi ?? '') !== filterPosisi) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return [d.picPenjahit, d.posisi ?? '', d.status].some((v) => String(v).toLowerCase().includes(q));
    });
  }, [items, search, filterPosisi]);

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
          <select value={filterPosisi} onChange={e => setFilterPosisi(e.target.value)} className="h-8 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300">
            <option value="all">Semua Posisi</option>
            {POSISI_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="text-[11px] text-slate-400 ml-auto">{filtered.length} karyawan</span>
        </div>

        <div className={T_WRAP}>
          <table className={T_TABLE}>
            <thead><tr className={T_HEAD_ROW}>
              <th className={cn(T_TH, 'text-left')}>Nama Karyawan</th>
              <th className={cn(T_TH, 'text-left')}>Posisi</th>
              <th className={cn(T_TH, 'text-left')}>Status</th>
              <th className={cn(T_TH, 'text-right')}>Action</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-[13px] text-gray-400">Belum ada karyawan terdaftar</td></tr>}
              {filtered.map((item, i) => (
                <tr key={item.id} className={rowClass(i)}>
                  <td className={cn(T_TD, 'font-medium text-gray-900')}>{item.picPenjahit}</td>
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
                  <td className={cn(T_TD, 'text-right')}>
                    <div className="inline-flex gap-1">
                      <button onClick={() => openEdit(item)} title="Edit" className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(item)} title="Hapus" className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
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
