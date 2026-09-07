import { Fragment, useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { formatMonthYearFromYm } from '@/lib/monthYear';
import { T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, T_TOOLBAR_BTN, T_TOOLBAR_BTN_IDLE, rowClass } from '@/lib/tableStyles';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton } from '@/components/Table/ColumnSettings';
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import { fetchAll as fetchAllTarget, update as updateTarget, remove as removeTarget, type TargetJahitRow } from '@/services/targetJahit';
import { buildPriceMap } from '@/services/staffDebt';
import * as daftarLiburSvc from '@/services/daftarLibur';
import * as sewingRecordSvc from '@/services/sewingRecords';
import * as workOrderSvc from '@/services/workOrders';
import * as targetJahitDetailSvc from '@/services/targetJahitDetail';
import { enrichTargetRows, enrichDetails } from '@/lib/targetCompute';
import {
  buildSewingBacklog,
  calculateMonthlyRemainingMoney,
  type SummaryRate,
  type SummaryValue,
} from '@/lib/sewingBacklog';
import { fetchSewingRatesByProductionOrder, type SewingRateByProductionOrder } from '@/services/productionOrderPrices';
import type { WorkOrderDesignIdentity } from '@/lib/targetDetailIdentity';
import {
  filterDebtRowsByLatestAccum,
  computeDebtFromRows,
} from '@/lib/staffDebtEligibility';
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
  benefit_per_pcs: 'benefitRate',
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
  { key: 'sisaUangMonthly', label: 'Sisa Uang | Monthly', align: 'right', format: 'currency', inv: true },
  { key: 'targetCostAccum', label: 'Target Cost Akumulasi', align: 'right', format: 'currency' },
  { key: 'realisasiCostAccum', label: 'Realisasi Cost Akumulasi', align: 'right', format: 'currency' },
  { key: 'selisihCostAccum', label: 'Selisih Cost Akumulasi', align: 'right', format: 'currency' },
  { key: 'sisaUangAccum', label: 'Sisa Uang | Akumulasi', align: 'right', format: 'currency', inv: true },
  { key: 'progressCostAccum', label: 'Progress Biaya Akumulasi', align: 'right', format: 'percent' },
  { key: 'statusFinalCostAccum', label: 'Status Biaya | Akumulasi', badge: true },
  { key: 'benefitRate', label: 'Benefit Rate /Pcs', align: 'right', format: 'currency' },
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

// Nilai Rupiah backlog: jumlahkan bila seluruh Work Order bertarif,
// 'Bervariasi' bila sebagian tarif tidak tersedia, '—' bila tidak ada tarif.
function formatValue(value: SummaryValue): ReactNode {
  if (value.kind === 'single') return formatCurrency(value.value);
  if (value.kind === 'varied') return 'Bervariasi';
  return <span className="text-gray-300">—</span>;
}

interface DebtRow {
  nama: string;
  totalTargetCost: number;
  totalRealisasiCost: number;
  utang: number;
}

interface BenefitRow {
  id: number;
  nama: string;
  bulan: string;
  targetMonthly: number;
  realisasiMonthly: number;
  extraProduction: number;
  benefitRate: number | null;
  benefitAmount: number;
}

