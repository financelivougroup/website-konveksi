import { useMemo, useState } from 'react';
import { Image as ImageIcon, ImageOff } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { DataTable } from '@/components/Table/DataTable';
import { Pagination } from '@/components/Table/Pagination';
import { PillTabs, type PillTabItem } from '@/components/Production/PillTabs';
import { StatusBadge } from '@/components/Production/StatusBadge';
import { cn } from '@/lib/utils';
import { formatDate } from '@/data/pipelineData';
import { LOG_PAGE_SIZE, clampPage, paginate } from '@/lib/pagination';
import { EM_DASH, warnaButuhBorder, warnaSwatch } from '@/lib/laporanCompute';
import { softBadgeClass, T_TD, T_WRAP } from '@/lib/tableStyles';
import type { KanbanGroup, KanbanWorkOrder } from '@/lib/kanban';
import type {
  CuttingRecord,
  FinishingRecord,
  KancingRecord,
  ProductionStatus,
  SewingRecord,
} from '@/types/pipeline';
import {
  buildDayPoints,
  buildStageRows,
  filterStageRows,
  STAGE_META,
  STAGES,
  type StageKey,
} from '@/lib/productionTimeline';

// ===== Detail kartu Kanban — dua panel resizable =====
//
// Permintaan user (verbatim): "ketika card dibuka, bikin jadi 2 panel aja ka
// pakai reui resizable." Panel kiri = identitas + foto ber-overlay + tabel
// variasi; panel kanan = tombol tahap + grafik harian + tabel riwayat.
//
// Komponen ini SENGAJA hanya menerima data yang sudah dimuat halaman. Tidak ada
// fetch di sini: keempat array catatan (cutting/sewing/kancing/finishing) sudah
// ada di state Production Monitoring, jadi menambah fetch berarti memuat ulang
// data yang sama dan berisiko menampilkan versi yang berbeda dari tabel di
// belakangnya.
//
// react-resizable-panels v4: `defaultSize`/`minSize`/`maxSize` WAJIB string
// persen ("40%"). Nilai number diartikan PIXEL — lihat catatan lengkap di
// ProductionMonitoring.tsx (tab log dua panel).

type StageFilter = StageKey | 'all';

/** Warna grafik per tahap. Dipilih agar tetap terbedakan pada sumbu yang sama;
 *  cutting sengaja netral (abu) karena ia satu kali jalan, bukan laju harian
 *  seperti tiga tahap lainnya. */
const CHART_CONFIG = {
  cutting: { label: 'Cutting', theme: { light: '#64748B', dark: '#94A3B8' } },
  sewing: { label: 'Sewing', theme: { light: '#2a78d6', dark: '#3987e5' } },
  kancing: { label: 'Kancing', theme: { light: '#8B5CF6', dark: '#A78BFA' } },
  finishing: { label: 'Finishing', theme: { light: '#10B981', dark: '#34D399' } },
} satisfies ChartConfig;

const STAGE_TABS: PillTabItem<StageFilter>[] = [
  { id: 'all', label: 'All' },
  { id: 'cutting', label: 'Cutting' },
  { id: 'sewing', label: 'Sewing' },
  { id: 'kancing', label: 'Kancing' },
  { id: 'finishing', label: 'Finishing' },
];

/** Warna bar progres per tahap — mengikuti tone badge tahap di STAGE_META. */
const STAGE_BAR: Record<StageKey, string> = {
  cutting: 'bg-slate-400',
  sewing: 'bg-blue-500',
  kancing: 'bg-violet-500',
  finishing: 'bg-emerald-500',
};

function formatAngka(v: number): string {
  return v.toLocaleString('id-ID');
}

interface Props {
  group: KanbanGroup;
  cuttingRecords: CuttingRecord[];
  sewingRecords: SewingRecord[];
  kancingRecords: KancingRecord[];
  finishingRecords: FinishingRecord[];
}

