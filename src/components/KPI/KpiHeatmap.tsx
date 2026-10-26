import { useMemo,useRef,useState } from 'react';
import { Card,CardContent,CardHeader,CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip,TooltipContent,TooltipProvider,TooltipTrigger } from '@/components/ui/tooltip';
import { ToggleGroup,ToggleGroupItem } from '@/components/ui/toggle-group';
import { heatmapDays } from '@/lib/kpiHeatmap';
import type { KpiPeriodeData } from '@/types/kpi';
import './kpiPhase7.css';

export function KpiHeatmap({data,fromMonth,toMonth}:{data:KpiPeriodeData;fromMonth:string;toMonth:string}) {
 const [division,setDivision]=useState<'penjahit'|'finishing'>('penjahit');
 const [focus,setFocus]=useState(0);const refs=useRef<(HTMLButtonElement|null)[]>([]);
 const days=useMemo(()=>heatmapDays(data.entries,fromMonth,toMonth,division,data.libur),[data,fromMonth,toMonth,division]);
 const padding=days.length?new Date(Number(days[0].tanggal.slice(0,4)),Number(days[0].tanggal.slice(5,7))-1,1).getDay():0;
 const describe=(d:typeof days[number])=>`${d.tanggal} · ${division==='penjahit'?'Jahit':'Finishing'} · ${d.future?'Belum teramati':`${d.pcs.toLocaleString('id-ID')} pcs${d.pcs===0?' · tidak ada setoran tercatat':''}`}${d.libur?' · Hari libur':''}`;
 return <Card className="min-w-0 shadow-none"><CardHeader className="pb-2"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-sm">Kalender Produksi Harian Team</CardTitle><ToggleGroup type="single" value={division} onValueChange={v=>{if(v==='penjahit'||v==='finishing'){setDivision(v);setFocus(0);}}} aria-label="Metrik heatmap"><ToggleGroupItem value="penjahit">Jahit</ToggleGroupItem><ToggleGroupItem value="finishing">Finishing</ToggleGroupItem></ToggleGroup></div><p className="text-xs text-muted-foreground">{fromMonth} – {toMonth}. Tahapan ditampilkan terpisah. Gunakan tombol panah untuk berpindah tanggal.</p></CardHeader><CardContent className="space-y-3">
 <TooltipProvider><div className="max-w-full overflow-x-auto pb-2"><div className="grid w-max grid-flow-col grid-rows-7 gap-1" role="group" aria-label="Hari produksi"><div className="contents" aria-hidden="true">{Array.from({length:padding},(_,i)=><span key={i} className="size-6" />)}</div>{days.map((d,i)=><Tooltip key={d.tanggal}><TooltipTrigger asChild><Button ref={el=>{refs.current[i]=el;}} type="button" size="icon" variant="outline" tabIndex={focus===i?0:-1} onFocus={()=>setFocus(i)} onKeyDown={e=>{let n=i;if(e.key==='ArrowDown')n=i+1;else if(e.key==='ArrowUp')n=i-1;else if(e.key==='ArrowRight')n=i+7;else if(e.key==='ArrowLeft')n=i-7;else if(e.key==='Home')n=0;else if(e.key==='End')n=days.length-1;else return;e.preventDefault();n=Math.min(days.length-1,Math.max(0,n));setFocus(n);refs.current[n]?.focus();}} className={`kpi-heat-cell size-6 rounded-sm p-0 ${d.libur?'kpi-heat-holiday':''} ${d.future?'kpi-heat-future':''}`} data-level={d.future?0:d.level} aria-label={describe(d)}><span className="sr-only">{describe(d)}</span></Button></TooltipTrigger><TooltipContent><p>{describe(d)}</p></TooltipContent></Tooltip>)}</div></div></TooltipProvider>
 <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">Skala pcs/hari: {['0','1–10','11–30','31–60','61+'].map((label,i)=><span className="inline-flex items-center gap-1" key={label}><span className="kpi-heat-cell inline-block size-3 rounded-sm" data-level={i} />{label}</span>)}<span>Garis putus = libur · arsiran = belum teramati</span></div>
 <details className="text-xs"><summary className="cursor-pointer">Lihat daftar tanggal dan jumlah</summary><ul className="mt-2 grid gap-1 sm:grid-cols-2">{days.map(d=><li key={d.tanggal} className="border-b py-1">{describe(d)}</li>)}</ul></details>
 </CardContent></Card>;
}
