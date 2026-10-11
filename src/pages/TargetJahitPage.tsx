import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Search, Trash2 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatMonthYearFromYm } from '@/lib/monthYear';
import { T_WRAP, T_TD, T_TOOLBAR_BTN, T_TOOLBAR_BTN_IDLE, softBadgeClass } from '@/lib/tableStyles';
import { DataTable } from '@/components/Table/DataTable';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton } from '@/components/Table/ColumnSettings';
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import { fetchAll as fetchAllTarget, remove as removeTarget, type TargetJahitRow } from '@/services/targetJahit';
import { fetchAll as fetchAllRegister, type RegisterPenjahitRow } from '@/services/registerPenjahit';
import { computeDebt, buildPriceMap, type DebtSummary } from '@/services/staffDebt';
import * as daftarLiburSvc from '@/services/daftarLibur';
import * as sewingRecordSvc from '@/services/sewingRecords';
import * as workOrderSvc from '@/services/workOrders';
import * as targetJahitDetailSvc from '@/services/targetJahitDetail';
import { enrichTargetRows, enrichDetails } from '@/lib/targetCompute';
import { buildSalaryLookup, emptySalaryLookup, type SalaryLookup } from '@/lib/staffSalary';
import * as expenseSvc from '@/services/expenseEntries';
import { calculateDesignBenefits } from '@/lib/targetBenefit';
import { buildSewingBacklog, calculateMonthlyRemainingMoney, type SummaryRate } from '@/lib/sewingBacklog';
import { fetchSewingRatesByProductionOrder, type SewingRateByProductionOrder } from '@/services/productionOrderPrices';
import type { WorkOrderDesignIdentity } from '@/lib/targetDetailIdentity';
import { filterDebtRowsByLatestAccum } from '@/lib/staffDebtEligibility';
import { sumRealisasiCostByStaff } from '@/lib/staffDebtAmounts';
import type { SewingRecord, WorkOrder } from '@/types/pipeline';
import { useAuth } from '@/contexts/AuthContext';

// Map live snake_case target_jahit columns to camelCase render keys.
const TARGET_COLUMN_ALIAS: Record<string, string> = {
  bulan_tahun: 'bulanTahun',
  total_hari_kerja: 'totalHariKerja',
  hari_kerja_hari_ini: 'hariKerjaHariIni',
  sisa_hari: 'sisaHari',
  target_daily: 'targetDaily',
  target_ngebut_hari: 'targetNgebutHari',
  target_monthly: 'targetMonthly',
  realisasi_monthly: 'realisasiMonthly',
  sisa_target_monthly: 'sisaTargetMonthly',
  progress_monthly: 'progressMonthly',
  status_final: 'statusFinal',
  target_cost_posisi: 'targetCostPosisi',
  realisasi_cost_posisi: 'realisasiCostPosisi',
  target_accum: 'targetAccum',
  realisasi_accum: 'realisasiAccum',
  selisih_accum: 'selisihAccum',
  target_ngebut_hari_akumulasi: 'targetNgebutHariAkumulasi',
  progress_accum: 'progressAccum',
  status_final_akumulasi: 'statusFinalAkumulasi',
  // `benefit_per_pcs` sengaja TIDAK punya alias: kolomnya sudah tidak dipakai
  // (tarif benefit adalah milik desain, dari Register Harga). Membiarkannya
  // ber-alias `benefitRate` akan menyesatkan — seolah ada satu tarif per baris.
};

function normalizeTargetRow(row: TargetJahitRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const alias = TARGET_COLUMN_ALIAS[key];
    out[alias ?? key] = value;
  }
  return out;
}

// Column definition — mirrors viewConfig['target-jahit'] order.
interface ColDef { key: string; label: string; align?: 'right'; format?: 'currency' | 'percent'; badge?: boolean; inv?: boolean }
const TARGET_COLUMNS: ColDef[] = [
  { key: 'bulanTahun', label: 'Bulan Tahun' },
  { key: 'nama', label: 'Nama' },
  { key: 'posisi', label: 'Posisi', badge: true, inv: true },
  { key: 'sisaHari', label: 'Sisa Hari', align: 'right', inv: true },
  { key: 'targetDaily', label: 'Target | Daily', align: 'right' },
  { key: 'targetNgebutHari', label: 'Target Ngebut | Daily', align: 'right' },
  { key: 'targetMonthly', label: 'Target | Monthly', align: 'right' },
  { key: 'realisasiMonthly', label: 'Realisasi | Monthly', align: 'right', inv: true },
  { key: 'sisaTargetMonthly', label: 'Sisa Target | Monthly', align: 'right' },
  { key: 'progressMonthly', label: 'Progress | Monthly', align: 'right', format: 'percent', inv: true },
  { key: 'statusFinal', label: 'Status Final | Monthly', badge: true, inv: true },
  { key: 'targetCostPosisi', label: 'Target Cost / Posisi', align: 'right', format: 'currency' },
  { key: 'realisasiCostPosisi', label: 'Realisasi Cost / Posisi', align: 'right', format: 'currency' },
  { key: 'targetAccum', label: 'Target Akumulasi', align: 'right' },
  { key: 'realisasiAccum', label: 'Realisasi Akumulasi', align: 'right' },
  { key: 'selisihAccum', label: 'Selisih Akumulasi', align: 'right' },
  { key: 'targetNgebutHariAkumulasi', label: 'Target Ngebut | Akumulasi', align: 'right' },
  { key: 'progressAccum', label: 'Progress Akumulasi', align: 'right', format: 'percent' },
  { key: 'statusFinalAkumulasi', label: 'Status Final | Akumulasi', badge: true },
  { key: 'extraProduction', label: 'Extra Production', align: 'right' },
  { key: 'benefitAmount', label: 'Benefit Amount', align: 'right', format: 'currency' },
];

type TabKey = 'target' | 'belum-jahit' | 'utang-staf' | 'benefit';

