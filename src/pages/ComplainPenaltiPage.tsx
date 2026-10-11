import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Plus, RefreshCw, Search, Camera, X, Trash2, Check, ChevronsUpDown } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { T_WRAP, softBadgeClass} from '@/lib/tableStyles';
import { formatDate } from '@/data/pipelineData';
import { DataTable } from '@/components/Table/DataTable';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton } from '@/components/Table/ColumnSettings';
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import { Button } from '@/components/ui/button';
import { ComplainDatePicker } from '@/components/ComplainDatePicker';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  COMPLAIN_STATUS,
  fetchComplainOptions,
  suggestPotongan,
} from '@/lib/complainHelper';
import {
  clientCodeOptionsOf,
  konveksiCodeFor,
  legacyKonveksiCode,
  productOptionsOf,
  resolveLegacyCode,
  warnaOptionsOf,
  type ComplainProductionOption,
} from '@/lib/complainCascade';
import { buildComplainSummary } from '@/lib/complainSummary';
import { formatMonthYearFromYm } from '@/lib/monthYear';
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

// Badge soft (lihat `softBadgeClass` di '@/lib/tableStyles') — TINGKAT:
// ringan/sedang/berat, STATUS: Baru/Diproses/Selesai. Nilainya nama warna,
// bukan kelas penuh, agar tidak ada kelas setengah jadi yang tertinggal.
const TINGKAT_BADGE: Record<string, string> = {
  ringan: 'emerald',
  sedang: 'amber',
  berat: 'rose',
};

// STATUS: NEED PROCEED (baru dibuat, potongan belum dieksekusi) / SOLVED.
const STATUS_BADGE: Record<string, string> = {
  'NEED PROCEED': 'amber',
  SOLVED: 'emerald',
};

/**
 * Pilihan Status untuk dropdown di sel tabel.
 *
 * Diambil dari `COMPLAIN_STATUS` supaya tidak ada daftar nilai yang ditulis dua
 * kali — kalau kelak ada status baru, ia cukup ditambahkan di satu tempat
 * (`src/lib/complainHelper.ts`) dan dropdown ikut mengenalnya.
 *
 * Urutan: NEED PROCEED dulu, karena itu keadaan awal dan yang paling sering
 * perlu diubah.
 */
const STATUS_OPTIONS = [
  { value: COMPLAIN_STATUS.NEED_PROCEED, label: COMPLAIN_STATUS.NEED_PROCEED },
  { value: COMPLAIN_STATUS.SOLVED, label: COMPLAIN_STATUS.SOLVED },
];

/** Sel kosong untuk nilai yang belum diisi (pola `ExpensePage.tsx`). */
const EMPTY_CELL = <span className="text-gray-300">—</span>;

