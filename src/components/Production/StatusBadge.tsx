import { softBadgeClass } from '@/lib/tableStyles';
import { productionStatusLabel, type ProductionStatus } from '@/types/pipeline';

// Badge status produksi — gaya SOFT (latar muda + teks sewarna + border tipis),
// sama seperti badge "Main Category" di Expense. Sebelumnya pill solid dengan
// teks putih; diganti agar seragam dengan badge status lain di proyek.
// Dipindah ke berkas sendiri supaya dipakai bersama oleh halaman Production
// Monitoring dan panel kiri Kode Produksi, tanpa salah satunya mengimpor yang
// lain (halaman itu 1000+ baris; mengimpor darinya akan menyeret seluruh
// halaman ke dalam modul panel).

// Tanpa 'CUTTING': cutting terisi → PROGRESS (lihat deriveStatus).
// Nilainya nama warna untuk `softBadgeClass`, bukan kelas penuh.
const STATUS_BADGE: Record<ProductionStatus, string> = {
  NEW: 'slate',
  PROGRESS: 'amber',
  FINISHED: 'emerald',
  INVOICED: 'violet',
};

export function StatusBadge({ status }: { status: ProductionStatus }) {
  return (
    <span className={softBadgeClass(STATUS_BADGE[status] ?? 'slate')}>
      {productionStatusLabel[status] || status}
    </span>
  );
}
