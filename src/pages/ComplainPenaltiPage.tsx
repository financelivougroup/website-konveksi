import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Plus, RefreshCw, Search, Camera, Pencil, Trash2, X } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, rowClass } from '@/lib/tableStyles';
import {
  list as listComplain,
  create as createComplain,
  update as updateComplain,
  remove as removeComplain,
  type ComplainPenaltiRow,
} from '@/services/complainPenalti';
import {
  fetchFilesByComplainId,
  fetchFileCounts,
  uploadComplainProof,
  createComplainFileRecord,
  removeComplainFile,
  removeComplainFilesByPaths,
  type ComplainFileRow,
} from '@/services/complainFiles';
import { fetchAll as fetchStaff } from '@/services/registerPenjahit';
import {
  TINGKAT_OPTIONS,
  STATUS_OPTIONS,
  fetchComplainOptions,
  suggestPotongan,
  type ComplainOption,
} from '@/lib/complainHelper';
import { useAuth } from '@/contexts/AuthContext';

const MAX_PHOTOS = 3;

const POSISI_OPTIONS = [
  { key: 'jahit', label: 'Jahit' },
  { key: 'obras', label: 'Obras' },
  { key: 'finishing', label: 'Finishing' },
  { key: 'kancing', label: 'Kancing' },
];

const POSISI_LABEL: Record<string, string> = {
  jahit: 'Jahit',
  obras: 'Obras',
  finishing: 'Finishing',
  kancing: 'Kancing',
};

// Badge solid pill — TINGKAT: ringan/sedang/berat, STATUS: Baru/Diproses/Selesai.
const TINGKAT_BADGE: Record<string, string> = {
  ringan: 'bg-emerald-600',
  sedang: 'bg-amber-500',
  berat: 'bg-rose-600',
};

const STATUS_BADGE: Record<string, string> = {
  Baru: 'bg-blue-600',
  Diproses: 'bg-amber-500',
  Selesai: 'bg-emerald-600',
};

