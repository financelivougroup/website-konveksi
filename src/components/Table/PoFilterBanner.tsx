import { X, Filter } from 'lucide-react';
import { T_CODE } from '@/lib/tableStyles';

/**
 * Penanda bahwa halaman tujuan sedang tersaring ke satu PO.
 *
 * Muncul setelah user melompat dari nomor PO di Register Harga. Fungsinya
 * rangkap, dan keduanya perlu:
 *
 * 1. **Menjelaskan kenapa daftarnya pendek.** Tanpa penanda ini, halaman yang
 *    tiba-tiba hanya berisi 4 baris dari 100 tampak seperti data hilang, bukan
 *    seperti filter yang disengaja.
 * 2. **Jalan keluar.** Tombol `×` mengembalikan daftar penuh; tanpa itu user
 *    harus menebak bahwa filter berasal dari halaman sebelumnya.
 *
 * `note` opsional dipakai halaman yang punya keterbatasan pencocokan yang harus
 * disampaikan terus terang (Invoicing: invoice lama bisa tidak punya relasi
 * order). Sengaja tidak disembunyikan — lebih baik user tahu sebagian invoice
 * mungkin tidak ikut tampil daripada mengira daftarnya sudah lengkap.
 */
export function PoFilterBanner({
  code,
  orderId,
  count,
  note,
  onClear,
}: {
  /** Nomor PO yang tampil ke user, mis. `PO/001-LVU/09/2026/002`. */
  code: string | null;
  /** Kunci relasi `production_orders.id`; ditampilkan bila `code` kosong. */
  orderId: string;
  count: number;
  note?: string;
  onClear: () => void;
}) {
  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <Filter className="w-3.5 h-3.5 flex-shrink-0 text-blue-600" />
        <span className="text-[12px] text-blue-700">
          Difilter ke PO: <span className={`font-medium ${T_CODE}`}>{code || orderId}</span>
          <span className="text-blue-600/80"> — {count} baris</span>
        </span>
        <button
          onClick={onClear}
          aria-label="Hapus filter PO"
          title="Tampilkan semua baris"
          className="ml-auto w-5 h-5 flex-shrink-0 rounded flex items-center justify-center text-blue-500 hover:bg-slate-100 hover:text-blue-700"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {note && <p className="mt-1 pl-[22px] text-[11px] text-blue-600/90">{note}</p>}
    </div>
  );
}
