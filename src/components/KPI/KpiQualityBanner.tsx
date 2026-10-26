import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { kpiQuality } from '@/lib/kpiQuality';
import type { KpiPeriodeData } from '@/types/kpi';
export function KpiQualityBanner({data,bulan}:{data:KpiPeriodeData;bulan:string}) {
 const issues=kpiQuality(data,bulan,new Date(),data.legacyRateCount??0);
 if(!issues.length)return null;
 return <aside className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3" aria-label="Kualitas data produksi"><h2 className="text-sm font-semibold">Periksa kualitas data ({issues.length})</h2><ul className="space-y-1">{issues.map(i=><li key={i.code} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{i.count} · {i.message}</span><Button asChild variant="link" size="sm" className="h-auto p-0 text-xs"><Link to={`/laporan/pengaturan?tab=${i.tab}&bulan=${bulan}`}>Periksa pengaturan</Link></Button></li>)}</ul></aside>;
}
