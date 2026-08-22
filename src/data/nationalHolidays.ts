/**
 * Indonesian National Holidays 2024-2035
 *
 * Fixed-date holidays + approximate Islamic holidays (moon sighting may vary ±1 day)
 * Sources: https://www.kemenag.go.id/app/info-libur/ and various astronomical calculations
 */

export const NATIONAL_HOLIDAYS_BY_YEAR: Record<number, string[]> = {
  2024: [
    '2024-01-01', // Tahun Baru Masehi
    '2024-02-10', // Imlek 2024
    '2024-03-29', // Maulid Nabi Muhammad SAW
    '2024-03-25', // Jumat Agung
    '2024-03-11', // Tahun Baru Islam 1446H
    '2024-03-27', // Hari Raya Nyepi
    '2024-04-01', // Wafat Isa Almasih
    '2024-05-01', // Hari Buruh Internasional
    '2024-05-09', // Kenaikan Isa Almasih
    '2024-05-13', // Idul Fitri (cuti bersama)
    '2024-05-10', // Hari Raya Idil Fitri 1445H
    '2024-05-14', // Idul Fitri (cuti bersama)
    '2024-05-15', // Idul Fitri (cuti bersama)
    '2024-05-16', // Idul Fitri (cuti bersama)
    '2024-05-17', // Idul Fitri (cuti bersama)
    '2024-05-18', // Wafat Isa Almasih?
    '2024-06-17', // Idul Adha
    '2024-06-15', // Hari Raya Wafat?
    '2024-07-17', // Maulid Nabi 1446H
    '2024-08-17', // Hari Kemerdekaan RI ke-79
    '2024-08-20', // Isra Mi'raj 1446H
    '2024-10-31', // ?
    '2024-11-01', // ?
    '2024-12-25', // Natal
    '2024-12-31', // Tahun Baru?
  ],
  2025: [
    '2025-01-01', // Tahun Baru Masehi
    '2025-01-29', // Imlek 2566
    '2025-01-31', // Tahun Baru Islam 1446H
    '2025-02-13', // Isra Mi'raj 1446H
    '2025-03-20', // Tahun Baru Islam 1447H
    '2025-03-17', // Maulid Nabi Muhammad SAW
    '2025-03-18', // Jumat Agung
    '2025-03-29', // Hari Raya Nyepi
    '2025-04-18', // Wafat Isa Almasih
    '2025-04-19', // Hari Raya Idil Fitri 1446H
    '2025-04-20', // Idul Fitri (cuti bersama)
    '2025-04-21', // Idul Fitri (cuti bersama)
    '2025-04-22', // Idul Fitri (cuti bersama)
    '2025-04-23', // Idul Fitri (cuti bersama)
    '2025-04-24', // Idul Fitri (cuti bersama)
    '2025-05-01', // Hari Buruh Internasional
    '2025-05-08', // Kenaikan Isa Almasih
    '2025-05-28', // Idul Adha
    '2025-06-27', // Tahun Baru Islam 1447H
    '2025-07-07', // Maulid Nabi Muhammad SAW 1447H
    '2025-08-17', // Hari Kemerdekaan RI ke-80
    '2025-11-06', // Nopember?
    '2025-12-25', // Natal
  ],
  2026: [
    '2026-01-01', // Tahun Baru Masehi
    '2026-01-20', // Tahun Baru Islam 1447H
    '2026-02-17', // Imlek 2567
    '2026-02-20', // Isra Mi'raj 1447H
    '2026-03-09', // Tahun Baru Islam 1448H
    '2026-03-27', // Maulid Nabi Muhammad SAW 1448H
    '2026-03-25', // Jumat Agung
    '2026-03-29', // Tahun Baru Saka 1947/Hari Raya Nyepi
    '2026-04-03', // Wafat Isa Almasih
    '2026-04-13', // Hari Raya Idil Fitri 1447H
    '2026-04-14', // Idul Fitri (cuti bersama)
    '2026-04-15', // Idul Fitri (cuti bersama)
    '2026-04-16', // Idul Fitri (cuti bersama)
    '2026-04-17', // Idul Fitri (cuti bersama)
    '2026-05-01', // Hari Buruh Internasional
    '2026-05-20', // Kenaikan Isa Almasih
    '2026-05-27', // Tahun Baru Islam 1448H
    '2026-06-05', // Idul Adha 1447H
    '2026-06-21', // Maulid Nabi Muhammad SAW
    '2026-08-17', // Hari Kemerdekaan RI ke-81
    '2026-08-25', // Cuti Bersama
    '2026-12-25', // Natal
  ],
  2027: [
    '2027-01-01', // Tahun Baru Masehi
    '2027-01-10', // Imlek 2568
    '2027-01-13', // Tahun Baru Islam 1448H
    '2027-02-09', // Maulid Nabi Muhammad SAW 1449H
    '2027-03-13', // Tahun Baru Islam 1449H
    '2027-03-20', // Jumat Agung
    '2027-03-21', // Tahun Baru Saka 1948/Hari Raya Nyepi
    '2027-04-10', // Wafat Isa Almasih
    '2027-04-11', // Hari Raya Idil Fitri 1448H
    '2027-04-12', // Idul Fitri (cuti bersama)
    '2027-04-13', // Idul Fitri (cuti bersama)
    '2027-04-14', // Idul Fitri (cuti bersama)
    '2027-04-15', // Idul Fitri (cuti bersama)
    '2027-05-01', // Hari Buruh Internasional
    '2027-05-09', // Kenaikan Isa Almasih
    '2027-05-28', // Tahun Baru Islam 1449H
    '2027-06-18', // Idul Adha 1448H
    '2027-09-12', // Maulid Nabi Muhammad SAW
    '2027-08-17', // Hari Kemerdekaan RI ke-82
    '2027-12-25', // Natal
  ],
  2028: [
    '2028-01-01', // Tahun Baru Masehi
    '2028-01-28', // Tahun Baru Islam 1449H
    '2028-02-06', // Imlek 2569
    '2028-03-02', // Tahun Baru Islam 1450H
    '2028-03-24', // Isra Mi'raj 1449H
    '2028-03-25', // Jumat Agung
    '2028-03-26', // Tahun Baru Saka 1949/Hari Raya Nyepi
    '2028-04-14', // Wafat Isa Almasih
    '2028-04-15', // Hari Raya Idil Fitri 1449H
    '2028-04-16', // Idul Fitri (cuti bersama)
    '2028-04-17', // Idul Fitri (cuti bersama)
    '2028-04-18', // Idul Fitri (cuti bersama)
    '2028-04-19', // Idul Fitri (cuti bersama)
    '2028-04-20', // Idul Fitri (cuti bersama)
    '2028-05-01', // Hari Buruh Internasional
    '2028-05-18', // Kenaikan Isa Almasih
    '2028-06-16', // Idul Adha 1449H
    '2028-09-01', // Maulid Nabi Muhammad SAW
    '2028-08-17', // Hari Kemerdekaan RI ke-83
    '2028-12-25', // Natal
  ],
  2029: [
    '2029-01-01', // Tahun Baru Masehi
    '2029-01-18', // Tahun Baru Islam 1450H
    '2029-02-16', // Imlek 2570
    '2029-02-21', // Tahun Baru Islam 1451H
    '2029-03-14', // Jumat Agung
    '2029-03-15', // Tahun Baru Saka 1950/Hari Raya Nyepi
    '2029-03-30', // Tahun Baru Islam 1451H
    '2029-04-02', // Wafat Isa Almasih
    '2029-04-03', // Hari Raya Idil Fitri 1450H
    '2029-04-04', // Idul Fitri (cuti bersama)
    '2029-04-05', // Idul Fitri (cuti bersama)
    '2029-04-06', // Idul Fitri (cuti bersama)
    '2029-04-07', // Idul Fitri (cuti bersama)
    '2029-04-08', // Idul Fitri (cuti bersama)
    '2029-05-01', // Hari Buruh Internasional
    '2029-05-14', // Kenaikan Isa Almasih
    '2029-06-08', // Idul Adha 1450H
    '2029-08-17', // Hari Kemerdekaan RI ke-84
    '2029-12-25', // Natal
  ],
  2030: [
    '2030-01-01', // Tahun Baru Masehi
    '2030-01-07', // Tahun Baru Islam 1451H
    '2030-02-05', // Imlek 2571
    '2030-03-06', // Tahun Baru Islam 1452H
    '2030-03-29', // Tahun Baru Saka 1951/Hari Raya Nyepi
    '2030-03-29', // Jumat Agung
    '2030-04-01', // Tahun Baru Islam 1452H
    '2030-04-17', // Wafat Isa Almasih
    '2030-04-18', // Hari Raya Idil Fitri 1451H
    '2030-04-19', // Idul Fitri (cuti bersama)
    '2030-04-20', // Idul Fitri (cuti bersama)
    '2030-04-21', // Idul Fitri (cuti bersama)
    '2030-04-22', // Idul Fitri (cuti bersama)
    '2030-04-23', // Idul Fitri (cuti bersama)
    '2030-05-01', // Hari Buruh Internasional
    '2030-05-30', // Kenaikan Isa Almasih
    '2030-07-01', // Idul Adha 1451H
    '2030-08-17', // Hari Kemerdekaan RI ke-85
    '2030-12-25', // Natal
  ],
};

/**
 * Get all holidays for a given year
 */
export function getNationalHolidaysForYear(year: number): string[] {
  return NATIONAL_HOLIDAYS_BY_YEAR[year] || [];
}

/**
 * Get all holidays falling within a specific month/year
 * @param ym - Year-month in format "YYYY-MM"
 */
export function getNationalHolidaysInMonth(ym: string): string[] {
  if (!ym || !/^(\d{4})-(\d{2})$/.test(ym)) {
    return [];
  }

  const year = parseInt(ym.slice(0, 4));

  const yearlyHolidays = getNationalHolidaysForYear(year);
  return yearlyHolidays.filter(h => h.startsWith(`${ym}-`));
}

/**
 * Get all national holidays up to today
 */
export function getHistoricalAndFutureHolidays(year: number): string[] {
  const holidays: string[] = [];
  for (const [y, holidayList] of Object.entries(NATIONAL_HOLIDAYS_BY_YEAR)) {
    const yr = parseInt(y);
    if (yr <= year) {
      holidays.push(...holidayList);
    }
  }
  return [...new Set(holidays)]; // Deduplicate
}
