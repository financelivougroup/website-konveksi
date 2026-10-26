import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/reui/badge';
import { cn } from '@/lib/utils';
import { formatMonthYearFromYm } from '@/lib/monthYear';
import type { RingkasanPeriode } from '@/lib/kpi';
import { formatPcs, formatPersen } from './kpiFormat';

/**
 * Kartu angka untuk dashboard Kinerja Produksi.
 *
 * Satu komponen dipakai semua fase (team, per orang, akumulasi) supaya angka
 * yang sama tidak tampil dengan gaya berbeda di dua halaman. Warna mengikuti
 * token semantik di `src/index.css`: realisasi biru, target merah,
 * tercapai/surplus hijau (brief bagian 8).
 */

export type KpiTone = 'realisasi' | 'target' | 'tercapai' | 'peringatan' | 'netral';

const TONE_TEXT: Record<KpiTone, string> = {
  realisasi: 'text-[hsl(var(--kpi-realisasi))]',
  target: 'text-[hsl(var(--kpi-target))]',
  tercapai: 'text-[hsl(var(--kpi-tercapai))]',
  peringatan: 'text-[hsl(var(--kpi-peringatan))]',
  netral: 'text-muted-foreground',
};

const TONE_BAR: Record<KpiTone, string> = {
  realisasi: '[&>div]:bg-[hsl(var(--kpi-realisasi))]',
  target: '[&>div]:bg-[hsl(var(--kpi-target))]',
  tercapai: '[&>div]:bg-[hsl(var(--kpi-tercapai))]',
  peringatan: '[&>div]:bg-[hsl(var(--kpi-peringatan))]',
  netral: '[&>div]:bg-[hsl(var(--kpi-netral))]',
};

export interface KpiStatCardProps {
  label: string;
  value: string;
  /** Keterangan pendukung di bawah angka. */
  hint?: string;
  /** 0..1 (boleh >1). `null` = tidak ada target, batang disembunyikan. */
  progress?: number | null;
  tone?: KpiTone;
  badge?: ReactNode;
  className?: string;
}

