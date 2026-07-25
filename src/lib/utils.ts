import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { supabase } from '@/lib/supabase'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generate the next manual-prefix ID (e.g. PO-001, WO-001)
 * by querying the max existing ID from a Supabase table.
 */
export async function generateId(
  prefix: string,
  tableName: string,
  idColumn: string = 'id'
): Promise<string> {
  // Coba sequential dulu, fallback ke random UUID
  const { data, error } = await supabase
    .from(tableName)
    .select(idColumn)
    .order(idColumn, { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }

  const lastId = ((data[0] as unknown) as Record<string, unknown>)[idColumn] as string
  const numPart = lastId.replace(`${prefix}-`, '')
  const num = parseInt(numPart, 10)

  // Kalau ID existing bukan format sequential, pake random UUID
  if (Number.isNaN(num) || numPart.length > 6) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }

  const nextNum = num + 1
  return `${prefix}-${String(nextNum).padStart(3, '0')}`
}

export function formatCurrency(value: unknown): string {
  if (typeof value === 'number') return 'Rp ' + value.toLocaleString('id-ID');
  return String(value || '-');
}

// AppSheet treats a number as blank only when truly empty
// (undefined / null / "" / NaN). Explicit 0 is a real value -> not blank.
function isBlank(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(n);
}

function toNum(value: unknown): number {
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Compute "Cut vs Upload" following the AppSheet formula:
 *   IF ISNULL([Total Cutting]) -> ""
 *   ELSE IF (Quantity = Total Selesai Jahit) AND (Total Selesai Jahit = Total Cutting) -> "LENGKAP"
 *   ELSE -> "ON PROGRESS"
 */
export function computeCutVsUpload(row: Record<string, unknown>): string {
  if (isBlank(row.totalCutting)) return '';
  const quantity = toNum(row.quantity);
  const totalSelesaiJahit = toNum(row.totalSelesaiJahit);
  const totalCutting = toNum(row.totalCutting);
  if (quantity === totalSelesaiJahit && totalSelesaiJahit === totalCutting) {
    return 'LENGKAP';
  }
  return 'ON PROGRESS';
}

/**
 * Compute "STATUS STOCK":
 *   Cut vs Upload = ON PROGRESS  -> "DALAM PROSES PRODUKSI"
 *   otherwise (LENGKAP / kosong) -> "TUNGGU KEPUTUSAN"
 */
export function computeStatusStock(row: Record<string, unknown>): string {
  const cutVsUpload = isBlank(row.cutVsUpload) ? computeCutVsUpload(row) : String(row.cutVsUpload);
  return cutVsUpload === 'ON PROGRESS' ? 'DALAM PROSES PRODUKSI' : 'TUNGGU KEPUTUSAN';
}

export function getBadgeClass(value: unknown): string {
  const v = String(value).toUpperCase();
  if (['LENGKAP', 'CLEAR FINISH', 'DONE REGISTER', 'BALANCE', 'DITERIMA', 'AKTIF'].includes(v)) return 'success';
  if (['ON PROGRESS', 'SEDANG MENGEJAR', 'DALAM PERJALANAN', 'STOK MENIPIS'].some(x => v.includes(x))) return 'warning';
  if (['MASALAH', 'TYPO', 'NOT REGISTER', 'TIDAK CAPAI', 'NON-AKTIF'].some(x => v.includes(x))) return 'danger';
  if (['TUNGGU KEPUTUSAN', 'MENUNGGU', 'PERLU ISI', 'PERLU HAPUS'].some(x => v.includes(x))) return 'purple';
  if (['DALAM PROSES PRODUKSI', 'PRDN', 'WHLB', 'PENJAHIT', 'LEADER', 'FINISHING', 'ATASAN', 'BAWAHAN', 'OUTER', 'SUDAH ISI'].some(x => v.includes(x))) return 'info';
  return 'info';
}

export function getBadgeStyles(variant: string): string {
  switch (variant) {
    case 'success':
      return 'bg-green-100 text-green-700';
    case 'warning':
      return 'bg-amber-100 text-amber-700';
    case 'danger':
      return 'bg-red-100 text-red-700';
    case 'info':
      return 'bg-blue-100 text-blue-700';
    case 'purple':
      return 'bg-purple-100 text-purple-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function getRowCondColor(row: Record<string, unknown>, condColors: Array<{ field: string; operator: string; value: string; color: string }>): string {
  for (const cc of condColors) {
    const val = String(row[cc.field] || '').toLowerCase();
    const target = cc.value.toLowerCase();
    if (cc.operator === 'contains' && val.includes(target)) {
      return getCondColorClass(cc.color);
    }
    if (cc.operator === 'equals' && val === target) {
      return getCondColorClass(cc.color);
    }
  }
  return '';
}

function getCondColorClass(color: string): string {
  switch (color) {
    case 'red': return 'bg-red-50 hover:bg-red-100';
    case 'yellow': return 'bg-amber-50 hover:bg-amber-100';
    case 'green': return 'bg-green-50 hover:bg-green-100';
    case 'blue': return 'bg-blue-50 hover:bg-blue-100';
    case 'purple': return 'bg-purple-50 hover:bg-purple-100';
    default: return '';
  }
}
