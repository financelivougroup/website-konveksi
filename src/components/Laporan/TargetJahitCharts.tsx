import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { cn, formatCurrency } from '@/lib/utils';
import { formatRupiahRingkas } from '@/lib/targetJahitReport';
/**
 * Kontrak minimal yang benar-benar dibaca grafik. Sengaja bukan `MonthAggregate`
 * penuh: tab Per Penjahit memakai `PenjahitMonthRow` yang tidak punya
 * `penjahitCount`/`status`, dan grafiknya tidak butuh keduanya.
 */
export interface TrendPoint {
  label: string;
  target: number;
  realisasi: number;
}

/** Titik batang pencapaian; `pencapaianPct` sudah dalam persen (0..100). */
export interface PencapaianPoint extends TrendPoint {
  pencapaian: number;
  pencapaianPct: number;
}

/** Titik perbandingan antar penjahit (sumbu kategori, bukan waktu). */
export interface PenjahitPoint {
  nama: string;
  target: number;
  realisasi: number;
  targetCost: number;
  realisasiCost: number;
}

/**
 * Grafik Laporan Target Jahit.
 *
 * Warna mengikuti permintaan user: **merah = target, biru = realisasi**, dan
 * pasangan ini divalidasi (bukan dikira-kira) terhadap permukaan kartu putih
 * dan gelap milik proyek ini — keempat check lulus di kedua mode. Pasangan
 * merah/biru ini juga kebetulan yang paling aman menurut validator: ΔE
 * pemisahan CVD 21.6 (light) / 19.2 (dark), jauh di atas ambang 8.
 *
 * Satu-satunya hal yang perlu dijaga: merah juga dipakai badge status "Tidak
 * Tercapai". Karena itu batang/garis SELALU disertai legend dan tooltip yang
 * menyebut namanya, sehingga identitas tidak pernah bergantung pada warna saja.
 *
 * Catatan untuk sesi berikutnya: jangan menggantinya dengan biru+violet (aksen
 * app sendiri, #3B82F6/#8B5CF6) — ΔE pemisahan CVD-nya hanya 1.3, praktis tak
 * terbedakan bagi deuteranope.
 */
export const CHART_CONFIG = {
  target: {
    label: 'Target',
    theme: { light: '#e34948', dark: '#e66767' },
  },
  realisasi: {
    label: 'Realisasi',
    theme: { light: '#2a78d6', dark: '#3987e5' },
  },
  pencapaian: {
    label: 'Pencapaian',
    theme: { light: '#2a78d6', dark: '#3987e5' },
  },
  // Label legend/tooltip untuk seri biaya. Seri akumulasi memakai `dataKey`
  // `targetCostAccum`/`realisasiCostAccum` tetapi diberi `name`
  // `targetCost`/`realisasiCost`, sehingga tooltip memakai entri `targetCost`/
  // `realisasiCost` di bawah sementara LEGEND tetap memakai `dataKey`-nya —
  // karena itu keempat kunci ada, dengan label yang sama per entitas. Warna
  // mengikuti entitas (merah = target, biru = realisasi), bukan satuan.
  targetCost: {
    label: 'Target Cost',
    theme: { light: '#e34948', dark: '#e66767' },
  },
  realisasiCost: {
    label: 'Realisasi Cost',
    theme: { light: '#2a78d6', dark: '#3987e5' },
  },
  targetCostAccum: {
    label: 'Target Cost',
    theme: { light: '#e34948', dark: '#e66767' },
  },
  realisasiCostAccum: {
    label: 'Realisasi Cost',
    theme: { light: '#2a78d6', dark: '#3987e5' },
  },
  // Seri akumulasi pcs memakai `name` `target`/`realisasi` untuk tooltip, tetapi
  // legend membaca `dataKey` `targetAccum`/`realisasiAccum` — jadi keduanya perlu
  // entri dengan label yang sama.
  targetAccum: {
    label: 'Target',
    theme: { light: '#e34948', dark: '#e66767' },
  },
  realisasiAccum: {
    label: 'Realisasi',
    theme: { light: '#2a78d6', dark: '#3987e5' },
  },
} satisfies ChartConfig;

const WARNA_TARGET = 'var(--color-target)';
const WARNA_REALISASI = 'var(--color-realisasi)';

/** Format angka aksis: ribuan dipisah, tanpa desimal yang berisik. */
function formatAngka(v: number): string {
  return v.toLocaleString('id-ID');
}

interface TrendProps {
  months: TrendPoint[];
  /** Jumlah penjahit per bulan; hanya ada di tab Keseluruhan. */
  penjahitPerBulan?: Record<string, number>;
  className?: string;
}

