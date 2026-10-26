import { useState } from 'react';
import { Brush, CartesianGrid, LabelList, Line, LineChart, ReferenceArea, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { AppSelect } from '@/components/AppSelect';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { buatKpiOrang } from '@/lib/kpiOrang';
import { formatPcs } from './kpiFormat';

export function KpiPersonalChart({ rows, finishing }: { rows: ReturnType<typeof buatKpiOrang>['harian']; finishing: boolean }) {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(Math.max(0, rows.length - 1));
  const points = rows.map((r) => ({ ...r, hari: r.tanggal.slice(8), value: r.observed ? r.pcs : null }));
  const observed = points.filter((p) => p.observed);
  const last = observed.at(-1)?.tanggal;
  const max = observed.reduce<(typeof points)[number] | undefined>((best, p) => !best || p.pcs > best.pcs ? p : best, undefined)?.tanggal;
  const maxIndex = points.findIndex((p) => p.tanggal === max);
  const lastIndex = points.findIndex((p) => p.tanggal === last);
  const labelMax = Math.abs(lastIndex - maxIndex) < 3 ? null : max;
  const selected = points.slice(start, end + 1);
  const plot = points.map((p) => ({ ...p, label: p.tanggal === last || p.tanggal === labelMax ? p.value : null }));
  return <Card className="min-w-0 shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm">Total Selesai {finishing ? 'Finishing' : 'Jahit'} | Per Hari (Pcs)</CardTitle><CardDescription>Latar arsiran menandai hari libur. Titik masa depan belum teramati, bukan setoran nol.</CardDescription></CardHeader><CardContent className="space-y-3">
    <div className="flex flex-wrap items-end gap-2"><AppSelect label="Dari tanggal" className="w-32" value={String(start)} onValueChange={(v) => { const n=Number(v); setStart(n); setEnd((e) => Math.max(e,n)); }} options={points.map((p,i) => ({ value:String(i), label:p.hari }))} /><AppSelect label="Sampai tanggal" className="w-32" value={String(end)} onValueChange={(v) => { const n=Number(v); setEnd(n); setStart((s) => Math.min(s,n)); }} options={points.map((p,i) => ({value:String(i),label:p.hari}))} /><Button size="sm" variant="outline" onClick={() => {setStart(0);setEnd(points.length-1);}}>Sebulan penuh</Button></div>
    <ChartContainer config={{ value:{label:'Setoran',color:'hsl(var(--kpi-realisasi))'} }} className="h-[290px] w-full aspect-auto" role="img" aria-label={`Setoran harian ${finishing?'finishing':'jahit'}, hari libur ditandai`}>
      <LineChart data={plot} margin={{ top:26,right:20,bottom:8,left:0 }} accessibilityLayer>
        <defs><pattern id="kpi-holiday-hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" stroke="hsl(var(--border))" strokeWidth="1" /></pattern></defs>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="hari" tickLine={false} axisLine={false} fontSize={12} /><YAxis width={40} fontSize={12} tickLine={false} axisLine={false} />
        {points.filter((p) => p.libur).map((p) => <ReferenceArea key={p.tanggal} x1={p.hari} x2={p.hari} stroke="hsl(var(--muted-foreground))" strokeWidth={12} strokeOpacity={0.12} fill="url(#kpi-holiday-hatch)" />)}
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_,payload) => {const p=payload?.[0]?.payload as (typeof plot)[number] | undefined;return p?`${p.tanggal} · ${p.libur?'Hari libur':'Hari kerja'}`:'';}} formatter={(v) => <span>{formatPcs(Number(v))} pcs</span>} />} />
        <Line dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={{r:4}} connectNulls={false} isAnimationActive={false}><LabelList dataKey="label" position="top" fill="hsl(var(--foreground))" fontSize={12} /></Line>
        <Brush dataKey="hari" startIndex={start} endIndex={end} height={28} travellerWidth={12} onChange={(r) => { if(r.startIndex!==undefined)setStart(r.startIndex);if(r.endIndex!==undefined)setEnd(r.endIndex); }} />
      </LineChart>
    </ChartContainer>
    <p className="text-xs text-muted-foreground">Rentang {selected[0]?.tanggal} – {selected.at(-1)?.tanggal}. Label angka hanya pada hari tertinggi dan hari terakhir.</p>
    <details className="text-xs"><summary className="cursor-pointer">Lihat data harian</summary><ul className="mt-2 grid gap-1 sm:grid-cols-2">{selected.map((p) => <li key={p.tanggal} className="flex justify-between gap-2 border-b py-2"><span>{p.tanggal}{p.libur?' · Libur':''}</span><span className="tabular-nums">{p.value===null?'Belum teramati':`${formatPcs(p.value)} pcs`}</span></li>)}</ul></details>
  </CardContent></Card>;
}
