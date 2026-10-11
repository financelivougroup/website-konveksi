import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, Target as TargetIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { AppSelect } from '@/components/AppSelect';
import {
  AkumulasiBiayaPerBulan,
  TargetRealisasiAkumulasi,
  TargetRealisasiBulanan,
  TrenBiayaPerBulan,
} from '@/components/Laporan/TargetJahitCharts';
import { Badge } from '@/components/reui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { cn, formatCurrency } from '@/lib/utils';
import { T_WRAP, T_TABLE, T_HEAD_ROW, T_TH, T_TD, rowClass } from '@/lib/tableStyles';
import { enrichTargetRows, type EnrichedTargetRow } from '@/lib/targetCompute';
import { buildSalaryLookup } from '@/lib/staffSalary';
import * as expenseSvc from '@/services/expenseEntries';
import type { WorkOrderDesignIdentity } from '@/lib/targetDetailIdentity';
import {
  buildMonthAggregates,
  buildPenjahitAggregates,
  buildPenjahitMonthRows,
  bulanReportOptions,
  penjahitReportOptions,
  summarizeReport,
  targetJahitReportToCsv,
  type PenjahitAggregate,
} from '@/lib/targetJahitReport';
import * as targetJahitSvc from '@/services/targetJahit';
import * as targetJahitDetailSvc from '@/services/targetJahitDetail';
import * as daftarLiburSvc from '@/services/daftarLibur';
import * as sewingRecordSvc from '@/services/sewingRecords';
import * as workOrderSvc from '@/services/workOrders';
import { buildPriceMap } from '@/services/staffDebt';
import { fetchSewingRatesByProductionOrder } from '@/services/productionOrderPrices';
import type { SewingRecord, WorkOrder } from '@/types/pipeline';

type TabKey = 'keseluruhan' | 'penjahit';

const EM_DASH = '—';
const ALL = '__all__';

/**
 * Laporan Target Jahit — BACA-SAJA.
 *
 * Halaman ini adalah agregasi turunan atas data yang sama dengan
 * `src/pages/TargetJahitPage.tsx`, tetapi tidak pernah menulis apa pun dan tidak
 * menyediakan aksi edit/hapus. Nilai turunan (realisasi, sisa, status) dihitung
 * `enrichTargetRows` supaya angkanya identik dengan halaman Target Jahit —
 * perhitungan itu tidak diduplikasi di sini.
 *
 * Kedua tab berbagi SATU dataset yang dimuat sekali (`enrichTargetRows` di useMemo),
 * jadi berpindah tab tidak memicu fetch ulang.
 */