/**
 * Tren Target vs Realisasi — dua seri di SATU sumbu Y.
 *
 * Keduanya bersatuan pcs, jadi sumbu bersama adalah representasi yang benar.
 * Sumbu ganda (dua skala Y) sengaja tidak dipakai: kesejajaran dua skala itu
 * arbitrer dan mengarang korelasi yang tidak ada di datanya.
 */
export function TargetRealisasiTrend({ months, penjahitPerBulan, className }: TrendProps) {
  return (
    <ChartContainer
      config={CHART_CONFIG}
      className={cn('aspect-auto h-[260px] w-full', className)}
      role="img"
      aria-label="Grafik garis tren target dan realisasi per bulan"
    >
      <LineChart data={months} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        {/* Grid hairline SOLID, satu langkah dari permukaan — bukan dashed. */}
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeWidth={1} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={11}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={11}
          width={44}
          tickFormatter={formatAngka}
        />
        <ChartTooltip
          cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as TrendPoint | undefined;
                if (!p) return '';
                const n = penjahitPerBulan?.[p.label];
                return n == null ? p.label : `${p.label} · ${n} penjahit`;
              }}
              formatter={(value, name) => (
                <>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatAngka(Number(value))}
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    pcs · {name === 'realisasi' ? 'Realisasi' : 'Target'}
                  </span>
                </>
              )}
            />
          }
        />
        {/* Legend selalu ada untuk >= 2 seri: identitas tidak boleh bergantung warna saja. */}
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          dataKey="target"
          name="target"
          type="monotone"
          stroke={WARNA_TARGET}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={{ r: 4, fill: WARNA_TARGET, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
          activeDot={{ r: 6, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
        />
        <Line
          dataKey="realisasi"
          name="realisasi"
          type="monotone"
          stroke={WARNA_REALISASI}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={{ r: 4, fill: WARNA_REALISASI, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
          activeDot={{ r: 6, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
        />
      </LineChart>
    </ChartContainer>
  );
}

/**
 * Titik batang pencapaian. `pencapaianPct` sudah dalam persen (0..100) — konversi
 * dari rasio 0..1 dilakukan di pemanggil supaya nilai aksis dan tooltip memakai
 * satuan yang sama, dan tidak ada pembobotan ×100 yang tersembunyi di dalam grafik.
 */
interface PencapaianProps {
  months: PencapaianPoint[];
  className?: string;
  /** Tinggi grafik; dipakai agar selaras dengan meter pengganti. */
  height?: number;
}

/**
 * Pencapaian per Bulan — SATU seri, jadi tanpa legend (judul sudah menyebut
 * apa yang diplot; kotak legend berswab tunggal hanya mengulang judul).
 *
 * `ReferenceLine` di 100% adalah garis acuan target, bukan gridline, jadi ia
 * memang layak ditonjolkan — berbeda dari grid yang harus resesif.
 */
export function PencapaianPerBulan({ months, className, height = 260 }: PencapaianProps) {
  return (
    <ChartContainer
      config={CHART_CONFIG}
      className={cn('aspect-auto w-full', className)}
      style={{ height }}
      role="img"
      aria-label="Grafik batang pencapaian target per bulan"
    >
      <BarChart data={months} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barCategoryGap="35%">
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeWidth={1} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={11}
          width={44}
          tickFormatter={(v: number) => `${v}%`}
        />
        <ChartTooltip
          cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.5 }}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as PencapaianPoint | undefined;
                if (!p) return '';
                return `${p.label} · ${formatAngka(p.realisasi)} / ${formatAngka(p.target)} pcs`;
              }}
              formatter={(value) => (
                <span className="font-semibold tabular-nums text-foreground">
                  {Number(value).toFixed(1)}%
                </span>
              )}
            />
          }
        />
        <ReferenceLine
          y={100}
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1}
          strokeDasharray="4 4"
          label={{
            value: 'Target 100%',
            position: 'insideTopRight',
            fontSize: 10,
            fill: 'hsl(var(--muted-foreground))',
          }}
        />
        <Bar
          dataKey="pencapaianPct"
          name="pencapaian"
          fill="var(--color-pencapaian)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
        />
      </BarChart>
    </ChartContainer>
  );
}

/** Tinggi satu baris kategori; grafik tumbuh mengikuti jumlah penjahit. */
const ROW_HEIGHT = 34;
const BAR_AREA_HEIGHT = 28;

function tinggiUntuk(n: number): number {
  return Math.max(120, n * ROW_HEIGHT + BAR_AREA_HEIGHT);
}

// ===== Keseluruhan: per bulan & akumulasi =====

