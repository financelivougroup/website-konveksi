import type { SewingRecord } from '@/types/pipeline';
import type { TargetJahitRow } from '@/services/targetJahit';
import type { TargetJahitDetailRow } from '@/services/targetJahitDetail';
import { productionCodePriceKey, type PriceMap } from '@/lib/productionCode';
import { getNationalHolidaysInMonth } from '@/data/nationalHolidays';
import {
  calculateDetailRealizations,
  type WorkOrderDesignIdentity,
} from '@/lib/targetDetailIdentity';

// ===== Workdays: Mon–Sat minus daftar_libur =====

/** 'YYYY-MM' -> { year, month (1-12) } or null. Defensive against non-string input. */
export function parseYm(ym: string): { year: number; month: number } | null {
  if (typeof ym !== 'string') return null;
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

/** Total Mon–Sat days of the month, minus holidays including auto-detected national holidays. */
export function countWorkdays(ym: string, manualHolidays?: string[]): number {
  const p = parseYm(ym);
  if (!p) return 0;

  const holidaySet = new Set<string>();

  // Add national holidays (auto-detected)
  const national = getNationalHolidaysInMonth(ym);
  national.forEach(h => holidaySet.add(h));

  // Add manual holidays from daftar_libur
  manualHolidays?.forEach(h => holidaySet.add(h));

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

export function elapsedWorkdays(ym: string, manualHolidays?: string[], today: Date = new Date()): number {
  const p = parseYm(ym);
  if (!p) return 0;

  // Check month boundaries
  if (monthIsPast(ym, today)) return countWorkdays(ym, manualHolidays);
  if (!monthIsCurrent(ym, today)) return 0; // future month

  const holidaySet = new Set<string>();

  // Add national holidays for this month
  const national = getNationalHolidaysInMonth(ym);
  national.forEach(h => holidaySet.add(h));

  // Add manual holidays
  manualHolidays?.forEach(h => holidaySet.add(h));

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
  progressMonthly: number; // 0..1 (basis pcs; dipertahankan untuk DetailPanel)
  realisasiCostPosisi: number;
  statusFinal: string; // basis pcs; dipertahankan untuk DetailPanel
  // Basis biaya (Rupiah) — pengganti akumulasi berbasis pcs.
  sisaUangMonthly: number;
  targetCostAccum: number;
  realisasiCostAccum: number;
  selisihCostAccum: number;
  sisaUangAccum: number;
  progressCostAccum: number; // 0..1
  statusFinalCost: string;
  statusFinalCostAccum: string;
  benefitRate: number;        // normalized from benefit_per_pcs
  extraProduction: number;    // computed: max(0, realisasi - target)
  benefitAmount: number;      // computed: extra × rate
}

function monthlyRealisasi(sewing: SewingRecord[], person: string, ym: string): number {
  let n = 0;
  if (!ym) return n;
  for (const s of sewing) {
    if (s.picPenjahit !== person) continue;
    if (!String(s.tanggalLaporan ?? '').startsWith(ym)) continue;
    n += Number(s.qtySelesai) || 0;
  }
  return n;
}

export function enrichDetails(
  details: TargetJahitDetailRow[],
  sewing: SewingRecord[],
  person: string,
  ym: string,
  workOrderDesign: Map<string, WorkOrderDesignIdentity>,
): { qtyRealisasi: number; nilai: number }[] {
  return calculateDetailRealizations(
    details,
    sewing,
    person,
    ym,
    workOrderDesign,
  );
}

/**
 * Enrich all rows of ONE person at a time is handled internally: this function
 * processes every row, computing accumulation across that person's months
 * (rows sorted by bulan_tahun ascending for accumulation ordering).
 */
export function enrichTargetRows(
  rows: TargetJahitRow[],
  sewing: SewingRecord[],
  workOrderDesign: Map<string, WorkOrderDesignIdentity>,
  prices: PriceMap,
  details: TargetJahitDetailRow[],
  holidays: string[],
  today: Date,
): EnrichedTargetRow[] {
  const sorted = [...rows].sort((a, b) => String(a.bulan_tahun ?? '').localeCompare(String(b.bulan_tahun ?? '')));
  // Akumulasi lintas bulan per penjahit, kini dalam Rupiah (basis biaya).
  const accumByPerson = new Map<string, { targetCost: number; realisasiCost: number }>();

  return sorted.map((row) => {
    const ym = String(row.bulan_tahun ?? '');
    const person = row.nama;
    // Count full month workdays (Mon-Sat minus all holidays)
    const totalHariKerja = countWorkdays(ym, holidays);

    // Count workdays from start of month up to TODAY (inclusive)
    const hariKerjaHariIni = elapsedWorkdays(ym, holidays, today);

    // SISA HARI = Workdays remaining FROM TOMORROW until END OF MONTH
    let sisaHari: number;
    if (monthIsCurrent(ym, today)) {
      // Calculate workdays from tomorrow onwards
      const p = parseYm(ym);
      if (!p) {
        sisaHari = 0;
      } else {
        const holidaySet = new Set<string>();
        const national = getNationalHolidaysInMonth(ym);
        national.forEach(h => holidaySet.add(h));
        holidays?.forEach(h => holidaySet.add(h));

        sisaHari = 0;
        const totalDaysInMonth = daysInMonth(p.year, p.month);
        for (let d = today.getDate() + 1; d <= totalDaysInMonth; d++) {
          const dow = new Date(p.year, p.month - 1, d).getDay();
          if (dow === 0) continue; // Skip Sunday
          if (holidaySet.has(dateKey(p.year, p.month, d))) continue; // Skip holiday
          sisaHari++;
        }
      }
    } else {
      // Past or future month: 0 remaining
      sisaHari = 0;
    }
    const targetMonthly = Number(row.target_monthly) || 0;
    const targetDaily = totalHariKerja > 0 ? targetMonthly / totalHariKerja : 0;

    const realisasiMonthly = monthlyRealisasi(sewing, person, ym);
    const sisaTargetMonthly = Math.max(0, targetMonthly - realisasiMonthly);
    const progressMonthly = targetMonthly > 0 ? realisasiMonthly / targetMonthly : 0;
    const targetNgebutHari = sisaHari > 0 ? Math.ceil(sisaTargetMonthly / sisaHari) : 0;

    // Realization cost: prefer detail prices, fall back to price map.
    const myDetails = details.filter((d) => d.targetJahitId === row.id);
    const enrichedDetails = enrichDetails(myDetails, sewing, person, ym, workOrderDesign);
    let realisasiCostPosisi = 0;
    enrichedDetails.forEach((e, i) => {
      const d = myDetails[i];
      const fallbackPrice = prices[productionCodePriceKey(d.productNote)];
      const price = (d.hargaJahit || 0) + (d.hargaObras || 0) || (fallbackPrice ? fallbackPrice.jahit + fallbackPrice.obras : 0);
      realisasiCostPosisi += e.qtyRealisasi * price;
    });

    const isCurrent = monthIsCurrent(ym, today);
    const isPast = monthIsPast(ym, today);
    const statusFinal = finalStatus(realisasiMonthly, targetMonthly, isCurrent, isPast);

    // ===== Basis biaya (Rupiah) =====
    // Patokan pencapaian adalah uang, bukan pcs: target adalah penghasilan
    // penjahit, dan realisasi bertambah sebesar tarif per pcs x pcs dijahit.
    const targetCostPosisi = Number(row.target_cost_posisi) || 0;
    const sisaUangMonthly = Math.max(0, targetCostPosisi - realisasiCostPosisi);
    const statusFinalCost = finalStatus(
      realisasiCostPosisi,
      targetCostPosisi,
      isCurrent,
      isPast,
    );

    // Accumulation across this person's months up to this row — dalam Rupiah.
    const acc = accumByPerson.get(person) ?? { targetCost: 0, realisasiCost: 0 };
    acc.targetCost += targetCostPosisi;
    acc.realisasiCost += realisasiCostPosisi;
    accumByPerson.set(person, acc);
    const targetCostAccum = acc.targetCost;
    const realisasiCostAccum = acc.realisasiCost;
    // Tanda negatif berarti "masih kurang" — dipakai staffDebtEligibility.
    const selisihCostAccum = realisasiCostAccum - targetCostAccum;
    const sisaUangAccum = Math.max(0, targetCostAccum - realisasiCostAccum);
    const progressCostAccum =
      targetCostAccum > 0 ? realisasiCostAccum / targetCostAccum : 0;
    const statusFinalCostAccum = finalStatus(
      realisasiCostAccum,
      targetCostAccum,
      isCurrent,
      isPast,
    );

    // Benefit calculation: per-piece bonus for production above monthly target
    const benefitRate = Number(row.benefit_per_pcs) || 0;
    const extraProduction = Math.max(0, realisasiMonthly - targetMonthly);
    const benefitAmount = extraProduction * benefitRate;

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
      statusFinal,
      sisaUangMonthly,
      targetCostAccum,
      realisasiCostAccum,
      selisihCostAccum,
      sisaUangAccum,
      progressCostAccum,
      statusFinalCost,
      statusFinalCostAccum,
      benefitRate,
      extraProduction,
      benefitAmount,
    };
  });
}
