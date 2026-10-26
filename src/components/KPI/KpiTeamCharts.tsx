import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PencapaianDonut } from '@/components/Laporan/PencapaianDonut';
import { CHART_CONFIG } from '@/components/Laporan/TargetJahitCharts';
import { formatMonthYearFromYm } from '@/lib/monthYear';
import type { BarisOrang, HppRingkas } from '@/lib/kpi';
import type { KpiCostPoint, KpiUpahPoint } from '@/lib/kpiTeam';
import { formatPcs } from './kpiFormat';

function currency(value: number | null) { return value === null ? 'Belum tersedia' : `Rp${Math.round(value).toLocaleString('id-ID')}`; }

export function KpiGauge({ current, goal, title }: { current: number; goal: number; title: string }) {
  return <Card className="shadow-none"><CardContent className="flex flex-wrap items-center gap-5 p-4">
    <PencapaianDonut pct={goal > 0 ? current / goal : 0} size={132} tone="kpi" />
    <div className="space-y-2"><h2 className="text-sm font-semibold">{title}</h2><p className="text-sm">Realisasi <strong className="tabular-nums">{formatPcs(current)}</strong> | Target <strong className="tabular-nums">{formatPcs(goal)}</strong> pcs</p><p className="text-xs text-muted-foreground">{goal > 0 ? current >= goal ? `Surplus ${formatPcs(current - goal)} pcs` : `Kurang ${formatPcs(goal - current)} pcs` : 'Target belum ditetapkan; persentase belum dapat dinilai.'}</p></div>
  </CardContent></Card>;
}

/** Kedua seri bersatuan sama; null tetap berupa jeda, bukan nol. */
export function KpiTrendChart({ title, data, unit = 'pcs', showTarget = true }: { title: string; data: readonly KpiCostPoint[]; unit?: 'pcs' | 'rupiah'; showTarget?: boolean }) {
  const format = (n: number | null) => unit === 'rupiah' ? currency(n) : n === null ? 'Belum tersedia' : `${formatPcs(n)} pcs`;
  const plot = data.map((p) => ({ ...p, label: formatMonthYearFromYm(p.bulan) }));
  return <Card className="min-w-0 shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle><CardDescription>{unit === 'rupiah' ? 'Biaya per pcs' : 'Jumlah pcs'} · {showTarget ? 'Target dan realisasi per bulan' : 'Realisasi pribadi per bulan'}</CardDescription></CardHeader><CardContent>
    {!data.some((p) => p.target !== null || p.realisasi !== null) ? <p className="py-8 text-sm text-muted-foreground">Belum ada nilai untuk dibandingkan.</p> : <ChartContainer config={CHART_CONFIG} className="h-[240px] w-full aspect-auto" role="img" aria-label={title}>
      <LineChart data={plot} margin={{ top: 8, right: 16, bottom: 8, left: 4 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} minTickGap={25} />
        <YAxis tickLine={false} axisLine={false} width={unit === 'rupiah' ? 76 : 48} fontSize={12} tickFormatter={(n) => unit === 'rupiah' ? currency(Number(n)) : formatPcs(Number(n))} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => <span className="text-foreground">{name === 'target' ? 'Target' : 'Realisasi'}: {format(Number(v))}</span>} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {showTarget && <Line dataKey="target" name="target" stroke="var(--color-target)" strokeDasharray="5 3" strokeWidth={2} dot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />}
        <Line dataKey="realisasi" name="realisasi" stroke="var(--color-realisasi)" strokeWidth={2} dot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>}
    {plot.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Terakhir ({plot.at(-1)!.label}): realisasi {format(plot.at(-1)!.realisasi)}{showTarget ? ` · target ${format(plot.at(-1)!.target)}` : ''}.</p>}
    <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted-foreground">Lihat angka sebagai tabel</summary><Table><TableHeader><TableRow><TableHead>Bulan</TableHead><TableHead>Realisasi</TableHead>{showTarget && <TableHead>Target</TableHead>}</TableRow></TableHeader><TableBody>{plot.map((p) => <TableRow key={p.bulan}><TableCell>{p.label}</TableCell><TableCell>{format(p.realisasi)}</TableCell>{showTarget && <TableCell>{format(p.target)}</TableCell>}</TableRow>)}</TableBody></Table></details>
  </CardContent></Card>;
}

export function KpiUpahDivisiBulananChart({ data }: { data: readonly KpiUpahPoint[] }) {
  return <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-3">{(['leader', 'penjahit', 'finishing'] as const).map((d) => <KpiTrendChart key={d} title={`Upah ${d === 'leader' ? 'Leader' : d === 'finishing' ? 'Finishing' : 'Penjahit'} (1 pcs) | Bulanan`} data={data.filter((p) => p.divisi === d)} unit="rupiah" />)}</div>;
}

