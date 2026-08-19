import { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, Search, Trash2, X } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { formatMonthYearFromYm } from '@/lib/monthYear';
import { T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, rowClass } from '@/lib/tableStyles';
import { FilterButton, SortButton, ExportButton } from '@/components/Table/TableTools';
import { ColumnSettingsButton } from '@/components/Table/ColumnSettings';
import { useColumnSettings } from '@/lib/columnSettings';
import { applyFilters, applySorts, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import { fetchAll as fetchAllTarget, update as updateTarget, remove as removeTarget, type TargetJahitRow } from '@/services/targetJahit';
import { fetchAll as fetchAllRegister, type RegisterPenjahitRow } from '@/services/registerPenjahit';
import { computeDebt, buildPriceMap, type DebtSummary } from '@/services/staffDebt';
import * as daftarLiburSvc from '@/services/daftarLibur';
import * as sewingRecordSvc from '@/services/sewingRecords';
import * as workOrderSvc from '@/services/workOrders';
import * as targetJahitDetailSvc from '@/services/targetJahitDetail';
import { enrichTargetRows, enrichDetails } from '@/lib/targetCompute';
import type { SewingRecord } from '@/types/pipeline';
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
  { key: 'salary', label: 'Salary', align: 'right', format: 'currency' },
  { key: 'totalHariKerja', label: 'Hari Kerja Efektif', align: 'right' },
  { key: 'hariKerjaHariIni', label: 'Hari Kerja Hari Ini', align: 'right', inv: true },
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
];

type TabKey = 'target' | 'utang-staf';

interface DebtRow {
  nama: string;
  totalGaji: number;
  totalNilai: number;
  utang: number;
  status: string;
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
    if (col.key === 'statusFinal' || col.key === 'statusFinalAkumulasi') {
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
  const [editingSalaryId, setEditingSalaryId] = useState<number | null>(null);
  const [salaryDraft, setSalaryDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Derived-columns source data (live compute — never written back to DB).
  const [libur, setLibur] = useState<string[]>([]);
  const [sewing, setSewing] = useState<SewingRecord[]>([]);
  const [details, setDetails] = useState<import('@/services/targetJahitDetail').TargetJahitDetailRow[]>([]);
  const [woProduct, setWoProduct] = useState<Map<string, string>>(new Map());
  const [prices, setPrices] = useState<Record<string, { jahit: number; obras: number }>>({});
  const [overlayId, setOverlayId] = useState<number | null>(null);

  // Utang Staf state.
  const [debtRows, setDebtRows] = useState<DebtRow[]>([]);
  const [debtLoading, setDebtLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [t, l, s, d, wo, pm] = await Promise.all([
      fetchAllTarget(), daftarLiburSvc.fetchAll(), sewingRecordSvc.fetchAll(),
      targetJahitDetailSvc.fetchAll(), workOrderSvc.fetchAll(), buildPriceMap(),
    ]);
    setItems(t.data ?? []);
    setLibur((l.data ?? []).map((r) => r.tanggal));
    setSewing(s.data ?? []);
    setDetails(d.data ?? []);
    setWoProduct(new Map((wo.data ?? []).map((w) => [w.id, w.product] as const)));
    setPrices(pm);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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

      const results = await Promise.all(names.map((n) => computeDebt(n)));
      const combined: DebtRow[] = names.map((nama, i) => {
        const d: DebtSummary = results[i];
        return {
          nama,
          totalGaji: d.totalGaji,
          totalNilai: d.totalNilai,
          utang: d.utang,
          status: d.status,
        };
      });
      setDebtRows(combined);
    } finally {
      setDebtLoading(false);
    }
  }, [canSeeDebt, items]);

  useEffect(() => {
    if (canSeeDebt && tab === 'utang-staf') {
      loadDebt();
    }
  }, [tab, canSeeDebt, loadDebt]);