// Ringkasan tarif per Product Note: nominal seragam, 'Bervariasi' bila
// tarif Work Order-nya berbeda atau sebagian tidak tersedia.
function formatRate(rate: SummaryRate): ReactNode {
  if (rate.kind === 'single') return formatCurrency(rate.value);
  if (rate.kind === 'varied') return 'Bervariasi';
  return <span className="text-gray-300">—</span>;
}

// Tarif eksak per Work Order; null bila Register PO-nya tidak punya komponen.
function formatRateValue(rate: number | null): ReactNode {
  return rate == null ? <span className="text-gray-300">—</span> : formatCurrency(rate);
}

interface DebtRow {
  nama: string;
  totalTargetCost: number;
  /** Realisasi Cost / Posisi — pengurang Target Cost (dulu "Total Nilai PCS"). */
  realisasiCost: number;
  utang: number;
}

interface BenefitRow {
  id: number;
  nama: string;
  bulan: string;
  targetMonthly: number;
  realisasiMonthly: number;
  extraProduction: number;
  benefitAmount: number;
}

function renderCell(col: ColDef, row: Record<string, unknown>) {
  const v = row[col.key];
  if (col.key === 'bulanTahun') {
    const s = String(v ?? '').trim();
    return s ? formatMonthYearFromYm(s) : <span className="text-gray-300">—</span>;
  }
  // Target Cost / Posisi = GAJI bulan itu. Bila gajinya belum diinput, kolomnya
  // menampilkan "—" plus badge penjelas — BUKAN "Rp 0", yang akan terbaca seolah
  // gajinya nol. `salaryAmount` yang membedakan keduanya; nilai `targetCostPosisi`
  // sendiri sudah dinolkan supaya hitungan uang di hilir tetap menerima angka.
  if (col.key === 'targetCostPosisi') {
    if (row.salaryAmount == null) {
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-gray-300">—</span>
          <span className={softBadgeClass('amber')}>Gaji belum diinput</span>
        </span>
      );
    }
    return formatCurrency(Number(v));
  }
  if (col.format === 'currency') return v == null || v === '' ? <span className="text-gray-300">—</span> : formatCurrency(Number(v));
  if (col.format === 'percent') return v == null || v === '' ? <span className="text-gray-300">—</span> : `${(Number(v) * 100).toFixed(1)}%`;
  if (col.key === 'targetDaily') {
    if (v == null || v === '') return <span className="text-gray-300">—</span>;
    const n = Number(v);
    return n % 1 === 0 ? String(n) : n.toFixed(1);
  }
  if (col.badge) {
    const s = String(v ?? '').trim();
    if (!s) return <span className="text-gray-300">—</span>;
    // Badge memakai token soft bersama (lihat `softBadgeClass`) supaya seragam
    // dengan tabel lain. Sebelumnya pill solid `rounded-full bg-*-100` dengan
    // padding `py-0.5` tanpa `leading-none` — bentuk dan tingginya berbeda dari
    // badge tabel acuan.
    let tone = 'slate';
    if (col.key === 'statusFinal' || col.key === 'statusFinalAkumulasi') {
      if (s === 'Tercapai') tone = 'emerald';
      else if (s === 'Tidak Tercapai') tone = 'rose';
      else tone = 'blue'; // 'Berjalan' (atau nilai lain)
    }
    return <span className={softBadgeClass(tone)}>{s}</span>;
  }
  return v == null || v === '' ? <span className="text-gray-300">—</span> : String(v);
}

