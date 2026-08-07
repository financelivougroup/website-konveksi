import { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { DataTable } from '@/components/Table/DataTable';
import { Pagination } from '@/components/Table/Pagination';
import { viewConfig } from '@/data/mockData';
import { fetchAll as fetchAllTarget, type TargetJahitRow } from '@/services/targetJahit';
import { fetchAll as fetchAllRegister, type RegisterPenjahitRow } from '@/services/registerPenjahit';
import { computeDebt, type DebtSummary } from '@/services/staffDebt';
import { useAuth } from '@/contexts/AuthContext';
import { cn, formatCurrency } from '@/lib/utils';

const PAGE_SIZE = 10;

type TabKey = 'target' | 'utang-staf';

interface DebtRow {
  nama: string;
  totalGaji: number;
  totalNilai: number;
  utang: number;
  status: string;
}

export function TargetJahitPage() {
  const { profile } = useAuth();
  const canSeeDebt = profile.role === 'owner' || profile.role === 'finance';

  const [tab, setTab] = useState<TabKey>('target');

  // Target tab state.
  const [items, setItems] = useState<TargetJahitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Utang Staf state.
  const [debtRows, setDebtRows] = useState<DebtRow[]>([]);
  const [debtLoading, setDebtLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchAllTarget();
    setItems(data ?? []);
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
        names = registerRows.map((r: RegisterPenjahitRow) => r.pic_penjahit);
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

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((d) =>
      [
        d.bulan_tahun,
        d.nama,
        d.posisi ?? '',
        String(d.salary),
        d.status_final ?? '',
        d.status_final_akumulasi ?? '',
      ].some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, search]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const config = viewConfig['target-jahit'];

  if (loading && tab === 'target') {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading Target Jahit...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col min-w-0">
      <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
        <div>
          <h1 className="text-lg font-bold text-slate-900">🎯 Target Jahit</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Target produksi per penjahit + perhitungan utang staf
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'target' && (
            <button onClick={refresh} className="h-8 px-3 text-[11px] border border-gray-200 rounded-lg flex items-center gap-1.5 text-slate-600 hover:bg-gray-50">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-3 flex items-center gap-2">
        <button
          onClick={() => setTab('target')}
          className={cn(
            'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors',
            tab === 'target' ? 'bg-sky-500 text-white' : 'bg-white text-slate-600 border border-gray-200 hover:bg-gray-50',
          )}
        >
          Target
        </button>
        {canSeeDebt ? (
          <button
            onClick={() => setTab('utang-staf')}
            className={cn(
              'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors',
              tab === 'utang-staf' ? 'bg-sky-500 text-white' : 'bg-white text-slate-600 border border-gray-200 hover:bg-gray-50',
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

      <div className="flex-1 flex flex-col overflow-y-auto">
        {tab === 'target' && (
          <>
            <div className="px-5 py-2">
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari target..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full h-8 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
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
              onViewDetail={() => {}}
              onEditDetail={() => {}}
              onDeleteRow={() => {}}
              onResizeColumn={() => {}}
              onReorderColumn={() => {}}
              onRenameColumn={() => {}}
              onUpdateNote={() => {}}
              onSortColumn={() => {}}
              onGroupColumn={() => {}}
              onSetSource={() => {}}
            />

            <div className="px-5 pb-4 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">{filtered.length} target jahit</span>
              <Pagination total={filtered.length} currentPage={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
            </div>
          </>
        )}

        {tab === 'utang-staf' && (
          <div className="px-5 py-4">
            {debtLoading ? (
              <p className="text-slate-400 text-sm">Menghitung utang staf...</p>
            ) : debtRows.length === 0 ? (
              <p className="text-slate-400 text-sm">Belum ada data utang staf.</p>
            ) : (
              <table className="w-full text-[12px] border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                    <th className="px-4 py-2.5 font-semibold border-b border-gray-200 text-left">Nama</th>
                    <th className="px-4 py-2.5 font-semibold border-b border-gray-200 text-right">Total Gaji</th>
                    <th className="px-4 py-2.5 font-semibold border-b border-gray-200 text-right">Total Nilai PCS</th>
                    <th className="px-4 py-2.5 font-semibold border-b border-gray-200 text-right">Utang</th>
                    <th className="px-4 py-2.5 font-semibold border-b border-gray-200 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {debtRows.map((r) => (
                    <tr key={r.nama} className="border-b border-gray-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.nama}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{formatCurrency(r.totalGaji)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{formatCurrency(r.totalNilai)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-rose-600">{formatCurrency(r.utang)}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium',
                            r.status === 'Utang' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600',
                          )}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-[11px] text-slate-400 mt-3">
              Utang = Total Gaji − Total Nilai PCS (hasil kerja berharga). Nilai dihitung dari data target & sewing.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default TargetJahitPage;