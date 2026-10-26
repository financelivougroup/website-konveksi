import { deretHarian, hitungUpah, pcsPadaTanggal, ringkasBulanan, ringkasPeriode, sisaHariKerja, tanggalHariIni, targetNgebutPerHari } from './kpi.ts';
import type { KpiPeriodeData, KpiUpahPribadi } from '../types/kpi.ts';

export function ringkasUpahPribadi(rows: readonly KpiUpahPribadi[]) {
  const known = rows.some((r) => r.estimasi !== null);
  return {
    estimasi: known ? rows.reduce((sum, r) => sum + (r.estimasi ?? 0), 0) : null,
    pcsTotal: rows.reduce((sum, r) => sum + r.pcsTotal, 0),
    pcsBertarif: rows.reduce((sum, r) => sum + r.pcsBertarif, 0),
    entryTanpaTarif: rows.reduce((sum, r) => sum + r.entryTanpaTarif, 0),
    pcsTanpaTarif: rows.reduce((sum, r) => sum + r.pcsTanpaTarif, 0),
  };
}

/** Seluruh input sudah di-scope server; filter defensif tetap menjaga label orang/bulan. */
export function buatKpiOrang(data: KpiPeriodeData, orangId: number, bulan: string, hariIni: Date = new Date()) {
  const orang = data.orang.find((o) => o.orangId === orangId);
  const sumber = orang?.divisi === 'finishing' ? 'finishing' : 'penjahit';
  const today = tanggalHariIni(hariIni);
  const entries = data.entries.filter((e) => e.orangId === orangId && e.divisi === sumber && e.tanggal.slice(0, 7) <= bulan && e.tanggal <= today);
  const targets = data.targets.filter((t) => t.orangId === orangId && t.bulan <= bulan && (t.divisi === 'finishing') === (sumber === 'finishing'));
  const targetBulan = new Map<string, number>();
  for (const t of targets) targetBulan.set(t.bulan, (targetBulan.get(t.bulan) ?? 0) + t.targetPcs);
  const current = entries.filter((e) => e.tanggal.startsWith(bulan));
  const ringkas = ringkasPeriode({ entries: current, goal: targetBulan.get(bulan) ?? 0, bulan, libur: data.libur, hariIni, final: data.bulanFinal.has(bulan) });
  const selectedToday = today.startsWith(bulan);
  const harian = deretHarian(current, bulan, data.libur).map((d) => ({ ...d, observed: d.tanggal <= today }));
  const pcsHariIni = selectedToday ? pcsPadaTanggal(current, today) : 0;
  const liburHariIni = harian.find((d) => d.tanggal === today)?.libur ?? false;
  // Gunakan sisa sebelum setoran hari ini, supaya target hari ini tidak menyusut
  // lagi akibat pcs hari ini yang sudah dihitung sebagai pencapaian.
  const sebelumHariIni = current.filter((e) => e.tanggal < today).reduce((sum, e) => sum + e.pcs, 0);
  const dailyTarget = selectedToday && !liburHariIni && ringkas.goal > 0 ? targetNgebutPerHari(ringkas.goal - sebelumHariIni, ringkas.sisaHariKerja).perHari : 0;
  const bulanan = ringkasBulanan({ entries, targetPerBulan: targetBulan, bulanFinal: data.bulanFinal, libur: data.libur, hariIni });
  const last = bulanan.at(-1);
  const currentAccum = last?.currentKumulatif ?? 0;
  const goalAccum = last?.goalKumulatif ?? 0;
  const biayaBulanan = bulanan.map((p) => {
    const upah = hitungUpah(entries.filter((e) => e.tanggal.startsWith(p.bulan)));
    return { bulan: p.bulan, realisasi: upah.perPcs, target: orang ? data.targetBiayaPerBulan.get(p.bulan)?.get(orang.divisi) ?? null : null };
  });
  return {
    orang, sumber, ringkas, harian, bulanan, biayaBulanan,
    today: { tanggal: today, berlaku: selectedToday, libur: liburHariIni, pcs: pcsHariIni, target: dailyTarget, sisa: Math.max(0, dailyTarget - pcsHariIni) },
    akumulasi: { current: currentAccum, goal: goalAccum, progress: goalAccum > 0 ? currentAccum / goalAccum : 0, sisa: Math.max(0, goalAccum - currentAccum), ngebut: targetNgebutPerHari(goalAccum - currentAccum, sisaHariKerja(bulan, data.libur, hariIni)), dari: bulanan[0]?.bulan ?? bulan, sampai: bulan },
  };
}
