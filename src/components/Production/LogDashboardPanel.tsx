import { useMemo } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logCardMetrics, type LogTarget } from '@/lib/logDashboard';
import { getNationalHolidaysForYear } from '@/data/nationalHolidays';
import { AppSelect } from '@/components/AppSelect';
import { LaporanKpiCards } from '@/components/Laporan/LaporanKpiCards';
import {
  EMPTY_FILTERS,
  PIC_LABEL,
  applyLaporanFilters,
  bulanOptions,
  picOptions,
  produkOptions,
  summarizeLaporan,
  type LaporanFilters,
  type LaporanRow,
  type LaporanKind,
} from '@/lib/laporanCompute';
import type { KanbanGroup } from '@/lib/kanban';

// Panel dashboard kanan untuk tab log (Sewing / Kancing / Finishing).
//
// Dipanen dari LaporanReportPage: KPI dan slicer.
// TIDAK mengambil datanya sendiri — work order dan catatan log sudah dimuat
// halaman, jadi meneruskannya sebagai prop. Tabel laporan sengaja tidak ikut:
// panel kiri sudah menjadi daftarnya, dan tabelnya hanya menduplikasi.

interface Props {
  kind: LaporanKind;
  /** Baris laporan yang sudah disaring ke kode terpilih — induk yang menyusunnya
   *  supaya tabel di bawah panel memakai rantai baris yang sama persis. */
  scopedRows: LaporanRow[];
  /** Filter slicer. Diangkat ke induk (bukan state lokal) supaya tabel ikut
   *  terfilter, bukan hanya KPI di panel ini. */
  filters: LaporanFilters;
  onFiltersChange: (next: LaporanFilters) => void;
  /** null = tidak ada kode yang dipilih → dashboard keseluruhan. */
  group: KanbanGroup | null;
  loading?: boolean;
  /**
   * Kotak pencarian, berdiri sebaris dengan slicer.
   *
   * Nilainya tetap milik halaman: pencarian menyaring daftar Kode Produksi di
   * panel KIRI (lewat `filteredWO`), bukan baris panel ini. Panel hanya
   * memindahkan tempatnya ke sebelah slicer, jadi tidak ada penyaringan baru
   * yang terjadi di sini.
   */
  searchQuery: string;
  onSearchChange: (value: string) => void;
  /**
   * Tombol aksi halaman (mis. "Entry Jahitan Baru") yang ikut duduk di baris
   * slicer ini.
   *
   * Dulu tombol ini punya barisnya sendiri di atas KPI, sebaris dengan kotak
   * pencarian. Karena pencariannya pindah ke sini, baris itu tinggal berisi
   * satu tombol yang menggantung — jadi tombolnya ikut ke sini alih-alih
   * menyisakan satu baris kosong di dashboard yang padat.
   */
  actions?: React.ReactNode;
  targets?: LogTarget[];
  holidays?: string[];
  metricsLoading?: boolean;
  targetError?: string | null;
  calendarError?: string | null;
  onRetryMetrics?: () => void;
  today?: Date;
}

