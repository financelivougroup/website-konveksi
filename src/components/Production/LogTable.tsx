import { useMemo } from 'react';
import { Image } from 'lucide-react';
import { cn } from '@/lib/utils';
import { T_TD, T_WRAP } from '@/lib/tableStyles';
import { DataTable } from '@/components/Table/DataTable';
import { Pagination } from '@/components/Table/Pagination';
import { LOG_PAGE_SIZE, clampPage, paginate } from '@/lib/pagination';
import { formatDate } from '@/data/pipelineData';
import {
  EM_DASH,
  warnaButuhBorder,
  warnaSwatch,
  type LaporanRow,
} from '@/lib/laporanCompute';

// Tabel laporan di panel kanan tab log (Sewing / Kancing / Finishing).
//
// Bentuk kolomnya mengikuti tabel laporan yang sudah ada
// (LaporanReportPage: Tanggal / Produk / Warna / Size / Qty / PIC / Bukti) —
// termasuk swatch warna dan badge size — supaya tidak ada informasi yang
// hilang saat halaman laporan dilebur ke sini.
//
// Tabel ini TIDAK menampilkan Kode Produksi: daftarnya sudah menjadi panel
// kiri, jadi mengulanginya di sini hanya menduplikasi kolom.

const PHOTO_TONE = {
  blue: 'text-blue-500',
  violet: 'text-violet-500',
  emerald: 'text-emerald-500',
} as const;

export type PhotoTone = keyof typeof PHOTO_TONE;

interface Props {
  rows: LaporanRow[];
  /** Header kolom PIC: Penjahit / Pemasang / Finisher. */
  picLabel: string;
  photoTone: PhotoTone;
  emptyText: string;
  page: number;
  onPageChange: (page: number) => void;
  /** Tinggi maksimum narah gulir tabel. */
  maxHeightClass?: string;
  /** Selected-row actions; the caller retains all role checks. */
  rowActions?: (row: LaporanRow) => React.ReactNode;
}

export function LogTable({
  rows,
  picLabel,
  photoTone,
  emptyText,
  page,
  onPageChange,
  maxHeightClass = 'max-h-[calc(100vh-380px)]',
  rowActions,
}: Props) {
  const pageRows = paginate(rows, page);
  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);

  // Kolom tabel laporan. Sel yang butuh swatch warna, ikon bukti, atau
  // placeholder "—" dirender sendiri lewat `render`.
  const columns = useMemo(() => [
    {
      key: 'tanggal', label: 'Tanggal', width: '110px',
      render: (row: Record<string, unknown>) => (
        <span className="whitespace-nowrap text-gray-700">
          {row.tanggal ? formatDate(String(row.tanggal)) : <span className="text-gray-300">{EM_DASH}</span>}
        </span>
      ),
    },
    {
      key: 'produk', label: 'Produk', width: '220px',
      render: (row: Record<string, unknown>) => (
        <span className="block max-w-[220px] truncate font-medium text-gray-900" title={String(row.produk ?? '')}>
          {row.produk ? String(row.produk) : <span className="text-gray-300">{EM_DASH}</span>}
        </span>
      ),
    },
    {
      key: 'warna', label: 'Warna', width: '130px',
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
      key: 'size', label: 'Size', width: '80px',
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
      key: 'pic', label: picLabel, width: '130px',
      render: (row: Record<string, unknown>) => (
        <span className="whitespace-nowrap text-gray-700">
          {row.pic ? String(row.pic) : <span className="text-gray-300">{EM_DASH}</span>}
        </span>
      ),
    },
    {
      key: 'bukti', label: 'Bukti Barang', width: '110px', align: 'center' as const,
      render: (row: Record<string, unknown>) => {
        if (!row.bukti) return <span className="text-gray-300">{EM_DASH}</span>;
        const bukti = String(row.bukti);
        return (
          <span title={bukti}>
            <Image aria-label={bukti} className={cn('w-4 h-4 inline', PHOTO_TONE[photoTone])} />
          </span>
        );
      },
    },
  ], [picLabel, photoTone]);

  return (
    <div>
      <div className={cn(T_WRAP, maxHeightClass, 'rounded-b-none border-b-0')}>
        <DataTable
          variant="plain"
          columns={columns}
          data={pageRows as unknown as Record<string, unknown>[]}
          rowActions={
            rowActions
              ? (row) => rowActions(row as unknown as LaporanRow)
              : undefined
          }
          emptyMessage={<div className="py-10 text-center text-[13px] text-gray-400">{emptyText}</div>}
          footer={
            <tr className="border-t-2 border-[#D1D5DB] bg-[#F9FAFB]">
              <td className={cn(T_TD, 'text-[12px] font-semibold text-[#4B5563]')}>Total Qty</td>
              <td className={T_TD} colSpan={3} />
              <td className={cn(T_TD, 'text-right font-semibold tabular-nums text-gray-900')}>
                {totalQty.toLocaleString('id-ID')}
              </td>
              {/* PIC and evidence remain after Qty; selection is reserved above. */}
              <td className={T_TD} colSpan={2} />
            </tr>
          }
        />
      </div>
      <Pagination
        total={rows.length}
        currentPage={clampPage(page, rows.length, LOG_PAGE_SIZE)}
        pageSize={LOG_PAGE_SIZE}
        onPageChange={onPageChange}
        className="h-auto min-h-11 flex-wrap gap-3 rounded-b-lg border border-gray-200 px-3 py-2"
      />
    </div>
  );
}
