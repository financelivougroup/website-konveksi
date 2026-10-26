/**
 * Pemformat angka dashboard Kinerja Produksi.
 *
 * Dipisahkan dari `KpiCards.tsx` supaya file komponen hanya mengekspor
 * komponen — aturan `react-refresh/only-export-components` membutuhkan itu
 * agar Fast Refresh tidak membuang state saat file disunting.
 */

/** Angka pcs dengan pemisah ribuan Indonesia. */
export function formatPcs(nilai: number): string {
  const n = Number.isFinite(nilai) ? Math.round(nilai) : 0;
  return n.toLocaleString('id-ID');
}

/** Persentase tanpa desimal untuk angka >= 10%, satu desimal di bawahnya. */
export function formatPersen(rasio: number): string {
  if (!Number.isFinite(rasio)) return '—';
  const pct = rasio * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1)}%`;
}