export function KanbanCardDetail({
  group,
  cuttingRecords,
  sewingRecords,
  kancingRecords,
  finishingRecords,
}: Props) {
  const [stage, setStage] = useState<StageFilter>('all');
  const [page, setPage] = useState(1);

  // Semua baris untuk kode produksi ini, digabung dari keempat sumber.
  const rows = useMemo(
    () =>
      buildStageRows({
        workOrders: group.workOrders,
        cutting: cuttingRecords,
        sewing: sewingRecords,
        kancing: kancingRecords,
        finishing: finishingRecords,
      }),
    [group.workOrders, cuttingRecords, sewingRecords, kancingRecords, finishingRecords],
  );

  const days = useMemo(() => buildDayPoints(rows), [rows]);
  const filtered = useMemo(() => filterStageRows(rows, stage), [rows, stage]);

  const pageRows = paginate(filtered, page);
  const totalQty = filtered.reduce((sum, r) => sum + r.qty, 0);

  // Seri grafik: keempatnya saat "All", hanya satu saat satu tahap dipilih.
  const activeStages = stage === 'all' ? STAGES : [stage];

  const hasRows = rows.length > 0;
  const scopeLabel = stage === 'all' ? 'semua tahap' : STAGE_META[stage].label.toLowerCase();

  // Ringkasan progres per tahap untuk ruang kanan foto: jumlahkan angka yang
  // sudah dimuat Production Monitoring (`*Total` per Work Order). `totalQty`
  // dipakai sebagai penyebut — sama dengan "Client Terima" di tabel variasi,
  // jadi angka di kartu ini konsisten dengan tabel di bawahnya.
  const stageProgress = useMemo(() => {
    const sum = (pick: (wo: KanbanWorkOrder) => number | undefined) =>
      group.workOrders.reduce((acc, wo) => acc + (Number(pick(wo)) || 0), 0);
    return [
      { key: 'cutting' as StageKey, done: sum((wo) => wo.cuttingTotal) },
      { key: 'sewing' as StageKey, done: sum((wo) => wo.sewingTotal) },
      { key: 'kancing' as StageKey, done: sum((wo) => wo.kancingTotal) },
      { key: 'finishing' as StageKey, done: sum((wo) => wo.finishingTotal) },
    ];
  }, [group.workOrders]);

  // Kolom tabel variasi panel kiri — persis daftar yang diminta user:
  // Status · Warna · Size · Cutting · Sewing · Finish · Client Terima.
  const variationColumns = useMemo(
    () => [
      {
        key: 'derivedStatus', label: 'Status', width: '110px', align: 'center' as const,
        render: (row: Record<string, unknown>) => (
          <StatusBadge status={row.derivedStatus as ProductionStatus} />
        ),
      },
      {
        key: 'warna', label: 'Warna', width: '110px',
        render: (row: Record<string, unknown>) => (
          <span className="text-gray-700">{String(row.warna ?? '') || EM_DASH}</span>
        ),
      },
      {
        key: 'size', label: 'Size', width: '70px',
        render: (row: Record<string, unknown>) => (
          <span className="text-gray-700">{String(row.size ?? '') || EM_DASH}</span>
        ),
      },
      {
        key: 'cuttingTotal', label: 'Cutting', width: '80px', align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="tabular-nums text-gray-700">{Number(row.cuttingTotal ?? 0) || EM_DASH}</span>
        ),
      },
      {
        key: 'sewingTotal', label: 'Sewing', width: '80px', align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="tabular-nums text-gray-700">{Number(row.sewingTotal ?? 0) || EM_DASH}</span>
        ),
      },
      {
        key: 'finishingTotal', label: 'Finish', width: '80px', align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="tabular-nums text-gray-700">{Number(row.finishingTotal ?? 0) || EM_DASH}</span>
        ),
      },
      {
        key: 'quantity', label: 'Client Terima', width: '110px', align: 'right' as const,
        render: (row: Record<string, unknown>) => {
          const qty = Number(row.quantity) || 0;
          // 0 = belum diterima dari POS client (lihat catatan di RAW_FIELDS).
          if (qty <= 0) return <span className="text-gray-300">{EM_DASH}</span>;
          return <span className="font-medium tabular-nums text-gray-900">{qty.toLocaleString('id-ID')}</span>;
        },
      },
    ],
    [],
  );

  // Kolom tabel riwayat panel kanan.
  const historyColumns = useMemo(
    () => [
      {
        key: 'tanggal', label: 'Tanggal', width: '100px',
        render: (row: Record<string, unknown>) => (
          <span className="whitespace-nowrap text-gray-700">
            {row.tanggal ? formatDate(String(row.tanggal)) : <span className="text-gray-300">{EM_DASH}</span>}
          </span>
        ),
      },
      {
        key: 'stage', label: 'Tahap', width: '100px',
        render: (row: Record<string, unknown>) => {
          const key = row.stage as StageKey;
          return <span className={softBadgeClass(STAGE_META[key].tone)}>{STAGE_META[key].label}</span>;
        },
      },
      {
        key: 'warna', label: 'Warna', width: '120px',
        render: (row: Record<string, unknown>) => {
          const warna = String(row.warna ?? '');
          if (!warna) return <span className="text-gray-300">{EM_DASH}</span>;
          return (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span
                className={cn(
                  'inline-block w-3 h-3 rounded-full shrink-0',
                  warnaButuhBorder(warna) && 'ring-1 ring-gray-300',
                )}
                style={{ backgroundColor: warnaSwatch(warna) }}
              />
              <span className="text-gray-700">{warna}</span>
            </span>
          );
        },
      },
      {
        key: 'size', label: 'Size', width: '70px',
        render: (row: Record<string, unknown>) => (
          <span className="whitespace-nowrap text-gray-700">
            {row.size ? String(row.size) : <span className="text-gray-300">{EM_DASH}</span>}
          </span>
        ),
      },
      {
        key: 'qty', label: 'Qty', width: '80px', align: 'right' as const,
        render: (row: Record<string, unknown>) => (
          <span className="font-medium tabular-nums text-gray-900">
            {(Number(row.qty) || 0).toLocaleString('id-ID')}
          </span>
        ),
      },
      {
        key: 'pic', label: 'PIC', width: '120px',
        render: (row: Record<string, unknown>) => (
          <span className="whitespace-nowrap text-gray-700">
            {row.pic ? String(row.pic) : <span className="text-gray-300">{EM_DASH}</span>}
          </span>
        ),
      },
      {
        key: 'bukti', label: 'Bukti', width: '80px', align: 'center' as const,
        render: (row: Record<string, unknown>) => {
          if (!row.bukti) return <span className="text-gray-300">{EM_DASH}</span>;
          const bukti = String(row.bukti);
          return (
            <span title={bukti}>
              <ImageIcon aria-label={bukti} className="w-4 h-4 inline text-slate-500" />
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="flex-1 min-h-0"
    >
      {/* ===== Panel kiri: identitas + foto overlay + tabel variasi ===== */}
      <ResizablePanel defaultSize="40%" minSize="28%" maxSize="60%" className="min-w-0">
        <div className="h-full min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Foto (kiri) + ruang informasi (kanan).
              Permintaan user: "size foto harus dibuat 4:5", "foto bisa di geser
              ke kiri, jangan center", "kananya ada space kosong bisa diisi
              tambahan informasi", "progress bisa dimasukin ke atas kanan foto".
              Jadi: `aspect-[4/5]` (bukan lagi mengisi tinggi panel), rata kiri
              (tanpa `mx-auto`/`justify-center`), dan kolom kanan berisi total
              qty + jumlah variasi + progres tiap tahap.

              Badge status DIHAPUS dari sini (permintaan user 2026-10-06:
              "di samping foto itu kan ada status ... dihilangin aja deh,
              soalnya di bagian paling atas, di samping nomor produk, itu kan
              udah ada ... biar nggak double"). Status sudah tampil di judul
              dialog (`ProductionMonitoring.tsx` → `DialogTitle`), jadi
              menampilkannya lagi di sini hanya mengulang informasi yang sama. */}
          <div className="flex items-start gap-3">
            <div className="relative aspect-[4/5] w-[46%] max-w-[240px] shrink-0 overflow-hidden rounded-lg border border-border bg-slate-100">
              {group.photoUrl ? (
                <img
                  src={group.photoUrl}
                  alt={group.product}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImageOff className="w-8 h-8 text-slate-300" />
                </div>
              )}
              {/* Gradasi dari bawah supaya teks putih tetap terbaca di atas foto
                  terang sekalipun. */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-2.5">
                <p className="truncate text-[13px] font-semibold leading-tight text-white" title={group.product}>
                  {group.product}
                </p>
                <p className="truncate text-[11px] text-white/80" title={group.brand}>
                  {group.brand}
                </p>
              </div>
            </div>

            {/* Ruang kanan foto: angka pokok + progres per tahap. */}
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-0.5">
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-slate-500">Total qty</span>
                  <span className="text-[12px] font-bold tabular-nums text-slate-900">
                    {group.totalQty > 0 ? group.totalQty.toLocaleString('id-ID') : EM_DASH}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-slate-500">Variasi</span>
                  <span className="text-[12px] font-semibold tabular-nums text-slate-700">
                    {group.workOrders.length}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border pt-2">
                {stageProgress.map(({ key, done }) => {
                  const pct = group.totalQty > 0 ? Math.min(100, Math.round((done / group.totalQty) * 100)) : 0;
                  return (
                    <div key={key} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[10px] font-medium text-slate-600">{STAGE_META[key].label}</span>
                        <span className="text-[10px] tabular-nums text-slate-500">
                          {done.toLocaleString('id-ID')}/{group.totalQty.toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className={cn('h-full rounded-full', STAGE_BAR[key])} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tabel variasi */}
          <div className="flex flex-col gap-2">
            <h3 className="text-[12px] font-bold text-slate-700">Daftar Variasi</h3>
            <div className={cn(T_WRAP, 'max-h-none')}>
              <DataTable
                variant="plain"
                columns={variationColumns}
                data={group.workOrders as unknown as Record<string, unknown>[]}
              />
            </div>
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* ===== Panel kanan: tombol tahap + grafik harian + tabel riwayat ===== */}
      <ResizablePanel defaultSize="60%" minSize="40%" className="min-w-0">
        <div className="h-full min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          <PillTabs
            items={STAGE_TABS}
            active={stage}
            onChange={(id) => { setStage(id); setPage(1); }}
            aria-label="Filter tahap produksi"
          />

          {/* Grafik pergerakan harian */}
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="mb-2 text-[12px] font-bold text-slate-700">Pergerakan Harian</p>
            {days.length === 0 ? (
              <p className="py-10 text-center text-[12px] text-slate-400">
                Belum ada laporan untuk {scopeLabel}.
              </p>
            ) : (
              <ChartContainer
                config={CHART_CONFIG}
                className="aspect-auto h-[220px] w-full"
                role="img"
                aria-label={`Grafik pergerakan harian produksi — ${scopeLabel}`}
              >
                <LineChart data={days} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeWidth={1} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    fontSize={11}
                    width={40}
                    tickFormatter={formatAngka}
                  />
                  <ChartTooltip
                    cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                    content={
                      <ChartTooltipContent
                        indicator="line"
                        formatter={(value, name) => (
                          <>
                            <span className="font-semibold tabular-nums text-foreground">
                              {formatAngka(Number(value))}
                            </span>
                            <span className="text-muted-foreground">
                              {' '}
                              pcs · {STAGE_META[name as StageKey]?.label ?? String(name)}
                            </span>
                          </>
                        )}
                      />
                    }
                  />
                  {/* Legend hanya saat >= 2 seri: identitas tidak boleh
                      bergantung warna saja. Satu seri sudah dijelaskan judul
                      panel, jadi kotak legend berswab tunggal hanya mengulang. */}
                  {activeStages.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
                  {activeStages.map((key) => (
                    <Line
                      key={key}
                      dataKey={key}
                      name={key}
                      type="monotone"
                      stroke={`var(--color-${key})`}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={{ r: 3, fill: `var(--color-${key})`, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            )}
          </div>

          {/* Tabel riwayat laporan */}
          <div className="flex flex-col gap-2">
            <h3 className="text-[12px] font-bold text-slate-700">Riwayat Laporan</h3>
            {/* `key={stage}` me-remount pagination per tahap, jadi halaman
                kembali ke 1 saat tombol tahap berganti (bukan mendarat di
                halaman yang sudah kosong). */}
            <div key={stage}>
              <div className={cn(T_WRAP, 'max-h-none rounded-b-none border-b-0')}>
                <DataTable
                  variant="plain"
                  columns={historyColumns}
                  data={pageRows as unknown as Record<string, unknown>[]}
                  emptyMessage={
                    <div className="py-10 text-center text-[13px] text-gray-400">
                      {hasRows ? `Belum ada catatan ${scopeLabel}.` : 'Belum ada catatan untuk kode ini.'}
                    </div>
                  }
                  footer={
                    <tr className="border-t-2 border-[#D1D5DB] bg-[#F9FAFB]">
                      <td className={cn(T_TD, 'text-[12px] font-semibold text-[#4B5563]')}>Total Qty</td>
                      {/* Kolom 2-4 (Tahap · Warna · Size) kosong; angka jatuh di
                          kolom 5 (Qty), lalu kolom 6-7 (PIC · Bukti) kosong. */}
                      <td className={T_TD} colSpan={3} />
                      <td className={cn(T_TD, 'text-right font-semibold tabular-nums text-gray-900')}>
                        {totalQty.toLocaleString('id-ID')}
                      </td>
                      <td className={T_TD} colSpan={2} />
                    </tr>
                  }
                />
              </div>
              <Pagination
                total={filtered.length}
                currentPage={clampPage(page, filtered.length, LOG_PAGE_SIZE)}
                pageSize={LOG_PAGE_SIZE}
                onPageChange={setPage}
                className="h-auto min-h-11 flex-wrap gap-3 rounded-b-lg border border-gray-200 px-3 py-2"
              />
            </div>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
