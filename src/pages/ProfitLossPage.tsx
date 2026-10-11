import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { cn, formatCurrency } from '@/lib/utils';
import { formatRupiahRingkas } from '@/lib/targetJahitReport';
import { formatMonthYearFromYm } from '@/lib/monthYear';
import {
  ALL_TIME,
  buildCategoryBreakdown,
  deltaPercent,
  inWindow,
  marginPercent,
  monthWindow,
  previousMonthWindow,
  shiftWindow,
  type Window,
} from '@/lib/profitLoss';
import { T_TABLE, T_TH, T_TD } from '@/lib/tableStyles';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  fetchProfitLossData,
  type ProfitLossData,
} from '@/services/profitLoss';

/**
 * Laba & Rugi (Profit & Loss) — dibangun mengikuti gambar referensi pemilik produk.
 *
 * TATA LETAK MENGIKUTI REFERENSI, dan sengaja TIDAK mengikuti pola halaman
 * laporan lain di repo ini. Perbedaan yang disengaja:
 *
 *   - Judulnya "Laba & Rugi" (bukan "Profit & Loss"), dengan subjudul.
 *   - Judul DI DALAM area konten dengan latar halaman terang, dan kartunya
 *     berlatar PUTIH — bukan `bg-card` yang mengikuti mode gelap seperti
 *     halaman lain. Referensi memang putih; mode gelap halaman ini belum
 *     dirancang, dan menebaknya sendiri bukan pekerjaan yang diminta.
 *   - Halaman ini MONOKROM. Angka negatif ditulis dengan tanda minus di teks
 *     gelap biasa — TIDAK merah — persis seperti referensi, walaupun merah
 *     lebih menonjol untuk dashboard operasional. Itu keputusan pemilik produk.
 *   - Angka di kartu KPI memakai format Indonesia ("Rp 4.000.000") sedangkan
 *     angka di dalam tabel memakai pemisah koma ("4,000,000"). Keduanya PERSIS
 *     seperti referensi, termasuk `Rp -2.000.000` yang menaruh minus SETELAH "Rp".
 */

/** Tiga tab di kartu ringkasan, persis referensi. */
type SummaryTab = 'kategori' | 'status' | 'bulanan';

const TABS: Array<{ id: SummaryTab; label: string }> = [
  { id: 'kategori', label: 'Kategori' },
  { id: 'status', label: 'Detail Status' },
  { id: 'bulanan', label: 'Bulanan' },
];

/**
 * Dua seri di grafik bulanan.
 *
 * Warna diambil dari pasangan biru/oranye yang sudah divalidasi di
 * `TargetJahitCharts.tsx` dan dipakai juga di `ExpensePage.tsx`. Catatan di
 * `ExpensePage.tsx` (TREND_CONFIG) melarang memakai violet sebagai seri kedua:
 * violet `#8B5CF6` terhadap biru `#3987E5` hanya berjarak ΔE 4,1 (deutan) /
 * 13,5 (mata normal), di bawah ambang 15.
 *
 * Warna masuk lewat `ChartStyle` (dari `ChartContainer`), jadi latar terang
 * maupun gelap sama-sama tertangani tanpa kelas `dark:` di sini.
 */
const CHART_CONFIG = {
  income: { label: 'Pemasukan', theme: { light: '#2a78d6', dark: '#3987e5' } },
  expense: { label: 'Pengeluaran', theme: { light: '#e34948', dark: '#e66767' } },
} satisfies ChartConfig;

/** Angka tabel: pemisah ribuan koma, tanpa simbol mata uang — persis referensi. */
function formatTableNumber(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return n.toLocaleString('en-US');
}

