/**
 * Helper utilities for calculating and formatting holiday information
 */

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month - 1, 0).getDate();
}

export function countSundays(year: number, month: number): number {
  let count = 0;
  const totalDays = daysInMonth(year, month);
  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month - 1, day);
    if (date.getDay() === 0) {
      count++;
    }
  }
  return count;
}

export function generateHolidayTooltipInfo(
  ym: string,
  manualHolidays: string[],
  nationalHolidays: string[]
): { totalDays: number; sundays: number; totalHolidays: number; workdays: number } {
  const p = /^(\d{4})-(\d{2})$/.test(ym) ? ym.match(/^(\d{4})-(\d{2})$/) : null;
  if (!p) {
    return { totalDays: 0, sundays: 0, totalHolidays: 0, workdays: 0 };
  }

  const year = parseInt(p[1]);
  const month = parseInt(p[2]);

  const totalDays = daysInMonth(year, month);
  const sundays = countSundays(year, month);
  const totalHolidays = [...new Set([...manualHolidays, ...nationalHolidays])].length;

  // Workdays = Total days - Sundays - Holidays
  const workdays = Math.max(0, totalDays - sundays - totalHolidays);

  return { totalDays, sundays, totalHolidays, workdays };
}

/**
 * Format a date as day-month format (DD MMMM) with Indonesian month names
 */
export function formatDatePretty(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return dateStr;

  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const date = new Date(year, month - 1, day);
  const dayName = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][date.getDay()];

  return `${day} ${months[month - 1]} (${dayName})`;
}