function today(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

interface ComplainForm {
  tanggal: string; // default hari ini
  product: string;
  warna: string;
  /** Kode Produksi Client — pilihan user, penentu harga potongan. */
  clientCode: string;
  /** Kode Produksi Konveksi — terisi otomatis dari `clientCode`, tidak diketik. */
  productionCode: string;
  pic: string;
  posisi: string;
  tingkat: string; // ringan/sedang/berat
  potonganPerPcs: string;
  detailComplain: string;
}

// Status tidak diisi user — complain baru otomatis 'NEED PROCEED' (default DB),
// lalu berubah 'SOLVED' lewat tombol aksi di tabel setelah potongan dieksekusi.
const EMPTY_FORM: ComplainForm = {
  tanggal: today(),
  product: '',
  warna: '',
  clientCode: '',
  productionCode: '',
  pic: '',
  posisi: '',
  tingkat: '',
  potonganPerPcs: '',
  detailComplain: '',
};

interface PendingFile {
  file: File;
  previewUrl: string;
}

const labelCls = 'text-slate-500 text-[11px] font-medium';

interface Option {
  value: string;
  label: string;
}

/**
 * Dropdown pilihan, dibangun dari shadcn `Select`.
 *
 * `value` boleh berisi nilai yang belum ada di `options` (mis. PIC yang sudah
 * Non-Aktif) — nilai itu ditambahkan sebagai item tambahan supaya pilihan yang
 * tersimpan tetap tampil dan tidak berubah diam-diam saat disimpan ulang.
 */
function FormSelect({
  id,
  value,
  placeholder,
  options,
  onSelect,
  disabled = false,
}: {
  id: string;
  value: string;
  placeholder: string;
  options: Option[];
  onSelect: (v: string) => void;
  disabled?: boolean;
}) {
  const hasValue = value !== '';
  const items = hasValue && !options.some((o) => o.value === value)
    ? [{ value, label: value }, ...options]
    : options;

  return (
    <Select value={value} onValueChange={onSelect} disabled={disabled}>
      <SelectTrigger id={id} className={cn('h-9 text-[12px]', !hasValue && 'text-slate-400')}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-slate-400">Tidak ada pilihan.</div>
        ) : (
          items.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-[12px]">
              {o.label}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

/**
 * Pilihan yang bisa dicari — shadcn `Popover` + `Command`.
 *
 * Dipakai untuk daftar yang bisa panjang (Produk, PIC) di mana `Select` biasa
 * sudah tidak nyaman. Semua primitifnya tetap shadcn.
 */
function SearchSelect({
  value,
  placeholder,
  options,
  onSelect,
  disabled = false,
  emptyHint = 'Tidak ada pilihan.',
  searchPlaceholder = 'Cari...',
}: {
  value: string;
  placeholder: string;
  options: string[];
  onSelect: (v: string) => void;
  disabled?: boolean;
  emptyHint?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-9 w-full justify-between px-3 text-[12px] font-normal',
            value ? 'text-slate-800' : 'text-slate-400',
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-8 text-[12px]" />
          <CommandList>
            <CommandEmpty className="py-2 text-center text-[12px] text-slate-400">
              {emptyHint}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  className="text-[12px]"
                  onSelect={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-3.5 w-3.5',
                      option === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ComplainPenaltiPage() {
  const { profile } = useAuth();

  /**
   * Tab aktif. `'complain'` = tabel yang sudah ada, `'summary'` = ringkasan
   * per PIC per bulan.
   *
   * Memakai segmented control, bukan dua tabel bertumpuk, mengikuti pola yang
   * sudah dipakai Target Jahit (Target / Belum Jahit / Utang Staf / Benefit)
   * dan Production Monitoring — lihat keputusan user saat ditanya.
   */
  const [tab, setTab] = useState<'complain' | 'summary'>('complain');

  // ===== Data tabel =====
  const [items, setItems] = useState<ComplainPenaltiRow[]>([]);
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  /**
   * Baris yang statusnya sedang disimpan.
   *
   * Dipakai untuk menonaktifkan dropdown baris itu saja — tanpa ini user bisa
   * mengubah status berkali-kali sebelum permintaan pertama selesai, dan
   * hasilnya bergantung pada urutan respons server.
   */
  const [savingStatusId, setSavingStatusId] = useState<number | null>(null);

  // ===== Opsi form (dari data produksi) =====
  const [complainOptions, setComplainOptions] = useState<ComplainProductionOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);

  // ===== Modal state =====
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ComplainPenaltiRow | null>(null);
  const [form, setForm] = useState<ComplainForm>(EMPTY_FORM);
  const [existingFiles, setExistingFiles] = useState<ComplainFileRow[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);

  // Saran potongan terakhir yang diterapkan — supaya saran tidak menimpa input manual user.
  const lastSuggestionRef = useRef<string | null>(null);
  // Timer flash pesan — clear sebelum jadwalkan yang baru agar pesan beruntun tidak saling potong.
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // useCallback supaya identitasnya stabil: `flash` dipakai di dalam
  // `handleStatusChange`, dan `handleStatusChange` sendiri dipakai di dalam
  // useMemo kolom. Tanpa ini keduanya dibuat ulang tiap render dan memo kolom
  // jadi sia-sia.
  const flash = useCallback((msg: string, ms = 3500) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setMessage(msg);
    flashTimerRef.current = setTimeout(() => setMessage(null), ms);
  }, []);

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

  // ===== Opsi cascade: Product -> Warna -> Kode Produksi Client =====
  // Bentuk opsi (termasuk peruntuhan 4 work order menjadi 2 pilihan) ada di
  // `complainCascade.ts`; di sini hanya memanggilnya agar tidak ada logika
  // cascade yang tersembunyi di dalam komponen.
  const productOptions = useMemo(() => productOptionsOf(complainOptions), [complainOptions]);

  const warnaOptions = useMemo(
    () => warnaOptionsOf(complainOptions, form.product),
    [complainOptions, form.product],
  );

  const clientCodeOptions = useMemo(
    () => clientCodeOptionsOf(complainOptions, form.product, form.warna),
    [complainOptions, form.product, form.warna],
  );

  // 1 warna untuk produk terpilih -> auto-select.
  useEffect(() => {
    if (!form.product || form.warna) return;
    if (warnaOptions.length === 1) {
      setForm((f) => ({ ...f, warna: warnaOptions[0] }));
    }
  }, [form.product, form.warna, warnaOptions]);

  // 1 kode client untuk produk+warna terpilih -> auto-select sekaligus isi kode
  // konveksinya. Inilah yang membuat kolom Kode Produksi Konveksi "otomatis
  // terisi": user tidak pernah mengetiknya, hanya memilih kode client.
  useEffect(() => {
    if (!form.warna || form.clientCode) return;
    if (clientCodeOptions.length !== 1) return;
    const clientCode = clientCodeOptions[0];
    setForm((f) => ({
      ...f,
      clientCode,
      productionCode: konveksiCodeFor(complainOptions, clientCode) ?? '',
    }));
  }, [form.warna, form.clientCode, clientCodeOptions, complainOptions]);

  // Saran potongan otomatis dari harga Order Entry (berdasarkan kode client + posisi).
  useEffect(() => {
    if (!form.clientCode || !form.posisi) return;
    const opt = complainOptions.find(
      (o) => o.product === form.product && o.warna === form.warna && o.clientCode === form.clientCode,
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
  }, [complainOptions, form.product, form.warna, form.clientCode, form.posisi]);

  function selectProduct(p: string) {
    if (form.product === p) return;
    // Cascade reset: ganti product -> reset warna, kode, potongan.
    lastSuggestionRef.current = null;
    setForm((f) => ({
      ...f,
      product: p,
      warna: '',
      clientCode: '',
      productionCode: '',
      potonganPerPcs: '',
    }));
  }

  function selectWarna(w: string) {
    if (form.warna === w) return;
    // Cascade reset: ganti warna -> reset kode, potongan.
    lastSuggestionRef.current = null;
    setForm((f) => ({
      ...f,
      warna: w,
      clientCode: '',
      productionCode: '',
      potonganPerPcs: '',
    }));
  }

  /**
   * Pilih Kode Produksi Client — sekaligus mengisi Kode Produksi Konveksi.
   *
   * Inilah inti permintaan user: satu pilihan, dua kolom terisi. Pasangannya
   * dicari lewat `konveksiCodeFor` (relasi 1:1, diverifikasi lewat MCP), bukan
   * disimpan berpasangan di state — supaya tidak ada dua sumber kebenaran yang
   * bisa berbeda.
   */
  function selectClientCode(clientCode: string) {
    if (form.clientCode === clientCode) return;
    lastSuggestionRef.current = null;
    setForm((f) => ({
      ...f,
      clientCode,
      productionCode: konveksiCodeFor(complainOptions, clientCode) ?? '',
      potonganPerPcs: '',
    }));
  }

  // ===== Modal buka/tutup =====
  const openCreate = useCallback(() => {
    setEditTarget(null);
    // M-3: tanggal dihitung saat modal dibuka (bukan saat module load) — aman untuk sesi lintas tengah malam.
    setForm({ ...EMPTY_FORM, tanggal: today() });
    lastSuggestionRef.current = null;
    setExistingFiles([]);
    setPendingFiles([]);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback(async (item: ComplainPenaltiRow) => {
    setEditTarget(item);
    // Nilai potongan existing dianggap input user — jangan ditimpa saran.
    lastSuggestionRef.current = null;
    // Kode client dipulihkan dari `workCode` tersimpan. Baris LAMA isinya teks
    // gabungan ("PO/001 | Gena Pants | Black | M") yang tidak sama dengan kode
    // client mana pun — `resolveLegacyCode` yang mencocokkannya lewat kode
    // konveksi, jadi dropdown-nya tidak kosong saat form dibuka.
    const clientCode = resolveLegacyCode(item.workCode, complainOptions) ?? item.workCode ?? '';
    // Kode konveksi memakai kolomnya sendiri; cadangan hanya untuk baris lama
    // yang kolomnya masih NULL (mis. work order-nya sudah tidak ada).
    const productionCode =
      item.productionCode ??
      konveksiCodeFor(complainOptions, clientCode) ??
      legacyKonveksiCode(item.workCode) ??
      '';
    setForm({
      tanggal: item.tanggal,
      product: item.product,
      warna: item.warna ?? '',
      clientCode,
      productionCode,
      pic: item.pic ?? '',
      posisi: item.posisi,
      tingkat: item.tingkat ?? '',
      potonganPerPcs: String(item.potonganPerPcs),
      detailComplain: item.detailComplain ?? '',
    });
    setExistingFiles([]);
    setPendingFiles([]);
    setModalOpen(true);
    const { data } = await fetchFilesByComplainId(item.id);
    setExistingFiles(data ?? []);
  }, [complainOptions]);

  const closeModal = useCallback(() => {
    setPendingFiles((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
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
  // Semua field wajib diisi. Potongan/PCS boleh 0, tapi tidak boleh kosong.
  const isValid = Boolean(
    form.tanggal &&
      form.product &&
      form.warna &&
      form.clientCode &&
      form.pic &&
      form.posisi &&
      form.tingkat &&
      form.potonganPerPcs.trim() !== '' &&
      Number(form.potonganPerPcs) >= 0 &&
      form.detailComplain.trim() !== '',
  );
  const selectedPoin = TINGKAT_OPTIONS.find((t) => t.key === form.tingkat)?.poin ?? 0;

  async function handleSave() {
    if (!isValid) {
      flash('❌ Lengkapi semua field wajib (*).');
      return;
    }
    setSaving(true);
    // Status tidak dikirim: create memakai default DB ('NEED PROCEED'),
    // dan update tidak boleh menimpa status yang sudah SOLVED.
    const fields = {
      tanggal: form.tanggal,
      product: form.product,
      warna: form.warna || null,
      // `workCode` di service adalah kolom DB `work_code`, yang isinya Kode
      // Produksi Client (nama kolom warisan) — lihat migrasi 2026-09-22.
      workCode: form.clientCode || null,
      productionCode: form.productionCode || null,
      pcs: 1, // pcs selalu 1
      posisi: form.posisi,
      pic: form.pic || null,
      detailComplain: form.detailComplain || null,
      potonganPerPcs: Number(form.potonganPerPcs || 0),
      poin: selectedPoin, // otomatis dari tingkat
      tingkat: form.tingkat || null,
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


  /**
   * Ubah status satu baris — dipakai dropdown Status di tabel.
   *
   * Menggantikan tombol "Solve" satu arah yang lama: dulu status hanya bisa
   * maju NEED PROCEED → SOLVED lewat tombol, sekarang bisa dua arah lewat
   * dropdown. Karena itu `confirm()` yang lama **dihapus**: memilih nilai di
   * dropdown itu sendiri sudah tindakan yang disengaja, dan tindakannya bisa
   * dibatalkan dengan memilih nilai semula. Konfirmasi di atas pilihan yang
   * sudah eksplisit hanya menambah klik tanpa menambah keamanan.
   *
   * Nilai yang sama dengan status sekarang tidak dikirim ke server: itu bukan
   * perubahan, dan mengirimnya hanya menghasilkan permintaan tulis yang tidak
   * mengubah apa pun.
   *
   * Badge diperbarui optimistis di state lokal (pola `handleStatusChange` di
   * Planning Produksi), BUKAN dengan `refresh()`. `refresh()` menyalakan
   * `loading`, dan halaman ini mengembalikan layar "Loading..." selama itu —
   * jadi memanggilnya di sini akan mengedipkan seluruh halaman (termasuk
   * membuang posisi tab) hanya untuk satu baris. Bila server menolak, nilainya
   * dikembalikan ke status semula supaya layar tidak berbohong.
   */
  const handleStatusChange = useCallback(async (item: ComplainPenaltiRow, status: string) => {
    if (status === item.status) return;

    const previous = item.status;
    setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, status } : r)));
    setSavingStatusId(item.id);

    const { error } = await updateComplain(item.id, { status });

    setSavingStatusId(null);
    if (error) {
      setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, status: previous } : r)));
      flash(`❌ Error: ${error.message}`);
      return;
    }
    flash(`✅ Status "${item.product}" diubah ke ${status}.`);
  }, [flash]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((d) =>
      [
        d.tanggal,
        d.productionCode ?? '',
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

  const COMPLAIN_FIELDS: FieldOption[] = [
    { key: 'tanggal', label: 'Tanggal' },
    { key: 'productionCode', label: 'Kode Produksi Konveksi' },
    { key: 'workCode', label: 'Kode Produksi Client' },
    { key: 'product', label: 'Produk' },
    { key: 'posisi', label: 'Posisi' },
    { key: 'pic', label: 'PIC' },
    { key: 'poin', label: 'Poin' },
    { key: 'potonganPerPcs', label: 'Potongan/PCS' },
    { key: 'tingkat', label: 'Tingkat' },
    { key: 'status', label: 'Status' },
  ];
  const rows = useMemo(() => applySorts(applyFilters(filtered.map((d) => ({ ...d } as unknown as Record<string, unknown>)), filters), sorts) as unknown as ComplainPenaltiRow[], [filtered, filters, sorts]);

  // Bentuk kolom untuk DataGrid (variant "plain"). Sel yang butuh badge,
  // format, atau tombol sendiri memakai `render` supaya tabel bersama tidak
  // perlu tahu soal tone tingkat/status maupun aksi Solve.
  const complainColumns = useMemo(() => [
    {
      key: 'tanggal', label: 'Tanggal', width: '120px',
      render: (row: Record<string, unknown>) => (
        <span className="text-gray-700 whitespace-nowrap">{formatDate(row.tanggal as string)}</span>
      ),
    },
    {
      key: 'productionCode', label: 'Kode Produksi Konveksi', width: '180px',
      render: (row: Record<string, unknown>) => {
        const code = row.productionCode as string | null;
        return <span className="font-mono text-gray-700" title={code ?? ''}>{code || EMPTY_CELL}</span>;
      },
    },
    {
      key: 'workCode', label: 'Kode Produksi Client', width: '170px',
      render: (row: Record<string, unknown>) => {
        const code = row.workCode as string | null;
        return <span className="font-mono text-gray-700" title={code ?? ''}>{code || EMPTY_CELL}</span>;
      },
    },
    { key: 'product', label: 'Produk', width: '160px' },
    {
      key: 'posisi', label: 'Posisi', width: '110px',
      render: (row: Record<string, unknown>) => {
        const posisi = row.posisi as string;
        return <span className="text-gray-700">{POSISI_LABEL[posisi] ?? posisi}</span>;
      },
    },
    {
      key: 'pic', label: 'PIC', width: '140px',
      render: (row: Record<string, unknown>) => (
        <span className="text-gray-700">{(row.pic as string) || '—'}</span>
      ),
    },
    {
      key: 'poin', label: 'Poin', align: 'right' as const, width: '80px',
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums text-gray-700">{String(row.poin)}</span>
      ),
    },
    {
      key: 'potonganPerPcs', label: 'Potongan/PCS', align: 'right' as const, width: '130px',
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums text-gray-700">{formatCurrency(row.potonganPerPcs as number)}</span>
      ),
    },
    {
      key: 'tingkat', label: 'Tingkat', align: 'center' as const, width: '110px',
      render: (row: Record<string, unknown>) => {
        const tingkat = row.tingkat as string | null;
        if (!tingkat) return EMPTY_CELL;
        return (
          <span className={softBadgeClass(TINGKAT_BADGE[tingkat])}>
            {TINGKAT_OPTIONS.find((t) => t.key === tingkat)?.label ?? tingkat}
          </span>
        );
      },
    },
    {
      key: 'status', label: 'Status', align: 'center' as const, width: '190px',
      // Dropdown status hidup di dalam sel, bukan di kolom aksi, supaya
      // letaknya persis di tempat badge lama berada. Tiga hal yang wajib:
      //
      // 1. `stopPropagation` — baris tabel membuka modal Edit saat diklik
      //    (`onRowClick`), jadi tanpa ini memilih status ikut membuka modal.
      //    `onPointerDown` ikut dihentikan karena Radix Select membuka menu
      //    lewat pointerdown, sebelum `click` sempat sampai ke baris.
      // 2. Badge dipasang di `SelectTrigger`, BUKAN di dalam `SelectValue`.
      //    Radix hanya memindahkan teks item ke dalam `SelectValue` bila ia
      //    tidak punya anak; memberi anak membuat nilainya tidak tampil sama
      //    sekali. Pola ini sama dengan dropdown status di Planning Produksi.
      // 3. `w-auto` — Select bawaan ber-`w-full`, jadi tanpa ini ia menyeret
      //    lebar kolom mengikuti isi teksnya.
      render: (row: Record<string, unknown>) => {
        const item = row as unknown as ComplainPenaltiRow;
        const status = item.status;
        // Nilai yang belum dikenal (mis. baris lama) tetap ditampilkan apa
        // adanya sebagai pilihan tambahan — sama seperti `FormSelect` di form,
        // supaya status tersimpan tidak berubah diam-diam saat dibuka.
        const options = STATUS_OPTIONS.some((o) => o.value === status)
          ? STATUS_OPTIONS
          : [{ value: status, label: status }, ...STATUS_OPTIONS];

        return (
          <span
            className="flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Select
              value={status}
              onValueChange={(value) => void handleStatusChange(item, value)}
              disabled={savingStatusId === item.id}
            >
              <SelectTrigger
                aria-label={`Status ${item.product}`}
                className={cn(
                  'h-[19px] w-auto gap-1 rounded-md border-0 px-2 text-[11px] font-semibold shadow-none focus:ring-1 focus:ring-slate-300 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-70',
                  softBadgeClass(STATUS_BADGE[status]),
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-[12px]">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        );
      },
    },
    {
      key: 'bukti', label: 'Bukti', align: 'center' as const, width: '90px',
      render: (row: Record<string, unknown>) => {
        // id bigint bisa tiba sebagai string dari supabase-js — kunci peta
        // penghitung file memakai string, sama seperti versi tabel lama.
        const photoCount = fileCounts[String(row.id)] ?? 0;
        if (photoCount === 0) return EMPTY_CELL;
        return (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-600">
            <Camera className="w-3.5 h-3.5 text-blue-500" /> {photoCount}
          </span>
        );
      },
    },
  // `handleStatusChange` dan `savingStatusId` ikut jadi dependensi karena sel
  // Status memakainya: tanpa itu sel akan memegang versi lama dan dropdown bisa
  // memakai state basi setelah refresh, atau tidak ikut menonaktifkan diri saat
  // penyimpanan sedang berjalan.
  ], [fileCounts, handleStatusChange, savingStatusId]);

  // Pengaturan kolom (tampil/sembunyi + freeze) dipanggil di sini, bukan di blok
  // state di atas, karena butuh urutan kolom yang baru lengkap setelah
  // `complainColumns` selesai disusun. Tidak ada `return` lebih awal di
  // antaranya, jadi urutan hook tetap stabil.
  //
  // `columnFields` diturunkan dari `complainColumns`, bukan dari daftar manual
  // seperti dulu: daftar manual harus disunting dua kali setiap kali ada kolom
  // baru, dan fitur freeze butuh urutannya benar-benar sama dengan tabel —
  // daftar beku selalu dirapikan menjadi awalan dari urutan ini.
  const columnKeys = useMemo(() => complainColumns.map((c) => c.key), [complainColumns]);
  const columnFields = useMemo(() => complainColumns.map((c) => ({ key: c.key, label: c.label })), [complainColumns]);
  const {
    hidden: hiddenCols, toggle: toggleCol,
    frozen: frozenCols, toggleFreeze: toggleFreezeCol, toggleFreezeAll: toggleFreezeAllCols,
    headerFrozen, setHeaderFrozen,
  } = useColumnSettings('complain-penalti', columnKeys);

  // Multi-select + toolbar (same pattern as Production Monitoring RAW DATA).
  // "Select all" is owned by the grid now — it toggles every visible row and
  // replays the difference through `handleToggleRow`.
  const handleToggleRow = (id: string) => setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleImport = () => { if (selectedRows.size === 0) { alert('Pilih minimal 1!'); return; } alert(`✅ ${selectedRows.size} complain di-import`); setSelectedRows(new Set()); };
  const handleExport = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Tanggal', 'Kode Produksi Konveksi', 'Kode Produksi Client', 'Produk', 'Warna', 'Posisi', 'PIC', 'Poin', 'Potongan/PCS', 'Tingkat', 'Status'];
    const lines = filtered.map((r) => [r.tanggal, r.productionCode ?? '', r.workCode ?? '', r.product, r.warna ?? '', POSISI_LABEL[r.posisi] ?? r.posisi, r.pic ?? '', r.poin, r.potonganPerPcs, r.tingkat ?? '', r.status].map(esc).join(','));
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n'); // BOM for Excel UTF-8
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `complain-penalti-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Ekspor tab Summary.
   *
   * Meniru `handleExport` di atas (BOM + escape kutip yang sama) supaya kedua
   * berkas CSV bisa dibuka di Excel dengan cara yang sama. Yang diekspor adalah
   * `summaryRows` — hasil penjumlahan yang terlihat di layar, bukan baris mentah
   * — sebab itu isi tab ini. Urutan kolomnya sengaja sama persis dengan kolom di
   * tabel (Bulan dulu, baru PIC), supaya berkas yang diunduh dan yang dilihat di
   * layar terbaca dengan urutan yang sama.
   */
  const handleSummaryExport = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Bulan', 'PIC', 'Jumlah Complain', 'Total Pcs', 'Total Potongan'];
    const lines = summaryRows.map((r) =>
      [r.bulan, r.pic, r.jumlahComplain, r.totalPcs, r.totalPotongan].map(esc).join(','),
    );
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n'); // BOM for Excel UTF-8
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `complain-penalti-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    if (!confirm(`Hapus ${selectedRows.size} complain terpilih? File bukti terkait juga akan terhapus.`)) return;
    let deleted = 0;
    for (const id of selectedRows) {
      const item = items.find((it) => String(it.id) === id);
      if (!item) continue;
      const { data: files } = await fetchFilesByComplainId(item.id);
      const { error } = await removeComplain(item.id);
      if (!error) {
        deleted++;
        await removeComplainFilesByPaths((files ?? []).map((f) => f.filePath)).catch(() => {});
      }
    }
    setItems(prev => prev.filter(it => !selectedRows.has(String(it.id))));
    setSelectedRows(new Set());
    flash(`✅ ${deleted} complain berhasil dihapus!`);
  };

  // ===== Tab Summary =====
  //
  // Dibangun dari `items` yang sudah dimuat tabel, BUKAN query baru: keduanya
  // harus melihat baris yang sama persis, dan satu sumber berarti tidak mungkin
  // tabel dan summary berbeda angka. Ia juga ikut tersaring oleh pencarian,
  // supaya mengetik nama orang menyaring kedua tab dengan rantai yang sama.
  //
  // `filtered` (bukan `items`) yang dipakai agar pencarian berlaku di kedua tab;
  // slicer Filter/Sort sengaja TIDAK ikut, karena keduanya memakai nama kolom
  // tabel dan tidak punya arti pada baris ringkasan yang sudah dijumlahkan.
  const summaryRows = useMemo(() => buildComplainSummary(filtered), [filtered]);

  // The shared grid keys rows by `row.id` (`getRowId`), while a summary row is
  // identified by its (PIC, bulan) pair. The pair is copied across as `id` so
  // the grid, the row key, and the cell renderers agree on one identity —
  // `pic` alone is not unique (one person spans several months).
  const summaryGridRows = useMemo(
    () => summaryRows.map((r) => ({ ...r, id: `${r.pic}\u0000${r.bulan}` })),
    [summaryRows],
  );

  const summaryColumns = useMemo(() => [
    // Bulan dulu, baru PIC: urutan kolom ini sepasang dengan urutan baris di
    // `buildComplainSummary` (bulan menaik, lalu PIC) — lihat komentar di sana.
    {
      key: 'bulan', label: 'Bulan', width: '140px',
      render: (row: Record<string, unknown>) => (
        <span className="text-gray-700 whitespace-nowrap">
          {formatMonthYearFromYm(row.bulan as string) || EMPTY_CELL}
        </span>
      ),
    },
    { key: 'pic', label: 'PIC', width: '180px' },
    {
      key: 'jumlahComplain', label: 'Jumlah Complain', align: 'right' as const, width: '140px',
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums text-gray-700">{String(row.jumlahComplain)}</span>
      ),
    },
    {
      key: 'totalPcs', label: 'Total Pcs', align: 'right' as const, width: '110px',
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums text-gray-700">{String(row.totalPcs)}</span>
      ),
    },
    {
      key: 'totalPotongan', label: 'Potongan / Pcs', align: 'right' as const, width: '160px',
      // Permintaan user (verbatim): *"summary per orang, per bulan, dan
      // Potongan / Pcs"*. Setelah ditanya, user memilih **total potongan
      // rupiah** (Σ pcs × tarif), bukan tarif rata-rata per pcs — jadi ini
      // angka yang benar-benar dipotong dari gaji orang itu bulan itu.
      render: (row: Record<string, unknown>) => (
        <span className="tabular-nums font-semibold text-rose-600">
          {formatCurrency(Number(row.totalPotongan))}
        </span>
      ),
    },
  ], []);

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
      <div className="px-6 pt-3 pb-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Complain & Penalti</h1>
          <div className="flex items-center gap-2.5">
            <Button onClick={refresh} variant="outline" size="sm" className="h-8 px-3.5">
              <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh
            </Button>
            <Button onClick={openCreate} size="sm" className="h-8 px-3.5 bg-primary hover:bg-primary/90">
              <Plus className="w-3.5 h-3.5 mr-2" /> Tambah Complain
            </Button>
          </div>
        </div>
        {message && (
          <div className="mb-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[12px] text-blue-700">
            {message}
          </div>
        )}

        {/* Tabs — segmented control, pola Target Jahit & Production Monitoring.
            Dua section yang diminta user: tabel complain (yang sudah ada) dan
            summary per orang per bulan. */}
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => setTab('complain')}
            className={cn(
              'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors',
              tab === 'complain' ? 'bg-primary text-white shadow-md shadow-slate-300' : 'bg-white text-slate-600 border border-gray-200 hover:bg-slate-50 hover:text-blue-700',
            )}
          >
            Complain
          </button>
          <button
            onClick={() => setTab('summary')}
            className={cn(
              'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors',
              tab === 'summary' ? 'bg-primary text-white shadow-md shadow-slate-300' : 'bg-white text-slate-600 border border-gray-200 hover:bg-slate-50 hover:text-blue-700',
            )}
          >
            Summary
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 pt-4 pb-5 overflow-auto">
        {/* ===== Section 1 — tabel complain (isi yang sudah ada) ===== */}
        {tab === 'complain' && (
          <>
            {/* Toolbar: search + filter/sort/export/import/delete + hitungan complain */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari complain..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <FilterButton fields={COMPLAIN_FIELDS} value={filters} onChange={setFilters} />
              <SortButton fields={COMPLAIN_FIELDS} value={sorts} onChange={setSorts} />
              <ColumnSettingsButton fields={columnFields} hidden={hiddenCols} onToggle={toggleCol} frozen={frozenCols} onToggleFreeze={toggleFreezeCol} onToggleFreezeAll={toggleFreezeAllCols} headerFrozen={headerFrozen} onToggleHeaderFrozen={setHeaderFrozen} />
              <ExportButton onClick={handleExport} />
              <button onClick={handleImport} className={cn('h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium transition-colors', selectedRows.size > 0 ? 'bg-primary text-white hover:bg-primary/90' : 'border border-gray-200 text-slate-400')}>📥 Import ({selectedRows.size})</button>
              {selectedRows.size > 0 && (
                <button onClick={handleBulkDelete} className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
                  <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
                </button>
              )}
              <span className="text-[11px] text-slate-400 ml-auto">{rows.length} complain</span>
            </div>

            {/* Tabel — DataGrid bersama (variant "plain"): checkbox tetap paling
                kiri, dan fitur tabel lain (hidden kolom, tinggi baris) ikut aktif. */}
            <div className={T_WRAP}>
              <DataTable
                variant="plain"
                columns={complainColumns}
                data={rows as unknown as Record<string, unknown>[]}
                selectedRows={selectedRows}
                onToggleRow={handleToggleRow}
                onRowClick={(row) => void openEdit(row as unknown as ComplainPenaltiRow)}
                hiddenColumns={hiddenCols}
                frozenColumns={frozenCols}
                headerFrozen={headerFrozen}
                emptyMessage={
                  <div className="py-10 text-center text-[13px] text-gray-400">
                    {filtered.length === 0 ? 'Belum ada complain' : 'Tidak ada hasil yang cocok dengan filter'}
                  </div>
                }
              />
            </div>
          </>
        )}

        {/* ===== Section 2 — summary per orang per bulan =====
            Pencarian tetap berlaku di sini (dibangun dari `filtered`), supaya
            mengetik nama orang menyaring kedua tab dengan rantai yang sama.
            Filter/Sort sengaja tidak ikut: keduanya memakai nama kolom tabel
            dan tidak punya arti pada baris yang sudah dijumlahkan. */}
        {tab === 'summary' && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari complain..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <ExportButton onClick={handleSummaryExport} />
              <span className="text-[11px] text-slate-400 ml-auto">{summaryRows.length} baris ringkasan</span>
            </div>

            <div className={T_WRAP}>
              <DataTable
                variant="plain"
                columns={summaryColumns}
                data={summaryGridRows as unknown as Record<string, unknown>[]}
                emptyMessage={
                  <div className="py-10 text-center text-[13px] text-gray-400">
                    {items.length === 0 ? 'Belum ada complain' : 'Tidak ada hasil yang cocok dengan pencarian'}
                  </div>
                }
              />
            </div>
          </>
        )}
      </div>

      {/* ===== Modal form complain ===== */}
      {modalOpen && (
        <Dialog open={modalOpen} onOpenChange={closeModal}>
          <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editTarget ? 'Edit Complain' : 'Tambah Complain'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-3.5 py-1">
              {/* Row 1: Tanggal | Produk (bisa dicari) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="complain-tanggal" className={labelCls}>
                    Tanggal <span className="text-rose-600">*</span>
                  </Label>
                  <ComplainDatePicker
                    id="complain-tanggal"
                    value={form.tanggal}
                    onChange={(value) => setField('tanggal', value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>
                    Produk <span className="text-rose-600">*</span>
                  </Label>
                  <SearchSelect
                    value={form.product}
                    placeholder="Pilih produk..."
                    options={productOptions}
                    onSelect={selectProduct}
                    searchPlaceholder="Cari produk..."
                    emptyHint={
                      complainOptions.length === 0
                        ? 'Memuat produk dari data produksi...'
                        : 'Tidak ada produk yang cocok.'
                    }
                  />
                </div>
              </div>

              {/* Row 2: Warna | Kode Produksi Client */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="complain-warna" className={labelCls}>
                    Warna <span className="text-rose-600">*</span>
                  </Label>
                  <FormSelect
                    id="complain-warna"
                    value={form.warna}
                    placeholder={form.product ? '— Pilih Warna —' : 'Pilih produk dulu'}
                    options={warnaOptions.map((w) => ({ value: w, label: w }))}
                    onSelect={selectWarna}
                    disabled={!form.product}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="complain-clientcode" className={labelCls}>
                    Kode Produksi Client <span className="text-rose-600">*</span>
                  </Label>
                  <FormSelect
                    id="complain-clientcode"
                    value={form.clientCode}
                    placeholder={form.warna ? '— Pilih Kode Produksi Client —' : 'Pilih warna dulu'}
                    options={clientCodeOptions.map((cc) => ({ value: cc, label: cc }))}
                    onSelect={selectClientCode}
                    disabled={!form.warna}
                  />
                </div>
              </div>

              {/* Kode Produksi Konveksi — terisi otomatis dari kode client di atas.
                  Read-only karena pasangannya hanya satu; kotak yang bisa
                  diketik hanya menambah peluang salah isi. */}
              <div className="space-y-1.5">
                <Label className={labelCls}>Kode Produksi Konveksi</Label>
                <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-[12px] text-slate-700">
                  {form.productionCode || <span className="text-slate-400">Terisi otomatis</span>}
                </div>
                <p className="text-[11px] text-slate-400">Terisi otomatis setelah Kode Produksi Client dipilih.</p>
              </div>

              {/* Row 3: PIC | Posisi */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={labelCls}>
                    PIC <span className="text-rose-600">*</span>
                  </Label>
                  <SearchSelect
                    value={form.pic}
                    placeholder="Pilih PIC..."
                    options={staffOptions}
                    onSelect={(v) => setField('pic', v)}
                    searchPlaceholder="Cari PIC..."
                    emptyHint="Belum ada karyawan aktif — daftarkan di menu Contact → tab Karyawan."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="complain-posisi" className={labelCls}>
                    Posisi <span className="text-rose-600">*</span>
                  </Label>
                  <FormSelect
                    id="complain-posisi"
                    value={form.posisi}
                    placeholder="Pilih Posisi..."
                    options={POSISI_OPTIONS.map((p) => ({ value: p.key, label: p.label }))}
                    onSelect={(v) => setField('posisi', v)}
                  />
                </div>
              </div>

              {/* Row 4: Tingkat | Potongan/PCS (saran otomatis) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="complain-tingkat" className={labelCls}>
                    Tingkat <span className="text-rose-600">*</span>
                  </Label>
                  <FormSelect
                    id="complain-tingkat"
                    value={form.tingkat}
                    placeholder="Pilih Tingkat..."
                    options={TINGKAT_OPTIONS.map((t) => ({ value: t.key, label: `${t.label} (${t.poin} poin)` }))}
                    onSelect={(v) => setField('tingkat', v)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="complain-potongan" className={labelCls}>
                    Potongan/PCS <span className="text-rose-600">*</span>
                  </Label>
                  <Input
                    id="complain-potongan"
                    type="number"
                    min={0}
                    value={form.potonganPerPcs}
                    onChange={(e) => setField('potonganPerPcs', e.target.value)}
                    placeholder="0"
                    className="h-9 text-[12px]"
                  />
                  <p className="text-[11px] text-slate-400">Saran otomatis dari harga Order Entry — bisa diubah.</p>
                </div>
              </div>

              {/* Row 5: Poin (otomatis dari tingkat) — status dikelola otomatis, bukan pilihan user */}
              <div className="space-y-1.5">
                <Label className={labelCls}>Poin</Label>
                <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] font-semibold text-slate-700">
                  {form.tingkat
                    ? `${selectedPoin} poin — ${TINGKAT_OPTIONS.find((t) => t.key === form.tingkat)?.label ?? form.tingkat}`
                    : '—'}
                </div>
                <p className="text-[11px] text-slate-400">Status baru otomatis NEED PROCEED; tandai SOLVED dari tabel setelah potongan dieksekusi.</p>
              </div>

              {/* Detail complain */}
              <div className="space-y-1.5">
                <Label htmlFor="complain-detail" className={labelCls}>
                  Detail Complain <span className="text-rose-600">*</span>
                </Label>
                <Textarea
                  id="complain-detail"
                  value={form.detailComplain}
                  onChange={(e) => setField('detailComplain', e.target.value)}
                  placeholder="Deskripsi complain / catatan"
                  rows={3}
                  className="resize-none text-[12px]"
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
                        className="w-16 h-16 rounded-lg object-cover border border-slate-200"
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
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:border-slate-500 hover:text-blue-500 transition-colors">
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

            <DialogFooter>
              <Button onClick={closeModal} variant="outline" disabled={saving}>Cancel</Button>
              <Button onClick={() => void handleSave()} disabled={!isValid || saving} className="bg-primary hover:bg-primary/90">
                {saving ? 'Saving…' : editTarget ? 'Update Complain' : 'Simpan Complain'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default ComplainPenaltiPage;
