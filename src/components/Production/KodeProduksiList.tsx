import { ChevronLeft, ImageOff, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';
import type { KodeListEntry } from '@/lib/logDashboard';

// Panel kiri: satu baris per Kode Produksi Konveksi.
//
// Baris pertama adalah "Semua" — jalan pulang untuk melepas pilihan, supaya
// tidak ada keadaan tanpa cara kembali ke dashboard keseluruhan.
//
// Judul baris = Kode Produksi Konveksi (product note); Kode Produksi Client
// ditampilkan sebagai baris kedua di dalam kartu (mono, dipotong dengan `…`)
// karena kode client jauh lebih panjang daripada lebar panel.
//
// SENGAJA TANPA JUDUL PANEL. Dulu ada bilah "KODE PRODUKSI" di atas daftar;
// user memintanya dihapus (2026-09-28) bersama label lingkup di panel kanan,
// karena ketiganya hanya mengulang apa yang sudah jelas dari kartunya sendiri
// (tiap kartu sudah menampilkan kode produksi + kode client). Tinggi bilah itu
// ikut kembali ke daftar. Jangan menambahkannya kembali tanpa diminta.

interface Props {
  entries: KodeListEntry[];
  /** null = tidak ada yang dipilih → dashboard keseluruhan. */
  selected: string | null;
  onSelect: (productNote: string | null) => void;
  /** Jumlah baris log keseluruhan, untuk sub-label baris "Semua". */
  totalRows: number;
  totalQty: number;
  loading?: boolean;
}

export function KodeProduksiList({
  entries,
  selected,
  onSelect,
  totalRows,
  totalQty,
  loading,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {loading ? (
          <p className="px-2 py-6 text-center text-[12px] text-slate-400">Memuat…</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {/* Baris "Semua" — dashboard keseluruhan */}
            <button
              type="button"
              onClick={() => onSelect(null)}
              aria-pressed={selected === null}
              className={cn(
                'w-full text-left rounded-lg border px-2.5 py-2 transition-colors',
                selected === null
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border bg-card hover:bg-slate-50',
              )}
            >
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                <span className="text-[12px] font-semibold text-slate-900">Semua</span>
              </span>
              <span className="mt-0.5 block text-[11px] tabular-nums text-slate-500">
                {totalRows} baris · {totalQty.toLocaleString('id-ID')} pcs
              </span>
            </button>

            {entries.length === 0 ? (
              <p className="px-2 py-6 text-center text-[12px] text-slate-400">
                Belum ada kode produksi dengan catatan di log ini.
              </p>
            ) : (
              entries.map(({ group, rowQty, rowCount }) => {
                const isActive = selected === group.productNote;
                return (
                  <button
                    key={group.productNote}
                    type="button"
                    onClick={() => onSelect(group.productNote)}
                    aria-pressed={isActive}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'w-full text-left rounded-lg border px-2.5 py-2 transition-colors',
                      isActive
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border bg-card hover:bg-slate-50',
                    )}
                  >
                    <span className="flex items-start gap-2">
                      {/* Foto variasi — thumbnail kecil; kalau tidak ada foto,
                          kotak abu-abu berisi ikon agar tinggi baris tetap
                          seragam dan daftar tidak terlihat berlubang. */}
                      {group.photoUrl ? (
                        <img
                          src={group.photoUrl}
                          alt={group.product}
                          loading="lazy"
                          className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                        />
                      ) : (
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-slate-50"
                          title="Belum ada foto"
                        >
                          <ImageOff className="w-4 h-4 text-slate-300" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span
                            className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold leading-tight text-slate-900"
                            title={group.productNote}
                          >
                            {group.productNote}
                          </span>
                          <StatusBadge status={group.status} />
                        </span>
                        {/* Kode Produksi Client — informasi yang dicari user. */}
                        <span
                          className="mt-0.5 block truncate font-mono text-[10px] text-slate-500"
                          title={group.clientProductionCode ?? undefined}
                        >
                          {group.clientProductionCode || '—'}
                        </span>
                        <span className="mt-0.5 block text-[10px] tabular-nums text-slate-500">
                          {rowCount} baris · {rowQty.toLocaleString('id-ID')} pcs
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Petunjuk melepas pilihan — hanya saat ada yang dipilih. */}
      {selected !== null && (
        <div className="shrink-0 border-t p-2">
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="w-full h-7 rounded-md text-[11px] font-medium text-slate-600 border border-border bg-card hover:bg-primary/10 hover:text-primary transition-colors inline-flex items-center justify-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Lihat semua kode
          </button>
        </div>
      )}
    </div>
  );
}
