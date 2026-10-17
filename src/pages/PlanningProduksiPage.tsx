import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, RefreshCw, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMonthYearFromYm } from '@/lib/monthYear';
import { T_WRAP, T_TOOLBAR_BTN, T_TOOLBAR_BTN_IDLE, T_SOFT_BADGE_TONE } from '@/lib/tableStyles';
import { DataTable } from '@/components/Table/DataTable';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton } from '@/components/Table/ColumnSettings';
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import {
  list as listPlanning,
  create as createPlanning,
  update as updatePlanning,
  type PlanningProduksiRow,
} from '@/services/planningProduksi';
import { fetchAll as fetchAllPenjahit, activePenjahitNames, type RegisterPenjahitRow } from '@/services/registerPenjahit';
import { generateTargetsFromPlanning } from '@/services/staffDebt';
import { AppSelect } from '@/components/AppSelect';
import {
  clientCodeChoices,
  konveksiCodeFor,
  sizeChoicesFor,
  warnaChoicesFor,
  type ClientVariant,
  type ComplainProductionOption,
} from '@/lib/complainCascade';
import { fetchProductionCodeData } from '@/lib/complainHelper';
import { Button } from '@/components/ui/button';
import { PermanentDeleteDialog } from '@/components/Modals/PermanentDeleteDialog';
import { useAuth } from '@/contexts/AuthContext';
import { canPermanentlyDelete } from '@/lib/permissions';
import type { PermanentDeleteResult } from '@/types/permanentDeletion';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

// Status planning: draft (baru) → approved (boleh di-generate ke target jahit)
// atau rejected.
//
// Warna memakai `T_SOFT_BADGE_TONE` (lihat '@/lib/tableStyles') agar seragam
// dengan badge status soft di tabel lain — hijau = approved, merah = rejected,
// abu = draft. `border` ditulis terpisah karena SelectTrigger dasarnya
// `border-0`; tanpa itu badge-nya kehilangan garis tepi tipis yang jadi ciri
// gaya soft. Ukuran/padding tetap milik SelectTrigger (h-7 px-2 text-xs),
// bukan milik badge tabel, karena elemen ini harus setinggi kontrol lain.
const PLAN_STATUS_BADGE: Record<string, string> = {
  approved: `border ${T_SOFT_BADGE_TONE.emerald}`,
  rejected: `border ${T_SOFT_BADGE_TONE.rose}`,
};
const PLAN_STATUS_BADGE_FALLBACK = `border ${T_SOFT_BADGE_TONE.slate}`;

interface PlanningForm {
  namaPenjahit: string;
  /** Kode Produksi Client — dipilih user, sumber kebenarannya. */
  clientCode: string;
  /** Kode Produksi Konveksi — diturunkan dari `clientCode`, tidak diketik user. */
  productionCode: string;
  product: string;
  warna: string;
  size: string;
  qty: string;
  bulanTarget: string;
}

const EMPTY_FORM: PlanningForm = {
  namaPenjahit: '',
  clientCode: '',
  productionCode: '',
  product: '',
  warna: '',
  size: '',
  qty: '',
  bulanTarget: currentMonth(),
};

