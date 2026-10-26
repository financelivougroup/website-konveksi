import { useCallback, useEffect, useState } from 'react';
import { bulanBerjalan, fetchBulanTersedia } from '@/services/kpiProduksi';

/**
 * State bulan terpilih + daftar bulan yang tersedia.
 *
 * Dipisahkan dari komponen supaya fase 4 (tab Team) dan fase 5 (halaman per
 * orang) memakai logika yang sama: bulan berjalan sebagai default, dan bulan
 * terpilih tetap dipertahankan walau daftar tersedia berubah setelah refresh.
 *
 * Pemuatan awal memakai `.then()`, bukan `setState` sinkron di badan effect:
 * `react-hooks/set-state-in-effect` menolak setState yang berjalan langsung di
 * dalam effect (pola yang sama dipakai `ProfitLossPage`).
 */
export function useKpiBulan(aktif: boolean) {
  const [bulan, setBulan] = useState(() => bulanBerjalan());
  const [tersedia, setTersedia] = useState<string[]>([]);
  const [memuat, setMemuat] = useState(aktif);
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!aktif) return;
    let batal = false;

    void fetchBulanTersedia().catch((cause: unknown) => ({
      data: [],
      error: cause instanceof Error ? cause : new Error('Gagal membaca daftar bulan.'),
    })).then(({ data, error: gagal }) => {
      if (batal) return;
      if (!gagal) setTersedia(data);
      setError(gagal);
      setMemuat(false);
    });

    return () => {
      batal = true;
    };
  }, [aktif, nonce]);

  // Tombol Refresh adalah event handler, jadi aman menyalakan indikator di sini.
  const muatUlang = useCallback(() => {
    setMemuat(true);
    setNonce((n) => n + 1);
  }, []);

  return { bulan, setBulan, tersedia, memuat, error, muatUlang };
}
