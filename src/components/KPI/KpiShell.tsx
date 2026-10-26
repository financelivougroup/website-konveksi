import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Inbox, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { formatMonthYearFromYm } from '@/lib/monthYear';
import { bulanBerjalan } from '@/services/kpiProduksi';
import type { KpiMode } from '@/types/kpi';
import { KpiThemeControl } from './KpiThemeControl';

/**
 * Kerangka halaman "Monitor Kinerja Produksi".
 *
 * Komponen ini sengaja hanya mengurus tiga hal yang dipakai SEMUA tab:
 * judul, switch Bulan/Akumulasi, dan chip bulan. Isi tab (Team, Per Orang)
 * menyusul di fase berikutnya dan menerima state ini sebagai prop.
 */

// ===========================================================================
// Header
// ===========================================================================

export interface KpiHeaderProps {
  judul?: string;
  subjudul?: string;
  mode: KpiMode;
  onModeChange: (mode: KpiMode) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  /**
   * Tampilkan switch Bulan/Akumulasi. False untuk role terbatas (brief bagian 2:
   * switch hanya untuk owner/finance).
   */
  tampilkanMode?: boolean;
  /** Aksi tambahan di kanan, misalnya tombol pengaturan. */
  aksi?: ReactNode;
  /**
   * `navy` membungkus header dalam panel gelap. Dipakai halaman per orang
   * (brief bagian 5: "header navy berisi nama, filter bulan sendiri"); tab Team
   * tetap memakai header datar supaya tidak bersaing dengan gauge di bawahnya.
   */
  tampilan?: 'datar' | 'navy';
  /** Tombol "Kembali ke tim" di dalam header navy. */
  onKembali?: () => void;
  labelKembali?: string;
}

/**
 * Header halaman: judul, switch mode, dan tombol Refresh.
 *
 * Switch disembunyikan untuk role terbatas. Bukan sekadar kosmetik: mode
 * Akumulasi menampilkan perbandingan lintas bulan yang tidak berguna untuk
 * penjahit, dan brief bagian 2 menyatakan switch hanya untuk owner/finance.
 */