function renderCell(col: ColDef, row: Record<string, unknown>) {
  const v = row[col.key];
  if (col.key === 'bulanTahun') {
    const s = String(v ?? '').trim();
    return s ? formatMonthYearFromYm(s) : <span className="text-gray-300">—</span>;
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
    let cls = 'bg-slate-100 text-slate-600';
    if (col.key === 'statusFinal' || col.key === 'statusFinalCostAccum') {
      if (s === 'Tercapai') cls = 'bg-emerald-100 text-emerald-700';
      else if (s === 'Tidak Tercapai') cls = 'bg-rose-100 text-rose-700';
      else cls = 'bg-blue-100 text-blue-700'; // 'Berjalan' (atau nilai lain)
    }
    return (
      <span className={cn('inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap', cls)}>
        {s}
      </span>
    );
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
  const [editingBenefitId, setEditingBenefitId] = useState<number | null>(null);
  const [benefitDraft, setBenefitDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Derived-columns source data (live compute — never written back to DB).
  const [libur, setLibur] = useState<string[]>([]);
  const [sewing, setSewing] = useState<SewingRecord[]>([]);
  const [details, setDetails] = useState<import('@/services/targetJahitDetail').TargetJahitDetailRow[]>([]);
  const [workOrderDesign, setWorkOrderDesign] = useState<Map<string, WorkOrderDesignIdentity>>(new Map());
  const [prices, setPrices] = useState<Record<string, { jahit: number; obras: number }>>({});
  const [overlayId, setOverlayId] = useState<number | null>(null);

  // Belum Jahit state — backlog global lintas penjahit dan bulan.
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [sewingRateMap, setSewingRateMap] = useState<SewingRateByProductionOrder>(new Map());
  const [backlogError, setBacklogError] = useState<string | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [backlogSearch, setBacklogSearch] = useState('');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());


  const refresh = useCallback(async () => {
    setLoading(true);
    const [t, l, s, d, wo, pm, rates] = await Promise.all([
      fetchAllTarget(), daftarLiburSvc.fetchAll(), sewingRecordSvc.fetchAll(),
      targetJahitDetailSvc.fetchAll(), workOrderSvc.fetchAll(), buildPriceMap(),
      fetchSewingRatesByProductionOrder(),
    ]);
    setItems(t.data ?? []);
    setLibur((l.data ?? []).map((r) => r.tanggal));
    setSewing(s.data ?? []);
    setDetails(d.data ?? []);
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
    () => enrichTargetRows(items, sewing, workOrderDesign, prices, details, libur, new Date()),
    [items, sewing, workOrderDesign, prices, details, libur],
  );

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

  const enriched = useMemo(() => {
    if (!search) return allEnriched;
    const q = search.toLowerCase();
    return allEnriched.filter((d) =>
      [
        d.bulan_tahun,
        d.nama,
        d.posisi ?? '',
        d.statusFinal,
        d.statusFinalCostAccum,
      ].some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [allEnriched, search]);

  // Utang Staf: kumulatif, dihitung murni dari baris Target yang sudah
  // di-enrich. Sumber harganya identik dengan Sisa Uang
  // (`target cost - realisasi cost`) dan TIDAK mengurangi potongan complain.
  // Sebelumnya `computeDebt()` membaca `realisasi_cost_posisi` dari DB, tetapi
  // kolom itu tidak pernah ditulis dan selalu 0.
  const debtRows = useMemo<DebtRow[]>(() => {
    if (!canSeeDebt) return [];
    return computeDebtFromRows(allEnriched);
  }, [allEnriched, canSeeDebt]);

  const visibleDebtRows = useMemo(
    () => filterDebtRowsByLatestAccum(debtRows, allEnriched),
    [debtRows, allEnriched],
  );

  const normalized = useMemo(
    () => applySorts(applyFilters(enriched.map((r) => normalizeTargetRow(r)), filters), sorts),
    [enriched, filters, sorts],
  );

  // Access matrix (spec): inventory may see production data but NOT target/cost
  // or akumulasi columns. Owner/finance see everything.
  // Kolom `salary` sudah dihapus dari DB (`target_jahit`), jadi tidak lagi
  // termasuk dalam matriks ini.
  const roleColumns = useMemo(
    () => (canSeeDebt ? TARGET_COLUMNS : TARGET_COLUMNS.filter((c) => c.inv)),
    [canSeeDebt],
  );

  // Hide/show kolom (persist per tabel).
  const { hidden: hiddenCols, toggle: toggleCol } = useColumnSettings('target-jahit');
  const visibleColumns = useMemo(
    () => roleColumns.filter((c) => !hiddenCols.has(c.key)),
    [roleColumns, hiddenCols],
  );

  // Benefit tab: rows whose monthly realization exceeds the target
  // (extraProduction > 0 — same condition as earning a bonus). Shown as-is:
  // rows with an unset benefit rate still appear with amount 0.
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
        benefitRate: r.benefitRate,
        benefitAmount: r.benefitAmount,
      }))
      .sort((a, b) => (b.bulan || '').localeCompare(a.bulan || '') || a.nama.localeCompare(b.nama));
  }, [enriched, canSeeDebt]);

  // Edit benefit rate inline (owner/finance only)
  async function handleSaveBenefit(id: number) {
    const value = Number(benefitDraft);
    if (Number.isNaN(value) || value < 0) {
      setMessage('❌ Benefit rate harus angka ≥ 0.');
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    const { error } = await updateTarget(id, { benefit_per_pcs: value });
    if (error) {
      setMessage(`❌ Error: ${error.message}`);
    } else {
      setItems(prev => prev.map(r => (r.id === id ? { ...r, benefit_per_pcs: value } : r)));
      setMessage('✅ Benefit rate disimpan.');
      setEditingBenefitId(null);
    }
    setTimeout(() => setMessage(null), 3000);
  }

  // Multi-select + toolbar (same pattern as Production Monitoring RAW DATA).
  const handleToggleRow = (id: number) => setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleToggleAll = () => { if (selectedRows.size === normalized.length) setSelectedRows(new Set()); else setSelectedRows(new Set(normalized.map(r => Number(r.id)))); };
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

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="px-8 pt-4 pb-0">
        <div className="flex items-center justify-between mb-4">
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
        {message && <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-[12px] text-blue-700">{message}</div>}

        {/* Tabs — segmented control, pola Production Monitoring */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('target')}
            className={cn(
              'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors',
              tab === 'target' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white text-slate-600 border border-gray-200 hover:bg-blue-50 hover:text-blue-700',
            )}
          >
            Target
          </button>
          <button
            onClick={() => setTab('belum-jahit')}
            className={cn(
              'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors',
              tab === 'belum-jahit' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white text-slate-600 border border-gray-200 hover:bg-blue-50 hover:text-blue-700',
            )}
          >
            Belum Jahit
          </button>
          {canSeeDebt ? (
            <button
              onClick={() => setTab('utang-staf')}
              className={cn(
                'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors',
                tab === 'utang-staf' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white text-slate-600 border border-gray-200 hover:bg-blue-50 hover:text-blue-700',
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
                tab === 'benefit' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white text-slate-600 border border-gray-200 hover:bg-blue-50 hover:text-blue-700',
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

      <div className="flex-1 px-8 pt-5 pb-6 overflow-auto">
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
                  className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <FilterButton fields={visibleColumns.map((c) => ({ key: c.key, label: c.label })) as FieldOption[]} value={filters} onChange={setFilters} />
              <SortButton fields={visibleColumns.map((c) => ({ key: c.key, label: c.label })) as FieldOption[]} value={sorts} onChange={setSorts} />
              <ColumnSettingsButton fields={roleColumns.map((c) => ({ key: c.key, label: c.label }))} hidden={hiddenCols} onToggle={toggleCol} />
              <ExportButton onClick={handleExport} />
              <button onClick={handleImport} className={cn('h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium transition-colors', selectedRows.size > 0 ? 'bg-blue-500 text-white hover:bg-blue-600' : 'border border-gray-200 text-slate-400')}>📥 Import ({selectedRows.size})</button>
              {selectedRows.size > 0 && (
                <button onClick={handleBulkDelete} className="h-8 px-2.5 text-[11px] rounded-lg flex items-center gap-1.5 font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
                  <Trash2 className="w-3 h-3" /> Delete ({selectedRows.size})
                </button>
              )}
              <span className="text-[11px] text-slate-400 ml-auto">{normalized.length} target jahit</span>
            </div>

            <div className={T_WRAP}>
              <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
                <thead><tr className={T_HEAD_ROW}>
                  <th className={cn(T_TH, 'w-12 text-center')}><input type="checkbox" checked={selectedRows.size === normalized.length && normalized.length > 0} onChange={handleToggleAll} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></th>
                  {visibleColumns.map((c) => (
                    <th key={c.key} className={cn(T_TH, c.align === 'right' ? 'text-right' : 'text-left')}>{c.label}</th>
                  ))}
                  <th className={cn(T_TH, 'w-8')} />
                </tr></thead>
                <tbody>
                  {normalized.length === 0 && <tr><td colSpan={visibleColumns.length + 2} className="py-10 text-center text-[13px] text-gray-400">{enriched.length === 0 ? 'Belum ada target jahit' : 'Tidak ada hasil yang cocok dengan filter'}</td></tr>}
                  {normalized.map((row, i) => {
                    const selected = selectedRows.has(Number(row.id));
                    return (
                      <tr key={String(row.id)} className={cn(rowClass(i, selected), 'cursor-pointer')} onClick={() => setOverlayId(Number(row.id))} title="Klik untuk lihat rincian per desain">
                        <td className={cn(T_TD, 'text-center')} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => handleToggleRow(Number(row.id))} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 align-middle" /></td>
                        {visibleColumns.map((c) => (
                          <td key={c.key} className={cn(T_TD, c.align === 'right' ? 'text-right tabular-nums text-gray-700' : 'text-gray-700')}>
                            {c.key === 'benefitRate' && canSeeDebt ? (
                              editingBenefitId === Number(row.id) ? (
                                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                  <input type="number" min={0} value={benefitDraft} onChange={(e) => setBenefitDraft(e.target.value)} autoFocus
                                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveBenefit(Number(row.id)); if (e.key === 'Escape') setEditingBenefitId(null); }}
                                    className="h-7 w-28 px-2 text-[11px] text-right border border-blue-300 rounded-md outline-none focus:ring-2 focus:ring-blue-100" />
                                  <button onClick={() => void handleSaveBenefit(Number(row.id))} className="h-7 px-2 text-[10px] font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700">Simpan</button>
                                  <button onClick={() => setEditingBenefitId(null)} className="h-7 px-2 text-[10px] text-slate-500 border border-gray-200 rounded-md hover:bg-gray-50">✕</button>
                                </div>
                              ) : (
                                <button onClick={(e) => { e.stopPropagation(); setEditingBenefitId(Number(row.id)); setBenefitDraft(String(row.benefitRate ?? 0)); }} className="underline decoration-dotted decoration-slate-300 underline-offset-2 hover:text-blue-600 cursor-text" title="Klik untuk edit benefit rate">
                                  {(row.benefitRate as number) !== undefined && (row.benefitRate as number) !== null && (row.benefitRate as number) > 0 ? formatCurrency(row.benefitRate as number) : '-'}
                                </button>
                              )
                            ) : renderCell(c, row)}
                          </td>
                        ))}
                        <td className={cn(T_TD, 'text-center text-slate-300')}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block"><path d="m9 18 6-6-6-6" /></svg>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                  className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
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
                <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
                  <thead><tr className={T_HEAD_ROW}>
                    <th className={cn(T_TH, 'w-8')} />
                    <th className={cn(T_TH, 'text-left')}>Product Note</th>
                    <th className={cn(T_TH, 'text-left')}>Product</th>
                    <th className={cn(T_TH, 'text-right')}>Total Qty Order</th>
                    <th className={cn(T_TH, 'text-right')}>Qty Jahit</th>
                    <th className={cn(T_TH, 'text-right')}>Total Belum Jahit</th>
                    <th className={cn(T_TH, 'text-right')}>Tarif Jahit + Obras</th>
                    <th className={cn(T_TH, 'text-right')}>Nilai Rupiah</th>
                  </tr></thead>
                  <tbody>
                    {visibleBacklogGroups.map((g, gi) => {
                      const expanded = expandedNotes.has(g.key);
                      return (
                        <Fragment key={g.key}>
                          <tr
                            className={cn(rowClass(gi), 'cursor-pointer')}
                            onClick={() => setExpandedNotes(prev => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                            title="Klik untuk lihat rincian Work Order"
                          >
                            <td className={cn(T_TD, 'text-center text-slate-400')}>
                              {expanded ? <ChevronDown className="w-3.5 h-3.5 inline-block" /> : <ChevronRight className="w-3.5 h-3.5 inline-block" />}
                            </td>
                            <td className={cn(T_TD, 'text-gray-700')}>{g.productNote || <span className="text-gray-300">—</span>}</td>
                            <td className={cn(T_TD, 'font-medium text-gray-900')}>{g.productLabel}</td>
                            <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{g.totalQtyOrder}</td>
                            <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{g.totalQtyJahit}</td>
                            <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-rose-600')}>{g.totalBelumJahit}</td>
                            <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatRate(g.rate)}</td>
                            <td className={cn(T_TD, 'text-right tabular-nums font-medium text-gray-900')}>{formatValue(g.nilaiBacklog)}</td>
                          </tr>
                          {expanded && (
                            <tr className="bg-slate-50 border-b border-[#E5E7EB]">
                              <td colSpan={8} className="px-4 py-3">
                                <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
                                  <thead><tr>
                                    <th className={cn(T_TH, 'text-left')}>Work Code</th>
                                    <th className={cn(T_TH, 'text-left')}>Product</th>
                                    <th className={cn(T_TH, 'text-left')}>Warna</th>
                                    <th className={cn(T_TH, 'text-left')}>Size</th>
                                    <th className={cn(T_TH, 'text-right')}>Qty Order</th>
                                    <th className={cn(T_TH, 'text-right')}>Qty Jahit</th>
                                    <th className={cn(T_TH, 'text-right')}>Total Belum Jahit</th>
                                    <th className={cn(T_TH, 'text-right')}>Tarif Jahit + Obras</th>
                                    <th className={cn(T_TH, 'text-right')}>Nilai Rupiah</th>
                                  </tr></thead>
                                  <tbody>
                                    {g.workOrders.map((w, wi) => (
                                      <tr key={w.workOrderId} className={rowClass(wi)}>
                                        <td className={cn(T_TD, 'text-gray-700')}>{w.workCode}</td>
                                        <td className={cn(T_TD, 'font-medium text-gray-900')}>{w.product}</td>
                                        <td className={cn(T_TD, 'text-gray-700')}>{w.warna || <span className="text-gray-300">—</span>}</td>
                                        <td className={cn(T_TD, 'text-gray-700')}>{w.size || <span className="text-gray-300">—</span>}</td>
                                        <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{w.qtyOrder}</td>
                                        <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{w.qtyJahit}</td>
                                        <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-rose-600')}>{w.totalBelumJahit}</td>
                                        <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatRateValue(w.rate)}</td>
                                        <td className={cn(T_TD, 'text-right tabular-nums font-medium text-gray-900')}>{formatRateValue(w.nilaiBacklog)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-3">
              Total Belum Jahit = Qty Order − seluruh Qty Jahit Work Order (lintas penjahit dan bulan). Daftar bersifat global dan baca-saja.
            </p>
          </>
        )}

        {tab === 'utang-staf' && (
          <>
            {visibleDebtRows.length === 0 ? (
              <p className="text-slate-400 text-sm">
                {debtRows.length === 0 ? 'Belum ada data utang staf.' : '🎉 Tidak ada staf dengan kekurangan target akumulasi dan utang jahit.'}
              </p>
            ) : (
              <div className={T_WRAP}>
                <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
                  <thead><tr className={T_HEAD_ROW}>
                    <th className={cn(T_TH, 'text-left')}>Nama</th>
                    <th className={cn(T_TH, 'text-right')}>Total Target Cost</th>
                    <th className={cn(T_TH, 'text-right')}>Total Realisasi Cost</th>
                    <th className={cn(T_TH, 'text-right')}>Utang</th>
                  </tr></thead>
                  <tbody>
                    {visibleDebtRows.map((r, i) => (
                      <tr key={r.nama} className={rowClass(i)}>
                        <td className={cn(T_TD, 'font-medium text-gray-900')}>{r.nama}</td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatCurrency(r.totalTargetCost)}</td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatCurrency(r.totalRealisasiCost)}</td>
                        <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-rose-600')}>{formatCurrency(r.utang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-3">
              Utang = Total Target Cost − Total Realisasi Cost (kumulatif, tanpa potongan complain). Sumber harganya sama dengan Sisa Uang. Ditampilkan bila Selisih Cost Akumulasi bulan terbaru masih negatif dan nominal utang lebih dari Rp0.
            </p>
          </>
        )}

        {tab === 'benefit' && (
          <>
            {benefitRows.length === 0 ? (
              <p className="text-slate-400 text-sm">Belum ada staf yang produksinya melebihi target.</p>
            ) : (
              <div className={T_WRAP}>
                <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
                  <thead><tr className={T_HEAD_ROW}>
                    <th className={cn(T_TH, 'text-left')}>Nama</th>
                    <th className={cn(T_TH, 'text-left')}>Bulan</th>
                    <th className={cn(T_TH, 'text-right')}>Target | Monthly</th>
                    <th className={cn(T_TH, 'text-right')}>Realisasi | Monthly</th>
                    <th className={cn(T_TH, 'text-right')}>Extra Production</th>
                    <th className={cn(T_TH, 'text-right')}>Benefit Rate /Pcs</th>
                    <th className={cn(T_TH, 'text-right')}>Benefit Amount</th>
                    <th className={cn(T_TH, 'w-8')} />
                  </tr></thead>
                  <tbody>
                    {benefitRows.map((r, i) => (
                      <tr
                        key={r.id}
                        className={cn(rowClass(i), 'cursor-pointer')}
                        onClick={() => setOverlayId(r.id)}
                        title="Klik untuk lihat rincian per desain"
                      >
                        <td className={cn(T_TD, 'font-medium text-gray-900')}>{r.nama}</td>
                        <td className={cn(T_TD, 'text-gray-700')}>{r.bulan ? formatMonthYearFromYm(r.bulan) : <span className="text-gray-300">—</span>}</td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{r.targetMonthly}</td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{r.realisasiMonthly}</td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-emerald-600 font-semibold')}>+{r.extraProduction}</td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{r.benefitRate != null && r.benefitRate > 0 ? formatCurrency(r.benefitRate) : '-'}</td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatCurrency(r.benefitAmount)}</td>
                        <td className={cn(T_TD, 'text-center text-slate-300')}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block"><path d="m9 18 6-6-6-6" /></svg>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-3">
              Benefit = Extra Production × Benefit Rate /Pcs. Hanya staf dengan realisasi melebihi target bulanan yang ditampilkan.
            </p>
          </>
        )}
      </div>

      {/* ===== Full-screen detail overlay (pola Kanban card detail) ===== */}
      {overlayId != null && (() => {
        const src = enriched.find((r) => r.id === overlayId);
        if (!src) return null;
        const myDetails = details.filter((d) => d.targetJahitId === overlayId);
        const enrichedD = enrichDetails(myDetails, sewing, src.nama, src.bulan_tahun, workOrderDesign);
        const progressPct = src.progressMonthly * 100;
        // Sisa Uang kini tampil untuk SEMUA role (konsisten dengan kolom tabel).
        const remainingMoney = calculateMonthlyRemainingMoney(
          src.target_cost_posisi,
          src.realisasiCostPosisi,
        );
        return (
          <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={() => setOverlayId(null)}>
            <div
              className="relative bg-white rounded-2xl shadow-2xl w-[min(960px,96vw)] h-[min(86vh,900px)] flex flex-col overflow-hidden border border-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[15px] font-bold text-slate-900 truncate">{src.nama}</span>
                  <span className="text-[12px] text-slate-400">{formatMonthYearFromYm(src.bulan_tahun)}</span>
                  {src.posisi && <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap bg-slate-100 text-slate-600">{src.posisi}</span>}
                </div>
                <button onClick={() => setOverlayId(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="Tutup">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {/* Stat cards */}
                <div className={cn('grid gap-3 mb-5', 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5')}>
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
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider">Sisa Uang yang Harus Dikejar</p>
                    <p className="text-[15px] font-semibold text-amber-800 mt-0.5 tabular-nums">{formatCurrency(remainingMoney)}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[12px] font-bold text-slate-700">Progress Bulanan</p>
                    <p className="text-[12px] font-semibold text-slate-600 tabular-nums">{progressPct.toFixed(1)}%</p>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', progressPct >= 100 ? 'bg-emerald-500' : 'bg-blue-500')} style={{ width: `${Math.min(progressPct, 100)}%` }} />
                  </div>
                </div>

                {/* Per-design realization */}
                <h3 className="text-[12px] font-bold text-slate-700 mb-2">Rincian Realisasi per Desain</h3>
                <div className="bg-white border border-gray-200 rounded-lg overflow-auto">
                  {myDetails.length === 0 ? (
                    <p className="text-[13px] text-slate-400 py-8 text-center">Tidak ada rincian desain untuk bulan ini.</p>
                  ) : (
                    <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
                      <thead><tr className={T_HEAD_ROW}>
                        <th className={cn(T_TH, 'text-left')}>Product Note</th>
                        <th className={cn(T_TH, 'text-left')}>Product</th>
                        <th className={cn(T_TH, 'text-left')}>Warna</th>
                        <th className={cn(T_TH, 'text-right')}>Qty Target</th>
                        <th className={cn(T_TH, 'text-right')}>Qty Realisasi</th>
                        <th className={cn(T_TH, 'text-center')}>Progress</th>
                        {canSeeDebt && <th className={cn(T_TH, 'text-right')}>Harga Jahit+Obras</th>}
                        {canSeeDebt && <th className={cn(T_TH, 'text-right')}>Nilai Realisasi</th>}
                      </tr></thead>
                      <tbody>
                        {myDetails.map((d, di) => {
                          const qty = enrichedD[di]?.qtyRealisasi ?? 0;
                          const pct = d.qtyTarget > 0 ? (qty / d.qtyTarget) * 100 : 0;
                          return (
                            <tr key={d.id} className={rowClass(di)}>
                              <td className={cn(T_TD, 'text-gray-700')}>
                                {d.productNote || <span className="text-gray-300">—</span>}
                              </td>
                              <td className={cn(T_TD, 'font-medium text-gray-900')}>{d.product}</td>
                              <td className={cn(T_TD, 'text-gray-700')}>{d.warna || <span className="text-gray-300">—</span>}</td>
                              <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{d.qtyTarget}</td>
                              <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{qty}</td>
                              <td className={cn(T_TD, 'text-center')}>
                                <span className={cn('inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap tabular-nums', pct >= 100 ? 'bg-emerald-100 text-emerald-700' : qty > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}>{pct.toFixed(0)}%</span>
                              </td>
                              {canSeeDebt && <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatCurrency(d.hargaJahit + d.hargaObras)}</td>}
                              {canSeeDebt && <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatCurrency(enrichedD[di]?.nilai ?? 0)}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Ringkasan backlog global — baca-saja, dibatasi 5 teratas */}
                <h3 className="text-[12px] font-bold text-slate-700 mt-6 mb-2">Product Note Belum Jahit</h3>
                {backlogGroups.length === 0 ? (
                  <p className="text-[13px] text-slate-400 py-6 text-center border border-gray-200 rounded-lg">Semua Work Order sudah selesai dijahit.</p>
                ) : (
                  <>
                    <div className="bg-white border border-gray-200 rounded-lg overflow-auto">
                      <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
                        <thead><tr className={T_HEAD_ROW}>
                          <th className={cn(T_TH, 'text-left')}>Product Note</th>
                          <th className={cn(T_TH, 'text-left')}>Product</th>
                          <th className={cn(T_TH, 'text-right')}>Total Belum Jahit</th>
                          <th className={cn(T_TH, 'text-right')}>Tarif Jahit + Obras</th>
                        </tr></thead>
                        <tbody>
                          {backlogGroups.slice(0, 5).map((g, gi) => (
                            <tr key={g.key} className={rowClass(gi)}>
                              <td className={cn(T_TD, 'text-gray-700')}>{g.productNote || <span className="text-gray-300">—</span>}</td>
                              <td className={cn(T_TD, 'font-medium text-gray-900')}>{g.productLabel}</td>
                              <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-rose-600')}>{g.totalBelumJahit}</td>
                              <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatRate(g.rate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      onClick={() => { setOverlayId(null); setTab('belum-jahit'); }}
                      className="mt-3 h-8 px-3 text-[12px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      Lihat Semua Belum Jahit
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}

export default TargetJahitPage;
