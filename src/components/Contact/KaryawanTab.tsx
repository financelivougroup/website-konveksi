import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PermanentDeleteDialog } from '@/components/Modals/PermanentDeleteDialog';
import { useAuth } from '@/contexts/AuthContext';
import { canPermanentlyDelete } from '@/lib/permissions';
import type { PermanentDeleteResult } from '@/types/permanentDeletion';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { T_WRAP, softBadgeClass} from '@/lib/tableStyles';
import { DataTable } from '@/components/Table/DataTable';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton } from '@/components/Table/ColumnSettings';
import { DatePickerField } from '@/components/DatePickerField';
import { formatDate } from '@/data/pipelineData';
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import {
  fetchAll as fetchAllKaryawan,
  create as createKaryawan,
  update as updateKaryawan,
  POSISI_OPTIONS,
  STATUS_OPTIONS,
  type RegisterPenjahitRow,
} from '@/services/registerPenjahit';

// Badge status soft (lihat `softBadgeClass` di '@/lib/tableStyles'). Nilai
// disimpan sebagai nama warna, bukan kelas penuh, supaya tidak ada kelas
// setengah jadi yang tertinggal saat polanya berubah.
const STATUS_BADGE: Record<string, string> = {
  'Aktif': 'emerald',
  'Non-Aktif': 'slate',
};

const POSISI_BADGE: Record<string, string> = {
  'Leader': 'blue',
  'Penjahit': 'amber',
  'Finishing': 'violet',
};

interface KaryawanForm {
  picPenjahit: string;
  posisi: string;
  status: string;
  tanggalMulaiBekerja: string;
}

const EMPTY_FORM: KaryawanForm = { picPenjahit: '', posisi: '', status: 'Aktif', tanggalMulaiBekerja: '' };

/** Sel kosong untuk nilai tanggal yang belum diisi (pola `ExpensePage.tsx`). */
const EMPTY_CELL = <span className="text-gray-300">—</span>;

/**
 * Tab Karyawan di halaman Contact.
 *
 * Isinya dipindah apa adanya dari halaman `RegisterKaryawanPage` — hanya
 * `<main>` dan `<h1>` yang naik ke shell `ContactPage`, karena dua-duanya milik
 * halaman, bukan milik satu tab.
 *
 * State, pemuatan data, dan dialognya **tetap di sini** (bukan diangkat ke
 * shell) supaya tombol Refresh dan Tambah tiap tab mengurus datanya sendiri,
 * dan berpindah tab tidak memuat ulang data tab lain.
 *
 * Kunci `useColumnSettings` sengaja TIDAK diubah: menggantinya akan membuat
 * pengaturan kolom yang sudah dibuat user kembali ke awal.
 */