export function KpiHeader({
  judul = 'Monitor Kinerja Produksi',
  subjudul,
  mode,
  onModeChange,
  onRefresh,
  refreshing = false,
  tampilkanMode = true,
  aksi,
  tampilan = 'datar',
  onKembali,
  labelKembali = 'Kembali ke tim',
}: KpiHeaderProps) {
  const navy = tampilan === 'navy';

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between',
        navy
          ? 'rounded-lg bg-[hsl(var(--kpi-navy))] px-3 py-2.5 text-[hsl(var(--kpi-navy-foreground))]'
          : 'border-b border-border pb-3',
      )}
    >
      <div className="min-w-0">
        {onKembali && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onKembali}
            className={cn(
              '-ml-1 mb-1 h-7 gap-1 px-1 text-xs',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              navy
                ? 'text-[hsl(var(--kpi-navy-foreground))]/75 hover:text-[hsl(var(--kpi-navy-foreground))]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ArrowLeft className="h-3 w-3" />
            {labelKembali}
          </Button>
        )}
        <h1
          className={cn(
            'truncate text-sm font-semibold uppercase tracking-wide',
            navy ? 'text-[hsl(var(--kpi-navy-foreground))]' : 'text-foreground',
          )}
        >
          {judul}
        </h1>
        {subjudul && (
          <p
            className={cn(
              'mt-0.5 truncate text-xs',
              navy
                ? 'text-[hsl(var(--kpi-navy-foreground))]/75'
                : 'text-muted-foreground',
            )}
          >
            {subjudul}
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {tampilkanMode && (
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => {
              // ToggleGroup mengirim '' saat item aktif diklik ulang. Abaikan,
              // supaya mode tidak pernah jatuh ke keadaan kosong.
              if (v === 'bulan' || v === 'akumulasi') onModeChange(v);
            }}
            size="sm"
            variant="outline"
            aria-label="Pilih mode tampilan"
            className={cn(navy && 'text-[hsl(var(--kpi-navy-foreground))]')}
          >
            <ToggleGroupItem value="bulan" className={cn('px-3 text-xs', navy && 'border-white/25 text-slate-200 hover:bg-white/10 hover:text-white data-[state=on]:border-blue-300/40 data-[state=on]:bg-blue-300/15 data-[state=on]:text-blue-100 focus-visible:ring-blue-200')}>
              Bulan
            </ToggleGroupItem>
            <ToggleGroupItem value="akumulasi" className={cn('px-3 text-xs', navy && 'border-white/25 text-slate-200 hover:bg-white/10 hover:text-white data-[state=on]:border-blue-300/40 data-[state=on]:bg-blue-300/15 data-[state=on]:text-blue-100 focus-visible:ring-blue-200')}>
              Akumulasi
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          aria-label="Muat ulang kinerja produksi"
          disabled={refreshing}
          className={cn(
            'h-8 gap-1.5 text-xs',
            navy &&
              'border-white/25 bg-transparent text-[hsl(var(--kpi-navy-foreground))] shadow-none hover:bg-white/10 hover:text-[hsl(var(--kpi-navy-foreground))]',
          )}
        >
          <RefreshCw aria-hidden="true" className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>

        <KpiThemeControl />
        {aksi}
      </div>
    </div>
  );
}

// ===========================================================================
// Chip bulan
// ===========================================================================

export interface KpiMonthChipsProps {
  bulan: string;
  onBulanChange: (bulan: string) => void;
  /** Daftar bulan yang punya data (`YYYY-MM`), terbaru dulu. */
  tersedia: readonly string[];
  /** Sembunyikan seluruh baris — dipakai di mode Akumulasi. */
  tersembunyi?: boolean;
}

/**
 * Chip "Pilih Bulan" dengan gulir horizontal di layar kecil.
 *
 * Bulan berjalan selalu ditampilkan meski belum punya data. Tanpa itu, akun
 * baru yang belum punya setoran sama sekali akan melihat baris chip kosong dan
 * tidak bisa memilih bulan apa pun — padahal justru halaman kosong itulah yang
 * perlu dijelaskan, bukan disembunyikan.
 */
export function KpiMonthChips({
  bulan,
  onBulanChange,
  tersedia,
  tersembunyi = false,
}: KpiMonthChipsProps) {
  const daftar = useMemo(() => {
    const ini = bulanBerjalan();
    const set = new Set<string>(tersedia);
    set.add(ini);
    if (bulan) set.add(bulan);
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [tersedia, bulan]);

  if (tersembunyi) return null;

  return (
    <div
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
      role="group"
      aria-label="Pilih bulan"
    >
      {daftar.map((ym) => {
        const aktif = ym === bulan;
        return (
          <Button
            key={ym}
            variant="outline"
            size="sm"
            type="button"
            onClick={() => onBulanChange(ym)}
            aria-pressed={aktif}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              aktif
                ? 'border-transparent bg-[hsl(var(--kpi-aksen-lembut))] text-[hsl(var(--kpi-aksen-teks))] hover:bg-[hsl(var(--kpi-aksen-lembut))] hover:text-[hsl(var(--kpi-aksen-teks))]'
                : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {formatMonthYearFromYm(ym)}
          </Button>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Keadaan: memuat, error, kosong
// ===========================================================================

/** Kerangka kartu KPI saat data belum siap. */
export function KpiSkeleton({ jumlah = 4 }: { jumlah?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: jumlah }, (_, i) => (
        <div key={i} className="rounded-lg border border-border p-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-20" />
          <Skeleton className="mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * Keadaan gagal, dengan tombol coba lagi.
 *
 * Brief bagian 8 mewajibkan error state eksplisit. Layar kosong yang sama
 * dengan "belum ada data" membuat user mengira produksinya nol padahal
 * datanya gagal dimuat.
 */
export function KpiErrorState({
  pesan,
  onRetry,
  sedangMencoba = false,
}: {
  pesan: string;
  onRetry: () => void;
  sedangMencoba?: boolean;
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Gagal memuat data</p>
          <p className="mt-1 text-xs text-muted-foreground">{pesan}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={sedangMencoba}
            className="mt-3 h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', sedangMencoba && 'animate-spin')} />
            Coba lagi
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Keadaan kosong yang menjelaskan SEBAB-nya, bukan hanya "tidak ada data".
 */
export function KpiEmptyState({
  judul,
  deskripsi,
}: {
  judul: string;
  deskripsi: string;
}) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox className="h-4 w-4 text-muted-foreground" />
        </EmptyMedia>
        <EmptyTitle>{judul}</EmptyTitle>
        <EmptyDescription>{deskripsi}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