function today(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

interface ComplainForm {
  tanggal: string; // default hari ini
  product: string;
  warna: string;
  workCode: string;
  pic: string;
  posisi: string;
  tingkat: string; // ringan/sedang/berat
  potonganPerPcs: string;
  detailComplain: string;
  status: string; // default 'Baru'
}

const EMPTY_FORM: ComplainForm = {
  tanggal: today(),
  product: '',
  warna: '',
  workCode: '',
  pic: '',
  posisi: '',
  tingkat: '',
  potonganPerPcs: '',
  detailComplain: '',
  status: 'Baru',
};

interface PendingFile {
  file: File;
  previewUrl: string;
}

const inputCls =
  'w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';
const labelCls = 'block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1';

export function ComplainPenaltiPage() {
  const { profile } = useAuth();

  // ===== Data tabel =====
  const [items, setItems] = useState<ComplainPenaltiRow[]>([]);
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // ===== Opsi form (dari data produksi) =====
  const [complainOptions, setComplainOptions] = useState<ComplainOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);

  // ===== Modal state =====
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ComplainPenaltiRow | null>(null);
  const [form, setForm] = useState<ComplainForm>(EMPTY_FORM);
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [existingFiles, setExistingFiles] = useState<ComplainFileRow[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);

  // Dropdown Produk: tutup saat klik di luar panel.
  const productDropdownRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!productDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node)) {
        setProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [productDropdownOpen]);

  // Saran potongan terakhir yang diterapkan — supaya saran tidak menimpa input manual user.
  const lastSuggestionRef = useRef<string | null>(null);
  // Timer flash pesan — clear sebelum jadwalkan yang baru agar pesan beruntun tidak saling potong.
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(msg: string, ms = 3500) {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setMessage(msg);
    flashTimerRef.current = setTimeout(() => setMessage(null), ms);
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    const [{ data }, counts] = await Promise.all([listComplain(), fetchFileCounts()]);
    setItems(data ?? []);
    setFileCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Muat opsi cascade (work orders) + daftar PIC aktif (Register Karyawan).
  useEffect(() => {
    void (async () => {
      setComplainOptions(await fetchComplainOptions());
    })();
    void (async () => {
      const { data } = await fetchStaff();
      const names: string[] = [];
      for (const s of data ?? []) {
        if (s.status === 'Aktif' && s.picPenjahit && !names.includes(s.picPenjahit)) {
          names.push(s.picPenjahit);
        }
      }
      setStaffOptions(names);
    })();
  }, []);

  // ===== Opsi cascade: Product -> Warna -> Work Code =====
  const productOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const o of complainOptions) {
      if (o.product && !seen.has(o.product)) seen.add(o.product);
    }
    return Array.from(seen);
  }, [complainOptions]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return productOptions;
    return productOptions.filter((p) => p.toLowerCase().includes(q));
  }, [productOptions, productSearch]);

  const warnaOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const o of complainOptions) {
      if (o.product === form.product && o.warna && !seen.has(o.warna)) seen.add(o.warna);
    }
    return Array.from(seen);
  }, [complainOptions, form.product]);

  const workCodeOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const o of complainOptions) {
      if (o.product === form.product && o.warna === form.warna && o.workCode && !seen.has(o.workCode)) {
        seen.add(o.workCode);
      }
    }
    return Array.from(seen);
  }, [complainOptions, form.product, form.warna]);

  // 1 warna untuk produk terpilih -> auto-select.
  useEffect(() => {
    if (!form.product || form.warna) return;
    if (warnaOptions.length === 1) {
      setForm((f) => ({ ...f, warna: warnaOptions[0] }));
    }
  }, [form.product, form.warna, warnaOptions]);

  // Saran potongan otomatis dari Register PO (berdasarkan work code + posisi).
  useEffect(() => {
    if (!form.workCode || !form.posisi) return;
    const opt = complainOptions.find(
      (o) => o.product === form.product && o.warna === form.warna && o.workCode === form.workCode,
    );
    if (!opt) return;
    let cancelled = false;
    void (async () => {
      const val = await suggestPotongan(opt.sourceOrderId, form.posisi);
      if (!cancelled && val !== null) {
        // Saran = default, bukan paksaan: hanya isi kalau field masih kosong
        // atau masih sama dengan saran terakhir (belum diedit manual).
        setForm((f) => {
          const stale = f.potonganPerPcs === '' || f.potonganPerPcs === lastSuggestionRef.current;
          if (!stale) return f;
          lastSuggestionRef.current = String(val);
          return { ...f, potonganPerPcs: String(val) };
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [complainOptions, form.product, form.warna, form.workCode, form.posisi]);

  function selectProduct(p: string) {
    setProductSearch(p);
    setProductDropdownOpen(false);
    if (form.product === p) return;
    // Cascade reset: ganti product -> reset warna, workCode, potongan.
    lastSuggestionRef.current = null;
    setForm((f) => ({ ...f, product: p, warna: '', workCode: '', potonganPerPcs: '' }));
  }

  function selectWarna(w: string) {
    if (form.warna === w) return;
    // Cascade reset: ganti warna -> reset workCode, potongan.
    lastSuggestionRef.current = null;
    setForm((f) => ({ ...f, warna: w, workCode: '', potonganPerPcs: '' }));
  }

  // ===== Modal buka/tutup =====
  const openCreate = useCallback(() => {
    setEditTarget(null);
    // M-3: tanggal dihitung saat modal dibuka (bukan saat module load) — aman untuk sesi lintas tengah malam.
    setForm({ ...EMPTY_FORM, tanggal: today() });
    lastSuggestionRef.current = null;
    setProductSearch('');
    setProductDropdownOpen(false);
    setExistingFiles([]);
    setPendingFiles([]);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback(async (item: ComplainPenaltiRow) => {
    setEditTarget(item);
    // Nilai potongan existing dianggap input user — jangan ditimpa saran.
    lastSuggestionRef.current = null;
    setForm({
      tanggal: item.tanggal,
      product: item.product,
      warna: item.warna ?? '',
      workCode: item.workCode ?? '',
      pic: item.pic ?? '',
      posisi: item.posisi,
      tingkat: item.tingkat ?? '',
      potonganPerPcs: String(item.potonganPerPcs),
      detailComplain: item.detailComplain ?? '',
      status: item.status,
    });
    setProductSearch(item.product);
    setProductDropdownOpen(false);
    setExistingFiles([]);
    setPendingFiles([]);
    setModalOpen(true);
    const { data } = await fetchFilesByComplainId(item.id);
    setExistingFiles(data ?? []);
  }, []);

  const closeModal = useCallback(() => {
    setPendingFiles((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setProductDropdownOpen(false);
    setModalOpen(false);
  }, []);

  // ===== Bukti foto (maks 3) =====
  const totalPhotos = existingFiles.length + pendingFiles.length;

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (files.length === 0) return;
    const room = MAX_PHOTOS - totalPhotos;
    if (room <= 0) return;
    const accepted = files.slice(0, room);
    setPendingFiles((prev) => [...prev, ...accepted.map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) }))]);
    if (files.length > accepted.length) {
      flash(`⚠️ Maksimal ${MAX_PHOTOS} foto — sisa file dilewati.`);
    }
  }

  function removePending(previewUrl: string) {
    setPendingFiles((prev) => {
      const target = prev.find((p) => p.previewUrl === previewUrl);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.previewUrl !== previewUrl);
    });
  }

  async function handleRemoveExisting(file: ComplainFileRow) {
    const { error } = await removeComplainFile(file.id);
    if (error) {
      flash(`❌ Gagal hapus foto: ${error.message}`);
      return;
    }
    setExistingFiles((prev) => prev.filter((f) => f.id !== file.id));
  }

  async function uploadPendingFiles(complainId: number): Promise<number> {
    let failed = 0;
    for (const p of pendingFiles) {
      const up = await uploadComplainProof({ complainId, file: p.file });
      if (up.error) {
        failed += 1;
        continue;
      }
      const { error } = await createComplainFileRecord({
        complainId,
        fileName: up.fileName,
        filePath: up.filePath,
        fileUrl: up.fileUrl,
      });
      if (error) failed += 1;
    }
    return failed;
  }

  // ===== Simpan / hapus =====
  const isValid = Boolean(
    form.tanggal && form.product && form.warna && form.workCode && form.pic && form.posisi && form.tingkat,
  );
  const selectedPoin = TINGKAT_OPTIONS.find((t) => t.key === form.tingkat)?.poin ?? 0;

  async function handleSave() {
    if (!isValid) {
      flash('❌ Lengkapi semua field wajib (*).');
      return;
    }
    setSaving(true);
    const fields = {
      tanggal: form.tanggal,
      product: form.product,
      warna: form.warna || null,
      workCode: form.workCode || null,
      pcs: 1, // pcs selalu 1
      posisi: form.posisi,
      pic: form.pic || null,
      detailComplain: form.detailComplain || null,
      potonganPerPcs: Number(form.potonganPerPcs || 0),
      poin: selectedPoin, // otomatis dari tingkat
      tingkat: form.tingkat || null,
      status: form.status,
      inputBy: profile.displayName,
    };
    try {
      if (editTarget) {
        const { error } = await updateComplain(editTarget.id, fields);
        if (error) {
          flash(`❌ Error: ${error.message}`);
          return;
        }
        const failed = await uploadPendingFiles(editTarget.id);
        closeModal();
        flash(
          failed > 0
            ? `⚠️ Complain terupdate, ${failed} foto gagal diupload.`
            : `✅ Complain untuk "${form.product}" berhasil diupdate!`,
        );
        void refresh();
      } else {
        const { data: created, error } = await createComplain(fields);
        if (error || !created) {
          flash(`❌ Error: ${error?.message ?? 'Gagal menyimpan complain.'}`);
          return;
        }
        const failed = await uploadPendingFiles(created.id);
        closeModal();
        flash(
          failed > 0
            ? `⚠️ Complain tersimpan, ${failed} foto gagal diupload.`
            : `✅ Complain untuk "${form.product}" berhasil ditambahkan!`,
        );
        void refresh();
      }
    } catch (e) {
      flash('❌ ' + (e instanceof Error ? e.message : 'Gagal menyimpan.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: ComplainPenaltiRow) {
    if (!confirm('Yakin ingin hapus complain ini? File bukti terkait juga akan terhapus.')) return;
    // Ambil path file bukti SEBELUM hapus DB — row complain_files ikut terhapus oleh CASCADE.
    const { data: files } = await fetchFilesByComplainId(item.id);
    const { error } = await removeComplain(item.id);
    if (error) {
      flash(`❌ Error: ${error.message}`);
      return;
    }
    // Best-effort: hapus objek storage juga; kegagalan jangan menghambat UI
    // (row DB sudah hilang, file yang tersisa jadi orphan).
    await removeComplainFilesByPaths((files ?? []).map((f) => f.filePath)).catch(() => {});
    flash('✅ Complain berhasil dihapus.');
    void refresh();
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((d) =>
      [
        d.tanggal,
        d.workCode ?? '',
        d.product,
        d.warna ?? '',
        d.posisi,
        d.pic ?? '',
        d.detailComplain ?? '',
        d.tingkat ?? '',
        d.status,
        d.inputBy ?? '',
      ].some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, search]);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Complain & Penalti...</p>
      </main>
    );
  }

  const setField = (k: keyof ComplainForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-auto">
      {/* Header — pola ProductionMonitoring */}
      <div className="px-8 pt-4 pb-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Complain & Penalti</h1>
          <div className="flex items-center gap-2.5">
            <button
              onClick={refresh}
              className="h-8 px-3.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:shadow-md transition-all flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={openCreate}
              className="h-8 px-3.5 text-[12px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-md hover:shadow-blue-200 transition-all flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Complain
            </button>
          </div>
        </div>
        {message && (
          <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-[12px] text-blue-700">
            {message}
          </div>
        )}
      </div>

      <div className="flex-1 px-8 pt-5 pb-6 overflow-auto">
        {/* Toolbar: search + hitungan complain */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari complain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <span className="text-[11px] text-slate-400 ml-auto">{filtered.length} complain</span>
        </div>

        {/* Tabel manual — design system tableStyles (sama dengan Production Monitoring) */}
        <div className={T_WRAP}>
          <table className={T_TABLE}>
            <thead>
              <tr className={T_HEAD_ROW}>
                <th className={cn(T_TH, 'text-left')}>Tanggal</th>
                <th className={cn(T_TH, 'text-left')}>Work Code</th>
                <th className={cn(T_TH, 'text-left')}>Produk</th>
                <th className={cn(T_TH, 'text-left')}>Posisi</th>
                <th className={cn(T_TH, 'text-left')}>PIC</th>
                <th className={cn(T_TH, 'text-right')}>Poin</th>
                <th className={cn(T_TH, 'text-right')}>Potongan/PCS</th>
                <th className={cn(T_TH, 'text-center')}>Tingkat</th>
                <th className={cn(T_TH, 'text-center')}>Status</th>
                <th className={cn(T_TH, 'text-center')}>Bukti</th>
                <th className={cn(T_TH, 'text-center')}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-[13px] text-gray-400">
                    Belum ada complain
                  </td>
                </tr>
              )}
              {filtered.map((item, i) => {
                // id bigint bisa tiba sebagai string dari supabase-js — bandingkan sebagai string.
                const photoCount = fileCounts[String(item.id)] ?? 0;
                return (
                  <tr key={String(item.id)} className={rowClass(i)}>
                    <td className={cn(T_TD, 'text-gray-700 whitespace-nowrap')}>{item.tanggal}</td>
                    <td className={cn(T_TD, 'font-mono text-[12px] text-gray-600 max-w-[260px] truncate')} title={item.workCode ?? ''}>
                      {item.workCode ?? '—'}
                    </td>
                    <td className={cn(T_TD, 'font-medium text-gray-900')}>{item.product}</td>
                    <td className={cn(T_TD, 'text-gray-700')}>{POSISI_LABEL[item.posisi] ?? item.posisi}</td>
                    <td className={cn(T_TD, 'text-gray-700')}>{item.pic ?? '—'}</td>
                    <td className={cn(T_TD, 'text-right font-medium tabular-nums text-gray-900')}>{item.poin}</td>
                    <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatCurrency(item.potonganPerPcs)}</td>
                    <td className={cn(T_TD, 'text-center')}>
                      {item.tingkat ? (
                        <span
                          className={cn(
                            'inline-block px-2.5 py-1 rounded-md text-[11px] font-medium text-white whitespace-nowrap',
                            TINGKAT_BADGE[item.tingkat] ?? 'bg-gray-500',
                          )}
                        >
                          {TINGKAT_OPTIONS.find((t) => t.key === item.tingkat)?.label ?? item.tingkat}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className={cn(T_TD, 'text-center')}>
                      <span
                        className={cn(
                          'inline-block px-2.5 py-1 rounded-md text-[11px] font-medium text-white whitespace-nowrap',
                          STATUS_BADGE[item.status] ?? 'bg-gray-500',
                        )}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className={cn(T_TD, 'text-center')}>
                      {photoCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-600">
                          <Camera className="w-3.5 h-3.5 text-blue-500" /> {photoCount}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className={cn(T_TD, 'text-center whitespace-nowrap')}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => void openEdit(item)}
                          title="Edit complain"
                          className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => void handleDelete(item)}
                          title="Hapus complain"
                          className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Modal form complain ===== */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-full max-h-[90vh] flex flex-col border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-[14px] font-semibold text-slate-900">
                {editTarget ? 'Edit Complain' : 'Tambah Complain'}
              </h3>
              <button
                onClick={closeModal}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                title="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Row 1: Tanggal | Produk (combobox searchable) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Tanggal *</label>
                  <input
                    type="date"
                    value={form.tanggal}
                    onChange={(e) => setField('tanggal', e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Produk *</label>
                  <div ref={productDropdownRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setProductDropdownOpen((o) => {
                        if (!o) setProductSearch(''); // buka: mulai dengan daftar penuh
                        return !o;
                      })}
                      className={cn(inputCls, 'flex items-center justify-between text-left bg-white cursor-pointer')}
                    >
                      <span className={form.product ? 'text-slate-800' : 'text-slate-400'}>
                        {form.product || 'Pilih produk...'}
                      </span>
                      <svg className={cn('w-3 h-3 text-slate-400 transition-transform', productDropdownOpen && 'rotate-180')} viewBox="0 0 12 12" fill="none"><path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    {productDropdownOpen && (
                      <div className="absolute z-20 mt-1 w-full border border-gray-200 rounded-lg bg-white shadow-lg">
                        <div className="p-2 border-b border-gray-100">
                          <input
                            type="text"
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            placeholder="Cari produk..."
                            autoFocus
                            className="w-full h-8 px-2.5 text-[12px] border border-gray-200 rounded-md outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto divide-y divide-gray-100">
                          {complainOptions.length === 0 ? (
                            <p className="px-3 py-2 text-[11px] text-slate-400">Memuat produk dari data produksi...</p>
                          ) : filteredProducts.length === 0 ? (
                            <p className="px-3 py-2 text-[11px] text-slate-400">Tidak ada produk yang cocok.</p>
                          ) : (
                            filteredProducts.map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => selectProduct(p)}
                                className={cn(
                                  'w-full text-left px-3 py-1.5 text-[12px] transition-colors hover:bg-blue-50',
                                  form.product === p ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700',
                                )}
                              >
                                {p}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2: Warna | Work Code */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Warna *</label>
                  <select
                    value={form.warna}
                    onChange={(e) => selectWarna(e.target.value)}
                    disabled={!form.product}
                    className={inputCls}
                  >
                    <option value="">— Pilih Warna —</option>
                    {warnaOptions.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Work Code *</label>
                  <select
                    value={form.workCode}
                    onChange={(e) => setField('workCode', e.target.value)}
                    disabled={!form.warna}
                    className={inputCls}
                  >
                    <option value="">— Pilih Work Code —</option>
                    {workCodeOptions.map((wc) => (
                      <option key={wc} value={wc}>
                        {wc}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: PIC | Posisi */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>PIC *</label>
                  <select value={form.pic} onChange={(e) => setField('pic', e.target.value)} className={inputCls}>
                    <option value="">— Pilih PIC —</option>
                    {staffOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Posisi *</label>
                  <select value={form.posisi} onChange={(e) => setField('posisi', e.target.value)} className={inputCls}>
                    <option value="">— Pilih Posisi —</option>
                    {POSISI_OPTIONS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 4: Tingkat | Potongan/PCS (saran otomatis) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Tingkat *</label>
                  <select value={form.tingkat} onChange={(e) => setField('tingkat', e.target.value)} className={inputCls}>
                    <option value="">— Pilih Tingkat —</option>
                    {TINGKAT_OPTIONS.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label} ({t.poin} poin)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Potongan/PCS</label>
                  <input
                    type="number"
                    min={0}
                    value={form.potonganPerPcs}
                    onChange={(e) => setField('potonganPerPcs', e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">Saran otomatis dari Register PO — bisa diubah.</p>
                </div>
              </div>

              {/* Row 5: Status | Poin (otomatis dari tingkat) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.status} onChange={(e) => setField('status', e.target.value)} className={inputCls}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Poin (otomatis)</label>
                  <div className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-slate-50 flex items-center font-semibold text-slate-700">
                    {form.tingkat
                      ? `${selectedPoin} poin — ${TINGKAT_OPTIONS.find((t) => t.key === form.tingkat)?.label ?? form.tingkat}`
                      : '—'}
                  </div>
                </div>
              </div>

              {/* Detail complain */}
              <div>
                <label className={labelCls}>Detail Complain</label>
                <textarea
                  value={form.detailComplain}
                  onChange={(e) => setField('detailComplain', e.target.value)}
                  placeholder="Deskripsi complain / catatan"
                  rows={3}
                  className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 resize-none"
                />
              </div>

              {/* Bukti foto (maks 3) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bukti Foto (maks 3)</span>
                  <span className="text-[10px] font-semibold text-slate-400">{totalPhotos}/3 foto</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {existingFiles.map((f) => (
                    <div key={f.id} className="relative w-16 h-16">
                      <img
                        src={f.fileUrl}
                        alt={f.fileName}
                        className="w-16 h-16 rounded-lg object-cover border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => void handleRemoveExisting(f)}
                        title="Hapus foto"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700 shadow-sm transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {pendingFiles.map((p) => (
                    <div key={p.previewUrl} className="relative w-16 h-16">
                      <img
                        src={p.previewUrl}
                        alt={p.file.name}
                        className="w-16 h-16 rounded-lg object-cover border border-blue-200"
                      />
                      <button
                        type="button"
                        onClick={() => removePending(p.previewUrl)}
                        title="Batalkan foto"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700 shadow-sm transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {totalPhotos < MAX_PHOTOS && (
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                      <Plus className="w-4 h-4" />
                      <span className="text-[9px] font-semibold mt-0.5">Tambah</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleFilesSelected} />
                    </label>
                  )}
                </div>
              </div>

              {/* Footer info: input by otomatis */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between bg-slate-50 border border-gray-200 rounded-lg px-4 py-2.5">
                  <span className="text-[12px] font-semibold text-slate-600">Input By (otomatis)</span>
                  <span className="text-[12px] font-bold text-slate-800">{profile.displayName}</span>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-1.5 text-[11px] text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={!isValid || saving}
                className="px-4 py-1.5 text-[11px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : editTarget ? 'Update Complain' : 'Simpan Complain'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ComplainPenaltiPage;