/**
 * Bentuk data grafik bulanan. Kedua mode memakai sumbu X dan warna yang sama;
 * yang berganti hanya seri yang diplot (per bulan vs kumulatif). Didefinisikan di
 * sini (bukan di halaman) karena `BulananProps` memakainya; hanya tipenya yang
 * diekspor agar berkas komponen ini tetap lolos `react-refresh/only-export-components`.
 */
export type MonthlyMode = 'bulan' | 'akumulasi';

interface BulananProps {
  /** Bentuk seragam untuk tab Keseluruhan & Per Penjahit. */
  months: MonthAggregateLike[];
  /** Bentuk data yang diplot; dikendalikan toggle di header kartu. */
  mode: MonthlyMode;
  className?: string;
  height?: number;
}

const TINGGI_BULANAN = 260;

/**
 * Grid + aksis bersama agar grafik bulanan punya chrome yang identik.
 *
 * PENTING: ini FUNGSI BIASA yang mengembalikan ARRAY elemen — bukan komponen
 * `<ChromeBulanan />` dan bukan pula fragment `<>…</>`. Recharts menemukan
 * `XAxis`/`YAxis`/`CartesianGrid` dengan menelusuri `Children` lewat `toArray`
 * (`renderByOrder`/`findAllByType`), dan penelusuran itu:
 *  - TIDAK membuka komponen pembungkus (hanya anak langsung yang dikenali), dan
 *  - TIDAK membuka fragment, karena `isFragment()` dari `react-is@18` (dipakai
 *    Recharts 2.15.4) tidak mengenali `Symbol(react.transitional.element)` milik
 *    React 19 — `isFragment()` selalu `false`.
 * Array aman karena `Children.forEach` memang meratakan array. Tanpa bentuk ini
 * sumbu dan gridline hilang tanpa error apa pun.
 */
function chromeBulanan(tickFormatter: (v: number) => string) {
  return [
    <CartesianGrid key="grid" vertical={false} stroke="hsl(var(--border))" strokeWidth={1} />,
    <XAxis key="x" dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />,
    <YAxis
      key="y"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      fontSize={11}
      width={52}
      tickFormatter={tickFormatter}
    />,
  ];
}

/**
 * Kontrak bulanan yang dibaca kedua grafik Keseluruhan. Dipenuhi `MonthAggregate`.
 */
export interface MonthAggregateLike {
  label: string;
  target: number;
  realisasi: number;
  kurang: number;
  targetCost: number;
  realisasiCost: number;
  targetAccum: number;
  realisasiAccum: number;
  kurangAccum: number;
  targetCostAccum: number;
  realisasiCostAccum: number;
}

/**
 * Target vs Realisasi per bulan — satu grafik, dua bentuk data.
 *
 * Sumbu Y sengaja TIDAK memuat nama penjahit: satu batang/titik mewakili satu
 * bulan yang sudah dijumlahkan lintas penjahit. Sumbu kategori per orang hanya
 * dipakai di tempat yang memang membandingkan orang.
 *
 * Bentuk batang (per bulan) dan garis (akumulasi) memakai seri yang BERBEDA —
 * `target`/`realisasi` versus `targetAccum`/`realisasiAccum` — bukan sekadar
 * memakai ulang seri yang sama. Keduanya diplot di dalam SATU `ChartContainer`
 * dan bertukar menurut `mode`: bila memakai dua komponen `ChartContainer` yang
 * di-mount bergantian, React akan melepas-pasang seluruh subtree Recharts setiap
 * toggle ditekan, sementara di sini Recharts hanya mengganti elemen chart-nya.
 */