export function KpiStatCard({
  label,
  value,
  hint,
  progress = null,
  tone = 'netral',
  badge,
  className,
}: KpiStatCardProps) {
  // `aria-hidden` pada batang: angkanya sudah dibacakan teks di atas, jadi bar
  // hanya dekorasi dan tidak perlu diumumkan dua kali oleh pembaca layar.
  const lebar = progress == null ? 0 : Math.max(0, Math.min(1, progress)) * 100;

  return (
    <Card className={cn('shadow-none', className)}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {badge}
        </div>
        <p className={cn('kpi-angka mt-1.5 text-xl font-semibold leading-tight', TONE_TEXT[tone])}>
          {value}
        </p>
        {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
        {progress != null && (
          <Progress
            value={lebar}
            aria-hidden="true"
            className={cn('mt-2 h-1.5 bg-muted', TONE_BAR[tone])}
          />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Badge status ritme.
 *
 * Teks selalu ditulis lengkap ("Sesuai ritme", "Perlu dikejar"), tidak hanya
 * warna — brief bagian 8 meminta warna bukan satu-satunya pembeda, karena
 * sekitar 8% pria mengalami buta warna merah-hijau.
 */
export function RitmeBadge({ ritme }: { ritme: RingkasanPeriode['ritme'] }) {
  if (ritme === 'hijau') {
    return <Badge variant="success-light">Sesuai ritme</Badge>;
  }
  if (ritme === 'kuning') {
    return <Badge variant="warning-light">Hampir sesuai</Badge>;
  }
  return <Badge variant="destructive">Perlu dikejar</Badge>;
}

/**
 * Empat angka mode Akumulasi.
 *
 * `selisih` mengikuti definisi brief bagian 4: **target kumulatif − realisasi
 * kumulatif**. Jadi nilai positif berarti KURANG dari target, dan negatif
 * berarti surplus. Angkanya ditampilkan apa adanya dengan tanda eksplisit —
 * membalik tandanya agar "terlihat positif" akan membuat laporan keuangan
 * terbaca kebalikannya.
 */
export function KpiAkumulasiCards({
  current,
  goal,
  progress,
  selisih,
  jumlahBulan,
  dariBulan,
  sampaiBulan,
}: {
  current: number;
  goal: number;
  progress: number;
  selisih: number;
  jumlahBulan: number;
  dariBulan: string;
  sampaiBulan: string;
}) {
  const tanpaTarget = goal <= 0;
  const surplus = selisih < 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiStatCard
        label="Realisasi kumulatif"
        value={`${formatPcs(current)} pcs`}
        hint={`${formatMonthYearFromYm(dariBulan)} – ${formatMonthYearFromYm(sampaiBulan)}`}
        tone="realisasi"
      />
      <KpiStatCard
        label="Target kumulatif"
        value={tanpaTarget ? '—' : `${formatPcs(goal)} pcs`}
        hint={tanpaTarget ? 'Target belum ditetapkan' : `Dari ${jumlahBulan} bulan`}
        tone="target"
      />
      <KpiStatCard
        label="Pencapaian kumulatif"
        value={tanpaTarget ? '—' : formatPersen(progress)}
        hint={tanpaTarget ? 'Tanpa target' : `${jumlahBulan} bulan dihitung`}
        progress={tanpaTarget ? null : progress}
        tone={tanpaTarget ? 'netral' : progress >= 1 ? 'tercapai' : 'realisasi'}
      />
      <KpiStatCard
        label="Selisih kumulatif"
        value={
          tanpaTarget
            ? '—'
            : surplus
              ? `+${formatPcs(Math.abs(selisih))} pcs`
              : `${formatPcs(selisih)} pcs`
        }
        hint={
          tanpaTarget
            ? 'Tanpa target'
            : surplus
              ? 'Surplus di atas target'
              : selisih === 0
                ? 'Tepat sesuai target'
                : 'Kurang dari target'
        }
        tone={tanpaTarget ? 'netral' : surplus ? 'tercapai' : selisih === 0 ? 'tercapai' : 'target'}
      />
    </div>
  );
}

/**
 * Empat angka utama mode Bulan.
 */
export function KpiRingkasCards({ ringkas }: { ringkas: RingkasanPeriode }) {
  const tanpaTarget = ringkas.goal <= 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiStatCard
        label="Realisasi"
        value={formatPcs(ringkas.current)}
        hint="pcs bulan ini"
        tone="realisasi"
      />
      <KpiStatCard
        label="Target"
        value={tanpaTarget ? '—' : formatPcs(ringkas.goal)}
        hint={tanpaTarget ? 'Target belum ditetapkan' : 'pcs bulan ini'}
        tone="target"
      />
      <KpiStatCard
        label="Pencapaian"
        value={tanpaTarget ? '—' : formatPersen(ringkas.progress)}
        hint={
          tanpaTarget
            ? 'Tanpa target'
            : ringkas.sisaTarget > 0
              ? `Kurang ${formatPcs(ringkas.sisaTarget)} pcs`
              : `Surplus ${formatPcs(ringkas.current - ringkas.goal)} pcs`
        }
        progress={tanpaTarget ? null : ringkas.progress}
        tone={tanpaTarget ? 'netral' : ringkas.progress >= 1 ? 'tercapai' : 'realisasi'}
      />
      <KpiStatCard
        label="Proyeksi akhir bulan"
        value={tanpaTarget ? '—' : formatPcs(ringkas.proyeksi)}
        hint={
          tanpaTarget
            ? 'Butuh target untuk diproyeksikan'
            : `Rata-rata ${formatPcs(ringkas.rataRataHariKerja)} pcs/hari kerja`
        }
        badge={tanpaTarget ? undefined : <RitmeBadge ritme={ringkas.ritme} />}
        tone={tanpaTarget ? 'netral' : ringkas.ritme === 'hijau' ? 'tercapai' : ringkas.ritme === 'kuning' ? 'peringatan' : 'target'}
      />
    </div>
  );
}
