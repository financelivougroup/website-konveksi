import { deretHarian, hariKerjaBulan, hitungHpp, hitungUpah, perluPerhatian, ringkasBulanan, ringkasPeriode, ringkasPerOrang, sisaHariKerja, tanggalHariIni, targetNgebutPerHari } from './kpi.ts';
import type { BarisOrang, Divisi, KpiEntry, RingkasanPeriode } from './kpi.ts';
import type { KpiPeriodeData } from '../types/kpi.ts';

type BiayaDivisi = Divisi | 'total';
export interface KpiCostPoint { bulan: string; realisasi: number | null; target: number | null }
export interface KpiUpahPoint extends KpiCostPoint { divisi: Divisi }
export interface KpiTeamData {
  jahit: RingkasanPeriode;
  finishing: RingkasanPeriode;
  jahitPerOrang: BarisOrang[];
  finishingPerOrang: BarisOrang[];
  perhatian: BarisOrang[];
  hpp: ReturnType<typeof hitungHpp>;
  hppTarget: number | null;
  bulananJahit: ReturnType<typeof ringkasBulanan>;
  bulananFinishing: ReturnType<typeof ringkasBulanan>;
  bulananHpp: KpiCostPoint[];
  bulananUpah: KpiUpahPoint[];
  ngebutAkumulasi: ReturnType<typeof targetNgebutPerHari>;
  targetNormalPenjahit: number;
  perbandingan: {
    sebelumnya: RingkasanPeriode;
    sparkline: { hari: number; sisaHari: number; sisaTarget: number; normal: number; ngebut: number }[];
  } | null;
}