export function TargetRealisasiChart({ months, mode, className }: BulananProps) {
  const akumulasi = mode === 'akumulasi';

  return (
    <ChartContainer
      config={CHART_CONFIG}
      className={cn('aspect-auto w-full', className)}
      style={{ height: TINGGI_BULANAN }}
      role="img"
      aria-label={
        akumulasi
          ? 'Grafik garis akumulasi target dan realisasi per bulan'
          : 'Grafik batang target dan realisasi per bulan'
      }
    >
      {akumulasi ? (
        <LineChart data={months} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          {chromeBulanan(formatAngka)}
          <ChartTooltip
            cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as MonthAggregateLike | undefined;
                  if (!p) return '';
                  return `${p.label} · selisih akumulasi ${formatAngka(p.kurangAccum)} pcs`;
                }}
                formatter={(value, name) => (
                  <>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatAngka(Number(value))}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      pcs · {name === 'realisasi' ? 'Realisasi' : 'Target'}
                    </span>
                  </>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Line
            dataKey="targetAccum"
            name="target"
            type="monotone"
            stroke={WARNA_TARGET}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 4, fill: WARNA_TARGET, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
          />
          <Line
            dataKey="realisasiAccum"
            name="realisasi"
            type="monotone"
            stroke={WARNA_REALISASI}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 4, fill: WARNA_REALISASI, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
          />
        </LineChart>
      ) : (
        <BarChart data={months} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barGap={2} barCategoryGap="35%">
          {chromeBulanan(formatAngka)}
          <ChartTooltip
            cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }}
            content={
              <ChartTooltipContent
                indicator="dot"
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as MonthAggregateLike | undefined;
                  if (!p) return '';
                  return `${p.label} · kurang ${formatAngka(p.kurang)} pcs`;
                }}
                formatter={(value, name) => (
                  <>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatAngka(Number(value))}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      pcs · {name === 'realisasi' ? 'Realisasi' : 'Target'}
                    </span>
                  </>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="target" name="target" fill="var(--color-target)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Bar
            dataKey="realisasi"
            name="realisasi"
            fill="var(--color-realisasi)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
        </BarChart>
      )}
    </ChartContainer>
  );
}

/**
 * Target Cost vs Realisasi Cost per bulan (owner/finance saja) — satu grafik,
 * dua bentuk data seperti versi pcs-nya.
 *
 * Seri `targetCost`/`realisasiCost` dan `targetCostAccum`/`realisasiCostAccum`
 * memakai label yang sama per entitas — tooltip lewat `name` (yang sengaja
 * disamakan menjadi `targetCost`/`realisasiCost`), legend lewat `dataKey` — jadi
 * yang berganti saat toggle adalah bentuk datanya, bukan identitas serinya.
 * Keduanya bersatuan rupiah, jadi tetap SATU sumbu Y.
 *
 * Label aksis memakai rupiah ringkas ("26 jt") karena "Rp 26.000.000" tidak muat
 * di tick dan akan saling tumpang tindih; nilai penuh ada di tooltip dan tabel.
 */
export function CostRealisasiChart({ months, mode, className }: BulananProps) {
  const akumulasi = mode === 'akumulasi';

  // Seri kosong (mis. role tanpa biaya) tidak boleh menampilkan grafik datar.
  const adaAngka = months.some(
    (m) => (akumulasi ? m.targetCostAccum > 0 || m.realisasiCostAccum > 0 : m.targetCost > 0 || m.realisasiCost > 0),
  );
  if (!adaAngka) return null;

  return (
    <ChartContainer
      config={CHART_CONFIG}
      className={cn('aspect-auto w-full', className)}
      style={{ height: TINGGI_BULANAN }}
      role="img"
      aria-label={
        akumulasi
          ? 'Grafik garis akumulasi target cost dan realisasi cost'
          : 'Grafik batang target cost dan realisasi cost per bulan'
      }
    >
      {akumulasi ? (
        <LineChart data={months} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          {chromeBulanan(formatRupiahRingkas)}
          <ChartTooltip
            cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as MonthAggregateLike | undefined;
                  if (!p) return '';
                  const sisa = Math.max(0, p.targetCostAccum - p.realisasiCostAccum);
                  return `${p.label} · sisa ${formatCurrency(sisa)}`;
                }}
                formatter={(value, name) => (
                  <>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatCurrency(Number(value))}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      {name === 'realisasiCost' ? 'Realisasi Cost' : 'Target Cost'}
                    </span>
                  </>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Line
            dataKey="targetCostAccum"
            name="targetCost"
            type="monotone"
            stroke={WARNA_TARGET}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 4, fill: WARNA_TARGET, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
          />
          <Line
            dataKey="realisasiCostAccum"
            name="realisasiCost"
            type="monotone"
            stroke={WARNA_REALISASI}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 4, fill: WARNA_REALISASI, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
          />
        </LineChart>
      ) : (
        <BarChart data={months} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barGap={2} barCategoryGap="35%">
          {chromeBulanan(formatRupiahRingkas)}
          <ChartTooltip
            cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }}
            content={
              <ChartTooltipContent
                indicator="dot"
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as MonthAggregateLike | undefined;
                  if (!p) return '';
                  const sisa = Math.max(0, p.targetCost - p.realisasiCost);
                  return `${p.label} · sisa ${formatCurrency(sisa)}`;
                }}
                formatter={(value, name) => (
                  <>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatCurrency(Number(value))}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      {name === 'realisasiCost' ? 'Realisasi Cost' : 'Target Cost'}
                    </span>
                  </>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            dataKey="targetCost"
            name="targetCost"
            fill="var(--color-target)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
          <Bar
            dataKey="realisasiCost"
            name="realisasiCost"
            fill="var(--color-realisasi)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
        </BarChart>
      )}
    </ChartContainer>
  );
}

