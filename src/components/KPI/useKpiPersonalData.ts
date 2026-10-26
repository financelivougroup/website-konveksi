import { useCallback, useEffect, useState } from 'react';
import { tanggalHariIni } from '@/lib/kpi';
import { akhirBulan, awalBulan, fetchPeriodeData, fetchUpahPribadi, fetchLegacyPribadi } from '@/services/kpiProduksi';
import type { KpiPeriodeData, KpiScope, KpiUpahPribadi } from '@/types/kpi';

interface State { key: string; data: KpiPeriodeData | null; error: Error | null }
interface WageState { key: string; rows: KpiUpahPribadi[]; legacy: boolean; error: Error | null }
const failure = (e: unknown) => e instanceof Error ? e : new Error('Gagal memuat data pribadi.');

export function useKpiPersonalData(scope: KpiScope, orangId: number, bulan: string, tersedia: readonly string[], aktif: boolean) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<State | null>(null);
  const [wage, setWage] = useState<WageState | null>(null);
  const awal = tersedia.filter((b) => b <= bulan).sort()[0] ?? bulan;
  const key = `${orangId}|${awal}|${bulan}|${scope.orangId}|${scope.bisaTim}|${version}`;
  const wageKey = key;
  useEffect(() => {
    if (!aktif || !scope.punyaAkses) return;
    let cancelled = false;
    void fetchPeriodeData({ dari: awalBulan(awal), sampai: akhirBulan(bulan), orangId, bolehLihatBiaya: scope.bisaTim }).then((res) => {
      if (!cancelled) setState({ key, data: res.data, error: res.error });
    }).catch((e: unknown) => { if (!cancelled) setState({ key, data: null, error: failure(e) }); });
    const hariIni = tanggalHariIni();
    const wageEnd = hariIni < akhirBulan(bulan) ? hariIni : akhirBulan(bulan);
    const wageRequest = wageEnd < awalBulan(awal)
      ? Promise.resolve({ data: [] as KpiUpahPribadi[], error: null })
      : fetchUpahPribadi(awalBulan(awal), wageEnd, orangId);
    const legacyRequest = wageEnd < awalBulan(awal) ? Promise.resolve(false) : fetchLegacyPribadi(awalBulan(awal), wageEnd, orangId);
    void Promise.all([wageRequest, legacyRequest]).then(([res, legacy]) => {
      if (!cancelled) setWage({ key: wageKey, rows: res.data, legacy, error: res.error });
    }).catch((e: unknown) => { if (!cancelled) setWage({ key: wageKey, rows: [], legacy: false, error: failure(e) }); });
    return () => { cancelled = true; };
  }, [aktif, scope.punyaAkses, scope.bisaTim, orangId, awal, bulan, key, wageKey]);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return {
    data: actif(aktif, state, key)?.data ?? null,
    error: actif(aktif, state, key)?.error ?? null,
    loading: actif(aktif, state, key) === null,
    wages: actif(aktif, wage, wageKey)?.rows ?? [],
    legacyRate: actif(aktif, wage, wageKey)?.legacy ?? false,
    wageError: actif(aktif, wage, wageKey)?.error ?? null,
    wageLoading: actif(aktif, wage, wageKey) === null,
    refresh, version,
  };
}
function actif<T extends { key: string }>(active: boolean, value: T | null, key: string) { return active && value?.key === key ? value : null; }
