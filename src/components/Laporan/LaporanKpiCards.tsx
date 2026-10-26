import { Card, CardContent } from '@/components/ui/card';
import { useId } from 'react';
import type { LogCardMetrics } from '@/lib/logDashboard';
import type { LaporanSummary } from '@/lib/laporanCompute';
import { cn } from '@/lib/utils';

// Warna mengikuti domain yang sudah dipakai aplikasi:
// jahit = biru, finishing = emerald, kancing = violet
// (lihat src/pages/ProductionMonitoring.tsx baris 741/755/769).
const ACCENT = {
  jahit: { text: 'text-blue-600', edge: '#94A3B8' },
  kancing: { text: 'text-violet-600', edge: '#8B5CF6' },
  finishing: { text: 'text-emerald-600', edge: '#10B981' },
} as const;

interface Props {
  kind: keyof typeof ACCENT;
  summary: LaporanSummary;
  /** Header kolom PIC: Penjahit / Pemasang / Finisher. */
  picLabel: string;
  logMetrics?: LogCardMetrics;
  targetState?: string;
  calendarState?: string;
}

interface Tile {
  label: string;
  value: React.ReactNode;
  hint?: string;
  sideValue?: string;
  accent?: boolean;
  gauge?: boolean;
}

// Setiap tahap memakai hue temanya sebagai warna dominan, dipasangkan dengan hue
// tetangga (sewing biru→violet, kancing violet→biru, finishing emerald→biru).
// Nilai gelap dipilih terpisah untuk permukaan kartu dark, bukan dibalik otomatis.
// Kelas ditulis LITERAL (bukan dirangkai runtime) supaya pemindai Tailwind
// benar-benar menghasilkan aturan `stop-color` untuk light dan dark.
const GAUGE = {
  jahit: {
    from: '[stop-color:#2A78D6] dark:[stop-color:#3987E5]',
    to: '[stop-color:#7C3AED] dark:[stop-color:#9085E9]',
  },
  kancing: {
    from: '[stop-color:#7C3AED] dark:[stop-color:#9085E9]',
    to: '[stop-color:#2A78D6] dark:[stop-color:#3987E5]',
  },
  finishing: {
    from: '[stop-color:#059669] dark:[stop-color:#10B981]',
    to: '[stop-color:#2563EB] dark:[stop-color:#3987E5]',
  },
} as const;

function ProgressGauge({percent,kind,label}:{percent:number;kind:keyof typeof ACCENT;label:string}) {
  // React 19 menghasilkan id seperti «r0»; buang semua karakter non-SVG-safe
  // supaya `url(#id)` tetap valid.
  const id=`gauge-${useId().replace(/[^A-Za-z0-9_-]/g,'')}`;
  const g=GAUGE[kind];
  const capped=Math.max(0,Math.min(100,percent));
  // Setengah lingkaran berpusat (100,110) radius 80: t=0 di kiri, t=1 di kanan.
  // Busurnya SELALU ≤180°, jadi `large-arc-flag` harus 0 — hanya `sweep-flag`
  // yang 1 agar bagian yang diwarnai berjalan searah jarum jam di atas.
  const t=capped/100;
  const x=100-80*Math.cos(Math.PI*t);
  const y=110-80*Math.sin(Math.PI*t);
  const arc=`M20 110 A80 80 0 0 1 ${x} ${y}`;
  return <div className="flex flex-col items-center">
    <svg viewBox="0 0 200 124" role="img" aria-label={`Realisasi ${percent.toLocaleString('id-ID',{maximumFractionDigits:1})} persen. ${label||'Target tercapai'}`} className="h-[96px] w-full max-w-[172px]">
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" className={g.from}/>
        <stop offset="100%" className={g.to}/>
      </linearGradient></defs>
      <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="currentColor" strokeOpacity=".10" strokeWidth="24" strokeLinecap="round"/>
      {capped>0&&<path d={arc} fill="none" stroke={`url(#${id})`} strokeWidth="24" strokeLinecap="round"/>}
      {capped>2&&<path d={`M${x} ${y-6} L${x+1.8} ${y-1.8} L${x+6} ${y} L${x+1.8} ${y+1.8} L${x} ${y+6} L${x-1.8} ${y+1.8} L${x-6} ${y} L${x-1.8} ${y-1.8} Z`} fill="#fff" fillOpacity=".95"/>}
      <text x="100" y="92" textAnchor="middle" className="fill-foreground" fontSize="34" fontWeight="600" letterSpacing="-1.2">{percent>100?'+':''}{percent.toLocaleString('id-ID',{maximumFractionDigits:0})}%</text>
    </svg>
    <span className="-mt-1.5 text-xs font-medium text-muted-foreground">{label}</span>
  </div>;
}

export function LaporanKpiCards({ kind, summary, picLabel, logMetrics, targetState, calendarState }: Props) {
  const n = (value:number) => value.toLocaleString('id-ID',{maximumFractionDigits:1});
  const extra=logMetrics?.extra ?? null;
  const gaugeLabel=targetState||!logMetrics||logMetrics.target===null||logMetrics.target===0?'Target belum tersedia':extra!==null&&extra>0?`Extra ${n(extra)} pcs`:logMetrics.remaining===0?'':`Kurang ${n(logMetrics.remaining??0)} pcs`;
  const tiles: Tile[] = logMetrics ? [
    {label:'Total Qty',value:summary.totalQty,accent:true},
    {label:'Produk',value:summary.produkCount,accent:true},
    {label:'Realisasi vs Target',value:targetState||logMetrics.percent===null?'—':<ProgressGauge percent={logMetrics.percent} kind={kind} label={gaugeLabel}/>,accent:false,gauge:true},
    {label:'Rata-rata per Hari',value:calendarState||logMetrics.average===null?'—':`${n(logMetrics.average)} pcs`,accent:true},
  ] : [
    { label: 'Total Qty', value: summary.totalQty, hint: 'pcs dikerjakan', accent: true },
    { label: 'Produk', value: summary.produkCount, hint: `${summary.workOrderCount} work order` },
    { label: picLabel, value: summary.picCount, hint: 'orang tercatat' },
    { label: 'Bukti Barang', value: summary.buktiCount, hint: 'baris punya bukti' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card
          key={tile.label}
          className="shadow-xs overflow-hidden border-l-[3px]"
          style={{ borderLeftColor: ACCENT[kind].edge }}
        >
          <CardContent className={cn('flex flex-col gap-0.5 p-3', logMetrics && 'min-h-[160px]',tile.gauge&&'items-center')}>
            <span className={cn('text-xs font-medium leading-5 text-muted-foreground',logMetrics&&'text-xs',tile.gauge&&'self-start')}>{tile.label}</span>
            {tile.gauge ? <div className="flex flex-1 items-center justify-center self-stretch">{tile.value}</div> : <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span
                className={cn(
                  logMetrics ? 'text-[3rem] font-semibold tabular-nums leading-none tracking-tight' : 'text-2xl font-semibold tabular-nums leading-tight',
                  'text-slate-900',
                  tile.accent && ACCENT[kind].text,
                )}
              >
                {typeof tile.value === 'number' ? tile.value.toLocaleString('id-ID') : tile.value}
              </span>
              {tile.sideValue && <span className="shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">{tile.sideValue}</span>}
            </div>}
            {tile.hint && <span className="text-xs text-muted-foreground">{tile.hint}</span>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