  // Live enrichment: all 22 columns computed from source data at render time
  // (workdays, realization from sewing_records, accumulation, status).
  const enriched = useMemo(() => {
    const all = enrichTargetRows(items, sewing, woProduct, prices, details, libur, new Date());
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((d) =>
      [
        d.bulan_tahun,
        d.nama,
        d.posisi ?? '',
        String(d.salary),
        d.statusFinal,
        d.statusFinalAkumulasi,
      ].some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, sewing, woProduct, prices, details, libur, search]);

  const normalized = useMemo(
    () => applySorts(applyFilters(enriched.map((r) => normalizeTargetRow(r)), filters), sorts),
    [enriched, filters, sorts],
  );

  // Access matrix (spec): inventory may see production data but NOT salary,
  // target/cost, or akumulasi columns. Owner/finance see everything.
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

  // Edit salary inline (owner/finance only) — satu-satunya kolom yang bisa diedit.
  async function handleSaveSalary(id: number) {
    const value = Number(salaryDraft);
    if (Number.isNaN(value) || value < 0 || salaryDraft.trim() === '') {
      setMessage('❌ Salary harus angka ≥ 0.');
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    const { error } = await updateTarget(id, { salary: value });
    if (error) {
      setMessage(`❌ Error: ${error.message}`);
    } else {
      setItems(prev => prev.map(r => (r.id === id ? { ...r, salary: value } : r)));
      setMessage('✅ Salary disimpan.');
      setEditingSalaryId(null);
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

  if (loading && tab === 'target') {
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
          {!canSeeDebt && (
            <span className="text-[11px] text-slate-400 ml-2">
              Hanya owner/finance yang dapat melihat.
            </span>
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
                            {c.key === 'salary' && canSeeDebt ? (
                              editingSalaryId === Number(row.id) ? (
                                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                  <input type="number" min={0} value={salaryDraft} onChange={(e) => setSalaryDraft(e.target.value)} autoFocus
                                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveSalary(Number(row.id)); if (e.key === 'Escape') setEditingSalaryId(null); }}
                                    className="h-7 w-24 px-2 text-[11px] text-right border border-blue-300 rounded-md outline-none focus:ring-2 focus:ring-blue-100" />
                                  <button onClick={() => void handleSaveSalary(Number(row.id))} className="h-7 px-2 text-[10px] font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700">Simpan</button>
                                  <button onClick={() => setEditingSalaryId(null)} className="h-7 px-2 text-[10px] text-slate-500 border border-gray-200 rounded-md hover:bg-gray-50">✕</button>
                                </div>
                              ) : (
                                <button onClick={(e) => { e.stopPropagation(); setEditingSalaryId(Number(row.id)); setSalaryDraft(String(row.salary ?? 0)); }} className="underline decoration-dotted decoration-slate-300 underline-offset-2 hover:text-blue-600 cursor-text" title="Klik untuk edit salary">
                                  {formatCurrency(row.salary as number)}
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

        {tab === 'utang-staf' && (
          <>
            {debtLoading ? (
              <p className="text-slate-400 text-sm">Menghitung utang staf...</p>
            ) : debtRows.length === 0 ? (
              <p className="text-slate-400 text-sm">Belum ada data utang staf.</p>
            ) : (
              <div className={T_WRAP}>
                <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
                  <thead><tr className={T_HEAD_ROW}>
                    <th className={cn(T_TH, 'text-left')}>Nama</th>
                    <th className={cn(T_TH, 'text-right')}>Total Gaji</th>
                    <th className={cn(T_TH, 'text-right')}>Total Nilai PCS</th>
                    <th className={cn(T_TH, 'text-right')}>Utang</th>
                    <th className={cn(T_TH, 'text-center')}>Status</th>
                  </tr></thead>
                  <tbody>
                    {debtRows.map((r, i) => (
                      <tr key={r.nama} className={rowClass(i)}>
                        <td className={cn(T_TD, 'font-medium text-gray-900')}>{r.nama}</td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatCurrency(r.totalGaji)}</td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-gray-700')}>{formatCurrency(r.totalNilai)}</td>
                        <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-rose-600')}>{formatCurrency(r.utang)}</td>
                        <td className={cn(T_TD, 'text-center')}>
                          <span className={cn('inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap', r.status === 'Utang' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600')}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-3">
              Utang = Total Gaji − Total Nilai PCS (hasil kerja berharga). Nilai dihitung dari data target & sewing.
            </p>
          </>
        )}
      </div>

      {/* ===== Full-screen detail overlay (pola Kanban card detail) ===== */}
      {overlayId != null && (() => {
        const src = enriched.find((r) => r.id === overlayId);
        if (!src) return null;
        const myDetails = details.filter((d) => d.targetJahitId === overlayId);
        const enrichedD = enrichDetails(myDetails, sewing, src.nama, src.bulan_tahun, woProduct);
        const progressPct = src.progressMonthly * 100;
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
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
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}

export default TargetJahitPage;