interface BandingProps {
  penjahit: PenjahitPoint[];
  className?: string;
}

/**
 * Target vs Realisasi per penjahit — batang horizontal berkelompok.
 *
 * Bentuk ini dipilih karena inilah perbandingan yang paling sering dibaca di
 * laporan ini ("siapa yang paling jauh dari target?"), dan **tidak butuh 2 bulan
 * data** seperti grafik tren — jadi tetap tampil walau baru ada satu bulan.
 *
 * Horizontal, bukan vertikal: nama penjahit adalah label panjang, dan pada
 * batang vertikal nama itu harus diputar atau dipotong.
 *
 * Dua batang bersebelahan (bukan bertumpuk), dengan celah 2px supaya keduanya
 * terpisah karena ruang, bukan karena garis tepi.
 */
export function TargetRealisasiPerPenjahit({ penjahit, className }: BandingProps) {
  return (
    <ChartContainer
      config={CHART_CONFIG}
      className={cn('aspect-auto w-full', className)}
      style={{ height: tinggiUntuk(penjahit.length) }}
      role="img"
      aria-label="Grafik batang target dan realisasi per penjahit"
    >
      <BarChart
        data={penjahit}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
        barGap={2}
        barCategoryGap="28%"
      >
        <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeWidth={1} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          fontSize={11}
          tickFormatter={formatAngka}
        />
        <YAxis
          type="category"
          dataKey="nama"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          fontSize={11}
          width={110}
        />
        <ChartTooltip
          cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as PenjahitPoint | undefined;
                if (!p) return '';
                const kurang = Math.max(0, p.target - p.realisasi);
                return `${p.nama} · kurang ${formatAngka(kurang)} pcs`;
              }}
              formatter={(value, name) => (
                <>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatAngka(Number(value))}
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    pcs · {name === 'realisasi' ? 'Realisasi' : 'Target'}
                  </span>
                </>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="target"
          name="target"
          fill="var(--color-target)"
          radius={[0, 4, 4, 0]}
          maxBarSize={BAR_AREA_HEIGHT / 2}
        />
        <Bar
          dataKey="realisasi"
          name="realisasi"
          fill="var(--color-realisasi)"
          radius={[0, 4, 4, 0]}
          maxBarSize={BAR_AREA_HEIGHT / 2}
        />
      </BarChart>
    </ChartContainer>
  );
}

/**
 * Target Cost vs Realisasi Cost per penjahit (owner/finance).
 *
 * Senada dengan versi pcs-nya: perbandingan antar orang, bukan antar bulan,
 * sehingga tidak ikut menunggu data 2 bulan. Memakai pasangan warna yang sama
 * karena perannya juga sama (target vs realisasi) — warna mengikuti entitas,
 * bukan jenis satuan.
 */
export function BiayaPerPenjahit({ penjahit, className }: BandingProps) {
  const adaAngka = penjahit.some((p) => p.targetCost > 0 || p.realisasiCost > 0);
  if (!adaAngka) return null;

  return (
    <ChartContainer
      config={CHART_CONFIG}
      className={cn('aspect-auto w-full', className)}
      style={{ height: tinggiUntuk(penjahit.length) }}
      role="img"
      aria-label="Grafik batang target cost dan realisasi cost per penjahit"
    >
      <BarChart
        data={penjahit}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
        barGap={2}
        barCategoryGap="28%"
      >
        <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeWidth={1} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          fontSize={11}
          tickFormatter={formatRupiahRingkas}
        />
        <YAxis
          type="category"
          dataKey="nama"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          fontSize={11}
          width={110}
        />
        <ChartTooltip
          cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as PenjahitPoint | undefined;
                if (!p) return '';
                const sisa = Math.max(0, p.targetCost - p.realisasiCost);
                return `${p.nama} · sisa ${formatCurrency(sisa)}`;
              }}
              formatter={(value, name) => (
                <>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatCurrency(Number(value))}
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    {name === 'realisasiCost' ? 'Realisasi Cost' : 'Target Cost'}
                  </span>
                </>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="targetCost"
          name="targetCost"
          fill="var(--color-target)"
          radius={[0, 4, 4, 0]}
          maxBarSize={BAR_AREA_HEIGHT / 2}
        />
        <Bar
          dataKey="realisasiCost"
          name="realisasiCost"
          fill="var(--color-realisasi)"
          radius={[0, 4, 4, 0]}
          maxBarSize={BAR_AREA_HEIGHT / 2}
        />
      </BarChart>
    </ChartContainer>
  );
}
