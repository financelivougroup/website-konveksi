import type { SewingRecord } from '@/types/pipeline';
import type { TargetJahitRow } from '@/services/targetJahit';
import type { TargetJahitDetailRow } from '@/services/targetJahitDetail';
import type { PriceMap } from '@/services/staffDebt';

// ===== Workdays: Mon–Sat minus daftar_libur =====

/** 'YYYY-MM' -> { year, month (1-12) } or null. */
export function parseYm(ym: string): { year: number; month: number } | null {
  const m = ym.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Total Mon–Sat days of the month, minus holidays ('YYYY-MM-DD' strings). */
export function countWorkdays(ym: string, holidays: string[]): number {
  const p = parseYm(ym);
  if (!p) return 0;
  const holidaySet = new Set(holidays);
  let n = 0;
  for (let d = 1; d <= daysInMonth(p.year, p.month); d++) {
    const dow = new Date(p.year, p.month - 1, d).getDay(); // 0 = Sunday
    if (dow === 0) continue;
    if (holidaySet.has(dateKey(p.year, p.month, d))) continue;
    n++;
  }
  return n;
}

export function monthIsCurrent(ym: string, today: Date): boolean {
  return ym === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

export function monthIsPast(ym: string, today: Date): boolean {
  const p = parseYm(ym);
  if (!p) return false;
  return p.year < today.getFullYear() || (p.year === today.getFullYear() && p.month < today.getMonth() + 1);
}

/** Workdays of the month up to and including today (0 for future months, full total for past). */
export function elapsedWorkdays(ym: string, holidays: string[], today: Date): number {
  const p = parseYm(ym);
  if (!p) return 0;
  if (monthIsPast(ym, today)) return countWorkdays(ym, holidays);
  if (!monthIsCurrent(ym, today)) return 0; // future month
  const holidaySet = new Set(holidays);
  let n = 0;
  for (let d = 1; d <= today.getDate(); d++) {
    const dow = new Date(p.year, p.month - 1, d).getDay();
    if (dow === 0) continue;
    if (holidaySet.has(dateKey(p.year, p.month, d))) continue;
    n++;
  }
  return n;
}

export function finalStatus(realisasi: number, target: number, isCurrent: boolean, isPast: boolean): string {
  if (isCurrent || (!isPast && !isCurrent)) {
    // current or future months are still 'Berjalan'
    return 'Berjalan';
  }
  return realisasi >= target && target > 0 ? 'Tercapai' : 'Tidak Tercapai';
}

// ===== Enrichment =====

export interface EnrichedTargetRow extends TargetJahitRow {
  totalHariKerja: number;
  hariKerjaHariIni: number;
  sisaHari: number;
  targetDaily: number;
  targetNgebutHari: number;
  realisasiMonthly: number;
  sisaTargetMonthly: number;
  progressMonthly: number; // 0..1
  realisasiCostPosisi: number;
  targetAccum: number;
  realisasiAccum: number;
  selisihAccum: number;
  targetNgebutHariAkumulasi: number;
  progressAccum: number; // 0..1
  statusFinal: string;
  statusFinalAkumulasi: string;
}

/** Map sewing records -> WO product via workOrderProduct (wo.id -> product). */
function sewingQtyByProduct(sewing: SewingRecord[], person: string, ym: string, workOrderProduct: Map<string, string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sewing) {
    if (s.picPenjahit !== person) continue;
    if (!String(s.tanggalLaporan ?? '').startsWith(ym)) continue;
    const product = workOrderProduct.get(s.workOrderId);
    if (!product) continue;
    out.set(product, (out.get(product) ?? 0) + (Number(s.qtySelesai) || 0));
  }
  return out;
}

function monthlyRealisasi(sewing: SewingRecord[], person: string, ym: string): number {
  let n = 0;
  for (const s of sewing) {
    if (s.picPenjahit !== person) continue;
    if (!String(s.tanggalLaporan ?? '').startsWith(ym)) continue;
    n += Number(s.qtySelesai) || 0;
  }
  return n;
}

/**
 * Per-design realization: detail rows sharing a product split that product's
 * sewing qty proportionally to qtyTarget (covers multi-colour per product).
 */
export function enrichDetails(details: TargetJahitDetailRow[], sewing: SewingRecord[], person: string, ym: string, workOrderProduct: Map<string, string>): { qtyRealisasi: number; nilai: number }[] {
  const byProduct = sewingQtyByProduct(sewing, person, ym, workOrderProduct);
  const targetByProduct = new Map<string, number>();
  for (const d of details) targetByProduct.set(d.product, (targetByProduct.get(d.product) ?? 0) + d.qtyTarget);
  return details.map((d) => {
    const totalQty = byProduct.get(d.product) ?? 0;
    const totalTarget = targetByProduct.get(d.product) ?? 0;
    const share = totalTarget > 0 ? d.qtyTarget / totalTarget : details.length > 0 ? 1 / details.length : 0;
    const qtyRealisasi = Math.round(totalQty * share);
    const nilai = qtyRealisasi * (d.hargaJahit + d.hargaObras);
    return { qtyRealisasi, nilai };
  });
}

/**
 * Enrich all rows of ONE person at a time is handled internally: this function
 * processes every row, computing accumulation across that person's months
 * (rows sorted by bulan_tahun ascending for accumulation ordering).
 */
export function enrichTargetRows(
  rows: TargetJahitRow[],
  sewing: SewingRecord[],
  workOrderProduct: Map<string, string>,
  prices: PriceMap,
  details: TargetJahitDetailRow[],
  holidays: string[],
  today: Date,
): EnrichedTargetRow[] {
  const sorted = [...rows].sort((a, b) => a.bulan_tahun.localeCompare(b.bulan_tahun));
  const accumByPerson = new Map<string, { target: number; realisasi: number }>();

  return sorted.map((row) => {
    const ym = row.bulan_tahun;
    const person = row.nama;
    const totalHariKerja = countWorkdays(ym, holidays);
    const hariKerjaHariIni = elapsedWorkdays(ym, holidays, today);
    const sisaHari = Math.max(0, totalHariKerja - hariKerjaHariIni);
    const targetMonthly = Number(row.target_monthly) || 0;
    const targetDaily = totalHariKerja > 0 ? targetMonthly / totalHariKerja : 0;

    const realisasiMonthly = monthlyRealisasi(sewing, person, ym);
    const sisaTargetMonthly = Math.max(0, targetMonthly - realisasiMonthly);
    const progressMonthly = targetMonthly > 0 ? realisasiMonthly / targetMonthly : 0;
    const targetNgebutHari = sisaHari > 0 ? Math.ceil(sisaTargetMonthly / sisaHari) : 0;

    // Realization cost: prefer detail prices, fall back to price map.
    const myDetails = details.filter((d) => d.targetJahitId === row.id);
    const enrichedDetails = enrichDetails(myDetails, sewing, person, ym, workOrderProduct);
    let realisasiCostPosisi = 0;
    enrichedDetails.forEach((e, i) => {
      const d = myDetails[i];
      const price = (d.hargaJahit || 0) + (d.hargaObras || 0) || ((prices[d.product] ? prices[d.product].jahit + prices[d.product].obras : 0));
      realisasiCostPosisi += e.qtyRealisasi * price;
    });

    const isCurrent = monthIsCurrent(ym, today);
    const isPast = monthIsPast(ym, today);
    const statusFinal = finalStatus(realisasiMonthly, targetMonthly, isCurrent, isPast);

    // Accumulation across this person's months up to this row.
    const acc = accumByPerson.get(person) ?? { target: 0, realisasi: 0 };
    acc.target += targetMonthly;
    acc.realisasi += realisasiMonthly;
    accumByPerson.set(person, acc);
    const targetAccum = acc.target;
    const realisasiAccum = acc.realisasi;
    const selisihAccum = realisasiAccum - targetAccum;
    const progressAccum = targetAccum > 0 ? realisasiAccum / targetAccum : 0;
    const statusFinalAkumulasi = finalStatus(realisasiAccum, targetAccum, isCurrent, isPast);
    // 'Ngebut' for the accumulation only makes sense in the current month.
    const targetNgebutHariAkumulasi = isCurrent && sisaHari > 0 ? Math.ceil(Math.max(0, targetAccum - realisasiAccum) / sisaHari) : 0;

    return {
      ...row,
      totalHariKerja,
      hariKerjaHariIni,
      sisaHari,
      targetDaily,
      targetNgebutHari,
      realisasiMonthly,
      sisaTargetMonthly,
      progressMonthly,
      realisasiCostPosisi,
      targetAccum,
      realisasiAccum,
      selisihAccum,
      targetNgebutHariAkumulasi,
      progressAccum,
      statusFinal,
      statusFinalAkumulasi,
    };
  });
}
