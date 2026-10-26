import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { KpiQualityBanner } from './KpiQualityBanner';
import { Badge } from '@/components/reui/badge';
import { formatMonthYearFromYm } from '@/lib/monthYear';
import { cn } from '@/lib/utils';
import type { KpiMode, KpiScope } from '@/types/kpi';
import { KpiEmptyState, KpiErrorState, KpiHeader, KpiMonthChips, KpiSkeleton } from './KpiShell';
import { KpiTeamAccumulationSections, KpiTeamMonthSections } from './KpiTeamSections';
import { useKpiBulan } from './useKpiBulan';
import { useKpiData } from './useKpiData';
import { KpiHeatmap } from './KpiHeatmap';

/** Team hanya dipasang setelah scope owner/finance diverifikasi oleh router. */
export function KpiTeamPage({ scope }: { scope: KpiScope }) {
  const [mode, setMode] = useState<KpiMode>('bulan');
  const { bulan, setBulan, tersedia, memuat: memuatBulan, error: errorBulan, muatUlang: muatBulan } = useKpiBulan(scope.bisaTim);
  const { data, team, loading, error: errorData, muatUlang } = useKpiData({ scope, mode, bulan, orangId: null, bulanTersedia: tersedia, aktif: scope.bisaTim && !memuatBulan && !errorBulan });
  const error = errorBulan ?? errorData;
  const fromMonth=mode==='bulan'?bulan:tersedia.filter(b=>b<=bulan).sort()[0]??bulan;
  const refresh = useCallback(() => { muatUlang(); muatBulan(); }, [muatUlang, muatBulan]);
  if (!scope.bisaTim) return <KpiEmptyState judul="Tidak ada akses tim" deskripsi="Halaman tim hanya tersedia untuk Owner dan Finance." />;
  return <div className={cn('min-w-0 px-4 pb-5 pt-4 sm:px-6', mode === 'bulan' ? 'kpi-mode-bulan' : 'kpi-mode-akumulasi')}><div className="min-w-0 space-y-3">
    <KpiHeader mode={mode} onModeChange={setMode} onRefresh={refresh} refreshing={loading || memuatBulan}
      subjudul={mode === 'bulan' ? `Ringkasan seluruh tim — ${formatMonthYearFromYm(bulan)}` : `Akumulasi sejak pencatatan pertama sampai ${formatMonthYearFromYm(bulan)}`}
      aksi={<>{data && <Badge variant="outline" className="hidden sm:inline-flex">{data.orang.filter((o) => o.aktif).length} orang aktif</Badge>}<Button asChild variant="outline" size="sm"><Link to="/laporan/pengaturan">Pengaturan</Link></Button></>} />
    <KpiMonthChips bulan={bulan} onBulanChange={setBulan} tersedia={tersedia} tersembunyi={mode === 'akumulasi'} />
    {error && <KpiErrorState pesan={error.message} onRetry={refresh} sedangMencoba={memuatBulan || (!errorBulan && loading)} />}
    {!error && (loading || memuatBulan) && <KpiSkeleton />}
    {!error && data && <KpiQualityBanner data={data} bulan={bulan} />}
    {!error && team && (mode === 'bulan' ? <KpiTeamMonthSections team={team} bolehLihatBiaya={scope.bisaTim} /> : <KpiTeamAccumulationSections team={team} bolehLihatBiaya={scope.bisaTim} />)}
    {!error && data && team && <KpiHeatmap key={`${mode}:${bulan}`} data={data} fromMonth={fromMonth} toMonth={bulan} />}
    {!error && team && team.jahit.current === 0 && team.finishing.current === 0 && <KpiEmptyState judul="Belum ada setoran pada periode ini" deskripsi="Target tetap ditampilkan. Catat realisasi melalui menu entry jahit/finishing yang sudah ada." />}
  </div></div>;
}