export function geserBulan(bulan: string, offset: number): string {
  const [y, m] = bulan.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function targetHpp(target: ReadonlyMap<BiayaDivisi, number>): number | null {
  if (target.has('total')) return target.get('total')!;
  const parts = (['penjahit', 'leader', 'finishing'] as const).map((d) => target.get(d));
  return parts.every((n) => n !== undefined) ? parts.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;
}

/** Target unit-cost akumulasi dibobot target pcs tiap divisi; bukan rata-rata rasio. */
function targetTertimbang(data: KpiPeriodeData, divisi: BiayaDivisi, bulan: readonly string[], orangId?: number): number | null {
  let total = 0;
  let pcs = 0;
  for (const ym of bulan) {
    const volumes = data.targetPerBulanPerDivisi.get(ym);
    const qty = orangId !== undefined
      ? data.targets.filter((t) => t.bulan === ym && t.orangId === orangId).reduce((sum, t) => sum + t.targetPcs, 0)
      : divisi === 'total'
        ? (volumes?.get('penjahit') ?? 0) + (volumes?.get('leader') ?? 0)
        : volumes?.get(divisi) ?? 0;
    if (qty <= 0) continue;
    const costs = data.targetBiayaPerBulan.get(ym);
    const rate = divisi === 'total' ? targetHpp(costs ?? new Map()) : costs?.get(divisi) ?? null;
    if (rate === null) return null;
    total += qty * rate;
    pcs += qty;
  }
  return pcs > 0 ? total / pcs : null;
}

export function buatKpiTeam(data: KpiPeriodeData, bulan: string, mode: 'bulan' | 'akumulasi', hariIni: Date = new Date()): KpiTeamData {
  const prev = geserBulan(bulan, -1);
  const today = tanggalHariIni(hariIni);
  const currentMonth = today.slice(0, 7);
  const observed = data.entries.filter((e) => e.tanggal <= today);
  const targets = data.targets;
  const monthKeys = new Set([bulan, ...targets.map((t) => t.bulan), ...data.entries.map((e) => e.tanggal.slice(0, 7))]);
  const months = [...monthKeys].filter((ym) => ym <= bulan && (mode === 'akumulasi' || ym === bulan)).sort();
  const inPeriod = (ym: string) => months.includes(ym);
  const entries = observed.filter((e) => inPeriod(e.tanggal.slice(0, 7)));
  const sewing = entries.filter((e) => e.divisi === 'penjahit');
  const finishing = entries.filter((e) => e.divisi === 'finishing');
  const targetRows = targets.filter((t) => inPeriod(t.bulan));
  const sewingTarget = targetRows.filter((t) => t.divisi !== 'finishing').reduce((sum, t) => sum + t.targetPcs, 0);
  const finishingTarget = targetRows.filter((t) => t.divisi === 'finishing').reduce((sum, t) => sum + t.targetPcs, 0);
  const position = new Map(data.orang.map((o) => [o.orangId, o.divisi]));
  const sourceDivisi = (e: KpiEntry): Divisi => e.divisi === 'finishing' ? 'finishing' : position.get(e.orangId ?? -1) === 'leader' ? 'leader' : 'penjahit';
  const targetPerOrang = new Map<number, number>();
  for (const t of targetRows) if (t.orangId !== null) targetPerOrang.set(t.orangId, (targetPerOrang.get(t.orangId) ?? 0) + t.targetPcs);
  const scopedPeople = (divisi: 'penjahit' | 'finishing') => {
    const ids = new Set(data.orang.filter((o) => divisi === 'finishing' ? o.divisi === 'finishing' : o.divisi !== 'finishing').map((o) => o.orangId));
    const target = new Map([...targetPerOrang].filter(([id]) => ids.has(id)));
    const rows = ringkasPerOrang({ entries: divisi === 'finishing' ? finishing : sewing, orang: data.orang, targetPerOrang: target, bulan, libur: data.libur, hariIni });
    return rows.map((r) => {
      const biaya = mode === 'bulan' ? data.targetBiayaPerBulan.get(bulan)?.get(r.divisi) ?? null : targetTertimbang(data, r.divisi, months, r.orangId);
      return { ...r, targetUpahPerPcs: biaya };
    });
  };
  const jahitPerOrang = scopedPeople('penjahit');
  const finishingPerOrang = scopedPeople('finishing');
  const monthlyTarget = (fin: boolean) => new Map(months.map((ym) => [ym, targetRows.filter((t) => t.bulan === ym && (t.divisi === 'finishing') === fin).reduce((sum, t) => sum + t.targetPcs, 0)]));
  const jahit = ringkasPeriode({ entries: sewing, goal: sewingTarget, bulan, libur: data.libur, hariIni, final: data.bulanFinal.has(bulan) });
  const finishingSummary = ringkasPeriode({ entries: finishing, goal: finishingTarget, bulan, libur: data.libur, hariIni, final: data.bulanFinal.has(bulan) });
  // Di awal bulan, jendela ritme mencakup hari kerja bulan sebelumnya, tetapi current tidak.
  if (mode === 'bulan' && bulan === currentMonth) {
    const pace = ringkasPeriode({ entries: observed.filter((e) => e.divisi === 'penjahit'), goal: sewingTarget, bulan, libur: data.libur, hariIni });
    jahit.rataRataHariKerja = pace.rataRataHariKerja;
    jahit.proyeksi = jahit.current + pace.rataRataHariKerja * jahit.sisaHariKerja;
    jahit.proyeksiProgress = jahit.goal > 0 ? jahit.proyeksi / jahit.goal : 0;
    jahit.ritme = jahit.proyeksiProgress >= 1 ? 'hijau' : jahit.proyeksiProgress >= .85 ? 'kuning' : 'merah';
  }
  const bulananHpp = months.map((ym) => {
    const hpp = hitungHpp(entries.filter((e) => e.tanggal.startsWith(ym)), data.orang);
    return { bulan: ym, realisasi: hpp.perPcs, target: targetHpp(data.targetBiayaPerBulan.get(ym) ?? new Map()) };
  });
  const bulananUpah = months.flatMap((ym) => (['penjahit', 'leader', 'finishing'] as const).map((divisi) => ({
    bulan: ym, divisi,
    realisasi: hitungUpah(entries.filter((e) => e.tanggal.startsWith(ym) && sourceDivisi(e) === divisi)).perPcs,
    target: data.targetBiayaPerBulan.get(ym)?.get(divisi) ?? null,
  })));
  const prevEntries = data.entries.filter((e) => e.tanggal.startsWith(prev) && e.divisi === 'penjahit');
  const prevGoal = targets.filter((t) => t.bulan === prev && t.divisi !== 'finishing').reduce((sum, t) => sum + t.targetPcs, 0);
  const [py, pm] = prev.split('-').map(Number);
  const comparisonDate = bulan === currentMonth
    ? new Date(py, pm - 1, Math.min(hariIni.getDate(), new Date(py, pm, 0).getDate()))
    : bulan < currentMonth ? new Date(py, pm, 1) : new Date(py, pm - 1, 1);
  const previousEntries = bulan === currentMonth
    ? prevEntries.filter((e) => Number(e.tanggal.slice(8, 10)) <= comparisonDate.getDate())
    : bulan < currentMonth ? prevEntries : [];
  const previous = ringkasPeriode({ entries: previousEntries, goal: prevGoal, bulan: prev, libur: data.libur, hariIni: comparisonDate });
  let currentDayPcs = 0;
  const sparkline = deretHarian(sewing, bulan, data.libur).filter((day) => bulan < `${hariIni.getFullYear()}-${String(hariIni.getMonth() + 1).padStart(2, '0')}` || day.tanggal <= `${hariIni.getFullYear()}-${String(hariIni.getMonth() + 1).padStart(2, '0')}-${String(hariIni.getDate()).padStart(2, '0')}`).map((day) => {
    currentDayPcs += day.pcs;
    const [y, m, d] = day.tanggal.split('-').map(Number);
    const remaining = sisaHariKerja(bulan, data.libur, new Date(y, m - 1, d));
    return { hari: d, sisaHari: remaining, sisaTarget: Math.max(0, sewingTarget - currentDayPcs), normal: jahit.targetNormalPerHari, ngebut: targetNgebutPerHari(sewingTarget - currentDayPcs, remaining).perHari };
  });
  return {
    jahit, finishing: finishingSummary, jahitPerOrang, finishingPerOrang,
    perhatian: perluPerhatian([...jahitPerOrang, ...finishingPerOrang].filter((r) => r.goal > r.current && r.goal > 0).sort((a, b) => a.progress - b.progress || a.nama.localeCompare(b.nama))),
    hpp: hitungHpp(entries, data.orang),
    hppTarget: mode === 'bulan' ? targetHpp(data.targetBiayaPerBulan.get(bulan) ?? new Map()) : targetTertimbang(data, 'total', months),
    bulananJahit: ringkasBulanan({ entries: sewing, targetPerBulan: monthlyTarget(false), libur: data.libur, bulanFinal: data.bulanFinal, hariIni }),
    bulananFinishing: ringkasBulanan({ entries: finishing, targetPerBulan: monthlyTarget(true), libur: data.libur, bulanFinal: data.bulanFinal, hariIni }),
    bulananHpp, bulananUpah,
    ngebutAkumulasi: jahit.ngebut,
    targetNormalPenjahit: targetRows.filter((t) => t.divisi === 'penjahit').reduce((sum, t) => sum + t.targetPcs, 0) / Math.max(1, hariKerjaBulan(bulan, data.libur)),
    perbandingan: mode === 'bulan' ? { sebelumnya: previous, sparkline } : null,
  };
}
