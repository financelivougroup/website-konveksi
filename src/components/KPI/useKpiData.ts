import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ringkasBulanan, ringkasPeriode, type RingkasanPeriode } from '@/lib/kpi';
import { buatKpiTeam, geserBulan, type KpiTeamData } from '@/lib/kpiTeam';
import { akhirBulan, awalBulan, bulanBerjalan, fetchPeriodeData } from '@/services/kpiProduksi';
import type { KpiMode, KpiPeriodeData, KpiScope } from '@/types/kpi';

export interface AkumulasiRingkas {
  current: number;
  goal: number;
  progress: number;
  selisih: number;
  jumlahBulan: number;
  dariBulan: string;
  sampaiBulan: string;
}

export interface KpiDataState {
  data: KpiPeriodeData | null;
  ringkas: RingkasanPeriode | null;
  akumulasi: AkumulasiRingkas | null;
  team: KpiTeamData | null;
  loading: boolean;
  error: Error | null;
  rentang: { dari: string; sampai: string } | null;
  muatUlang: () => void;
}

interface Args {
  scope: KpiScope | null;
  mode: KpiMode;
  bulan: string;
  orangId: number | null;
  bulanTersedia: readonly string[];
  aktif: boolean;
}

type Hasil = Omit<KpiDataState, 'loading' | 'muatUlang'> & { key: string };

/** Pemuatan bersama dengan kunci periode dan pembatalan respons yang terlambat. */
export function useKpiData({ scope, mode, bulan, orangId, bulanTersedia, aktif }: Args): KpiDataState {
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [nonce, setNonce] = useState(0);
  const generation = useRef(0);
  const bolehLihatBiaya = scope?.bisaTim === true;
  const awalAkumulasi = useMemo(() => bulanTersedia.filter((b) => b <= bulan).sort()[0] ?? bulan, [bulanTersedia, bulan]);
  const akhir = bulan || bulanBerjalan();
  const dari = mode === 'akumulasi' ? awalAkumulasi : akhir;
  // Team Bulan juga memerlukan bulan sebelumnya untuk delta dan jendela ritme awal bulan.
  const muatDari = mode === 'bulan' && orangId === null ? geserBulan(akhir, -1) : dari;
  const key = `${mode}|${dari}|${akhir}|${orangId ?? 'tim'}|${bolehLihatBiaya}|${nonce}|${aktif}`;

  useEffect(() => {
    if (!aktif || !scope?.punyaAkses) return;
    const request = ++generation.current;
    void (async () => {
      try {
        const result = await fetchPeriodeData({ dari: awalBulan(muatDari), sampai: akhirBulan(akhir), orangId, bolehLihatBiaya });
        if (request !== generation.current) return;
        if (result.error || !result.data) throw result.error ?? new Error('Data periode tidak tersedia.');
        const d = result.data;
        const team = orangId === null && scope.bisaTim ? buatKpiTeam(d, akhir, mode) : null;
        const entries = d.entries.filter((e) => e.tanggal.slice(0, 7) >= dari && e.tanggal.slice(0, 7) <= akhir);
        const goal = [...d.targetPerOrang.values()].reduce((sum, n) => sum + n, 0);
        const ringkas = mode === 'bulan' ? team?.jahit ?? ringkasPeriode({ entries, goal, bulan: akhir, libur: d.libur, final: d.bulanFinal.has(akhir) }) : null;
        const perBulan = mode === 'akumulasi' ? team?.bulananJahit ?? ringkasBulanan({ entries, targetPerBulan: d.targetPerBulan, bulanFinal: d.bulanFinal, libur: d.libur }) : [];
        const last = perBulan.at(-1);
        const akumulasi = mode === 'akumulasi' ? {
          current: last?.currentKumulatif ?? 0, goal: last?.goalKumulatif ?? 0,
          progress: last?.progressKumulatif ?? 0, selisih: last?.selisihKumulatif ?? 0,
          jumlahBulan: perBulan.length, dariBulan: dari, sampaiBulan: akhir,
        } : null;
        setHasil({ key, data: d, ringkas, akumulasi, team, error: null, rentang: { dari: awalBulan(dari), sampai: akhirBulan(akhir) } });
      } catch (cause) {
        if (request !== generation.current) return;
        setHasil({ key, data: null, ringkas: null, akumulasi: null, team: null, rentang: null, error: cause instanceof Error ? cause : new Error('Gagal memuat periode.') });
      }
    })();
    return () => { generation.current += 1; };
  }, [aktif, scope, mode, orangId, bolehLihatBiaya, muatDari, akhir, dari, key]);

  const loading = aktif && (hasil === null || hasil.key !== key);
  const muatUlang = useCallback(() => setNonce((n) => n + 1), []);
  const ready = aktif && hasil?.key === key ? hasil : null;
  return {
    data: ready?.data ?? null, ringkas: ready?.ringkas ?? null,
    akumulasi: ready?.akumulasi ?? null, team: ready?.team ?? null,
    loading, error: ready?.error ?? null, rentang: ready?.rentang ?? null, muatUlang,
  };
}
