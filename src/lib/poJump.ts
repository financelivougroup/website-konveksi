import type { PoJump } from '@/types';

/**
 * Cocokkan satu baris dengan PO yang sedang dilompati.
 *
 * Dipakai tiga halaman tujuan (Production Monitoring, Invoicing, Order Entry)
 * yang bentuk barisnya berbeda-beda — karena itu fungsi ini menerima dua NILAI
 * yang sudah diekstrak pemanggil, bukan barisnya. Setiap halaman tahu sendiri
 * nama field-nya:
 *
 * | Halaman | nilai `orderId` | nilai `code` |
 * |---|---|---|
 * | Production Monitoring | `wo.sourceOrderId` | `wo.productNote` |
 * | Invoicing | `inv.productionOrderId` | segmen awal `inv.workCode` |
 * | Order Entry | `order.id` | `order.productionCode` |
 *
 * **`orderId` diperiksa lebih dulu, dan baris yang punya `orderId` BERBEDA
 * langsung ditolak** — tidak jatuh ke pembandingan `code`. Ini yang membuat
 * urutannya penting, bukan sekadar rapi: `code` hanyalah cadangan untuk baris
 * yang kolom relasinya kosong (invoice lama bisa ber-`production_order_id`
 * NULL). Kalau baris yang sudah jelas milik order lain masih dibandingkan
 * lewat `code`, baris itu bisa ikut lolos hanya karena nomor PO-nya kebetulan
 * sama — dan `product_note` tidak punya UNIQUE constraint di database, jadi
 * nomor yang sama bisa muncul lebih dari sekali.
 *
 * `code` dibandingkan setelah `trim()` dan tanpa peduli huruf besar-kecil:
 * nomor PO diketik manusia di beberapa jalur, dan satu spasi tak sengaja tidak
 * boleh membuat barisnya menghilang dari hasil.
 *
 * Tanpa `jump` (halaman dibuka normal), semuanya lolos — jadi pemanggil tidak
 * perlu bercabang.
 */
export function matchesPoJump(
  jump: PoJump | null | undefined,
  values: { orderId?: string | null; code?: string | null },
): boolean {
  if (!jump) return true;

  // Baris punya relasi → relasinya yang menentukan, titik.
  if (values.orderId) return values.orderId === jump.orderId;

  // Baris tanpa relasi (mis. invoice lama) → baru pakai nomor PO sebagai
  // cadangan. Tanpa nomor PO pembanding, barisnya tidak bisa dicocokkan.
  if (!jump.code) return false;
  const wanted = jump.code.trim().toLocaleLowerCase('id-ID');
  const actual = values.code?.trim().toLocaleLowerCase('id-ID');
  return !!actual && actual === wanted;
}

/**
 * Ambil nomor PO dari `workCode` invoice.
 *
 * `invoices.work_code` dibentuk `order_entry_save` sebagai
 * `kode_produksi | produk | warna | size` (lihat migrasi
 * `2026-09-06-production-code-auto.sql`), jadi nomor PO-nya adalah segmen
 * PERTAMA sebelum `' | '` — bukan seluruh kolomnya. Memakai seluruh kolom akan
 * membuat perbandingan selalu gagal karena ada produk/warna/size di belakangnya.
 *
 * Dikembalikan `null` bila pemisahnya tidak ada, supaya pemanggil tahu bahwa
 * tidak ada nomor PO yang bisa dipakai membandingkan.
 */
export function poCodeFromWorkCode(workCode: string | null | undefined): string | null {
  if (!workCode) return null;
  const first = workCode.split(' | ')[0]?.trim();
  return first ? first : null;
}