export function KpiPersonCostChart({ rows }: { rows: readonly BarisOrang[] }) {
  const points = rows.map((r) => ({ nama: r.nama, realisasi: r.upahPerPcs, target: r.targetUpahPerPcs }));
  if (!points.some((p) => p.realisasi !== null || p.target !== null)) return <p className="px-3 py-2 text-xs text-muted-foreground">Tarif atau target biaya belum tersedia untuk grafik perbandingan.</p>;
  return <ChartContainer config={CHART_CONFIG} className="w-full aspect-auto" style={{ height: Math.max(150, points.length * 62 + 50) }} role="img" aria-label="Perbandingan target dan realisasi upah per pcs setiap orang"><BarChart data={points} layout="vertical" margin={{ left: 6, right: 20, bottom: 8 }} accessibilityLayer><XAxis type="number" fontSize={12} tickFormatter={(v) => currency(Number(v))} tickLine={false} axisLine={false} /><YAxis dataKey="nama" type="category" width={105} fontSize={12} tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent formatter={(v, n) => <span>{n === 'target' ? 'Target' : 'Realisasi'}: {currency(Number(v))}/pcs</span>} />} /><ChartLegend content={<ChartLegendContent />} /><Bar dataKey="target" fill="var(--color-target)" maxBarSize={10} radius={[0,4,4,0]} isAnimationActive={false} /><Bar dataKey="realisasi" fill="var(--color-realisasi)" maxBarSize={10} radius={[0,4,4,0]} isAnimationActive={false} /></BarChart></ChartContainer>;
}

export function KpiHppBreakdown({ hpp, target }: { hpp: HppRingkas; target: number | null }) {
  const value = hpp.perPcs;
  const parts = [{ nama: 'Penjahit', total: hpp.upahPenjahit }, { nama: 'Leader', total: hpp.upahLeader }, { nama: 'Finishing', total: hpp.upahFinishing }];
  const config = {
    ...CHART_CONFIG,
    penjahit: { label: 'Penjahit', theme: { light: '#2a78d6', dark: '#3987e5' } },
    leader: { label: 'Leader', theme: { light: '#e34948', dark: '#e66767' } },
    finishing: { label: 'Finishing', theme: { light: '#7568aa', dark: '#9b7fdb' } },
  };
  const components = [{ nama: 'Realisasi / pcs', penjahit: hpp.pcsSewing > 0 ? hpp.upahPenjahit / hpp.pcsSewing : null, leader: hpp.pcsSewing > 0 ? hpp.upahLeader / hpp.pcsSewing : null, finishing: hpp.pcsSewing > 0 ? hpp.upahFinishing / hpp.pcsSewing : null }];
  return <Card className="min-w-0 shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm">Harga Pokok Produksi (1 pcs)</CardTitle><CardDescription>Σ upah penjahit + leader + finishing ÷ pcs sewing</CardDescription></CardHeader><CardContent className="space-y-3">
    <div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-muted-foreground">Realisasi{hpp.tarifKosong > 0 ? ' (parsial)' : ''}</p><p className="text-xl font-semibold tabular-nums">{currency(value)}</p></div><div><p className="text-xs text-muted-foreground">Target</p><p className="text-xl font-semibold tabular-nums">{target === null ? 'Target belum diisi' : currency(target)}</p></div></div>
    {(value !== null || target !== null) && <ChartContainer config={config} className="h-[130px] w-full aspect-auto" role="img" aria-label="Perbandingan HPP realisasi dan target per pcs">
      <BarChart data={[{ nama: 'HPP / pcs', realisasi: value, target }]} margin={{ left: 4, right: 8, bottom: 8 }} accessibilityLayer>
        <XAxis dataKey="nama" tickLine={false} axisLine={false} fontSize={12} /><YAxis width={74} fontSize={12} tickFormatter={(v) => currency(Number(v))} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => <span>{n === 'target' ? 'Target' : 'Realisasi'} {currency(Number(v))}</span>} />} /><ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="target" fill="var(--color-target)" maxBarSize={30} radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar dataKey="realisasi" fill="var(--color-realisasi)" maxBarSize={30} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>}
    {hpp.pcsSewing > 0 && <ChartContainer config={config} className="h-[100px] w-full aspect-auto" role="img" aria-label="Komponen upah HPP per pcs sewing">
      <BarChart data={components} layout="vertical" margin={{ left: 0, right: 8 }} accessibilityLayer><XAxis type="number" hide /><YAxis type="category" dataKey="nama" hide />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => <span>{String(n)}: {currency(Number(v))}/pcs</span>} />} /><ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="penjahit" stackId="hpp" fill="var(--color-penjahit)" maxBarSize={14} isAnimationActive={false} /><Bar dataKey="leader" stackId="hpp" fill="var(--color-leader)" maxBarSize={14} isAnimationActive={false} /><Bar dataKey="finishing" stackId="hpp" fill="var(--color-finishing)" maxBarSize={14} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>}
    <ul className="grid gap-1 text-xs sm:grid-cols-3">{parts.map((p) => <li key={p.nama}>{p.nama}: {hpp.pcsSewing > 0 ? currency(p.total / hpp.pcsSewing) : 'Belum tersedia'}/pcs</li>)}</ul>
    <p className="text-xs text-muted-foreground">Finishing dapat tertinggal dari sewing (WIP); angka ini perkiraan sampai finishing selesai.{hpp.tarifKosong > 0 ? ` ${hpp.tarifKosong} entry belum bertarif; nilai yang diketahui belum mencakup seluruh upah.` : ''}</p>
  </CardContent></Card>;
}
