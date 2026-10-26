import { KpiRouter } from '@/components/KPI/KpiRouter';

/**
 * Titik masuk modul "Monitor Kinerja Produksi".
 *
 * Halaman ini hanya memasang `KpiRouter`, yang memilih tampilan tim atau
 * tampilan satu orang berdasarkan alamat dan peran sesi. Semua logika
 * pembatasan ada di router + database, bukan di halaman ini.
 */
export function LaporanKinerjaProduksiPage() {
  return <KpiRouter />;
}

export default LaporanKinerjaProduksiPage;