export function PlanningProduksiPage() {
  const { profile } = useAuth();
  const canDelete = canPermanentlyDelete(profile.role);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<readonly string[]>([]);
  const [items, setItems] = useState<PlanningProduksiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PlanningProduksiRow | null>(null);
  const [form, setForm] = useState<PlanningForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Penjahit options for the Nama Penjahit select.
  const [penjahitList, setPenjahitList] = useState<RegisterPenjahitRow[]>([]);

  // Opsi Kode Produksi Client + varian warna/size-nya, dibentuk dari work order.
  // Dimuat saat dialog dibuka (pola yang sama dengan `loadPenjahit`), bukan saat
  // halaman dimuat — supaya daftarnya selalu mengikuti produksi terbaru.
  const [codeOptions, setCodeOptions] = useState<ComplainProductionOption[]>([]);
  const [codeVariants, setCodeVariants] = useState<ClientVariant[]>([]);

  // Generate Target controls. Bulan target tidak lagi dipilih di toolbar: tiap
  // baris planning membawa `bulanTarget`-nya sendiri, jadi generate mengikuti
  // baris yang dicentang. Lihat `handleGenerate`.
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
    // Hanya karyawan Aktif berposisi Penjahit yang boleh dipilih. Aturannya ada
    // di `activePenjahitNames` (`src/lib/karyawan.ts`) supaya Entry Jahitan tidak
    // bisa menyimpang lagi seperti dulu (di sana daftarnya masih hardcoded).
    // Baris planning lama milik karyawan yang kini Non-Aktif tetap ada di tabel.
    const names = activePenjahitNames(data ?? []);
    setPenjahitList(
      (data ?? []).filter((p) => names.includes(p.picPenjahit)),
    );
  }, []);

  /**
   * Ambil pasangan kode produksi (konveksi + client) **beserta varian warna/size**
   * dari work order — satu query untuk keduanya.
   *
   * Dipanggil saat dialog dibuka supaya daftarnya selalu mengikuti produksi
   * terbaru — pola yang sama dengan `loadPenjahit`. Yang disimpan adalah daftar
   * mentahnya, bukan hasil turunan: pemulihan kode konveksi saat Edit memakai
   * `konveksiCodeFor` yang mencari di daftar ini, sedangkan bentuk pilihan
   * dropdown-nya disusun terpisah di `codeChoiceOptions` / `warnaChoiceOptions` /
   * `sizeChoiceOptions`.
   */
  const loadCodeOptions = useCallback(async () => {
    const { options, variants } = await fetchProductionCodeData();
    setCodeOptions(options);
    setCodeVariants(variants);
  }, []);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    loadPenjahit();
    loadCodeOptions();
    setModalOpen(true);
  }, [loadPenjahit, loadCodeOptions]);

  const openEdit = useCallback((item: PlanningProduksiRow) => {
    setEditTarget(item);
    setForm({
      namaPenjahit: item.namaPenjahit,
      clientCode: item.clientProductionCode ?? '',
      productionCode: item.productNote ?? '',
      product: item.product,
      warna: item.warna ?? '',
      size: item.size ?? '',
      qty: String(item.qty),
      bulanTarget: item.bulanTarget,
    });
    loadPenjahit();
    loadCodeOptions();
    setModalOpen(true);
  }, [loadPenjahit, loadCodeOptions]);

  // `productionCode` ikut wajib: baris planning tanpa kode konveksi akan
  // ditagih 0 rupiah oleh `generateTargetsFromPlanning` tanpa error apa pun
  // (lihat catatan di `src/services/staffDebt.ts`). Lebih baik dicegah di sini.
  const isValid = Boolean(
    form.namaPenjahit && form.clientCode && form.productionCode.trim() && form.product && form.qty && form.bulanTarget,
  );

  async function handleSave() {
    if (!isValid) {
      setMessage('❌ Lengkapi Nama Penjahit, Kode Produksi Client, Produk, Qty, dan Bulan Target.');
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    setSaving(true);
    // 'status' is not user-editable (brief field list excludes it). Its only
    // documented value is 'draft' (DB default). Send it only on create to
    // satisfy the service input; omit it on update so it stays as stored.
    const payload = {
      namaPenjahit: form.namaPenjahit,
      // Kedua kode tersimpan berdampingan: `product_note` tetap kode konveksi
      // karena ia kunci pencarian harga, `client_production_code` kode client.
      productNote: form.productionCode.trim(),
      clientProductionCode: form.clientCode,
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

  // `previousStatus` datang dari baris yang diklik (selnya sudah memegang baris
  // itu), jadi rollback-nya tidak perlu membaca `items` sama sekali. Itu yang
  // membuat identitas fungsi ini stabil — dan karena stabil, useMemo kolom di
  // bawah tidak dibuat ulang setiap render. Rollback-nya juga jadi presisi:
  // hanya baris itu yang dikembalikan, bukan snapshot seluruh tabel.
  const handleStatusChange = useCallback(async (id: number, status: string, previousStatus: string) => {
    // Optimistic: badge berubah di layar saat itu juga.
    setItems(p => p.map(r => (r.id === id ? { ...r, status } : r)));
    const { error } = await updatePlanning(id, { status });
    if (error) {
      setItems(p => p.map(r => (r.id === id ? { ...r, status: previousStatus } : r)));
      setMessage(`❌ Error: ${error.message}`);
      setTimeout(() => setMessage(null), 3000);
    }
  }, []);

  // Bulk status: apply ke semua baris terpilih sekaligus, lalu sinkron state lokal.
  const handleBulkStatus = useCallback(async (status: string) => {
    const ids = [...selectedRows];
    for (const id of ids) {
      const { error } = await updatePlanning(Number(id), { status });
      if (error) {
        setMessage(`❌ Error: ${error.message}`);
        setTimeout(() => setMessage(null), 3000);
        return;
      }
    }
    setItems(prev => prev.map(r => (selectedRows.has(r.id) ? { ...r, status } : r)));
    setSelectedRows(new Set());
    setMessage(`✅ ${ids.length} planning di-update ke "${status}"`);
    setTimeout(() => setMessage(null), 3000);
  }, [selectedRows]);

  // Generate Target handler — hanya baris yang DICENTANG yang diproses.
  //
  // Bulan target diambil dari tiap baris planning (`bulanTarget`), bukan dari satu
  // input bulan, jadi mencentang baris dari dua bulan sekaligus tetap benar.
  // Kalau penjahit sudah punya target di bulan itu, JUMLAHNYA yang ditambah —
  // baris target baru tidak dibuat (lihat `generateTargetsFromPlanning`).
  const handleGenerate = useCallback(async () => {
    const ids = [...selectedRows];
    if (ids.length === 0) return;
    setGenerating(true);
    // Pesan yang memuat daftar nama gaji yang belum diinput ditahan lebih lama:
    // user perlu waktu membacanya dan berpindah ke halaman Expense, sedangkan
    // 4 detik cukup untuk pesan ringkas biasa.
    let holdMs = 4000;
    try {
      const result = await generateTargetsFromPlanning(ids);
      if (result.error) {
        setMessage(`❌ ${result.error.message}`);
      } else {
        const bagian: string[] = [];
        if (result.merged > 0) bagian.push(`${result.merged} target ditambahkan qty-nya`);
        if (result.created > 0) bagian.push(`${result.created} target baru dibuat`);
        const catatan: string[] = [];
        if (result.skippedNotApproved > 0) catatan.push(`${result.skippedNotApproved} belum approved`);
        if (result.skippedIncomplete > 0) catatan.push(`${result.skippedIncomplete} data belum lengkap`);

        // Gaji yang belum diinput disebutkan dengan NAMA dan BULANnya, bukan
        // sekadar jumlahnya — user perlu tahu siapa yang harus diisi gajinya
        // dulu sebelum bisa digenerate.
        const gajiKurang = result.missingSalary.length > 0
          ? ` Gaji belum diinput: ${result.missingSalary
            .map((m) => `${m.nama} (${m.bulan})`)
            .join(', ')} — isi di Expense (MANPOWER › SALARY) lalu generate lagi.`
          : '';

        if (bagian.length > 0) {
          setMessage(
            `✅ ${bagian.join(', ')} dari ${ids.length} planning terpilih.` +
              (catatan.length > 0 ? ` Dilewati: ${catatan.join(', ')}.` : '') +
              (gajiKurang ? `⚠️${gajiKurang}` : ''),
          );
        } else if (gajiKurang) {
          // Tidak ada yang berhasil DAN penyebabnya gaji: sampaikan alasannya,
          // bukan "tidak ada planning yang bisa digenerate" yang menyesatkan.
          setMessage(`⚠️ Tidak ada yang digenerate.${gajiKurang}`);
        } else if (result.skippedNotApproved > 0) {
          setMessage(`⚠️ ${result.skippedNotApproved} planning terpilih belum berstatus approved — ubah statusnya dulu.`);
        } else {
          setMessage('⚠️ Tidak ada planning yang bisa digenerate dari pilihan ini.');
        }
        if (result.missingSalary.length > 0) holdMs = 15000;
      }
      // Pilihan dikosongkan setelah berhasil, mengikuti pola `handleBulkStatus`.
      // Karena generate MENAMBAH qty, centang yang tertinggal lalu terklik lagi
      // akan menambah dua kali tanpa disadari.
      if (result.created > 0 || result.merged > 0) setSelectedRows(new Set());
    } catch (e: unknown) {
      setMessage(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
      setTimeout(() => setMessage(null), holdMs);
    }
  }, [selectedRows]);

  const PLAN_FIELDS: FieldOption[] = [
    { key: 'namaPenjahit', label: 'Nama Penjahit' },
    { key: 'productNote', label: 'Kode Produksi Konveksi' },
    { key: 'clientProductionCode', label: 'Kode Produksi Client' },
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
      return r.namaPenjahit.toLowerCase().includes(q) || r.productNote?.toLowerCase().includes(q) || r.clientProductionCode?.toLowerCase().includes(q) || r.product.toLowerCase().includes(q) || r.warna?.toLowerCase().includes(q) || r.size?.toLowerCase().includes(q);
    }
    return true;
  });
  const rows = useMemo(() => applySorts(applyFilters(filtered.map((r) => ({ ...r } as unknown as Record<string, unknown>)), filters), sorts) as unknown as PlanningProduksiRow[], [filtered, filters, sorts]);

  // Bentuk kolom untuk DataTable (variant "plain"). Sel yang butuh badge,
  // format bulan, atau editor status memakai `render` supaya tabel bersama
  // tidak perlu tahu soal status planning.
  const planningColumns = useMemo(() => [
    { key: 'namaPenjahit', label: 'Nama Penjahit', width: '180px' },
    {
      // Key tetap `productNote` (kolom DB-nya `product_note`); yang berubah
      // hanya labelnya, karena isinya memang Kode Produksi Konveksi.
      key: 'productNote', label: 'Kode Produksi Konveksi', width: '190px',
      render: (row: Record<string, unknown>) => {
        const code = row.productNote as string | null;
        return code
          ? <span className="font-mono" title={code}>{code}</span>
          : <span className="text-gray-300">—</span>;
      },
    },
    {
      key: 'clientProductionCode', label: 'Kode Produksi Client', width: '190px',
      render: (row: Record<string, unknown>) => {
        const code = row.clientProductionCode as string | null;
        return code
          ? <span className="font-mono" title={code}>{code}</span>
          : <span className="text-gray-300">—</span>;
      },
    },
    { key: 'product', label: 'Product', width: '150px' },
    {
      key: 'warna', label: 'Warna', width: '120px',
      render: (row: Record<string, unknown>) => (row.warna as string) || <span className="text-gray-300">—</span>,
    },
    {
      key: 'size', label: 'Size', width: '100px',
      render: (row: Record<string, unknown>) => (row.size as string) || <span className="text-gray-300">—</span>,
    },
    {
      key: 'qty', label: 'Qty', align: 'right' as const, width: '90px',
      render: (row: Record<string, unknown>) => <span className="tabular-nums">{String(row.qty)}</span>,
    },
    {
      key: 'bulanTarget', label: 'Bulan Target', width: '130px',
      render: (row: Record<string, unknown>) => formatMonthYearFromYm(row.bulanTarget as string),
    },
    {
      key: 'status', label: 'Status', align: 'center' as const, width: '140px',
      // Status diubah cepat dari tabel: dropdown dibungkus badge berwarna
      // supaya tetap terbaca sebagai status, bukan sekadar kolom isian.
      // stopPropagation menjaga klik dropdown tidak ikut membuka dialog edit.
      render: (row: Record<string, unknown>) => {
        const current = (row.status as string) || 'draft';
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Select value={current} onValueChange={(v) => void handleStatusChange(row.id as number, v, current)}>
              <SelectTrigger
                aria-label={`Status planning ${String(row.namaPenjahit)}`}
                className={cn(
                  // `h-[19px]`, bukan `h-7`: tinggi baris tabel ditentukan isi sel
                  // tertinggi, dan dropdown 28px mendorong barisnya ke 40px —
                  // sedangkan tabel acuan (Register Harga) 31.5px. 19px + padding
                  // sel 12px = 31.5px, sama persis.
                  'h-[19px] w-auto gap-1 rounded-md border-0 px-2 text-xs font-semibold shadow-none focus:ring-1 focus:ring-slate-300 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-70',
                  PLAN_STATUS_BADGE[current] ?? PLAN_STATUS_BADGE_FALLBACK,
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft" className="text-xs">draft</SelectItem>
                <SelectItem value="approved" className="text-xs">approved</SelectItem>
                <SelectItem value="rejected" className="text-xs">rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      },
    },
  ], [handleStatusChange]);

  // Hide/show kolom + freeze (persist per tabel). Dipanggil setelah
  // `planningColumns` ada: urutan kolom itu yang dipakai hook untuk merapikan
  // daftar beku menjadi awalan yang rapat — mesin pinning mengangkat kolom yang
  // di-pin ke depan mengikuti urutan tersebut, jadi daftar yang berlubang akan
  // mengubah urutan kolom di layar. Tidak ada `return` lebih awal di antara
  // keduanya, jadi urutan hook-nya tetap sama di setiap render.
  const planningColumnKeys = useMemo(() => planningColumns.map((c) => c.key), [planningColumns]);
  const { hidden: hiddenCols, toggle: toggleCol, frozen: frozenCols, toggleFreeze: toggleFreezeCol, toggleFreezeAll: toggleFreezeAllCols, headerFrozen, setHeaderFrozen } = useColumnSettings('planning-produksi', planningColumnKeys);

  // Multi-select (same pattern as Production Monitoring RAW DATA).
  // "Select all" is owned by the grid now — it toggles every visible row and
  // replays the difference through `handleToggleRow`.
  const handleToggleRow = (id: number) => setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleImport = () => { if (selectedRows.size === 0) { alert('Pilih minimal 1!'); return; } alert(`✅ ${selectedRows.size} planning di-import`); setSelectedRows(new Set()); };
  const handleExport = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Nama Penjahit', 'Kode Produksi Konveksi', 'Kode Produksi Client', 'Product', 'Warna', 'Size', 'Qty', 'Bulan Target', 'Status'];
    const lines = filtered.map((r) => [r.namaPenjahit, r.productNote ?? '', r.clientProductionCode ?? '', r.product, r.warna ?? '', r.size ?? '', r.qty, r.bulanTarget, r.status].map(esc).join(','));
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n'); // BOM for Excel UTF-8
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `planning-produksi-${new Date().toISOString().slice(0, 10)}.csv`;
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
    setMessage(`${result.deletedIds.length} planning dihapus permanen.${result.cleanupPending > 0 || result.cleanupError ? ' Pembersihan media masih tertunda; periksa status pembersihan.' : ''}`);
  };

  const codeChoiceOptions = useMemo(
    () => clientCodeChoices(codeOptions).map((c) => ({ value: c.value, label: c.label })),
    [codeOptions],
  );

  // Warna & Size mengikuti Kode Produksi Client, bukan diketik manual. Keduanya
  // diturunkan dari varian work order milik kode itu; Size menyempit lagi setelah
  // Warna dipilih (pada data live ada kode yang tiap warnanya beda size).
  // `toOptions` tidak dipakai karena di sini butuh daftar string untuk dihitung
  // jumlahnya juga (auto-pilih saat hanya ada satu).
  const warnaChoiceOptions = useMemo(
    () => warnaChoicesFor(codeVariants, form.clientCode),
    [codeVariants, form.clientCode],
  );

  const sizeChoiceOptions = useMemo(
    () => sizeChoicesFor(codeVariants, form.clientCode, form.warna),
    [codeVariants, form.clientCode, form.warna],
  );

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Planning Produksi...</p>
      </main>
    );
  }

  const setField = (k: keyof PlanningForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  /**
   * Pilih Kode Produksi Client -> Kode Produksi Konveksi ikut terisi, dan
   * Warna/Size berganti daftar.
   *
   * Pasangannya diturunkan lewat `konveksiCodeFor` (relasi 1:1, diverifikasi
   * lewat Supabase MCP), **bukan** disimpan di state pilihan: menyimpan kedua
   * kode di daftar opsi berarti dua sumber kebenaran yang bisa berbeda —
   * alasan yang sama dengan ComplainPenaltiPage.
   *
   * Warna dan Size **dikosongkan**, bukan dipertahankan: keduanya milik kode
   * lama, dan membiarkannya terisi menghasilkan kombinasi yang tidak ada di work
   * order mana pun — persis yang ingin dicegah dengan menjadikannya dropdown.
   * Auto-pilih dipakai bila kode itu hanya punya satu warna/size, supaya user
   * tidak perlu mengklik dropdown yang isinya satu.
   *
   * Product ikut terisi bila masih kosong, karena satu kode client memang
   * menunjuk satu produk. Yang sudah diketik user tidak ditimpa.
   */
  const selectClientCode = (code: string) => {
    if (form.clientCode === code) return;
    const konveksi = konveksiCodeFor(codeOptions, code) ?? '';
    const produk = codeOptions.find((o) => o.clientCode === code)?.product ?? '';
    const warnas = warnaChoicesFor(codeVariants, code);
    const warnaBaru = warnas.length === 1 ? warnas[0] : '';
    const sizes = sizeChoicesFor(codeVariants, code, warnaBaru);
    setForm((f) => ({
      ...f,
      clientCode: code,
      productionCode: konveksi,
      product: f.product.trim() ? f.product : produk,
      warna: warnaBaru,
      size: sizes.length === 1 ? sizes[0] : '',
    }));
  };

  /**
   * Pilih Warna -> Size dipersempit ke pasangan warna itu.
   *
   * Size ikut dikosongkan karena size milik warna lama belum tentu ada di warna
   * baru (`PDFF_CSC-TOP-02_B-01_PRDN`: Champagne hanya M, Ivory hanya S).
   */
  const selectWarna = (w: string) => {
    if (form.warna === w) return;
    const sizes = sizeChoicesFor(codeVariants, form.clientCode, w);
    setForm((f) => ({
      ...f,
      warna: w,
      size: sizes.includes(f.size) ? f.size : sizes.length === 1 ? sizes[0] : '',
    }));
  };

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-auto">
      {canDelete && (
        <PermanentDeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}
          module="planning_produksi" ids={deleteIds} onDeleted={handleDeleted} />
      )}
      <div className="px-6 pt-3 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Planning Produksi</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <Button onClick={refresh} variant="outline" size="sm" className="h-8 px-3.5">
              <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generating || selectedRows.size === 0}
              size="sm"
              className="h-8 px-3.5 bg-violet-500 hover:bg-violet-600"
              title={
                selectedRows.size === 0
                  ? 'Centang planning yang mau digenerate dulu'
                  : `Generate ${selectedRows.size} planning terpilih`
              }
            >
              <Sparkles className="w-3.5 h-3.5 mr-2" />{' '}
              {generating ? 'Generating…' : `Generate Target${selectedRows.size > 0 ? ` (${selectedRows.size})` : ''}`}
            </Button>
            <Button onClick={openCreate} size="sm" className="h-8 px-3.5 bg-primary hover:bg-primary/90">
              <Plus className="w-3.5 h-3.5 mr-2" /> Tambah Planning
            </Button>
          </div>
        </div>
        {message && <div className="mb-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-blue-700">{message}</div>}
      </div>

      <div className="flex-1 px-6 pt-4 pb-5 overflow-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" /><input type="text" placeholder="Cari planning..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-8 pl-8 pr-3 text-sm border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" /></div>
          <FilterButton fields={PLAN_FIELDS} value={filters} onChange={setFilters} />
          <SortButton fields={PLAN_FIELDS} value={sorts} onChange={setSorts} />
          <ColumnSettingsButton fields={PLAN_FIELDS} hidden={hiddenCols} onToggle={toggleCol} frozen={frozenCols} onToggleFreeze={toggleFreezeCol} onToggleFreezeAll={toggleFreezeAllCols} headerFrozen={headerFrozen} onToggleHeaderFrozen={setHeaderFrozen} />
          <ExportButton onClick={handleExport} />
          <Button onClick={handleImport} size="sm" variant="outline" className={cn(T_TOOLBAR_BTN, T_TOOLBAR_BTN_IDLE)} disabled={selectedRows.size === 0}>
            <Upload className="w-3 h-3" /> Import
          </Button>
          {selectedRows.size > 0 && (
            <>
              <Select onValueChange={(v) => void handleBulkStatus(v)}>
                <SelectTrigger className="h-8 w-[170px] text-[11px] rounded-lg">
                  <SelectValue placeholder={`Update status (${selectedRows.size})…`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              {canDelete && (
                <Button onClick={handleBulkDelete} size="sm" variant="destructive">
                  <Trash2 className="w-3 h-3 mr-1.5" /> Delete ({selectedRows.size})
                </Button>
              )}
            </>
          )}
          <div className="flex items-center ml-auto">
            <span className="text-[11px] text-slate-400">
              {selectedRows.size > 0
                ? `${selectedRows.size} planning dipilih`
                : 'Centang planning dulu untuk generate target'}
            </span>
          </div>
        </div>

        <div className={T_WRAP}>
          <DataTable
            variant="plain"
            columns={planningColumns}
            data={rows as unknown as Record<string, unknown>[]}
            selectedRows={selectedRows}
            onToggleRow={handleToggleRow}
            onRowClick={(row) => openEdit(row as unknown as PlanningProduksiRow)}
            hiddenColumns={hiddenCols}
            frozenColumns={frozenCols}
            headerFrozen={headerFrozen}
            emptyMessage={
              <div className="py-10 text-center text-[13px] text-gray-400">
                {filtered.length === 0 ? 'Belum ada planning produksi' : 'Tidak ada hasil yang cocok dengan filter'}
              </div>
            }
          />
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editTarget ? '✏️ Edit Planning Produksi' : '➕ Tambah Planning Produksi'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="namaPenjahit">Nama Penjahit *</Label>
              <Select value={form.namaPenjahit} onValueChange={(v) => setField('namaPenjahit', v)}>
                <SelectTrigger id="namaPenjahit" className="h-9 text-sm">
                  <SelectValue placeholder="— Pilih Penjahit —" />
                </SelectTrigger>
                <SelectContent>
                  {/* Nama yang tersimpan tetap ditampilkan walau penjahitnya kini Non-Aktif. */}
                  {form.namaPenjahit && !penjahitList.some((p) => p.picPenjahit === form.namaPenjahit) && (
                    <SelectItem value={form.namaPenjahit} className="text-sm">
                      {form.namaPenjahit} (Non-Aktif)
                    </SelectItem>
                  )}
                  {penjahitList.map((p) => (
                    <SelectItem key={p.id} value={p.picPenjahit} className="text-sm">
                      {p.picPenjahit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {penjahitList.length === 0 && <p className="text-xs text-slate-400">Belum ada karyawan aktif dengan posisi Penjahit — daftarkan di menu Contact → tab Karyawan.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                {/* `-trigger` mengikuti id yang dipasang AppSelect pada tombolnya;
                    elemen ber-id `clientCode` sendiri adalah input tersembunyi. */}
                <Label htmlFor="clientCode-trigger">Kode Produksi Client *</Label>
                <AppSelect
                  id="clientCode"
                  className="mt-1"
                  value={form.clientCode}
                  onValueChange={selectClientCode}
                  options={codeChoiceOptions}
                  placeholder="— Pilih Kode Produksi Client —"
                  emptyMessage="Belum ada kode produksi di Work Order."
                  allowUnlistedValue
                />
              </div>
              <div>
                {/* Kode Produksi Konveksi — read-only, menyalin gaya kolom
                    derived di ComplainPenaltiPage. Tidak ada `htmlFor` karena
                    memang tidak ada kontrol yang bisa difokus. */}
                <Label>Kode Produksi Konveksi</Label>
                <div className="mt-1 flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-[12px] text-slate-700">
                  {form.productionCode || <span className="text-slate-400">Terisi otomatis</span>}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Kode Produksi Konveksi terisi otomatis setelah Kode Produksi Client dipilih. Warna dan
              Size ikut menyesuaikan kode tersebut — pilihannya berasal dari varian di Work Order,
              jadi tidak perlu diketik manual.
            </p>
            {codeOptions.length === 0 && (
              <p className="text-xs text-slate-400">
                Belum ada kode produksi — buat order dulu di Order Entry supaya pasangan kodenya tersedia.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="product">Produk *</Label>
                <Input id="product" type="text" value={form.product} onChange={(e) => setField('product', e.target.value)} placeholder="e.g. Dress" className="mt-1" />
              </div>
              <div>
                {/* Warna & Size tidak lagi diketik manual: pilihannya berasal
                    dari varian work order milik Kode Produksi Client di atas,
                    jadi kombinasi yang tidak ada di produksi tidak bisa dibuat.
                    Sebelum kode dipilih, keduanya mati dan menjelaskan kenapa. */}
                <Label htmlFor="warna-trigger">Warna</Label>
                <AppSelect
                  id="warna"
                  className="mt-1"
                  value={form.warna}
                  onValueChange={selectWarna}
                  options={warnaChoiceOptions.map((w) => ({ value: w, label: w }))}
                  placeholder={form.clientCode ? '— Pilih Warna —' : 'Pilih Kode Produksi Client dulu'}
                  emptyMessage="Kode produksi ini belum punya warna di Work Order."
                  disabled={!form.clientCode}
                  allowUnlistedValue
                />
              </div>
              <div>
                <Label htmlFor="size-trigger">Size</Label>
                <AppSelect
                  id="size"
                  className="mt-1"
                  value={form.size}
                  onValueChange={(v) => setField('size', v)}
                  options={sizeChoiceOptions.map((s) => ({ value: s, label: s }))}
                  placeholder={form.clientCode ? '— Pilih Size —' : 'Pilih Kode Produksi Client dulu'}
                  emptyMessage="Kode produksi ini belum punya size di Work Order."
                  disabled={!form.clientCode}
                  allowUnlistedValue
                />
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
            <Button onClick={handleSave} disabled={!isValid || saving} className="bg-primary hover:bg-primary/90">{saving ? 'Saving…' : editTarget ? 'Update Planning' : 'Save Planning'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default PlanningProduksiPage;
