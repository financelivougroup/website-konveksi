import { Card, CardContent } from '@/components/ui/card';
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
}

interface Tile {
  label: string;
  value: number;
  hint: string;
  accent?: boolean;
}

export function LaporanKpiCards({ kind, summary, picLabel }: Props) {
  const tiles: Tile[] = [
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
          <CardContent className="flex flex-col gap-0.5 p-4">
            <span className="text-[11px] font-medium text-muted-foreground">{tile.label}</span>
            <span
              className={cn(
                'text-2xl font-semibold tabular-nums leading-tight text-slate-900',
                tile.accent && ACCENT[kind].text,
              )}
            >
              {tile.value.toLocaleString('id-ID')}
            </span>
            <span className="text-[11px] text-slate-400">{tile.hint}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