export function TargetJahitPage() {
  const { profile } = useAuth();
  const canSeeDebt = profile.role === 'owner' || profile.role === 'finance';

  const [tab, setTab] = useState<TabKey>('target');

  // Target tab state.
  const [items, setItems] = useState<TargetJahitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  // Derived-columns source data (live compute — never written back to DB).
  const [libur, setLibur] = useState<string[]>([]);
  const [sewing, setSewing] = useState<SewingRecord[]>([]);
  const [details, setDetails] = useState<import('@/services/targetJahitDetail').TargetJahitDetailRow[]>([]);
  const [workOrderDesign, setWorkOrderDesign] = useState<Map<string, WorkOrderDesignIdentity>>(new Map());
  const [prices, setPrices] = useState<Record<string, { jahit: number; obras: number }>>({});
  /**
   * Pencarian gaji per (nama, bulan) — sumber nilai `Target Cost / Posisi`.
   *
   * Dimuat sekali bersama data lain, bukan per baris: satu kali lintas data.
   */
  const [salaries, setSalaries] = useState<SalaryLookup>(() => emptySalaryLookup());
  const [overlayId, setOverlayId] = useState<number | null>(null);

  // Belum Jahit state — backlog global lintas penjahit dan bulan.
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [sewingRateMap, setSewingRateMap] = useState<SewingRateByProductionOrder>(new Map());
  const [backlogError, setBacklogError] = useState<string | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [backlogSearch, setBacklogSearch] = useState('');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  // Utang Staf state.
  const [debtRows, setDebtRows] = useState<DebtRow[]>([]);
  const [debtLoading, setDebtLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [t, l, s, d, wo, pm, rates, sal] = await Promise.all([
      fetchAllTarget(), daftarLiburSvc.fetchAll(), sewingRecordSvc.fetchAll(),
      targetJahitDetailSvc.fetchAll(), workOrderSvc.fetchAll(), buildPriceMap(),
      fetchSewingRatesByProductionOrder(), expenseSvc.fetchSalaries(),
    ]);
    setItems(t.data ?? []);
    setLibur((l.data ?? []).map((r) => r.tanggal));
    setSewing(s.data ?? []);
    setDetails(d.data ?? []);
    // Gaji yang boleh dibaca pengguna ini (RLS yang menyaring) — dipakai sebagai
    // nilai `Target Cost / Posisi`. Kegagalannya tidak boleh menjatuhkan tab.
    setSalaries(buildSalaryLookup(sal.data ?? []));
    setWorkOrderDesign(new Map(
      (wo.data ?? []).map((w) => [
        w.id,
        {
          productNote: w.productNote || null,
          product: w.product,
          warna: w.warna || null,
        },
      ] as const),
    ));
    setPrices(pm);

    // Kegagalan backlog atau tarif tidak boleh menjatuhkan tab Target.
    const orderList = wo.data ?? [];
    setWorkOrders(orderList);
    setBacklogError(wo.error ? wo.error.message : null);
    setSewingRateMap(rates.data);
    setRateError(rates.error ? rates.error.message : null);

    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Live enrichment: all 22 columns computed from source data at render time
  // (workdays, realization from sewing_records, accumulation, status).
  const allEnriched = useMemo(
    () => enrichTargetRows(items, sewing, workOrderDesign, prices, details, libur, new Date(), salaries),
    [items, sewing, workOrderDesign, prices, details, libur, salaries],
  );

  // Realisasi Cost / Posisi per penjahit — DIAMBIL dari baris hasil enrichment
  // di atas, bukan dihitung ulang. Tab Utang Staf dan tab Target dengan demikian
  // membaca angka yang sama; dua tempat yang menghitung nilai yang sama adalah
  // cara paling mudah membuat keduanya berbeda diam-diam.
  const realisasiCostByStaff = useMemo(
    () => sumRealisasiCostByStaff(allEnriched),
    [allEnriched],
  );

  const loadDebt = useCallback(async () => {
    if (!canSeeDebt) return; // owner/finance only — never query debt for other roles
    setDebtLoading(true);
    try {
      // Penjahit names: register_penjahit first, fall back to distinct nama in target_jahit.
      const { data: registerRows } = await fetchAllRegister();
      let names: string[] = [];
      if (registerRows && registerRows.length > 0) {
        names = registerRows.map((r: RegisterPenjahitRow) => r.picPenjahit);
      } else {
        names = Array.from(new Set(items.map((r) => r.nama).filter(Boolean))) as string[];
      }

      const results = await Promise.all(
        names.map((n) => computeDebt(n, realisasiCostByStaff.get(n.trim()) ?? 0)),
      );
      const combined: DebtRow[] = names.map((nama, i) => {
        const d: DebtSummary = results[i];
        return {
          nama,
          totalTargetCost: d.totalTargetCost,
          realisasiCost: d.realisasiCost,
          utang: d.utang,
        };
      });
      setDebtRows(combined);
    } finally {
      setDebtLoading(false);
    }
  }, [canSeeDebt, items, realisasiCostByStaff]);

  useEffect(() => {
    if (canSeeDebt && tab === 'utang-staf') {
      loadDebt();
    }
  }, [tab, canSeeDebt, loadDebt]);

  // Backlog jahit global (baca-saja): seluruh Work Order yang masih punya sisa
  // jahit, dikelompokkan per Product Note. Dihitung murni di helper.
  const backlogGroups = useMemo(
    () => buildSewingBacklog(workOrders, sewing, sewingRateMap),
    [workOrders, sewing, sewingRateMap],
  );

  const visibleBacklogGroups = useMemo(() => {
    const q = backlogSearch.trim().toLowerCase();
    if (!q) return backlogGroups;
    return backlogGroups.filter((g) => g.searchText.includes(q));
  }, [backlogGroups, backlogSearch]);

  // The shared grid keys rows by `row.id` (`getRowId`), while a backlog group
  // is keyed by its own `key` ("note:<product note>"). Copying it across as
  // `id` keeps one identity for the grid, the expansion set, and the detail
  // lookup — instead of three maps that could drift apart.
  const backlogRows = useMemo(
    () => visibleBacklogGroups.map((g) => ({ ...g, id: g.key })),
    [visibleBacklogGroups],
  );

  const enriched = useMemo(() => {
    if (!search) return allEnriched;
    const q = search.toLowerCase();
    return allEnriched.filter((d) =>
      [
        d.bulan_tahun,
        d.nama,
        d.posisi ?? '',
        d.statusFinal,
        d.statusFinalAkumulasi,
      ].some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [allEnriched, search]);

  const visibleDebtRows = useMemo(
    () => filterDebtRowsByLatestAccum(debtRows, allEnriched),
    [debtRows, allEnriched],
  );

  // The grid keys rows by `row.id` (`getRowId`); a debt row is identified by
  // the staff name, so it is copied across as `id`.
  const debtGridRows = useMemo(
    () => visibleDebtRows.map((r) => ({ ...r, id: r.nama })),
    [visibleDebtRows],
  );

  // Kolom tab "Utang Staf".
  const debtColumns = useMemo(
    () => [
      { key: 'nama', label: 'Nama', width: '180px' },
      {
        key: 'totalTargetCost',
        label: 'Target Cost',
        width: '140px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="tabular-nums text-gray-700">{formatCurrency(Number(row.totalTargetCost))}</span>
        ),
      },
      {
        key: 'realisasiCost',
        label: 'Realisasi Cost / Posisi',
        width: '160px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="tabular-nums text-gray-700">{formatCurrency(Number(row.realisasiCost))}</span>
        ),
      },
      {
        key: 'utang',
        label: 'Utang',
        width: '140px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="font-semibold text-rose-600 tabular-nums">{formatCurrency(Number(row.utang))}</span>
        ),
      },
    ],
    [],
  );

  // Kolom tab "Benefit".
  const benefitColumns = useMemo(
    () => [
      { key: 'nama', label: 'Nama', width: '170px' },
      {
        key: 'bulan',
        label: 'Bulan',
        width: '130px',
        render: (row: Record<string, unknown>) => {
          const bulan = String(row.bulan ?? '').trim();
          return bulan ? formatMonthYearFromYm(bulan) : <span className="text-gray-300">—</span>;
        },
      },
      {
        key: 'targetMonthly',
        label: 'Target | Monthly',
        width: '120px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => <span className="tabular-nums text-gray-700">{String(row.targetMonthly)}</span>,
      },
      {
        key: 'realisasiMonthly',
        label: 'Realisasi | Monthly',
        width: '130px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => <span className="tabular-nums text-gray-700">{String(row.realisasiMonthly)}</span>,
      },
      {
        key: 'extraProduction',
        label: 'Extra Production',
        width: '130px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="font-semibold text-emerald-600 tabular-nums">+{String(row.extraProduction)}</span>
        ),
      },
      {
        key: 'benefitAmount',
        label: 'Benefit Amount',
        width: '140px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="tabular-nums text-gray-700">{formatCurrency(Number(row.benefitAmount))}</span>
        ),
      },
    ],
    [],
  );

  const normalized = useMemo(
    () => applySorts(applyFilters(enriched.map((r) => normalizeTargetRow(r)), filters), sorts),
    [enriched, filters, sorts],
  );

  // Access matrix (spec): inventory may see production data but NOT target/cost
  // or akumulasi columns. Owner/finance see everything.
  const roleColumns = useMemo(
    () => (canSeeDebt ? TARGET_COLUMNS : TARGET_COLUMNS.filter((c) => c.inv)),
    [canSeeDebt],
  );

  // Hide/show kolom + freeze (persist per tabel).
  //
  // `roleColumns.map(...)` sebagai urutan kolom: dipakai hook untuk merapikan
  // daftar beku menjadi awalan yang rapat, karena mesin pinning mengangkat
  // kolom yang di-pin ke depan mengikuti urutan itu — daftar yang berlubang
  // akan mengubah urutan kolom di layar.
  const roleColumnKeys = useMemo(() => roleColumns.map((c) => c.key), [roleColumns]);
  const { hidden: hiddenCols, toggle: toggleCol, frozen: frozenCols, toggleFreeze: toggleFreezeCol, toggleFreezeAll: toggleFreezeAllCols, headerFrozen, setHeaderFrozen } = useColumnSettings('target-jahit', roleColumnKeys);
  const visibleColumns = useMemo(
    () => roleColumns.filter((c) => !hiddenCols.has(c.key)),
    [roleColumns, hiddenCols],
  );

  // Bentuk kolom untuk DataTable (variant "plain") — sama seperti tabel lain di
  // aplikasi. Sel yang butuh badge, format mata uang/persen, atau editor
  // benefit memakai `render` supaya tabel bersama tidak perlu tahu soal bentuk
  // target jahit.
  //
  // Lebar di sini nominal saja: tabel bersama dipakai tanpa `columnsResizable`,
  // jadi lebarnya `table-auto` dan kolomnya menyerap lebar halaman sendiri.
  // Kolom tabel target memakai bentuk yang sama dengan tabel lain di aplikasi.
  // Tidak ada lagi editor `benefitRate` inline: tarif benefit adalah milik
  // DESAIN (dari Register Harga), bukan milik penjahit+bulan, jadi tidak bisa
  // diwakili satu angka per baris.
  const targetColumns = useMemo(
    () => visibleColumns.map((c) => ({
      key: c.key,
      label: c.label,
      width: '130px',
      align: c.align === 'right' ? ('right' as const) : undefined,
      render: (row: Record<string, unknown>) => renderCell(c, row),
    })),
    [visibleColumns],
  );

  // Kolom tab "Belum Jahit" — tabel pohon: satu baris per Product Note, dan
  // rincian Work Order-nya dirender lewat `expandedRow` (bukan tabel bersarang),
  // supaya bentuknya sama dengan tabel lain. Kolom chevron paling kiri tetap
  // ada sebagai penanda buka/tutup.
  const backlogColumns = useMemo(
    () => [
      {
        key: 'toggle',
        label: '',
        width: '32px',
        align: 'center' as const,
        render: (row: Record<string, unknown>) => {
          const open = expandedNotes.has(String(row.key));
          return (
            <span className="text-slate-400">
              {open
                ? <ChevronDown className="w-3.5 h-3.5 inline-block" />
                : <ChevronRight className="w-3.5 h-3.5 inline-block" />}
            </span>
          );
        },
      },
      {
        key: 'productNote',
        label: 'Product Note',
        width: '160px',
        render: (row: Record<string, unknown>) => {
          const note = String(row.productNote ?? '').trim();
          return note ? note : <span className="text-gray-300">—</span>;
        },
      },
      { key: 'productLabel', label: 'Product', width: '160px' },
      { key: 'totalQtyOrder', label: 'Total Qty Order', width: '110px', align: 'right' as const },
      { key: 'totalQtyJahit', label: 'Qty Jahit', width: '90px', align: 'right' as const },
      {
        key: 'totalBelumJahit',
        label: 'Total Belum Jahit',
        width: '120px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="font-semibold text-rose-600 tabular-nums">{String(row.totalBelumJahit)}</span>
        ),
      },
      {
        key: 'rate',
        label: 'Tarif Jahit + Obras',
        width: '130px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="tabular-nums text-gray-700">{formatRate(row.rate as SummaryRate)}</span>
        ),
      },
    ],
    [expandedNotes],
  );

  // Kolom rincian Work Order di dalam panel terbuka tab "Belum Jahit".
  const backlogDetailColumns = useMemo(
    () => [
      { key: 'workCode', label: 'Work Code', width: '150px' },
      { key: 'product', label: 'Product', width: '160px' },
      {
        key: 'warna',
        label: 'Warna',
        width: '110px',
        render: (row: Record<string, unknown>) => {
          const w = String(row.warna ?? '').trim();
          return w ? w : <span className="text-gray-300">—</span>;
        },
      },
      {
        key: 'size',
        label: 'Size',
        width: '80px',
        render: (row: Record<string, unknown>) => {
          const s = String(row.size ?? '').trim();
          return s ? s : <span className="text-gray-300">—</span>;
        },
      },
      {
        key: 'qtyOrder',
        label: 'Qty Order',
        width: '90px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => <span className="tabular-nums text-gray-700">{String(row.qtyOrder)}</span>,
      },
      {
        key: 'qtyJahit',
        label: 'Qty Jahit',
        width: '90px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => <span className="tabular-nums text-gray-700">{String(row.qtyJahit)}</span>,
      },
      {
        key: 'totalBelumJahit',
        label: 'Total Belum Jahit',
        width: '120px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="font-semibold text-rose-600 tabular-nums">{String(row.totalBelumJahit)}</span>
        ),
      },
      {
        key: 'rate',
        label: 'Tarif Jahit + Obras',
        width: '130px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="tabular-nums text-gray-700">{formatRateValue(row.rate as number | null)}</span>
        ),
      },
    ],
    [],
  );

  // Kolom ringkasan backlog di dalam dialog detail (5 teratas, baca-saja).
  const backlogSummaryColumns = useMemo(
    () => [
      {
        key: 'productNote',
        label: 'Product Note',
        width: '160px',
        render: (row: Record<string, unknown>) => {
          const note = String(row.productNote ?? '').trim();
          return note ? note : <span className="text-gray-300">—</span>;
        },
      },
      { key: 'productLabel', label: 'Product', width: '160px' },
      {
        key: 'totalBelumJahit',
        label: 'Total Belum Jahit',
        width: '120px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="font-semibold text-rose-600 tabular-nums">{String(row.totalBelumJahit)}</span>
        ),
      },
      {
        key: 'rate',
        label: 'Tarif Jahit + Obras',
        width: '130px',
        align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="tabular-nums text-gray-700">{formatRate(row.rate as SummaryRate)}</span>
        ),
      },
    ],
    [],
  );

  // Benefit tab: rows with a surplus on at least one design (extraProduction > 0).
  // The per-design rate is deliberately NOT a column here — it differs by
  // production code, so it lives in the detail popup instead.
  const benefitRows = useMemo<BenefitRow[]>(() => {
    if (!canSeeDebt) return [];
    return enriched
      .filter((r) => r.extraProduction > 0)
      .map((r) => ({
        id: r.id,
        nama: r.nama,
        bulan: r.bulan_tahun,
        targetMonthly: r.target_monthly,
        realisasiMonthly: r.realisasiMonthly,
        extraProduction: r.extraProduction,
        benefitAmount: r.benefitAmount,
      }))
      .sort((a, b) => (b.bulan || '').localeCompare(a.bulan || '') || a.nama.localeCompare(b.nama));
  }, [enriched, canSeeDebt]);

  // Edit benefit rate inline dihapus: tarif benefit adalah milik DESAIN (dari
  // Register Harga), bukan satu angka per penjahit+bulan. Rinciannya ada di
  // popup detail.

  // Multi-select + toolbar (same pattern as Production Monitoring RAW DATA).
  const handleToggleRow = (id: number) => setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // "Pilih semua" kini milik grid: ia men-toggle seluruh baris yang tampil dan
  // memutar selisihnya lewat `handleToggleRow`, jadi tidak ada checkbox header
  // manual di sini lagi.
  const handleImport = () => { if (selectedRows.size === 0) { alert('Pilih minimal 1!'); return; } alert(`✅ ${selectedRows.size} target di-import`); setSelectedRows(new Set()); };
  const handleExport = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = visibleColumns.map((c) => c.label);
    const lines = normalized.map((r) => visibleColumns.map((c) => {
      const v = r[c.key];
      return c.format === 'percent' && v != null && v !== '' ? `${v}%` : (v as string | number | null | undefined);
    }).map(esc).join(','));
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n'); // BOM for Excel UTF-8
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `target-jahit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    if (!confirm(`Hapus ${selectedRows.size} target jahit terpilih?`)) return;
    let deleted = 0;
    for (const id of selectedRows) {
      const { error } = await removeTarget(Number(id));
      if (!error) deleted++;
    }
    setItems(prev => prev.filter(r => !selectedRows.has(Number(r.id))));
    setSelectedRows(new Set());
    setMessage(`✅ ${deleted} target berhasil dihapus!`);
    setTimeout(() => setMessage(null), 3000);
  };

  if (loading && tab !== 'belum-jahit') {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Target Jahit...</p>
      </main>
    );
  }

  // Baris yang dibuka di overlay detail. Dihitung sebelum render supaya dialog
  // hanya benar-benar terbuka bila barisnya ada — kalau tidak, `open` tetap
  // false dan tidak muncul dialog kosong tanpa judul.
  const overlayRow = overlayId != null ? enriched.find((r) => r.id === overlayId) ?? null : null;

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="px-6 pt-3 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Target Jahit</h1>
          </div>
          <div className="flex items-center gap-2.5">
            {tab === 'target' && (
              <button onClick={refresh} className="h-8 px-3.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200 transition-all flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            )}
          </div>
        </div>
        {message && <div className="mb-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[12px] text-blue-700">{message}</div>}

        {/* Tabs — segmented control, pola Production Monitoring */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('target')}
            className={cn(
              'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors',
              tab === 'target' ? 'bg-primary text-white shadow-md shadow-slate-300' : 'bg-white text-slate-600 border border-gray-200 hover:bg-slate-50 hover:text-blue-700',
            )}
          >
            Target
          </button>
          <button
            onClick={() => setTab('belum-jahit')}
            className={cn(
              'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors',
              tab === 'belum-jahit' ? 'bg-primary text-white shadow-md shadow-slate-300' : 'bg-white text-slate-600 border border-gray-200 hover:bg-slate-50 hover:text-blue-700',
            )}
          >
            Belum Jahit
          </button>
          {canSeeDebt ? (
            <button
              onClick={() => setTab('utang-staf')}
              className={cn(
                'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors',
                tab === 'utang-staf' ? 'bg-primary text-white shadow-md shadow-slate-300' : 'bg-white text-slate-600 border border-gray-200 hover:bg-slate-50 hover:text-blue-700',
              )}
            >
              Utang Staf
            </button>
          ) : (
            <button
              disabled
              title="Hanya owner/finance yang dapat melihat."
              className="h-8 px-4 text-[12px] font-medium rounded-lg bg-slate-50 text-slate-400 border border-gray-200 cursor-not-allowed"
            >
              Utang Staf 🔒
            </button>
          )}
          {canSeeDebt ? (
            <button
              onClick={() => setTab('benefit')}
              className={cn(
                'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors',
                tab === 'benefit' ? 'bg-primary text-white shadow-md shadow-slate-300' : 'bg-white text-slate-600 border border-gray-200 hover:bg-slate-50 hover:text-blue-700',
              )}
            >
              Benefit
            </button>
          ) : (
            <button
              disabled
              title="Hanya owner/finance yang dapat melihat."
              className="h-8 px-4 text-[12px] font-medium rounded-lg bg-slate-50 text-slate-400 border border-gray-200 cursor-not-allowed"
            >
              Benefit 🔒
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 px-6 pt-4 pb-5 overflow-auto">
        {tab === 'target' && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari target..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <FilterButton fields={visibleColumns.map((c) => ({ key: c.key, label: c.label })) as FieldOption[]} value={filters} onChange={setFilters} />
              <SortButton fields={visibleColumns.map((c) => ({ key: c.key, label: c.label })) as FieldOption[]} value={sorts} onChange={setSorts} />
              <ColumnSettingsButton fields={roleColumns.map((c) => ({ key: c.key, label: c.label }))} hidden={hiddenCols} onToggle={toggleCol} frozen={frozenCols} onToggleFreeze={toggleFreezeCol} onToggleFreezeAll={toggleFreezeAllCols} headerFrozen={headerFrozen} onToggleHeaderFrozen={setHeaderFrozen} />
              <ExportButton onClick={handleExport} />
              <button onClick={handleImport} className={cn('h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium transition-colors', selectedRows.size > 0 ? 'bg-primary text-white hover:bg-primary/90' : 'border border-gray-200 text-slate-400')}>📥 Import ({selectedRows.size})</button>
              {selectedRows.size > 0 && (
                <button onClick={handleBulkDelete} className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
                  <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
                </button>
              )}
              <span className="text-[11px] text-slate-400 ml-auto">{normalized.length} target jahit</span>
            </div>

            <div className={T_WRAP}>
              <DataTable
                variant="plain"
                columns={targetColumns}
                data={normalized as unknown as Record<string, unknown>[]}
                selectedRows={selectedRows}
                onToggleRow={handleToggleRow}
                onRowClick={(row) => setOverlayId(Number(row.id))}
                hiddenColumns={hiddenCols}
                frozenColumns={frozenCols}
                headerFrozen={headerFrozen}
                emptyMessage={
                  <div className="py-10 text-center text-[13px] text-gray-400">
                    {enriched.length === 0 ? 'Belum ada target jahit' : 'Tidak ada hasil yang cocok dengan filter'}
                  </div>
                }
              />
            </div>
          </>
        )}

        {tab === 'belum-jahit' && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari product note, work code, warna, size..."
                  value={backlogSearch}
                  onChange={(e) => setBacklogSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <button onClick={refresh} className={cn(T_TOOLBAR_BTN, T_TOOLBAR_BTN_IDLE)}>
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
              <span className="text-[11px] text-slate-400 ml-auto">{visibleBacklogGroups.length} product note belum jahit</span>
            </div>

            {rateError && (
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-700">
                Tarif Jahit + Obras belum dapat dimuat. Daftar backlog tetap ditampilkan dengan tarif “—”.
              </div>
            )}

            {backlogError ? (
              <div className="py-10 text-center">
                <p className="text-[13px] text-rose-600 mb-3">Gagal memuat data Work Order: {backlogError}</p>
                <button onClick={refresh} className={cn(T_TOOLBAR_BTN, T_TOOLBAR_BTN_IDLE)}>
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
            ) : backlogGroups.length === 0 ? (
              <p className="text-slate-400 text-sm">Semua Work Order sudah selesai dijahit.</p>
            ) : visibleBacklogGroups.length === 0 ? (
              <p className="text-slate-400 text-sm">Tidak ada hasil yang cocok dengan pencarian.</p>
            ) : (
              <div className={T_WRAP}>
                <DataTable
                  variant="plain"
                  columns={backlogColumns}
                  data={backlogRows as unknown as Record<string, unknown>[]}
                  onRowClick={(row) => {
                    const key = String(row.key);
                    setExpandedNotes(prev => {
                      const n = new Set(prev);
                      if (n.has(key)) n.delete(key); else n.add(key);
                      return n;
                    });
                  }}
                  isRowExpanded={(row) => expandedNotes.has(String(row.key))}
                  expandedRow={(row) => {
                    const g = backlogRows.find((x) => x.key === String(row.key));
                    if (!g) return null;
                    return (
                      <DataTable
                        variant="plain"
                        columns={backlogDetailColumns}
                        data={g.workOrders as unknown as Record<string, unknown>[]}
                      />
                    );
                  }}
                  emptyMessage={
                    <div className="py-10 text-center text-[13px] text-gray-400">
                      Tidak ada hasil yang cocok dengan pencarian.
                    </div>
                  }
                />
              </div>
            )}
          </>
        )}

        {tab === 'utang-staf' && (
          <>
            {debtLoading ? (
              <p className="text-slate-400 text-sm">Menghitung utang staf...</p>
            ) : visibleDebtRows.length === 0 ? (
              <p className="text-slate-400 text-sm">
                {debtRows.length === 0 ? 'Belum ada data utang staf.' : '🎉 Tidak ada staf dengan kekurangan target akumulasi dan utang jahit.'}
              </p>
            ) : (
              <div className={T_WRAP}>
                <DataTable
                  variant="plain"
                  columns={debtColumns}
                  data={debtGridRows as unknown as Record<string, unknown>[]}
                  emptyMessage={
                    <div className="py-10 text-center text-[13px] text-gray-400">
                      Belum ada data utang staf.
                    </div>
                  }
                />
              </div>
            )}
          </>
        )}

        {tab === 'benefit' && (
          <>
            {benefitRows.length === 0 ? (
              <p className="text-slate-400 text-sm">Belum ada staf yang produksinya melebihi target.</p>
            ) : (
              <div className={T_WRAP}>
                <DataTable
                  variant="plain"
                  columns={benefitColumns}
                  data={benefitRows as unknown as Record<string, unknown>[]}
                  onRowClick={(row) => setOverlayId(Number(row.id))}
                  emptyMessage={
                    <div className="py-10 text-center text-[13px] text-gray-400">
                      Belum ada staf yang produksinya melebihi target.
                    </div>
                  }
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ===== Full-screen detail overlay (pola Kanban card detail) ===== */}
      <Dialog
        open={overlayRow !== null}
        onOpenChange={(open) => { if (!open) setOverlayId(null); }}
      >
        {/* `sm:max-w-none` wajib: DialogContent bawaan shadcn memasang
            `sm:max-w-lg` (512px), yang di CSS hasil build justru muncul
            SETELAH `max-w-none` — jadi tanpa awalan `sm:` lebarnya akan tetap
            terjepit 512px di layar ≥640px. */}
        <DialogContent className="flex h-[min(86vh,900px)] w-[min(960px,96vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        {(() => {
        const src = overlayRow;
        if (!src) return null;
        const myDetails = details.filter((d) => d.targetJahitId === src.id);
        const enrichedD = enrichDetails(myDetails, sewing, src.nama, src.bulan_tahun, workOrderDesign);
        // Benefit dihitung PER DESAIN (tarif beda-beda per kode produksi), dan
        // hanya untuk owner/finance — sama seperti kolom biaya lainnya.
        const designBenefits = canSeeDebt
          ? calculateDesignBenefits(myDetails, enrichedD.map((e) => e.qtyRealisasi), prices)
          : [];
        const totalBenefit = designBenefits.reduce((sum, b) => sum + b.benefitAmount, 0);
        // The grid reads the realized qty and value from the enriched row, so
        // both are merged onto the raw detail row here — the cell renderers
        // stay free of index lookups into a parallel array.
        const detailGridRows = myDetails.map((d, di) => ({
          ...d,
          qtyRealisasi: enrichedD[di]?.qtyRealisasi ?? 0,
          nilai: enrichedD[di]?.nilai ?? 0,
          extraProduction: designBenefits[di]?.extraProduction ?? 0,
          benefitRate: designBenefits[di]?.benefitRate ?? 0,
          benefitAmount: designBenefits[di]?.benefitAmount ?? 0,
        }));
        const progressPct = src.progressMonthly * 100;
        // Sisa Uang bersifat bulanan dan hanya untuk owner/finance (role gating
        // dilakukan di render, bukan sekadar disembunyikan).
        const remainingMoney = canSeeDebt
          ? calculateMonthlyRemainingMoney(src.target_cost_posisi, src.realisasiCostPosisi)
          : null;
        return (
          <>
              {/* pr-12 memberi ruang bagi tombol tutup bawaan DialogContent. */}
              <DialogHeader className="shrink-0 border-b border-gray-100 px-6 py-4 pr-12">
                <DialogTitle className="flex items-center gap-3">
                  <span className="truncate text-[15px] font-bold text-slate-900">{src.nama}</span>
                  <span className="text-[12px] font-normal text-slate-400">{formatMonthYearFromYm(src.bulan_tahun)}</span>
                  {src.posisi && <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap bg-slate-100 text-slate-600">{src.posisi}</span>}
                </DialogTitle>
              </DialogHeader>

              {/* min-h-0 perlu agar badan benar-benar menyusut dan scroll,
                  bukan mendorong tinggi dialog melebihi batasnya. */}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {/* Stat cards */}
                <div className={cn('grid gap-3 mb-5', canSeeDebt
                  ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
                  : 'grid-cols-2 md:grid-cols-4')}>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Target Bulanan</p>
                    <p className="text-[15px] font-semibold text-slate-800 mt-0.5 tabular-nums">{src.target_monthly} pcs</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Realisasi</p>
                    <p className="text-[15px] font-semibold text-slate-800 mt-0.5 tabular-nums">{src.realisasiMonthly} pcs</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Sisa Target</p>
                    <p className="text-[15px] font-semibold text-slate-800 mt-0.5 tabular-nums">{src.sisaTargetMonthly} pcs</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Status</p>
                    <p className="mt-0.5">
                      <span className={cn('inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap', src.statusFinal === 'Tercapai' ? 'bg-emerald-100 text-emerald-700' : src.statusFinal === 'Tidak Tercapai' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700')}>{src.statusFinal}</span>
                    </p>
                  </div>
                  {remainingMoney != null && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                      <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider">Sisa Uang yang Harus Dikejar</p>
                      <p className="text-[15px] font-semibold text-amber-800 mt-0.5 tabular-nums">{formatCurrency(remainingMoney)}</p>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[12px] font-bold text-slate-700">Progress Bulanan</p>
                    <p className="text-[12px] font-semibold text-slate-600 tabular-nums">{progressPct.toFixed(1)}%</p>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', progressPct >= 100 ? 'bg-emerald-500' : 'bg-slate-400')} style={{ width: `${Math.min(progressPct, 100)}%` }} />
                  </div>
                </div>

                {/* Per-design realization */}
                <h3 className="text-[12px] font-bold text-slate-700 mb-2">Rincian Realisasi per Desain</h3>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  {myDetails.length === 0 ? (
                    <p className="text-[13px] text-slate-400 py-8 text-center">Tidak ada rincian desain untuk bulan ini.</p>
                  ) : (
                    <DataTable
                      variant="plain"
                      columns={[
                        {
                          key: 'productNote',
                          label: 'Product Note',
                          width: '150px',
                          render: (row: Record<string, unknown>) => {
                            const note = String(row.productNote ?? '').trim();
                            return note ? note : <span className="text-gray-300">—</span>;
                          },
                        },
                        { key: 'product', label: 'Product', width: '150px' },
                        {
                          key: 'warna',
                          label: 'Warna',
                          width: '110px',
                          render: (row: Record<string, unknown>) => {
                            const w = String(row.warna ?? '').trim();
                            return w ? w : <span className="text-gray-300">—</span>;
                          },
                        },
                        {
                          key: 'qtyTarget',
                          label: 'Qty Target',
                          width: '90px',
                          align: 'right' as const,
                          render: (row: Record<string, unknown>) => <span className="tabular-nums text-gray-700">{String(row.qtyTarget)}</span>,
                        },
                        {
                          key: 'qtyRealisasi',
                          label: 'Qty Realisasi',
                          width: '110px',
                          align: 'right' as const,
                          render: (row: Record<string, unknown>) => <span className="tabular-nums text-gray-700">{String(row.qtyRealisasi)}</span>,
                        },
                        {
                          key: 'progress',
                          label: 'Progress',
                          width: '90px',
                          align: 'center' as const,
                          render: (row: Record<string, unknown>) => {
                            const qty = Number(row.qtyRealisasi) || 0;
                            const target = Number(row.qtyTarget) || 0;
                            const pct = target > 0 ? (qty / target) * 100 : 0;
                            // Token soft bersama supaya badge di sini sama
                            // bentuknya dengan badge tabel lain (pill solid
                            // lama punya tinggi dan padding berbeda).
                            const tone = pct >= 100 ? 'emerald' : qty > 0 ? 'blue' : 'slate';
                            return <span className={softBadgeClass(tone)}>{pct.toFixed(0)}%</span>;
                          },
                        },
                        ...(canSeeDebt ? [
                          {
                            key: 'hargaJahitObras',
                            label: 'Harga Jahit+Obras',
                            width: '130px',
                            align: 'right' as const,
                            render: (row: Record<string, unknown>) => (
                              <span className="tabular-nums text-gray-700">
                                {formatCurrency(Number(row.hargaJahit) + Number(row.hargaObras))}
                              </span>
                            ),
                          },
                          {
                            key: 'nilai',
                            label: 'Nilai Realisasi',
                            width: '130px',
                            align: 'right' as const,
                            render: (row: Record<string, unknown>) => (
                              <span className="tabular-nums text-gray-700">{formatCurrency(Number(row.nilai))}</span>
                            ),
                          },
                          // Benefit per desain. Tarifnya sengaja di sini, bukan di
                          // tabel utama: tiap kode produksi punya tarif sendiri,
                          // jadi satu kolom di tabel utama tidak bisa mewakilinya.
                          {
                            key: 'extraProduction',
                            label: 'Extra Production',
                            width: '120px',
                            align: 'right' as const,
                            render: (row: Record<string, unknown>) => {
                              const extra = Number(row.extraProduction) || 0;
                              return extra > 0
                                ? <span className="font-semibold text-emerald-600 tabular-nums">+{extra}</span>
                                : <span className="text-gray-300">—</span>;
                            },
                          },
                          {
                            key: 'benefitRate',
                            label: 'Benefit Rate /Pcs',
                            width: '130px',
                            align: 'right' as const,
                            render: (row: Record<string, unknown>) => (
                              <span className="tabular-nums text-gray-700">{formatCurrency(Number(row.benefitRate))}</span>
                            ),
                          },
                          {
                            key: 'benefitAmount',
                            label: 'Benefit',
                            width: '120px',
                            align: 'right' as const,
                            render: (row: Record<string, unknown>) => {
                              const amount = Number(row.benefitAmount) || 0;
                              return amount > 0
                                ? <span className="font-semibold tabular-nums text-gray-900">{formatCurrency(amount)}</span>
                                : <span className="text-gray-300">—</span>;
                            },
                          },
                        ] : []),
                      ]}
                      data={detailGridRows as unknown as Record<string, unknown>[]}
                      footer={canSeeDebt && myDetails.length > 0 ? (
                        <tr className="border-t-2 border-[#D1D5DB] bg-[#F9FAFB]">
                          <td className={cn(T_TD, 'text-[12px] font-semibold text-[#4B5563]')} colSpan={10}>
                            Total Benefit
                          </td>
                          <td className={cn(T_TD, 'text-right text-[12px] font-semibold tabular-nums text-gray-900')}>
                            {formatCurrency(totalBenefit)}
                          </td>
                        </tr>
                      ) : undefined}
                    />
                  )}
                </div>

                {/* Ringkasan backlog global — baca-saja, dibatasi 5 teratas */}
                <h3 className="text-[12px] font-bold text-slate-700 mt-6 mb-2">Product Note Belum Jahit</h3>
                {backlogGroups.length === 0 ? (
                  <p className="text-[13px] text-slate-400 py-6 text-center border border-gray-200 rounded-lg">Semua Work Order sudah selesai dijahit.</p>
                ) : (
                  <>
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <DataTable
                        variant="plain"
                        columns={backlogSummaryColumns}
                        data={backlogGroups.slice(0, 5) as unknown as Record<string, unknown>[]}
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => { setOverlayId(null); setTab('belum-jahit'); }}
                      className="mt-3 h-8 border-slate-200 bg-slate-50 px-3 text-[12px] font-medium text-blue-700 hover:bg-slate-100"
                    >
                      Lihat Semua Belum Jahit
                    </Button>
                  </>
                )}
              </div>
          </>
        );
      })()}
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default TargetJahitPage;