export function KaryawanTab() {
  const { profile } = useAuth();
  const canDelete = canPermanentlyDelete(profile.role);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<readonly string[]>([]);
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

  useEffect(() => {
    let cancelled = false;

    void fetchAllKaryawan().then(({ data }) => {
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

  const openEdit = useCallback((item: RegisterPenjahitRow) => {
    setEditTarget(item);
    setForm({
      picPenjahit: item.picPenjahit,
      posisi: item.posisi ?? '',
      status: item.status ?? 'Aktif',
      // Karyawan lama belum punya tanggal: form terbuka dengan picker kosong,
      // dan tombol Simpan tetap nonaktif sampai tanggalnya dipilih.
      tanggalMulaiBekerja: item.tanggalMulaiBekerja ?? '',
    });
    setModalOpen(true);
  }, []);

  const isValid = form.picPenjahit.trim() && form.posisi && form.tanggalMulaiBekerja;

  async function handleSave() {
    if (!isValid) {
      setMessage('❌ Lengkapi Nama Karyawan, Posisi, dan Tanggal Mulai Bekerja.');
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    setSaving(true);
    const payload = {
      picPenjahit: form.picPenjahit.trim(),
      posisi: form.posisi,
      status: form.status,
      tanggalMulaiBekerja: form.tanggalMulaiBekerja,
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
    { key: 'tanggalMulaiBekerja', label: 'Tanggal Mulai Bekerja' },
    { key: 'status', label: 'Status' },
  ];
  const rows = useMemo(() => applySorts(applyFilters(filtered.map((r) => ({ ...r } as unknown as Record<string, unknown>)), filters), sorts) as unknown as RegisterPenjahitRow[], [filtered, filters, sorts]);

  // Bentuk kolom untuk DataGrid (variant "plain"). Sel yang butuh badge
  // memakai `render` supaya tabel bersama tidak perlu tahu soal tone status.
  const karyawanColumns = useMemo(() => [
    { key: 'picPenjahit', label: 'Nama Karyawan', width: '200px' },
    {
      key: 'posisi', label: 'Posisi', width: '130px',
      render: (row: Record<string, unknown>) => {
        const posisi = row.posisi as string | null;
        return posisi ? <span className={softBadgeClass(POSISI_BADGE[posisi])}>{posisi}</span> : EMPTY_CELL;
      },
    },
    {
      key: 'tanggalMulaiBekerja', label: 'Tanggal Mulai Bekerja', width: '180px',
      render: (row: Record<string, unknown>) => {
        const tanggal = row.tanggalMulaiBekerja as string | null;
        return tanggal ? formatDate(tanggal) : EMPTY_CELL;
      },
    },
    {
      key: 'status', label: 'Status', width: '110px',
      render: (row: Record<string, unknown>) => (
        <span className={softBadgeClass(STATUS_BADGE[row.status as string])}>{String(row.status)}</span>
      ),
    },
  ], []);

  // Pengaturan kolom (tampil/sembunyi + freeze) dipanggil di sini, bukan di blok
  // state di atas, karena butuh urutan kolom yang baru lengkap setelah
  // `karyawanColumns` selesai disusun. Tidak ada `return` lebih awal di
  // antaranya, jadi urutan hook tetap stabil.
  const columnKeys = useMemo(() => karyawanColumns.map((c) => c.key), [karyawanColumns]);
  const {
    hidden: hiddenCols, toggle: toggleCol,
    frozen: frozenCols, toggleFreeze: toggleFreezeCol, toggleFreezeAll: toggleFreezeAllCols,
    headerFrozen, setHeaderFrozen,
  } = useColumnSettings('register-karyawan', columnKeys);

  // Multi-select + toolbar (same pattern as Production Monitoring RAW DATA).
  // "Select all" is owned by the grid now — it toggles every visible row and
  // replays the difference through `handleToggleRow`.
  const handleToggleRow = (id: number) => setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleImport = () => { if (selectedRows.size === 0) { alert('Pilih minimal 1!'); return; } alert(`✅ ${selectedRows.size} karyawan di-import`); setSelectedRows(new Set()); };
  const handleExport = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Nama Karyawan', 'Posisi', 'Tanggal Mulai Bekerja', 'Status'];
    const lines = filtered.map((r) => [r.picPenjahit, r.posisi ?? '', r.tanggalMulaiBekerja, r.status].map(esc).join(','));
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n'); // BOM for Excel UTF-8
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `register-karyawan-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleBulkDelete = () => {
    if (!canDelete || selectedRows.size === 0) return;
    setDeleteIds(items.filter((item) => selectedRows.has(item.id)).map((item) => String(item.id)));
    setDeleteDialogOpen(true);
  };
  const handleDeleted = async (result: PermanentDeleteResult) => {
    if (editTarget && result.deletedIds.includes(String(editTarget.id))) {
      setEditTarget(null);
      setModalOpen(false);
    }
    setSelectedRows(new Set());
    setDeleteDialogOpen(false);
    await refresh();
    setMessage(`${result.deletedIds.length} karyawan dihapus permanen.${result.cleanupPending > 0 || result.cleanupError ? ' Pembersihan media masih tertunda; periksa status pembersihan.' : ''}`);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Karyawan...</p>
      </div>
    );
  }

  const setField = (k: keyof KaryawanForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <div className="px-6 pt-3 pb-0">
        <div className="flex items-center justify-end gap-2.5 mb-4">
          <button onClick={refresh} className="h-8 px-3.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200 transition-all flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={openCreate} className="h-8 px-3.5 text-[12px] font-medium bg-primary text-white rounded-lg hover:bg-primary/90 hover:shadow-md hover:shadow-slate-300 transition-all flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" /> Tambah Karyawan
          </button>
        </div>
        {message && <div className="mb-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[12px] text-blue-700">{message}</div>}
      </div>

      <div className="flex-1 px-6 pt-2 pb-5 overflow-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" placeholder="Cari nama karyawan..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
          </div>
          <FilterButton fields={KARYAWAN_FIELDS} value={filters} onChange={setFilters} />
          <SortButton fields={KARYAWAN_FIELDS} value={sorts} onChange={setSorts} />
          <ColumnSettingsButton fields={KARYAWAN_FIELDS} hidden={hiddenCols} onToggle={toggleCol} frozen={frozenCols} onToggleFreeze={toggleFreezeCol} onToggleFreezeAll={toggleFreezeAllCols} headerFrozen={headerFrozen} onToggleHeaderFrozen={setHeaderFrozen} />
          <ExportButton onClick={handleExport} />
          <button onClick={handleImport} className={cn('h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium transition-colors', selectedRows.size > 0 ? 'bg-primary text-white hover:bg-primary/90' : 'border border-gray-200 text-slate-400')}>📥 Import ({selectedRows.size})</button>
          {canDelete && selectedRows.size > 0 && (
            <Button onClick={handleBulkDelete} variant="destructive" size="sm">
              <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
            </Button>
          )}
          <span className="text-[11px] text-slate-400 ml-auto">{rows.length} karyawan</span>
        </div>

        <div className={T_WRAP}>
          <DataTable
            variant="plain"
            columns={karyawanColumns}
            data={rows as unknown as Record<string, unknown>[]}
            selectedRows={selectedRows}
            onToggleRow={handleToggleRow}
            onRowClick={(row) => openEdit(row as unknown as RegisterPenjahitRow)}
            hiddenColumns={hiddenCols}
            frozenColumns={frozenCols}
            headerFrozen={headerFrozen}
            emptyMessage={
              <div className="py-10 text-center text-[13px] text-gray-400">
                {filtered.length === 0 ? 'Belum ada karyawan terdaftar' : 'Tidak ada hasil yang cocok dengan filter'}
              </div>
            }
          />
        </div>
      </div>

      {canDelete && (
        <PermanentDeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}
          module="register_penjahit" ids={deleteIds} onDeleted={handleDeleted} />
      )}

      {/* Popup tambah/edit karyawan. `key` me-remount tiap dialog dibuka,
          jadi formnya selalu terisi dari awal (kosong atau dari baris yang
          diedit) tanpa perlu efek. */}
      <Dialog
        key={String(modalOpen)}
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-[14px]">
              {editTarget ? 'Edit Karyawan' : 'Tambah Karyawan Baru'}
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Karyawan aktif bisa dipilih di Planning Produksi, Target Jahit, dan
              modul produksi lainnya.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="karyawan-nama" className="text-[12px]">
                Nama karyawan <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="karyawan-nama"
                value={form.picPenjahit}
                onChange={(event) => setField('picPenjahit', event.target.value)}
                placeholder="e.g. Budi Santoso"
                className="h-9 text-[13px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="karyawan-posisi" className="text-[12px]">
                Posisi <span className="text-rose-600">*</span>
              </Label>
              <Select value={form.posisi} onValueChange={(value) => setField('posisi', value)}>
                <SelectTrigger id="karyawan-posisi" className="h-9 text-[13px]">
                  <SelectValue placeholder="— Pilih Posisi —" />
                </SelectTrigger>
                <SelectContent>
                  {POSISI_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option} className="text-[13px]">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="karyawan-tanggal-mulai" className="text-[12px]">
                Tanggal mulai bekerja <span className="text-rose-600">*</span>
              </Label>
              {/* Tanpa `maxDate`: tanggal masa depan boleh dipilih, sesuai
                  keputusan pemilik produk untuk tanggal mulai kerja. */}
              <DatePickerField
                id="karyawan-tanggal-mulai"
                value={form.tanggalMulaiBekerja}
                onChange={(value) => setField('tanggalMulaiBekerja', value)}
                placeholder="— Pilih Tanggal —"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="karyawan-status" className="text-[12px]">Status</Label>
              <Select value={form.status} onValueChange={(value) => setField('status', value)}>
                <SelectTrigger id="karyawan-status" className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option} className="text-[13px]">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400">
                Karyawan Non-Aktif tidak muncul di dropdown Planning Produksi,
                tapi riwayatnya tetap tersimpan.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-8 text-[12px]"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="h-8 text-[12px]"
              onClick={() => void handleSave()}
              disabled={!isValid || saving}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
