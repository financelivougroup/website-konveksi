import type { SewingRecord } from '@/types/pipeline';

// ===== Supabase-powered: all mock data arrays have been removed. =====
// Helpers kept for computed fields, ID generation, and formatting.

export const penjahitList = [
  'Budi Santoso',
  'Ani Wulandari',
  'Caca',
  'Dedi Kurniawan',
  'Eka Prasetya',
  'Fitri Handayani',
];

// ===== Helper Functions (kept for computed values & formatting) =====

/** Get sewing total for a work order from an array of sewing records */
export function getSewingTotal(woId: string, records?: SewingRecord[]): number {
  if (!records) return 0;
  return records
    .filter((s) => s.workOrderId === woId)
    .reduce((sum, r) => sum + r.qtySelesai, 0);
}

// Generate work code
export function generateWorkCode(productNote: string, product: string, warna: string, size: string): string {
  if (!productNote) return '';
  let prefix: string;
  if (productNote.includes('B-00')) {
    prefix = 'Produksi - Awal';
  } else {
    const bIndex = productNote.indexOf('B-');
    if (bIndex === -1) {
      prefix = 'Restock-';
    } else {
      prefix = `Restock-${productNote.substring(bIndex + 2, bIndex + 4)}`;
    }
  }
  return `${prefix} | ${product} | ${warna} | ${size}`;
}

/** Format date for display */
// Format tanggal seragam: DD-MM-YYYY (mis. 05-09-2026).
export function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  // 'YYYY-MM-DD' murni (input type="date" / kolom date DB) — split string,
  // aman dari pergeseran zona waktu.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}-${m}-${y}`;
  }
  // Timestamp ISO (dengan waktu/zona) — konversi ke waktu lokal browser.
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}
