import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Line, LineChart } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ChartContainer } from '@/components/ui/chart';
import { Badge } from '@/components/reui/badge';
import { DataTable } from '@/components/Table/DataTable';
import type { SortRule } from '@/types';
import type { BarisOrang } from '@/lib/kpi';
import type { KpiTeamData } from '@/lib/kpiTeam';
import { AppSelect } from '@/components/AppSelect';
import { formatPcs, formatPersen } from './kpiFormat';
import { KpiGauge, KpiHppBreakdown, KpiPersonCostChart, KpiTrendChart, KpiUpahDivisiBulananChart } from './KpiTeamCharts';

const currency = (v: number | null) => v === null ? 'Tarif belum diisi' : `Rp${Math.round(v).toLocaleString('id-ID')}`;
function Nama({ row }: { row: BarisOrang }) { return <Button asChild variant="link" size="sm" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left text-xs"><Link to={`/laporan/orang/${row.orangId}`}>{row.nama}</Link></Button>; }

export function KpiTeamMonthSections({ team, bolehLihatBiaya }: { team: KpiTeamData; bolehLihatBiaya: boolean }) {
  const r = team.jahit;
  const withoutGoal = r.goal <= 0;
  const label = withoutGoal ? 'Target belum ditetapkan' : r.final ? r.status : r.ritme === 'hijau' ? 'Sesuai ritme' : r.ritme === 'kuning' ? 'Hampir sesuai ritme' : 'Perlu dikejar';
  const prev = team.perbandingan?.sebelumnya;
  return <div className="space-y-5">
    <Card className="shadow-none"><CardContent className="space-y-2 p-4"><Badge variant={withoutGoal ? 'outline' : (r.final ? r.current >= r.goal : r.ritme === 'hijau') ? 'success-light' : !r.final && r.ritme === 'kuning' ? 'warning-light' : 'destructive'}>{label}</Badge>
      <p className="text-sm">{withoutGoal ? 'Isi target bulanan untuk menilai ritme produksi.' : r.ngebut.habis ? `Hari kerja habis · sisa ${formatPcs(r.sisaTarget)} pcs.` : `Butuh ${formatPcs(r.ngebut.perHari)} pcs/hari kerja · rata-rata 7 hari ${formatPcs(r.rataRataHariKerja)} pcs/hari.`}</p>
      {!withoutGoal && <p className="text-xs text-muted-foreground">Proyeksi akhir bulan {formatPersen(r.proyeksiProgress)} ({formatPcs(r.proyeksi)} pcs), {r.proyeksi >= r.goal ? `surplus ${formatPcs(r.proyeksi - r.goal)}` : `kurang ${formatPcs(r.goal - r.proyeksi)}`} pcs.</p>}
    </CardContent></Card>
    <KpiGauge title="Progress Produksi Jahit" current={r.current} goal={r.goal} />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title="Sisa Hari Kerja" value={r.sisaHariKerja} unit="hari" previous={prev?.sisaHariKerja} points={team.perbandingan?.sparkline.map((d) => d.sisaHari)} />
      <Metric title="Sisa Target Produksi" value={r.sisaTarget} unit="pcs" previous={prev?.sisaTarget} points={team.perbandingan?.sparkline.map((d) => d.sisaTarget)} />
      <Metric title="Target Normal | Per Hari" value={r.targetNormalPerHari} unit="pcs/hari" previous={prev?.targetNormalPerHari} points={team.perbandingan?.sparkline.map((d) => d.normal)} />
      <Metric title="Target Ngebut | Per Hari" value={r.ngebut.perHari} unit={r.ngebut.habis ? 'pcs · Hari kerja habis' : 'pcs/hari'} previous={prev?.ngebut.perHari} points={team.perbandingan?.sparkline.map((d) => d.ngebut)} />
    </div>
    <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
      {bolehLihatBiaya && <KpiHppBreakdown hpp={team.hpp} target={team.hppTarget} />}
      <Card className="shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm">Perlu Perhatian</CardTitle><CardDescription>Maksimal tiga orang dengan target yang belum tercapai.</CardDescription></CardHeader><CardContent className="space-y-3">{team.perhatian.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada orang bertarget yang tertinggal.</p> : team.perhatian.map((row) => <div key={row.orangId} className="flex items-center justify-between gap-3 rounded-md border p-3"><div><Nama row={row} /><p className="text-xs text-muted-foreground">{formatPcs(row.current)} / {formatPcs(row.goal)} pcs</p></div><div className="text-right"><strong className="text-sm">{formatPersen(row.progress)}</strong><p className="text-xs text-muted-foreground">Kurang {formatPcs(row.sisaTarget)} pcs</p></div></div>)}</CardContent></Card>
    </div>
    <PeopleSection title="Penjahit" rows={team.jahitPerOrang} mode="bulan" bolehLihatBiaya={bolehLihatBiaya} normal={team.targetNormalPenjahit} />
    <PeopleSection title="Finishing" rows={team.finishingPerOrang} mode="bulan" bolehLihatBiaya={bolehLihatBiaya} />
  </div>;
}

export function KpiTeamAccumulationSections({ team, bolehLihatBiaya }: { team: KpiTeamData; bolehLihatBiaya: boolean }) {
  const r = team.jahit;
  return <div className="space-y-5">
    <KpiGauge title="Produksi Jahit | Akumulasi" current={r.current} goal={r.goal} />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Metric title="Sisa Target Produksi | Akumulasi" value={r.sisaTarget} unit="pcs" /><Metric title="Target Ngebut | Akumulasi" value={team.ngebutAkumulasi.perHari} unit={team.ngebutAkumulasi.habis ? 'pcs · Hari kerja habis' : 'pcs/hari kerja tersisa bulan terpilih'} /></div>
    {bolehLihatBiaya && <KpiHppBreakdown hpp={team.hpp} target={team.hppTarget} />}
    <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2"><KpiTrendChart title="Progress Produksi Jahit | Bulan ke Bulan" data={team.bulananJahit.map((p) => ({ bulan: p.bulan, target: p.goal, realisasi: p.current }))} />{bolehLihatBiaya && <KpiTrendChart title="HPP (1 pcs) | Bulan ke Bulan" data={team.bulananHpp} unit="rupiah" />}</div>
    {bolehLihatBiaya && <KpiUpahDivisiBulananChart data={team.bulananUpah} />}
    <PeopleSection title="Penjahit" rows={team.jahitPerOrang} mode="akumulasi" bolehLihatBiaya={bolehLihatBiaya} />
    <PeopleSection title="Finishing" rows={team.finishingPerOrang} mode="akumulasi" bolehLihatBiaya={bolehLihatBiaya} />
  </div>;
}

function Metric({ title, value, unit, previous, points }: { title: string; value: number; unit: string; previous?: number; points?: number[] }) {
  const delta = previous === undefined ? null : value - previous;
  return <Card className="min-w-0 shadow-none"><CardContent className="p-3"><h3 className="text-xs font-medium text-muted-foreground">{title}</h3><p className="mt-1 text-2xl font-semibold tabular-nums">{formatPcs(value)}</p><p className="text-xs text-muted-foreground">{unit}</p>{delta !== null && <p className="mt-2 text-xs text-muted-foreground">{delta >= 0 ? '+' : '−'}{formatPcs(Math.abs(delta))} vs bulan lalu (hari yang setara)</p>}
    {points && points.length > 0 && <ChartContainer config={{ value: { label: title, color: 'hsl(var(--kpi-aksen))' } }} className="mt-2 h-9 w-full aspect-auto" role="img" aria-label={`Tren ${title} dari awal bulan sampai tanggal laporan`}><LineChart data={points.map((v, i) => ({ hari: i + 1, value: v }))}><Line dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ChartContainer>}
  </CardContent></Card>;
}

function PeopleSection({ title, rows, mode, bolehLihatBiaya, normal }: { title: string; rows: readonly BarisOrang[]; mode: 'bulan' | 'akumulasi'; bolehLihatBiaya: boolean; normal?: number }) {
  return <section className="min-w-0 space-y-3" aria-label={`${title} ${mode}`}><div className={`border-l-4 pl-3 ${title === 'Penjahit' ? 'border-l-orange-500' : 'border-l-teal-600'}`}><h2 className="text-sm font-semibold uppercase tracking-wide">{title}{mode === 'akumulasi' ? ' | Akumulasi' : ''}</h2><p className="text-xs text-muted-foreground">{title === 'Finishing' ? 'Entry finishing; tidak termasuk gauge produksi jahit.' : 'Entry sewing; leader tetap diberi penanda tersendiri.'}</p></div>
    {normal !== undefined && <Metric title="Target Normal Penjahit | Per Hari" value={normal} unit="pcs/hari (tidak termasuk target leader)" />}
    <Card className="shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm">Progress Setoran {title === 'Finishing' ? 'Finishing' : 'Jahitan'}</CardTitle><CardDescription>Realisasi / target dan persen tetap terbaca di luar batang. Garis di ujung track menandai target.</CardDescription></CardHeader><CardContent className="space-y-4">{rows.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada target atau setoran.</p> : rows.map((row) => <div key={row.orangId} className="space-y-1.5"><div className="flex flex-wrap justify-between gap-2"><div className="flex gap-2"><Nama row={row} />{row.divisi === 'leader' && <Badge variant="outline">Leader</Badge>}</div><span className="text-xs tabular-nums">{formatPcs(row.current)} / {formatPcs(row.goal)} pcs · {row.goal > 0 ? formatPersen(row.progress) : 'Tanpa target'}</span></div><div className="relative pr-px"><Progress value={Math.min(100, Math.max(0, row.progress * 100))} className="h-2 bg-destructive/15 [&>div]:bg-[hsl(var(--kpi-realisasi))]" aria-label={`${row.nama}: ${formatPcs(row.current)} dari ${formatPcs(row.goal)} pcs`} />{row.goal > 0 && <span className="absolute -top-1 right-0 h-4 w-px bg-foreground" aria-hidden="true" />}</div><p className="text-xs text-muted-foreground">{row.goal <= 0 ? 'Target belum ditetapkan' : row.current > row.goal ? `Surplus ${formatPcs(row.current - row.goal)} pcs` : `Kurang ${formatPcs(row.sisaTarget)} pcs`}</p></div>)}</CardContent></Card>
    <PeopleTable title={`Rincian Kondisi Sisa Target — ${title}`} rows={rows} mode={mode} />
    {bolehLihatBiaya && <PeopleTable title={`Biaya Upah ${title} (1 pcs)`} rows={rows} mode={mode} cost />}
  </section>;
}

function PeopleTable({ title, rows, mode, cost = false }: { title: string; rows: readonly BarisOrang[]; mode: 'bulan' | 'akumulasi'; cost?: boolean }) {
  const [sort, setSort] = useState<SortRule>({ field: 'nama', dir: 'asc' });
  const records = useMemo(() => rows.map((r) => ({ ...r, id: r.orangId, selisih: r.goal - r.current, ngebutAngka: r.ngebut.perHari })), [rows]);
  const sorted = useMemo(() => [...records].sort((a, b) => {
    const av = a[sort.field as keyof typeof a]; const bv = b[sort.field as keyof typeof b];
    const cmp = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv, 'id') : Number(av) - Number(bv);
    return sort.dir === 'asc' ? cmp : -cmp;
  }), [records, sort]);
  const nama = { key: 'nama', label: 'Nama', width: '190px', render: (record: Record<string, unknown>) => <Nama row={record as unknown as BarisOrang} /> };
  const columns = cost ? [nama,
    { key: 'upahPerPcs', label: 'Realisasi / pcs', width: '180px', render: (r: Record<string, unknown>) => <span className="text-xs tabular-nums">{currency(r.upahPerPcs as number | null)}{(r.upah as BarisOrang['upah']).tarifKosong > 0 ? ' (tarif sebagian belum diisi)' : ''}</span> },
    { key: 'targetUpahPerPcs', label: 'Target / pcs', width: '180px', render: (r: Record<string, unknown>) => <span className="text-xs tabular-nums">{r.targetUpahPerPcs === null ? 'Target belum diisi' : currency(r.targetUpahPerPcs as number)}</span> },
  ] : [nama,
    { key: mode === 'akumulasi' ? 'selisih' : 'sisaTarget', label: mode === 'akumulasi' ? 'Selisih | Akumulasi' : 'Sisa Target | Bulanan', width: '190px', render: (r: Record<string, unknown>) => <span className={`text-xs tabular-nums ${Number(r.selisih) < 0 ? 'text-success' : ''}`}>{formatPcs(Number(mode === 'akumulasi' ? r.selisih : r.sisaTarget))} pcs{Number(r.selisih) < 0 ? ' (surplus)' : ''}</span> },
    { key: 'ngebutAngka', label: 'Target Ngebut / Hari', width: '220px', render: (r: Record<string, unknown>) => <span className="text-xs tabular-nums">{formatPcs(Number(r.ngebutAngka))} pcs{(r.ngebut as BarisOrang['ngebut']).habis ? ' · Hari kerja habis' : '/hari'}</span> },
  ];
  return <Card className="min-w-0 shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle><CardDescription>{cost ? 'Nilai aktual dibobot pcs bertarif. Tarif kosong tidak dianggap nol.' : mode === 'akumulasi' ? 'Selisih = target − realisasi. Negatif berarti surplus.' : 'Klik nama untuk melihat halaman orang.'}</CardDescription></CardHeader><CardContent className="p-0">{cost && <KpiPersonCostChart rows={rows} />}<div className="flex flex-wrap items-end gap-2 px-3 pb-3"><AppSelect label="Urutkan kolom" className="w-52" value={sort.field} onValueChange={(field) => setSort((s) => ({ ...s, field }))} options={columns.map((c) => ({ value: c.key, label: c.label }))} /><Button variant="outline" size="sm" onClick={() => setSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))} aria-label="Balik arah urutan">{sort.dir === 'asc' ? 'Naik ↑' : 'Turun ↓'}</Button></div><DataTable variant="plain" columns={columns} data={sorted} sorts={[sort]} onSortColumn={(field, dir) => setSort({ field, dir })} /></CardContent></Card>;
}