export function LogDashboardPanel({
  kind,
  scopedRows,
  filters,
  onFiltersChange,
  group,
  loading,
  searchQuery,
  onSearchChange,
  actions,
  targets = [], holidays = [], metricsLoading = false, targetError, calendarError, onRetryMetrics, today = new Date(),
}: Props) {
  const picLabel = PIC_LABEL[kind];

  // Slicer selalu dihitung dari baris yang SUDAH tersaring kode, bukan hasil
  // filter — supaya memilih satu bulan tidak mengosongkan opsi bulan lain dan
  // slicernya tidak terjebak.
  const bulanOpts = useMemo(() => bulanOptions(scopedRows), [scopedRows]);
  const produkOpts = useMemo(() => produkOptions(scopedRows), [scopedRows]);
  const picOpts = useMemo(() => picOptions(scopedRows), [scopedRows]);
  const rows = useMemo(() => applyLaporanFilters(scopedRows, filters), [scopedRows, filters]);
  const summary = useMemo(() => summarizeLaporan(rows), [rows]);
  const years = new Set([today.getFullYear(), ...[filters.bulan,...scopedRows.map(row=>row.tanggal)].map(value=>Number(value.slice(0,4))).filter(y=>Number.isInteger(y)&&y>=1900&&y<=today.getFullYear())]);
  const firstYear = Math.min(...years);
  const nationalHolidays = Array.from({length:today.getFullYear()-firstYear+1},(_,i)=>getNationalHolidaysForYear(firstYear+i)).flat();
  const metrics = logCardMetrics(scopedRows,filters,targets,[...holidays,...nationalHolidays],today);

  const hasFilter = Boolean(filters.bulan || filters.produk || filters.pic);

  if (loading) {
    return <p className="py-10 text-center text-[13px] text-slate-400">Memuat data…</p>;
  }

  // Panel kosong tidak boleh menyembunyikan pencarian dan tombol Entry.
  // Keduanya justru paling dibutuhkan saat kode terpilih belum punya catatan:
  // pencarian adalah satu-satunya jalan menemukan kode lain dari dalam panel,
  // dan "Entry Baru" adalah cara mengisi kode yang masih kosong itu. Karena
  // itu baris slicer selalu dirender; yang bergantung pada data hanyalah
  // slicernya sendiri (opsinya dihitung dari baris, jadi kosong = kosong).
  const hasScoped = scopedRows.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <LaporanKpiCards kind={kind} summary={summary} picLabel={picLabel} logMetrics={metrics}
        targetState={metricsLoading?'Memuat target…':targetError?'Target belum tersedia':undefined}
        calendarState={metricsLoading?'Memuat kalender…':calendarError?'Kalender belum tersedia':undefined} />
      {(targetError || calendarError) && <div role="alert" className="text-xs text-destructive">{targetError || calendarError}{onRetryMetrics && <Button size="sm" variant="outline" className="ml-2" onClick={onRetryMetrics}>Muat ulang KPI</Button>}</div>}

      <div className="flex flex-wrap items-center gap-2">
        {hasScoped && (
          <>
            <div className="w-[160px]">
              <AppSelect
                bare
                value={filters.bulan}
                onValueChange={(v) => onFiltersChange({ ...filters, bulan: v })}
                options={bulanOpts}
                placeholder="Semua bulan"
              />
            </div>
            {/* Slicer produk HANYA saat lingkupnya semua kode. Satu Kode
                Produksi Konveksi = satu produk, jadi saat satu kode dipilih
                slicer ini hanya berisi satu opsi — tampilannya menyiratkan
                ada pilihan padahal tidak ada. */}
            {group === null && (
              <div className="w-[170px]">
                <AppSelect
                  bare
                  value={filters.produk}
                  onValueChange={(v) => onFiltersChange({ ...filters, produk: v })}
                  options={produkOpts}
                  placeholder="Semua produk"
                />
              </div>
            )}
            <div className="w-[170px]">
              <AppSelect
                bare
                value={filters.pic}
                onValueChange={(v) => onFiltersChange({ ...filters, pic: v })}
                options={picOpts}
                placeholder={`Semua ${picLabel.toLowerCase()}`}
              />
            </div>
          </>
        )}
        {/* Pencarian berdiri tepat di sebelah slicer PIC — sebelumnya
            terpisah di baris atas panel kanan, sehingga terlihat seperti
            milik tabel padahal yang disaringnya adalah daftar kode di
            panel KIRI. Tingginya `h-7` mengikuti trigger AppSelect `bare`
            di sebelahnya supaya satu baris rata. */}
        <div className="relative w-[190px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari kode / produk / PIC..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-7 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-[11px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        {hasFilter && (
          <button
            onClick={() => onFiltersChange(EMPTY_FILTERS)}
            className="h-7 px-2.5 text-[11px] rounded-lg border border-border bg-card text-slate-600 hover:bg-slate-50 hover:text-blue-700 hover:border-slate-200 transition-all"
          >
            Reset
          </button>
        )}
        {/* Tombol aksi halaman, didorong ke ujung kanan baris.
            Dulu di sebelah kirinya ada ringkasan "{N} baris · {N} work order";
            user meminta teks itu dihapus (2026-09-29) karena KPI di atasnya
            sudah menampilkan angka yang sama (Total Qty, Produk, work order),
            jadi baris ini tidak perlu mengulanginya. */}
        {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
      </div>

      {!hasScoped && (
        <p className="py-10 text-center text-[13px] text-slate-400">
          Belum ada catatan untuk {group ? 'kode produksi ini' : 'log ini'}.
        </p>
      )}
    </div>
  );
}