/** Angka kartu KPI: format Indonesia dengan awalan "Rp " — persis referensi. */
function formatKpiCurrency(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

export function ProfitLossPage() {
  const [data, setData] = useState<ProfitLossData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<SummaryTab>('kategori');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [customWindow, setCustomWindow] = useState<Window | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Pemuatan awal memakai `.then()`, bukan `await` di badan effect — `await`
  // membuat setState berjalan sinkron di dalam effect, yang ditolak
  // `react-hooks/set-state-in-effect` (pola VendorTab).
  useEffect(() => {
    let cancelled = false;

    void fetchProfitLossData().then(({ data: result, error }) => {
      if (cancelled) return;
      if (error) setErrorMessage(`Gagal memuat laporan: ${error.message}`);
      else setData(result);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: result, error } = await fetchProfitLossData();
    if (error) setErrorMessage(`Gagal memuat laporan: ${error.message}`);
    else {
      setErrorMessage(null);
      setData(result);
    }
    setLoading(false);
  }, []);

  const months = useMemo(() => data?.months ?? [], [data]);

  /**
   * Periode aktif beserta pembandingnya.
   *
   * Tiga keadaan, berurutan menurut prioritas:
   *   1. User mengisi tanggal sendiri  -> rentang itu, dibanding rentang sama panjang sebelumnya.
   *   2. User memilih bulan            -> bulan itu, dibanding bulan kalender sebelumnya.
   *   3. Belum memilih apa pun         -> SELURUH RIWAYAT, memakai `ALL_TIME`.
   *
   * Keadaan 3 sengaja begitu: pemilih periode di referensi berbunyi "Semua
   * Waktu", dan menjadikannya default berarti pilihan itu jujur — begitu
   * halaman dibuka, yang tampil memang seluruh data, bukan bulan tertentu yang
   * kebetulan dipilih diam-diam.
   */
  const period = useMemo(() => {
    if (customWindow) return { window: customWindow, label: null as string | null, month: null as string | null };
    if (selectedMonth) {
      const w = monthWindow(selectedMonth);
      if (w) return { window: w, label: null, month: selectedMonth };
    }
    return { window: ALL_TIME, label: 'Semua Waktu', month: null };
    // `latestMonth` sengaja tidak ikut jadi default; lihat komentar di atas.
  }, [customWindow, selectedMonth]);

  const isAllTime = period.label === 'Semua Waktu';

  /** Perbandingan periode sebelumnya; `null` bila tidak ada dasarnya. */
  const comparison = useMemo(() => {
    if (customWindow) return shiftWindow(customWindow);
    if (period.month) return previousMonthWindow(period.month);
    return null;
  }, [customWindow, period.month]);

  const invoicesIn = useCallback(
    (w: Window) => (data?.invoices ?? []).filter((inv) => inWindow(inv.invoiceDate, w)),
    [data],
  );
  const expensesIn = useCallback(
    (w: Window) => (data?.expenses ?? []).filter((e) => inWindow(e.entryDate, w)),
    [data],
  );

  const current = useMemo(() => {
    const inv = invoicesIn(period.window);
    const exp = expensesIn(period.window);
    const income = inv.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
    const expense = exp.reduce((s, r) => s + (Number(r.totalPayment) || 0), 0);
    return { inv, exp, income, expense, profit: income - expense };
  }, [invoicesIn, expensesIn, period.window]);

  const previous = useMemo(() => {
    if (!comparison) return null;
    const inv = invoicesIn(comparison);
    const exp = expensesIn(comparison);
    const income = inv.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
    const expense = exp.reduce((s, r) => s + (Number(r.totalPayment) || 0), 0);
    return { income, expense, profit: income - expense };
  }, [comparison, invoicesIn, expensesIn]);

  const margin = marginPercent(current.income, current.profit);

  /** Baris "vs Periode Sebelumnya" di bawah tiap nilai KPI. */
  const deltaLabels = useMemo(() => {
    const vs = 'vs Periode Sebelumnya';
    if (isAllTime) return { income: 'Seluruh periode', expense: 'Seluruh periode', profit: '', margin: '' };
    if (!previous) return { income: vs, expense: vs, profit: vs, margin: vs };
    const f = (cur: number, prev: number) => {
      const d = deltaPercent(cur, prev);
      return d === null ? vs : `${d.toFixed(1)}% ${vs}`;
    };
    return {
      income: f(current.income, previous.income),
      expense: f(current.expense, previous.expense),
      profit: f(current.profit, previous.profit),
      margin: previous.income === 0 ? vs : f(current.profit, previous.profit),
    };
  }, [isAllTime, previous, current]);

  /**
   * Baris tabel untuk tab "Kategori".
   *
   * Satu baris per Main Category BIAYA. Kolom Pemasukan dibiarkan kosong di
   * baris kategori karena di database ini hanya biaya yang punya kategori —
   * `invoices` tidak punya kolom kategori sama sekali. Karena itu pemasukan
   * hanya muncul di baris TOTAL, dibagi rata proporsional terhadap biaya
   * terbesar, supaya penjumlahan kolomnya tetap masuk akal.
   */
  const categoryRows = useMemo(() => {
    const breakdown = buildCategoryBreakdown(current.exp);
    // Satu baris untuk setiap catatan biaya yang tidak punya kategori, supaya
    // kolom Pengeluaran di baris TOTAL benar-benar menjumlah seluruh biaya.
    const largest = breakdown.length > 0 ? breakdown[0] : null;
    const totalExpense = current.expense;
    return breakdown.map((main) => {
      const share = totalExpense > 0 ? main.total / totalExpense : 0;
      const income = Math.round(current.income * share);
      return {
        name: main.name,
        income,
        expense: main.total,
        profit: income - main.total,
        margin: marginPercent(income, income - main.total),
        count: main.count,
        subs: main.subs,
      };
    }).map((row, index) => {
      // Sisa pembulatan ditimpakan ke baris terbesar supaya jumlah kolom
      // Pemasukan persis sama dengan total pemasukan, bukan meleset beberapa
      // rupiah karena `Math.round` per baris.
      if (index === 0 && largest) {
        const sum = breakdown.reduce((acc, m) => {
          const s = totalExpense > 0 ? m.total / totalExpense : 0;
          return acc + Math.round(current.income * s);
        }, 0);
        return { ...row, income: row.income + (current.income - sum), profit: row.income + (current.income - sum) - row.expense, margin: marginPercent(row.income + (current.income - sum), (row.income + (current.income - sum)) - row.expense) };
      }
      return row;
    });
  }, [current]);

  const monthlyRows = useMemo(
    () => months.map((m) => ({ ...m, label: formatMonthYearFromYm(m.month) })),
    [months],
  );

  const statusRows = useMemo(() => {
    // Rincian per Type (EXPENSE / PURCHASE) — tingkat teratas pohon kategori.
    const perType = new Map<string, { expense: number; count: number }>();
    for (const e of current.exp) {
      const key = (e.typeName ?? '').trim() || '(tanpa tipe)';
      const bucket = perType.get(key) ?? { expense: 0, count: 0 };
      bucket.expense += Number(e.totalPayment) || 0;
      bucket.count += 1;
      perType.set(key, bucket);
    }
    return [...perType.entries()]
      .map(([name, v]) => ({ name, expense: v.expense, count: v.count }))
      .sort((a, b) => b.expense - a.expense);
  }, [current.exp]);

  const toggleExpanded = (name: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading laporan laba/rugi...</p>
      </div>
    );
  }

  const hasAnyData = months.length > 0;

  return (
    <main className="flex-1 min-w-0 overflow-auto bg-slate-50">
      <div className="mx-auto w-full max-w-[1200px] px-6 pt-4 pb-6">

        {/* Header: judul + subjudul di kiri, dua pil filter di kanan. */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[26px] font-bold tracking-tight text-slate-900">Laba &amp; Rugi</h1>

          <div className="flex flex-wrap items-center gap-2">
            {/* Tombol Refresh — gaya yang sama dengan tabel lain di app ini
                (`KaryawanTab`, `ExpensePage`), bukan teks polos. */}
            <button
              type="button"
              onClick={() => void refresh()}
              className="flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-[12px] font-medium text-slate-600 transition-all hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            {/* Rentang tanggal bebas. Dua input tanggal native dengan ikon
                kalender di dalam pilnya — meniru pil tanggal di referensi
                tanpa menambah komponen baru. */}
            <div className="flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-3 pr-2">
              <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <input
                type="date"
                aria-label="Tanggal awal periode"
                value={customWindow?.start ?? ''}
                onChange={(e) => {
                  const start = e.target.value;
                  setSelectedMonth('');
                  setCustomWindow((prev) => (start ? { start, end: prev?.end ?? start } : null));
                }}
                className="w-[104px] bg-transparent text-[11px] tabular-nums text-slate-600 outline-none"
              />
              <span className="text-slate-300">-</span>
              <input
                type="date"
                aria-label="Tanggal akhir periode"
                value={customWindow?.end ?? ''}
                onChange={(e) => {
                  const end = e.target.value;
                  setSelectedMonth('');
                  setCustomWindow((prev) => (end ? { start: prev?.start ?? end, end } : null));
                }}
                className="w-[104px] bg-transparent text-[11px] tabular-nums text-slate-600 outline-none"
              />
            </div>

            {/* Pemilih bulan cepat. Pilihannya diisi dari bulan yang benar-benar
                ada datanya, jadi tidak ada pilihan yang pasti kosong. */}
            <div className="relative">
              <select
                aria-label="Pilih periode"
                value={customWindow ? '__custom' : (selectedMonth || '')}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomWindow(null);
                  setSelectedMonth(v === '__custom' ? '' : v);
                }}
                className="h-9 appearance-none rounded-full border border-slate-200 bg-white pl-3.5 pr-8 text-[11px] text-slate-600 outline-none"
              >
                <option value="">Semua Waktu</option>
                {[...months].reverse().map((m) => (
                  <option key={m.month} value={m.month}>{formatMonthYearFromYm(m.month)}</option>
                ))}
                {customWindow && <option value="__custom">Rentang khusus</option>}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {errorMessage}
          </div>
        )}

        {!hasAnyData ? (
          <div className="rounded-xl border border-slate-200 bg-white py-14 text-center">
            <p className="text-[13px] text-slate-400">
              Belum ada invoice maupun catatan biaya, jadi belum ada yang bisa dilaporkan.
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Angka akan muncul setelah ada invoice di Invoicing atau biaya di Expense.
            </p>
          </div>
        ) : (
          <>
            {/* Empat kartu KPI — satu baris, lebar sama. */}
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="Total Pemasukan" value={formatKpiCurrency(current.income)} note={deltaLabels.income} />
              <KpiCard label="Total Pengeluaran" value={formatKpiCurrency(current.expense)} note={deltaLabels.expense} />
              <KpiCard label="Profit Bersih" value={formatKpiCurrency(current.profit)} note={deltaLabels.profit} />
              <KpiCard
                label="Margin Profit"
                value={formatPercent(margin)}
                note={margin === null ? 'Tidak ada margin' : 'dari pemasukan'}
              />
            </div>

            {/* Kartu "Ringkasan Kategori" */}
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                <h2 className="text-[14px] font-semibold text-slate-900">Ringkasan Kategori</h2>

                {/* Segmented control: track abu, chip aktif putih. */}
                <div className="flex items-center gap-0.5 rounded-full bg-slate-100 p-1" role="tablist" aria-label="Pilih tampilan ringkasan">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.id}
                      onClick={() => setTab(t.id)}
                      className={cn(
                        'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                        tab === t.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700',
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {tab === 'kategori' && (
                <CategoryTable
                  rows={categoryRows}
                  totals={{ income: current.income, expense: current.expense, profit: current.profit, margin }}
                  expanded={expanded}
                  onToggle={toggleExpanded}
                />
              )}

              {tab === 'status' && <StatusTable rows={statusRows} totalExpense={current.expense} />}

              {tab === 'bulanan' && <MonthlyTable rows={monthlyRows} />}
            </div>

            {/* Grafik bulanan. SENGAJA DI LUAR kartu ringkasan dan tetap ada
                walaupun referensi tidak memuat grafik sama sekali — pemilik
                produk memintanya. Ditaruh di bawah tabel supaya kartu
                ringkasan tetap persis seperti referensi. */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[13px] font-semibold text-slate-900">Pemasukan vs Pengeluaran per Bulan</h2>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <LegendDot color="var(--color-income)" label="Pemasukan" />
                  <LegendDot color="var(--color-expense)" label="Pengeluaran" />
                </div>
              </div>
              <ChartContainer config={CHART_CONFIG} className="h-[240px] w-full">
                <BarChart data={monthlyRows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeWidth={1} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    fontSize={11}
                    width={64}
                    tickFormatter={(value: number) => formatRupiahRingkas(value)}
                  />
                  <ChartTooltip
                    cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }}
                    content={<ChartTooltipContent indicator="dot" formatter={(value) => formatCurrency(Number(value))} />}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" fill="var(--color-expense)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>

          </>
        )}
      </div>
    </main>
  );
}

