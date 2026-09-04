import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, RefreshCw, Search, Trash2, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, rowClass } from '@/lib/tableStyles';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton, HiddenColgroup } from '@/components/Table/ColumnSettings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import type { ClientUsage } from '@/lib/clientCode';
import {
  fetchAll as fetchAllClient,
  create as createClient,
  update as updateClient,
  remove as removeClient,
  fetchClientUsage,
  type RegisterClientRow,
} from '@/services/registerClient';

const STATUS_BADGE: Record<string, string> = {
  'Aktif': 'bg-emerald-600',
  'Non-Aktif': 'bg-slate-500',
};

interface ClientForm {
  namaClient: string;
  kodeClient: string;
  status: string;
}

const EMPTY_FORM: ClientForm = { namaClient: '', kodeClient: '', status: 'Aktif' };

export function RegisterClientPage() {
  const [items, setItems] = useState<RegisterClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const { hidden: hiddenCols, toggle: toggleCol } = useColumnSettings('register-client');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RegisterClientRow | null>(null);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<RegisterClientRow[]>([]);
  const [deleteUsage, setDeleteUsage] = useState<ClientUsage[]>([]);
  const [checkingUsage, setCheckingUsage] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchAllClient();
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetchAllClient().then(({ data }) => {
      if (cancelled) return;
      setItems(data ?? []);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((item: RegisterClientRow) => {
    setEditTarget(item);
    setForm({
      namaClient: item.namaClient,
      kodeClient: item.kodeClient,
      status: item.status ?? 'Aktif',
    });
    setModalOpen(true);
  }, []);

  // Kode client dipakai di dalam kode invoice (INV/MP/LVU/...), jadi hanya huruf/angka
  // yang diterima dan disimpan huruf besar.
  const normalizedCode = form.kodeClient.trim().toUpperCase();
  const isValid = form.namaClient.trim() && /^[A-Z0-9]+$/.test(normalizedCode);

  async function handleSave() {
    if (!isValid) {
      setMessage('❌ Lengkapi Nama Client dan Kode Client (huruf/angka saja).');
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    setSaving(true);
    const payload = {
      namaClient: form.namaClient.trim(),
      kodeClient: normalizedCode,
      status: form.status,
    };
    if (editTarget) {
      const { error } = await updateClient(editTarget.id, payload);
      if (error) {
        setMessage(`❌ Error: ${error.message}`);
      } else {
        setMessage(`✅ Client "${payload.namaClient}" berhasil diupdate!`);
        setModalOpen(false);
        refresh();
      }
    } else {
      const { error } = await createClient(payload);
      if (error) {
        setMessage(`❌ Error: ${error.message}`);
      } else {
        setMessage(`✅ Client "${payload.namaClient}" berhasil ditambahkan!`);
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
      return [d.namaClient, d.kodeClient, d.status].some((v) => String(v).toLowerCase().includes(q));
    });
  }, [items, search]);

  const CLIENT_FIELDS: FieldOption[] = [
    { key: 'namaClient', label: 'Nama Client' },
    { key: 'kodeClient', label: 'Kode Client' },
    { key: 'status', label: 'Status' },
  ];
  const rows = useMemo(() => applySorts(applyFilters(filtered.map((r) => ({ ...r } as unknown as Record<string, unknown>)), filters), sorts) as unknown as RegisterClientRow[], [filtered, filters, sorts]);

  // Multi-select + toolbar (same pattern as Production Monitoring RAW DATA).
  const handleToggleRow = (id: number) => setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleToggleAll = () => { if (selectedRows.size === rows.length) setSelectedRows(new Set()); else setSelectedRows(new Set(rows.map(r => r.id))); };
  const handleExport = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Nama Client', 'Kode Client', 'Status'];
    const lines = filtered.map((r) => [r.namaClient, r.kodeClient, r.status].map(esc).join(','));
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n'); // BOM for Excel UTF-8
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `register-client-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const prepareBulkDelete = async () => {
    if (selectedRows.size === 0 || checkingUsage) return;

    const targets = items.filter((item) => selectedRows.has(item.id));
    if (targets.length === 0) return;

    setCheckingUsage(true);
    const { data: usage, error } = await fetchClientUsage(targets);
    setCheckingUsage(false);

    if (error || !usage) {
      setMessage(`❌ Pemakaian client gagal diperiksa: ${error?.message ?? 'Unknown error'}. Penghapusan dibatalkan.`);
      setTimeout(() => setMessage(null), 4000);
      return;
    }

    // Snapshot target + dampaknya. Dialog berikutnya tidak bergantung pada
    // checkbox yang mungkin berubah setelah pemeriksaan selesai.
    setDeleteTargets(targets);
    setDeleteUsage(usage);
    setDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (deleteTargets.length === 0 || deleting) return;

    setDeleting(true);
    const deletedIds = new Set<number>();
    const failedNames: string[] = [];

    for (const client of deleteTargets) {
      const { error } = await removeClient(client.id);
      if (error) failedNames.push(client.namaClient);
      else deletedIds.add(client.id);
    }

    setItems(prev => prev.filter(r => !deletedIds.has(r.id)));
    setSelectedRows(prev => {
      const next = new Set(prev);
      for (const id of deletedIds) next.delete(id);
      return next;
    });
    setDeleting(false);
    setDeleteDialogOpen(false);
    setDeleteTargets([]);
    setDeleteUsage([]);

    if (failedNames.length > 0) {
      setMessage(`⚠️ ${deletedIds.size} client dihapus; gagal menghapus: ${failedNames.join(', ')}.`);
    } else {
      setMessage(`✅ ${deletedIds.size} client berhasil dihapus!`);
    }
    setTimeout(() => setMessage(null), 4000);
  };

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Register Client...</p>
      </main>
    );
  }

  const setField = (k: keyof ClientForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const totalActiveWorkOrders = deleteUsage.reduce((sum, usage) => sum + usage.activeWorkOrders, 0);
  const totalInvoices = deleteUsage.reduce((sum, usage) => sum + usage.invoices, 0);

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="px-8 pt-4 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Register Client</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={refresh} className="h-8 px-3.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200 transition-all flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={openCreate} className="h-8 px-3.5 text-[12px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-md hover:shadow-blue-200 transition-all flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" /> Tambah Client
            </button>
          </div>
        </div>
        {message && <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-[12px] text-blue-700">{message}</div>}
      </div>

      <div className="flex-1 px-8 pt-5 pb-6 overflow-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" placeholder="Cari client..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
          </div>
          <FilterButton fields={CLIENT_FIELDS} value={filters} onChange={setFilters} />
          <SortButton fields={CLIENT_FIELDS} value={sorts} onChange={setSorts} />
          <ColumnSettingsButton fields={CLIENT_FIELDS} hidden={hiddenCols} onToggle={toggleCol} />
          <ExportButton onClick={handleExport} />
          {selectedRows.size > 0 && (
            <button onClick={prepareBulkDelete} disabled={checkingUsage} className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-60 disabled:cursor-wait transition-colors">
              <Trash2 className="w-3 h-3" /> {checkingUsage ? 'Memeriksa...' : `Delete (${selectedRows.size})`}
            </button>
          )}
          <span className="text-[11px] text-slate-400 ml-auto">{rows.length} client</span>
        </div>

        <div className={T_WRAP}>
          <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
            <HiddenColgroup hidden={hiddenCols} cols={['__sel', 'namaClient', 'kodeClient', 'status']} />
            <thead><tr className={T_HEAD_ROW}>
              <th className={cn(T_TH, 'w-12 text-center')}><input type="checkbox" checked={selectedRows.size === rows.length && rows.length > 0} onChange={handleToggleAll} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></th>
              <th className={cn(T_TH, 'text-left')}>Nama Client</th>
              <th className={cn(T_TH, 'text-left')}>Kode Client</th>
              <th className={cn(T_TH, 'text-left')}>Status</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-[13px] text-gray-400">{filtered.length === 0 ? 'Belum ada client terdaftar' : 'Tidak ada hasil yang cocok dengan filter'}</td></tr>}
              {rows.map((item, i) => {
                const selected = selectedRows.has(item.id);
                return (
                  <tr key={item.id} className={cn(rowClass(i, selected), 'cursor-pointer')} onClick={() => openEdit(item)} title="Klik untuk edit">
                    <td className={cn(T_TD, 'text-center')} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => handleToggleRow(item.id)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></td>
                    <td className={cn(T_TD, 'text-gray-700')}>{item.namaClient}</td>
                    <td className={cn(T_TD, 'text-gray-700')}>{item.kodeClient}</td>
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

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleting) return;
          setDeleteDialogOpen(open);
          if (!open) {
            setDeleteTargets([]);
            setDeleteUsage([]);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                totalActiveWorkOrders > 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600',
              )}>
                <TriangleAlert className="h-5 w-5" />
              </div>
              <div>
                <AlertDialogTitle>Hapus {deleteTargets.length} client?</AlertDialogTitle>
                <AlertDialogDescription className="mt-1">
                  Periksa dampak penghapusan berikut sebelum melanjutkan.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Client</th>
                  <th className="px-3 py-2 text-right font-medium">WO Belum Invoice</th>
                  <th className="px-3 py-2 text-right font-medium">Invoice Lama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deleteUsage.map((usage) => (
                  <tr key={usage.namaClient}>
                    <td className="px-3 py-2 text-slate-700">{usage.namaClient}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', usage.activeWorkOrders > 0 ? 'font-semibold text-red-600' : 'text-slate-500')}>
                      {usage.activeWorkOrders}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{usage.invoices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalActiveWorkOrders > 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] leading-relaxed text-red-700">
              <strong>{totalActiveWorkOrders} Work Order belum memiliki invoice.</strong> Setelah client dihapus, pembuatan invoice untuk WO tersebut akan terblokir sampai client dengan nama yang sama didaftarkan kembali.
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
              Tidak ada Work Order yang masih membutuhkan client ini untuk pembuatan invoice.
            </div>
          )}

          {totalInvoices > 0 && (
            <p className="text-[11px] leading-relaxed text-slate-500">
              {totalInvoices} invoice lama tetap aman karena Nama Client dan Kode Client tersimpan sebagai snapshot pada masing-masing invoice.
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmBulkDelete();
              }}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
            >
              {deleting ? 'Menghapus...' : 'Tetap Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[86vh] flex flex-col overflow-hidden border border-gray-100" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-[14px] font-semibold text-slate-800">{editTarget ? 'Edit Client' : 'Tambah Client Baru'}</h2>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nama Client *</label>
                <input type="text" value={form.namaClient} onChange={(e) => setField('namaClient', e.target.value)} placeholder="e.g. Livou" className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Kode Client *</label>
                <input type="text" value={form.kodeClient} onChange={(e) => setField('kodeClient', e.target.value)} placeholder="e.g. LVU" maxLength={10} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 uppercase" />
                <p className="text-[10px] text-slate-400 mt-1.5">Huruf/angka saja, otomatis huruf besar. Dipakai pada kode invoice (INV/MP/LVU/…).</p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</label>
                <select value={form.status} onChange={(e) => setField('status', e.target.value)} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none bg-white focus:border-blue-300">
                  <option value="Aktif">Aktif</option>
                  <option value="Non-Aktif">Non-Aktif</option>
                </select>
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

export default RegisterClientPage;
