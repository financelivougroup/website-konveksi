import { softBadgeClass } from '@/lib/tableStyles';
import { variasiStatusLabel, type VariasiStatus } from '@/types/pipeline';

// Badge status LEVEL-1 (per variasi) — Cutting/Sewing/Kancing/Finishing.
//
// Berbeda dari `StatusBadge` (level-2, satu nilai per Kode Produksi Konveksi),
// komponen ini merender SEBUAH DAFTAR: satu variasi bisa berstatus Sewing dan
// Kancing sekaligus. Karena itu ia tidak bisa memakai satu peta tone per status
// seperti StatusBadge — di sini setiap status punya warnanya sendiri, dan
// badge-nya dirender berurutan.
//
// Warnanya sengaja memakai nada yang sudah ada di `T_SOFT_BADGE_TONE`
// (tableStyles.ts) supaya seragam dengan badge lain di proyek — tidak ada kelas
// Tailwind mentah baru di berkas ini.
//
// `sewing: 'blue'` — bukan 'emerald' atau 'amber' — karena emerald sudah
// dipakai badge "Finished"/"Completed" dan amber dipakai "Progress"/"Kancing";
// biru adalah satu-satunya nada netral yang belum terpakai di kolom status,
// sehingga Sewing tidak tertukar dengan status level-2 di sebelahnya.
//
// `COMPLETED: 'emerald'` adalah nada terkuat karena ia status terminal. Karena
// Completed MENGGANTIKAN badge lain (lihat deriveVariasiStatuses), ia tidak
// pernah muncul bersamaan dengan Finishing — jadi emerald di sini tidak
// bertabrakan dengan badge mana pun.
const VARIASI_BADGE: Record<VariasiStatus, string> = {
  CUTTING: 'violet',
  SEWING: 'blue',
  KANCING: 'amber',
  FINISHING: 'slate',
  COMPLETED: 'emerald',
};

/**
 * Daftar badge status variasi.
 *
 * `statuses` kosong (tidak terjadi pada data nyata — lihat catatan di
 * `deriveVariasiStatuses`) dirender sebagai tanda pisah agar selnya tidak
 * tampak rusak.
 */
export function VariasiStatusBadge({
  statuses,
}: {
  statuses: readonly VariasiStatus[];
}) {
  if (statuses.length === 0) return <span className="text-gray-300">—</span>;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {statuses.map((s) => (
        <span key={s} className={softBadgeClass(VARIASI_BADGE[s] ?? 'slate')}>
          {variasiStatusLabel[s] || s}
        </span>
      ))}
    </span>
  );
}
