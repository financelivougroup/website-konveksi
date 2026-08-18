const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function formatMonthYear(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  const month = MONTHS_ID[d.getMonth()];
  return `${month} ${d.getFullYear()}`;
}

// 'YYYY-MM' (format input type="month" / kolom bulan_target) → 'September 2026'.
export function formatMonthYearFromYm(ym: string): string {
  if (!ym) return '';
  const m = ym.match(/^(\d{4})-(\d{2})/);
  if (!m) return ym;
  const month = MONTHS_ID[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : ym;
}