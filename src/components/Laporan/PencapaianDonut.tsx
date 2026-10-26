import { Cell, Pie, PieChart } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

/**
 * Cincin progres persentase pencapaian.
 *
 * PENTING (lihat catatan `chromeBulanan` di TargetJahitCharts.tsx): Recharts
 * menemukan `<Pie>` lewat `findAllByType(children, GraphicalChild)` dan `<Cell>`
 * lewat `findAllByType(children, Cell)` — keduanya hanya menelusuri ANAK LANGSUNG
 * (array boleh; fragment & komponen pembungkus tidak dikenali karena `isFragment()`
 * react-is@18 selalu false di React 19). Karena itu `<Pie>` dan kedua `<Cell>`
 * ditulis sebagai anak langsung, bukan lewat helper/fragment.
 *
 * Label tengah sengaja overlay HTML absolut DI LUAR `ChartContainer`, bukan
 * `<Label>` Recharts: posisinya tidak bergantung pada penelusuran anak Recharts
 * dan tipografinya memakai kelas Tailwind biasa.
 */
const DONUT_CONFIG = {
  nilai: { label: 'Tercapai', color: 'hsl(var(--primary))' },
  sisa: { label: 'Sisa', color: 'hsl(var(--primary) / 0.15)' },
} satisfies ChartConfig;

interface PencapaianDonutProps {
  /**
   * Rasio 0..1. Nilai > 1 tetap tampil apa adanya di tengah; lengkungan
   * dijepit ke satu putaran penuh agar tidak menutupi dirinya sendiri.
   */
  pct: number;
  /** Diameter cincin (px). Kartu penjahit ~92, ringkasan keseluruhan ~132. */
  size?: number;
  className?: string;
  tone?: 'default' | 'kpi';
}

export function PencapaianDonut({ pct, size = 104, className, tone = 'default' }: PencapaianDonutProps) {
  const ratio = Number.isFinite(pct) ? pct : 0;
  const tercapai = ratio >= 1;
  const bagian = Math.max(0, Math.min(ratio, 1));

  // Warna mengikuti meter lama: track biru-muda (primary/15), isi primary atau
  // success bila target tercapai.
  const warnaNilai = tone === 'kpi'
    ? tercapai ? 'hsl(var(--kpi-tercapai))' : 'hsl(var(--kpi-realisasi))'
    : tercapai ? 'hsl(var(--success))' : 'hsl(var(--primary))';
  const warnaTrack = tone === 'kpi' ? 'hsl(var(--kpi-realisasi) / 0.15)' : 'hsl(var(--primary) / 0.15)';

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Pencapaian ${(ratio * 100).toFixed(1)} persen`}
    >
      <ChartContainer
        config={DONUT_CONFIG}
        className="aspect-square"
        style={{ width: size, height: size }}
      >
        <PieChart>
          <Pie
            data={[
              { key: 'nilai', value: bagian },
              { key: 'sisa', value: 1 - bagian },
            ]}
            dataKey="value"
            nameKey="key"
            innerRadius="72%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill={warnaNilai} />
            <Cell fill={warnaTrack} />
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            'font-semibold tabular-nums leading-none',
            tercapai ? 'text-success' : 'text-foreground',
          )}
          style={{ fontSize: Math.round(size * 0.22) }}
        >
          {(ratio * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