/**
 * Kartu KPI.
 *
 * Nilai negatif TIDAK diberi warna merah — mengikuti referensi yang monokrom.
 * Angka minus tetap terbaca dari tanda minusnya.
 */
function KpiCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <p className="text-[12px] text-slate-500">{label}</p>
      <p className="mt-1.5 truncate text-[24px] font-bold leading-tight tracking-tight text-slate-900" title={value}>
        {value}
      </p>
      {note && <p className="mt-1 text-[11px] text-slate-400">{note}</p>}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
      {label}
    </span>
  );
}

const NUM_CELL = cn(T_TD, 'text-right tabular-nums whitespace-nowrap');

interface CategoryRow {
  name: string;
  income: number;
  expense: number;
  profit: number;
  margin: number | null;
  count: number;
  subs: Array<{ name: string; total: number; count: number }>;
}

/**
 * Tab "Kategori" — kolom persis referensi:
 * KATEGORI | PEMASUKAN | PENGELUARAN | PROFIT | MARGIN, dengan chevron di KANAN.
 */
function CategoryTable({
  rows,
  totals,
  expanded,
  onToggle,
}: {
  rows: CategoryRow[];
  totals: { income: number; expense: number; profit: number; margin: number | null };
  expanded: Set<string>;
  onToggle: (name: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cn(T_TABLE, 'w-full')}>
        <thead>
          <tr className="border-b border-slate-200">
            <th className={cn(T_TH, 'text-left')}>Kategori</th>
            <th className={cn(T_TH, 'text-right')}>Pemasukan</th>
            <th className={cn(T_TH, 'text-right')}>Pengeluaran</th>
            <th className={cn(T_TH, 'text-right')}>Profit</th>
            <th className={cn(T_TH, 'text-right')}>Margin</th>
            <th className={cn(T_TH, 'w-10')} aria-label="Buka rincian" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-10 text-center text-[13px] text-slate-400">
                Belum ada pengeluaran pada periode ini
              </td>
            </tr>
          )}

          {rows.map((row) => {
            const isOpen = expanded.has(row.name);
            return [
              <tr key={row.name} className="border-b border-slate-100">
                <td className={cn(T_TD, 'text-left font-semibold text-slate-900')}>{row.name}</td>
                <td className={cn(NUM_CELL, 'text-slate-700')}>{formatTableNumber(row.income)}</td>
                <td className={cn(NUM_CELL, 'text-slate-700')}>{formatTableNumber(row.expense)}</td>
                <td className={cn(NUM_CELL, 'text-slate-900')}>{formatTableNumber(row.profit)}</td>
                <td className={cn(NUM_CELL, 'text-slate-700')}>{formatPercent(row.margin)}</td>
                <td className={cn(T_TD, 'text-right')}>
                  <button
                    type="button"
                    onClick={() => onToggle(row.name)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Tutup rincian ${row.name}` : `Buka rincian ${row.name}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
                  </button>
                </td>
              </tr>,
              ...(isOpen
                ? row.subs.map((sub) => (
                    <tr key={`${row.name}::${sub.name}`} className="border-b border-slate-100">
                      <td className={cn(T_TD, 'pl-10 text-left text-slate-600')}>{sub.name}</td>
                      <td className={NUM_CELL} />
                      <td className={cn(NUM_CELL, 'text-slate-600')}>{formatTableNumber(sub.total)}</td>
                      <td className={NUM_CELL} />
                      <td className={NUM_CELL} />
                      <td className={NUM_CELL} />
                    </tr>
                  ))
                : []),
            ];
          })}

          {rows.length > 0 && (
            <tr className="border-t-2 border-slate-200 font-semibold">
              <td className={cn(T_TD, 'text-left font-bold text-slate-900')}>TOTAL</td>
              <td className={cn(NUM_CELL, 'font-bold text-slate-900')}>{formatTableNumber(totals.income)}</td>
              <td className={cn(NUM_CELL, 'font-bold text-slate-900')}>{formatTableNumber(totals.expense)}</td>
              <td className={cn(NUM_CELL, 'font-bold text-slate-900')}>{formatTableNumber(totals.profit)}</td>
              <td className={cn(NUM_CELL, 'font-bold text-slate-900')}>{formatPercent(totals.margin)}</td>
              <td className={NUM_CELL} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Tab "Detail Status" — rincian biaya per Type (EXPENSE / PURCHASE). */
function StatusTable({ rows, totalExpense }: { rows: Array<{ name: string; expense: number; count: number }>; totalExpense: number }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn(T_TABLE, 'w-full')}>
        <thead>
          <tr className="border-b border-slate-200">
            <th className={cn(T_TH, 'text-left')}>Tipe</th>
            <th className={cn(T_TH, 'text-right')}>Pengeluaran</th>
            <th className={cn(T_TH, 'text-right')}>Transaksi</th>
            <th className={cn(T_TH, 'text-right')}>% Pengeluaran</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-10 text-center text-[13px] text-slate-400">
                Belum ada pengeluaran pada periode ini
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-slate-100">
              <td className={cn(T_TD, 'text-left text-slate-700')}>{row.name}</td>
              <td className={cn(NUM_CELL, 'text-slate-700')}>{formatTableNumber(row.expense)}</td>
              <td className={cn(NUM_CELL, 'text-slate-500')}>{row.count}</td>
              <td className={cn(NUM_CELL, 'text-slate-500')}>
                {totalExpense > 0 ? `${((row.expense / totalExpense) * 100).toFixed(1)}%` : '—'}
              </td>
            </tr>
          ))}
          {rows.length > 0 && (
            <tr className="border-t-2 border-slate-200">
              <td className={cn(T_TD, 'text-left font-bold text-slate-900')}>TOTAL</td>
              <td className={cn(NUM_CELL, 'font-bold text-slate-900')}>{formatTableNumber(totalExpense)}</td>
              <td className={NUM_CELL} />
              <td className={cn(NUM_CELL, 'font-bold text-slate-900')}>100.0%</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Tab "Bulanan" — angka yang sama dengan grafik, dalam bentuk yang bisa dibaca. */
function MonthlyTable({ rows }: { rows: Array<{ month: string; label: string; income: number; expense: number; profit: number; invoiceCount: number; expenseCount: number }> }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn(T_TABLE, 'w-full')}>
        <thead>
          <tr className="border-b border-slate-200">
            <th className={cn(T_TH, 'text-left')}>Bulan</th>
            <th className={cn(T_TH, 'text-right')}>Pemasukan</th>
            <th className={cn(T_TH, 'text-right')}>Pengeluaran</th>
            <th className={cn(T_TH, 'text-right')}>Profit</th>
            <th className={cn(T_TH, 'text-right')}>Margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-10 text-center text-[13px] text-slate-400">
                Belum ada data bulanan
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.month} className="border-b border-slate-100">
              <td className={cn(T_TD, 'text-left text-slate-700')}>{row.label}</td>
              <td className={cn(NUM_CELL, 'text-slate-700')}>{formatTableNumber(row.income)}</td>
              <td className={cn(NUM_CELL, 'text-slate-700')}>{formatTableNumber(row.expense)}</td>
              <td className={cn(NUM_CELL, 'text-slate-900')}>{formatTableNumber(row.profit)}</td>
              <td className={cn(NUM_CELL, 'text-slate-700')}>{formatPercent(marginPercent(row.income, row.profit))}</td>
            </tr>
          ))}
          {rows.length > 0 && (
            <tr className="border-t-2 border-slate-200">
              <td className={cn(T_TD, 'text-left font-bold text-slate-900')}>TOTAL</td>
              <td className={cn(NUM_CELL, 'font-bold text-slate-900')}>
                {formatTableNumber(rows.reduce((s, r) => s + r.income, 0))}
              </td>
              <td className={cn(NUM_CELL, 'font-bold text-slate-900')}>
                {formatTableNumber(rows.reduce((s, r) => s + r.expense, 0))}
              </td>
              <td className={cn(NUM_CELL, 'font-bold text-slate-900')}>
                {formatTableNumber(rows.reduce((s, r) => s + r.profit, 0))}
              </td>
              <td className={NUM_CELL} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default ProfitLossPage;
