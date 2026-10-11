import type { SewingRecord } from '@/types/pipeline';
import type { TargetJahitRow } from '@/services/targetJahit';
import type { TargetJahitDetailRow } from '@/services/targetJahitDetail';
import type { PriceMap } from '@/services/staffDebt';
import { calculateDesignBenefits, effectiveDetailRate } from '@/lib/targetBenefit';
import { getNationalHolidaysInMonth } from '@/data/nationalHolidays';
import { emptySalaryLookup, type SalaryLookup } from '@/lib/staffSalary';
import {
  calculateDetailRealizations,
  type DetailRealization,
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
  progressMonthly: number; // 0..1
  realisasiCostPosisi: number;
  targetAccum: number;
  realisasiAccum: number;
  selisihAccum: number;
  targetNgebutHariAkumulasi: number;
  progressAccum: number; // 0..1
  statusFinal: string;
  statusFinalAkumulasi: string;
  /** Jumlah kelebihan per desain (hanya desain yang melebihi targetnya). */
  extraProduction: number;
  /** Total benefit bulanan = Σ (extra desain × tarif desain). */
  benefitAmount: number;
  /**
   * GAJI bulan itu, dibaca dari `expense_entries` (MANPOWER › SALARY).
   *
   * `null` berarti gajinya BELUM DIINPUT — dibedakan dari 0 supaya halaman bisa
   * menampilkan "—" dan badge, bukan "Rp 0" yang terbaca seolah gajinya nol.
   */
  salaryAmount: number | null;
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
): DetailRealization[] {
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
 *
 * `salaries` adalah pencarian gaji per (nama, bulan). Parameter ini OPSIONAL
 * supaya pemanggil lama (dan tes) tetap bisa memanggil tanpa data gaji — nilai
 * default-nya adalah pencarian kosong, yang berarti setiap baris tampil sebagai
 * "belum diinput", bukan error.
 */
export function enrichTargetRows(
  rows: TargetJahitRow[],
  sewing: SewingRecord[],
  workOrderDesign: Map<string, WorkOrderDesignIdentity>,
  prices: PriceMap,
  details: TargetJahitDetailRow[],
  holidays: string[],
  today: Date,
  salaries: SalaryLookup = emptySalaryLookup(),
): EnrichedTargetRow[] {
  const sorted = [...rows].sort((a, b) => String(a.bulan_tahun ?? '').localeCompare(String(b.bulan_tahun ?? '')));
  const accumByPerson = new Map<string, { target: number; realisasi: number }>();

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

    // Realization cost & benefit share one rate per design (`effectiveDetailRate`),
    // so the money shown for a design never disagrees between the two.
    const myDetails = details.filter((d) => d.targetJahitId === row.id);
    const enrichedDetails = enrichDetails(myDetails, sewing, person, ym, workOrderDesign);
    let realisasiCostPosisi = 0;
    enrichedDetails.forEach((e, i) => {
      realisasiCostPosisi += e.qtyRealisasi * effectiveDetailRate(myDetails[i], prices);
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

    // Benefit is per design, not per month: rates differ by production code, so
    // each design's surplus is multiplied by its own rate. `extraProduction` is
    // the summed surplus across designs that actually beat their own target.
    const designBenefits = calculateDesignBenefits(
      myDetails,
      enrichedDetails.map((e) => e.qtyRealisasi),
      prices,
    );
    const extraProduction = designBenefits.reduce((sum, b) => sum + b.extraProduction, 0);
    const benefitAmount = designBenefits.reduce((sum, b) => sum + b.benefitAmount, 0);

    // GAJI bulan ini = `Target Cost / Posisi`. Dibaca dari expense_entries,
    // bukan dari kolom `target_cost_posisi` (kolom itu tidak lagi ditulis).
    //
    // Inilah SATU-SATUNYA titik suntiknya: seluruh pembaca hilir — tabel Target
    // Jahit, Laporan, kedua chart biaya, dan Sisa Uang — membaca
    // `target_cost_posisi` dari baris HASIL fungsi ini, jadi menimpanya di sini
    // sudah cukup. Yang perlu diubah terpisah hanya `computeDebt` dan
    // `generateTargetsFromPlanning`, karena keduanya menyentuh DB langsung.
    const salaryAmount = salaries.amountFor(person, ym) ?? null;

    return {
      ...row,
      // Ditimpa dengan gaji; `null` (belum diinput) menjadi 0 supaya seluruh
      // perhitungan uang di hilir tetap menerima angka, bukan null.
      target_cost_posisi: salaryAmount ?? 0,
      salaryAmount,
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
      extraProduction,
      benefitAmount,
    };
  });
}