export function TargetJahitReportPage() {
  const { profile } = useAuth();
  // Hanya owner/finance yang melihat angka biaya. Gerbang ditegakkan di jalur
  // render + derivasi (includeCost), bukan sekadar menyembunyikan tombol —
  // mengikuti pola `canSeeDebt` di TargetJahitPage.tsx:153.
  const canSeeCost = profile.role === 'owner' || profile.role === 'finance';

  const [tab, setTab] = useState<TabKey>('keseluruhan');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<EnrichedTargetRow[]>([]);
  const [bulanFilter, setBulanFilter] = useState<string>(ALL);
  const [penjahitFilter, setPenjahitFilter] = useState<string>(ALL);

  // Guard generasi: hasil request lama tidak boleh menimpa refresh terbaru.
  const generation = useRef(0);

  // Bentuk try/catch/finally ini disengaja dan mengikuti `LaporanReportPage.tsx`:
  // setState yang berjalan sinkron sebelum `await` di dalam callback async
  // dikeluhkan aturan `react-hooks/set-state-in-effect` bila tidak dibungkus
  // try/catch.
  const load = useCallback(async () => {
    const myGen = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const [t, d, l, s, wo, pm, rates, sal] = await Promise.all([
        targetJahitSvc.fetchAll(),
        targetJahitDetailSvc.fetchAll(),
        daftarLiburSvc.fetchAll(),
        sewingRecordSvc.fetchAll(),
        workOrderSvc.fetchAll(),
        buildPriceMap(),
        fetchSewingRatesByProductionOrder(),
        expenseSvc.fetchSalaries(),
      ]);

      if (myGen !== generation.current) return; // refresh lebih baru sudah jalan

      // Semua-atau-tidak-sama-sekali: menampilkan laporan dengan separuh sumber
      // yang gagal berarti angka realisasi bisa tampak 0 padahal sumbernya belum
      // terbaca — itu mislabel, bukan sekadar tampilan kurang lengkap.
      const gagal = [t, d, l, s, wo].find((r) => r.error);
      if (gagal?.error) {
        setError(gagal.error.message);
        setRows([]);
        return;
      }

      const sewing: SewingRecord[] = s.data ?? [];
      const workOrders: WorkOrder[] = wo.data ?? [];
      const design = new Map<string, WorkOrderDesignIdentity>(
        workOrders.map((w) => [
          w.id,
          {
            productNote: w.productNote || null,
            product: w.product,
            warna: w.warna || null,
          },
        ] as const),
      );

      setRows(
        enrichTargetRows(
          t.data ?? [],
          sewing,
          design,
          pm,
          d.data ?? [],
          (l.data ?? []).map((r) => r.tanggal),
          new Date(),
          // `Target Cost / Posisi` = gaji bulan itu, dibaca dari expense_entries.
          // Kegagalan memuatnya TIDAK menjatuhkan laporan — biaya tampil 0 dan
          // badge "belum diinput" hanya ada di halaman Target Jahit.
          buildSalaryLookup(sal.data ?? []),
        ),
      );

      // Kegagalan tarif tidak menjatuhkan laporan; biaya jahit jatuh ke PriceMap
      // dan angkanya hanya kehilangan komponen tarif, bukan seluruh halaman.
      if (rates.error) setError(`Tarif jahit belum dapat dimuat: ${rates.error.message}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat laporan target jahit.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Opsi slicer dibangun dari SELURUH baris agar tidak terjebak saat filter aktif.
  const bulanOpts = useMemo(
    () => [{ value: ALL, label: 'Semua bulan' }, ...bulanReportOptions(rows)],
    [rows],
  );
  const penjahitOpts = useMemo(
    () => [{ value: ALL, label: 'Semua penjahit' }, ...penjahitReportOptions(rows)],
    [rows],
  );

  /** Baris setelah slicer bulan — dipakai tab Keseluruhan. */
  const rowsBulan = useMemo(
    () => (bulanFilter === ALL ? rows : rows.filter((r) => String(r.bulan_tahun) === bulanFilter)),
    [rows, bulanFilter],
  );

  /** Baris setelah slicer penjahit — dipakai tab Per Penjahit. */
  const rowsPenjahit = useMemo(
    () => (penjahitFilter === ALL ? rows : rows.filter((r) => r.nama === penjahitFilter)),
    [rows, penjahitFilter],
  );

  const months = useMemo(
    () => buildMonthAggregates(rowsBulan, canSeeCost),
    [rowsBulan, canSeeCost],
  );
  const kpi = useMemo(() => summarizeReport(rowsBulan, canSeeCost), [rowsBulan, canSeeCost]);
  const penjahitAgg = useMemo(
    () => buildPenjahitAggregates(rowsBulan, canSeeCost),
    [rowsBulan, canSeeCost],
  );

  const selectedPenjahit =
    penjahitFilter !== ALL
      ? penjahitFilter
      : penjahitOpts.find((o) => o.value !== ALL)?.value ?? '';

  // Baris milik penjahit yang benar-benar dipilih. Saat filter masih 'Semua
  // penjahit', `selectedPenjahit` jatuh ke penjahit pertama — jadi KPI harus
  // mengikuti orang itu, bukan menjumlahkan semua orang sementara tabelnya
  // hanya menampilkan satu (angka KPI dan isi tabel wajib sepakat).
  const rowsPenjahitTerpilih = useMemo(
    () =>
      selectedPenjahit ? rowsPenjahit.filter((r) => String(r.nama) === selectedPenjahit) : [],
    [rowsPenjahit, selectedPenjahit],
  );

  const penjahitMonths = useMemo(
    () => (selectedPenjahit ? buildPenjahitMonthRows(rowsPenjahit, selectedPenjahit) : []),
    [rowsPenjahit, selectedPenjahit],
  );
  const penjahitKpi = useMemo(
    () => summarizeReport(rowsPenjahitTerpilih, canSeeCost),
    [rowsPenjahitTerpilih, canSeeCost],
  );

  const handleExport = () => {
    const csv =
      tab === 'keseluruhan'
        ? targetJahitReportToCsv(rowsBulan, 'penjahit', canSeeCost)
        : targetJahitReportToCsv(rowsPenjahit, 'bulan', canSeeCost);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-target-jahit-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const punyaData = rows.length > 0;

  return (
    <main className="flex flex-1 flex-col min-w-0 overflow-auto">
      <div className="px-6 pt-3 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-1 h-7 rounded-full shrink-0 bg-primary" />
            <div className="min-w-0">
              <h1 className="text-[17px] font-semibold tracking-tight text-foreground">
                Laporan Target Jahit
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => void load()}
              className="h-8 px-3.5 text-[12px] font-medium text-muted-foreground bg-card border border-border rounded-lg hover:bg-muted hover:shadow-md hover:shadow-slate-200 transition-all flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={handleExport}
              disabled={!punyaData}
              className="h-8 px-3.5 text-[12px] font-medium bg-primary text-white rounded-lg hover:bg-primary/90 hover:shadow-md hover:shadow-slate-300 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" /> Ekspor CSV
            </button>
          </div>
        </div>

        {/* Tab — segmented control, pola Production Monitoring / Target Jahit. */}
        <div className="flex items-center gap-2">
          {(
            [
              ['keseluruhan', 'Keseluruhan'],
              ['penjahit', 'Per Penjahit'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'h-8 px-4 text-[12px] font-medium rounded-lg transition-colors',
                tab === key
                  ? 'bg-primary text-white shadow-md shadow-slate-300'
                  : 'bg-card text-muted-foreground border border-border hover:bg-primary/10 hover:text-primary',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 pt-4 pb-5 overflow-auto">
        {error && (
          <div
            role="status"
            aria-live="polite"
            className="mb-3 flex items-center justify-between gap-3 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg text-[12px] text-warning-foreground"
          >
            <span>Gagal memuat sebagian data laporan: {error}</span>
            <button
              onClick={() => void load()}
              className="shrink-0 h-7 px-2.5 text-[11px] font-medium rounded-md border border-warning/40 bg-card text-warning-foreground hover:bg-warning/20 transition-colors"
            >
              Coba lagi
            </button>
          </div>
        )}

        {loading ? (
          <ReportSkeleton />
        ) : !punyaData ? (
          <Empty className="border bg-card shadow-xs">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TargetIcon className="size-6 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle>Belum ada target jahit</EmptyTitle>
              <EmptyDescription>
                Laporan akan muncul setelah target bulanan penjahit diisi di halaman Target Jahit.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" variant="outline" onClick={() => void load()}>
                <RefreshCw className="size-3.5" /> Muat ulang
              </Button>
            </EmptyContent>
          </Empty>
        ) : tab === 'keseluruhan' ? (
          <>
            {/* Slicer sebaris di atas konten yang dicakupnya. */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="w-[170px]">
                <AppSelect
                  bare
                  value={bulanFilter}
                  onValueChange={setBulanFilter}
                  options={bulanOpts}
                  placeholder="Semua bulan"
                />
              </div>
            </div>

            <KpiRow
              tiles={[
                { label: 'Total Target', value: `${kpi.totalTarget.toLocaleString('id-ID')} pcs` },
                { label: 'Realisasi', value: `${kpi.totalRealisasi.toLocaleString('id-ID')} pcs` },
                {
                  label: 'Kurang',
                  value: `${kpi.totalKurang.toLocaleString('id-ID')} pcs`,
                  danger: kpi.totalKurang > 0,
                },
                { label: 'Pencapaian', value: `${(kpi.pencapaian * 100).toFixed(1)}%` },
                ...(canSeeCost
                  ? [
                      {
                        label: 'Sisa Uang yang Harus Dikejar',
                        value: formatCurrency(kpi.sisaUang),
                        accent: true as const,
                      },
                    ]
                  : []),
              ]}
            />

            {/* Keseluruhan = per bulan & akumulasi, bukan per orang. Sumbu Y
                tidak memuat nama penjahit di sini; tiap batang/titik adalah satu
                bulan yang sudah dijumlahkan lintas penjahit. */}
            {months.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <p className="text-[13px] text-muted-foreground">Belum ada data bulan yang bisa digambarkan.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <ChartCard title="Target vs Realisasi per Bulan">
                  <TargetRealisasiBulanan months={months} className="mt-2" />
                </ChartCard>
                <ChartCard title="Akumulasi Target vs Realisasi">
                  <TargetRealisasiAkumulasi months={months} className="mt-2" />
                </ChartCard>
                {canSeeCost && (
                  <ChartCard title="Target Cost vs Realisasi Cost per Bulan">
                    <TrenBiayaPerBulan months={months} className="mt-2" />
                  </ChartCard>
                )}
                {canSeeCost && (
                  <ChartCard title="Akumulasi Target Cost vs Realisasi Cost">
                    <AkumulasiBiayaPerBulan months={months} className="mt-2" />
                  </ChartCard>
                )}
              </div>
            )}

            {/* Kartu per penjahit sengaja TIDAK ditampilkan di tab ini — versi
                lengkapnya ada di tab Per Penjahit, dan menampilkannya dua kali
                hanya memanjangkan halaman tanpa informasi baru.

                Tabel di bawah tetap disediakan sebagai padanan angka grafik di
                atas yang bisa dibaca mesin (WCAG); bentuknya sama dengan CSV. */}
            <details className="mt-3 group">
              <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-muted-foreground select-none">
                Lihat sebagai tabel
              </summary>
              <div className={cn(T_WRAP, 'mt-2')}>
                <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
                  <thead>
                    <tr className={T_HEAD_ROW}>
                      <th className={cn(T_TH, 'text-left')}>Penjahit</th>
                      <th className={cn(T_TH, 'text-right')}>Target</th>
                      <th className={cn(T_TH, 'text-right')}>Realisasi</th>
                      <th className={cn(T_TH, 'text-right')}>Kurang</th>
                      <th className={cn(T_TH, 'text-right')}>Pencapaian</th>
                      <th className={cn(T_TH, 'text-left')}>Status</th>
                      {canSeeCost && <th className={cn(T_TH, 'text-right')}>Target Cost</th>}
                      {canSeeCost && <th className={cn(T_TH, 'text-right')}>Realisasi Cost</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {penjahitAgg.map((p, i) => (
                      <tr key={p.nama} className={rowClass(i)}>
                        <td className={cn(T_TD, 'font-medium text-foreground')}>{p.nama}</td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-muted-foreground')}>
                          {p.target.toLocaleString('id-ID')}
                        </td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-muted-foreground')}>
                          {p.realisasi.toLocaleString('id-ID')}
                        </td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-muted-foreground')}>
                          {p.kurang.toLocaleString('id-ID')}
                        </td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-muted-foreground')}>
                          {(p.pencapaian * 100).toFixed(1)}%
                        </td>
                        <td className={T_TD}>
                          <StatusBadge status={p.status} />
                        </td>
                        {canSeeCost && (
                          <td className={cn(T_TD, 'text-right tabular-nums text-muted-foreground')}>
                            {formatCurrency(p.targetCost)}
                          </td>
                        )}
                        {canSeeCost && (
                          <td className={cn(T_TD, 'text-right tabular-nums text-muted-foreground')}>
                            {formatCurrency(p.realisasiCost)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#D1D5DB] bg-[#F9FAFB]">
                      <td className={cn(T_TD, 'font-semibold text-foreground')}>TOTAL</td>
                      <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-foreground')}>
                        {kpi.totalTarget.toLocaleString('id-ID')}
                      </td>
                      <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-foreground')}>
                        {kpi.totalRealisasi.toLocaleString('id-ID')}
                      </td>
                      <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-destructive')}>
                        {kpi.totalKurang.toLocaleString('id-ID')}
                      </td>
                      <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-foreground')}>
                        {(kpi.pencapaian * 100).toFixed(1)}%
                      </td>
                      <td className={T_TD} />
                      {canSeeCost && <td className={T_TD} colSpan={2} />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </details>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="w-[220px]">
                <AppSelect
                  bare
                  value={selectedPenjahit || ''}
                  onValueChange={setPenjahitFilter}
                  options={penjahitOpts}
                  placeholder="Pilih penjahit"
                />
              </div>
              <span className="text-[11px] text-muted-foreground ml-auto">
                {penjahitKpi.bulanCount} bulan · {penjahitKpi.baris} baris target
              </span>
            </div>

            <KpiRow
              tiles={[
                { label: 'Target Bulanan', value: `${penjahitKpi.totalTarget.toLocaleString('id-ID')} pcs` },
                { label: 'Realisasi', value: `${penjahitKpi.totalRealisasi.toLocaleString('id-ID')} pcs` },
                {
                  label: 'Kurang',
                  value: `${penjahitKpi.totalKurang.toLocaleString('id-ID')} pcs`,
                  danger: penjahitKpi.totalKurang > 0,
                },
                { label: 'Pencapaian', value: `${(penjahitKpi.pencapaian * 100).toFixed(1)}%` },
                ...(canSeeCost
                  ? [
                      {
                        label: 'Sisa Uang yang Harus Dikejar',
                        value: formatCurrency(penjahitKpi.sisaUang),
                        accent: true as const,
                      },
                    ]
                  : []),
              ]}
            />

            {/* Template grafik disamakan dengan tab Keseluruhan: bulanan +
                akumulasi, dengan arti warna yang sama (merah = target,
                biru = realisasi). */}
            {penjahitMonths.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <p className="text-[13px] text-muted-foreground">Belum ada bulan untuk penjahit ini.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <ChartCard title={`Target vs Realisasi per Bulan — ${selectedPenjahit}`}>
                  <TargetRealisasiBulanan months={penjahitMonths} className="mt-2" />
                </ChartCard>
                <ChartCard title="Akumulasi Target vs Realisasi">
                  <TargetRealisasiAkumulasi months={penjahitMonths} className="mt-2" />
                </ChartCard>
              </div>
            )}

            <h3 className="text-[12px] font-bold text-foreground mt-6 mb-2">
              Detail per Bulan{selectedPenjahit ? ` — ${selectedPenjahit}` : ''}
            </h3>
            <div className={T_WRAP}>
              <table className={cn(T_TABLE, 'w-auto min-w-full whitespace-nowrap')}>
                <thead>
                  <tr className={T_HEAD_ROW}>
                    <th className={cn(T_TH, 'text-left')}>Bulan</th>
                    <th className={cn(T_TH, 'text-right')}>Target</th>
                    <th className={cn(T_TH, 'text-right')}>Realisasi</th>
                    <th className={cn(T_TH, 'text-right')}>Kurang</th>
                    <th className={cn(T_TH, 'text-right')}>Pencapaian</th>
                    <th className={cn(T_TH, 'text-left')}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {penjahitMonths.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-[13px] text-muted-foreground">
                        Belum ada target untuk penjahit ini
                      </td>
                    </tr>
                  ) : (
                    penjahitMonths.map((m, i) => (
                      <tr key={m.bulan} className={rowClass(i)}>
                        <td className={cn(T_TD, 'font-medium text-foreground')}>{m.label}</td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-muted-foreground')}>
                          {m.target.toLocaleString('id-ID')}
                        </td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-muted-foreground')}>
                          {m.realisasi.toLocaleString('id-ID')}
                        </td>
                        <td
                          className={cn(
                            T_TD,
                            'text-right tabular-nums font-semibold',
                            m.kurang > 0 ? 'text-destructive' : 'text-muted-foreground',
                          )}
                        >
                          {m.kurang.toLocaleString('id-ID')}
                        </td>
                        <td className={cn(T_TD, 'text-right tabular-nums text-muted-foreground')}>
                          {(m.pencapaian * 100).toFixed(1)}%
                        </td>
                        <td className={T_TD}>
                          <StatusBadge status={m.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {penjahitMonths.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-[#D1D5DB] bg-[#F9FAFB]">
                      <td className={cn(T_TD, 'font-semibold text-foreground')}>TOTAL</td>
                      <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-foreground')}>
                        {penjahitKpi.totalTarget.toLocaleString('id-ID')}
                      </td>
                      <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-foreground')}>
                        {penjahitKpi.totalRealisasi.toLocaleString('id-ID')}
                      </td>
                      <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-destructive')}>
                        {penjahitKpi.totalKurang.toLocaleString('id-ID')}
                      </td>
                      <td className={cn(T_TD, 'text-right tabular-nums font-semibold text-foreground')}>
                        {(penjahitKpi.pencapaian * 100).toFixed(1)}%
                      </td>
                      <td className={T_TD} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Section "Pencapaian per Penjahit" dipindah ke sini dari tab
                Keseluruhan: di sinilah orang dibandingkan, dan menaruhnya di
                dua tab hanya menduplikasi informasi yang sama. */}
            <h3 className="text-[12px] font-bold text-foreground mt-6 mb-2">Pencapaian per Penjahit</h3>
            {penjahitAgg.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <p className="text-[13px] text-muted-foreground">Tidak ada penjahit pada bulan yang dipilih</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {penjahitAgg.map((p) => (
                  <PenjahitCard key={p.nama} p={p} canSeeCost={canSeeCost} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

// ===== Sub-komponen lokal =====

interface Tile {
  label: string;
  value: string;
  danger?: boolean;
  accent?: boolean;
}

function KpiRow({ tiles }: { tiles: Tile[] }) {
  return (
    <div
      className={cn(
        'grid gap-3',
        tiles.length >= 5 ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4',
      )}
    >
      {tiles.map((t) => (
        <Card
          key={t.label}
          className={cn(
            'shadow-xs overflow-hidden border-l-[3px]',
            t.danger ? 'border-l-rose-400' : t.accent ? 'border-l-amber-400' : 'border-l-slate-400',
          )}
        >
          <CardContent className="flex flex-col gap-0.5 p-4">
            <span className="text-[11px] font-medium text-muted-foreground">{t.label}</span>
            <span
              className={cn(
                'text-xl font-semibold leading-tight text-foreground',
                t.danger && 'text-destructive',
              )}
            >
              {t.value}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Kartu pencapaian satu penjahit.
 *
 * Sengaja TIDAK lagi memuat angka target pcs, realisasi pcs, target cost, dan
 * realisasi cost: keempatnya sekarang dibawa grafik batang di atas, dan
 * mengulanginya dalam bentuk angka membuat halaman ini kembali terasa seperti
 * tabel. Yang tersisa di kartu hanya yang tidak digambar grafik: persentase
 * pencapaian, sisa (kurang) pcs, dan sisa uang.
 *
 * Meter memakai track biru muda — langkah terang dari ramp yang sama — sehingga
 * keadaan terbaca di sepanjang batang, bukan hanya di ujung isian.
 */
function PenjahitCard({ p, canSeeCost }: { p: PenjahitAggregate; canSeeCost: boolean }) {
  const pct = p.pencapaian * 100;
  const tercapai = p.pencapaian >= 1;

  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold text-foreground truncate">{p.nama}</p>
        <StatusBadge status={p.status} />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[11px] text-muted-foreground">Pencapaian</span>
          <span
            className={cn(
              'text-[15px] font-semibold tabular-nums',
              tercapai ? 'text-success' : 'text-foreground',
            )}
          >
            {pct.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-primary/15 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              tercapai ? 'bg-success' : 'bg-primary',
            )}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 text-[11px] border-t border-border pt-2.5">
        <div>
          <dt className="text-muted-foreground">Kurang</dt>
          <dd
            className={cn(
              'tabular-nums font-semibold',
              p.kurang > 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {p.kurang.toLocaleString('id-ID')} pcs
          </dd>
        </div>
        {canSeeCost && (
          <div>
            <dt className="text-muted-foreground">Sisa Uang</dt>
            <dd className="tabular-nums font-semibold text-warning-foreground">
              {formatCurrency(p.sisaUang)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/**
 * Badge status memakai ReUI `Badge` dengan varian semantik — bukan kelas warna
 * mentah. Tercapai/Tidak Tercapai memakai varian `-light` (bidang lembut)
 * karena badge ini muncul banyak sekaligus di tabel; varian solid akan terlalu
 * berisik pada kepadatan seperti ini.
 */
function StatusBadge({ status }: { status: string }) {
  const s = String(status ?? '').trim();
  if (!s) return <span className="text-muted-foreground">{EM_DASH}</span>;
  const variant =
    s === 'Tercapai' ? 'success-light' : s === 'Tidak Tercapai' ? 'destructive-light' : 'info-light';
  return (
    <Badge variant={variant} size="sm" radius="full">
      {s}
    </Badge>
  );
}

/**
 * Slot grafik dengan tiga keadaan jujur:
 *  - >= 2 bulan → grafik garis tren + grafik batang pencapaian
 *  - 1 bulan    → meter progres berlabel (bukan bar chart satu batang, yang
 *                 seharusnya cuma stat tile dan terbaca aneh)
 *  - 0 bulan    → Empty
 */
/**
 * Bingkai seragam untuk setiap grafik.
 *
 * CATATAN: sengaja TIDAK memakai `@/components/reui/frame`. File ReUI itu ditulis
 * untuk Tailwind 4 (44 kelas bergaya `px-(--frame-panel-header-px)`), sedangkan
 * proyek ini Tailwind 3 — kelas itu tidak menghasilkan CSS sama sekali sehingga
 * Frame akan tampil tanpa padding. Dilewati sampai frame.tsx diadaptasi ke
 * sintaks Tailwind 3 (preseden: `reui/alert.tsx` sudah diadaptasi begitu).
 */
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Card key={i} className="shadow-xs">
            <CardContent className="flex flex-col gap-2 p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-[260px] w-full rounded-lg" />
      <Skeleton className="h-[200px] w-full rounded-lg" />
    </div>
  );
}
