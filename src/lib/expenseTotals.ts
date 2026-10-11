// ===== Aritmetika uang Expense =====
// Helper murni: tidak fetch, tidak mengimpor Supabase, tidak menulis data —
// sama seperti src/lib/expenseEntries.ts, supaya aturan hitungan bisa dikunci
// tes tanpa merender halaman.
//
// ATURAN INI CERMINAN DARI KOLOM GENERATED DI DATABASE
// (lihat supabase/migrations/2026-09-17-expense-entries-transaction-columns.sql):
//   total         = quantity * unit_price
//   total_payment = quantity * unit_price + shipping_admin - discount_cashback
//
// Kenapa ditulis DUA KALI dengan sengaja: form perlu menampilkan hasilnya
// SEKETIKA saat user mengetik, sebelum apa pun disimpan. Tetapi angka yang
// benar-benar tersimpan tetap dihitung database — jadi kalau kedua sisi ini
// pernah berbeda, database yang menang dan tes di sini akan menangkap
// perbedaannya lebih dulu.
//
// CATATAN: di database, `total_payment` TIDAK boleh merujuk `total` (kolom
// generated tidak boleh bergantung pada kolom generated lain), jadi rumusnya
// ditulis penuh. Di sini pun ditulis penuh supaya bentuknya sama persis.

import { parseAmount } from './expenseEntries.ts';

export interface ExpenseAmounts {
  quantity: number;
  unitPrice: number;
  shippingAdmin: number;
  discountCashback: number;
}

/** `Jumlah × Harga/Item`. */
export function computeTotal(quantity: number, unitPrice: number): number {
  const qty = Number.isFinite(quantity) ? quantity : 0;
  const price = Number.isFinite(unitPrice) ? unitPrice : 0;
  return Math.round(qty * price);
}

/** `Total + Ongkir/Admin − Discount/Cashback`. */
export function computeTotalPayment(amounts: ExpenseAmounts): number {
  const total = computeTotal(amounts.quantity, amounts.unitPrice);
  const shipping = Number.isFinite(amounts.shippingAdmin) ? amounts.shippingAdmin : 0;
  const discount = Number.isFinite(amounts.discountCashback) ? amounts.discountCashback : 0;
  return total + shipping - discount;
}

/**
 * Jumlah barang dari input — bilangan bulat **lebih besar dari nol**.
 *
 * Beda dengan `parseAmount` yang menolak nol: di sana nol memang nominal yang
 * tidak sah, sedangkan di sini nol adalah jumlah barang yang tidak masuk akal
 * (membeli 0 barang bukan pembelian). Karena itu ada fungsi terpisah, bukan
 * memakai `parseAmount` dengan pengecualian.
 */
export function parseCount(raw: string): number | null {
  const value = parseAmount(raw);
  // `parseAmount` sudah menolak kosong, desimal, nol, dan negatif — jadi apa
  // pun yang lolos di sini pasti bilangan bulat > 0.
  return value;
}

/**
 * Nominal opsional (Ongkir/Admin, Discount/Cashback) — bilangan bulat >= 0.
 *
 * Kosong berarti **0**, bukan error: tidak setiap pembelian ada ongkir atau
 * diskon. Mengembalikan `null` hanya untuk input yang benar-benar salah
 * (desimal, negatif, bukan angka).
 */
export function parseOptionalAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;
  return value;
}

/**
 * Apakah hasil hitungannya masuk akal sebagai sebuah pembelian.
 *
 * Mengembalikan pesan alasan (siap tampil) bila tidak, atau `null` bila sah.
 * Cerminan CHECK `expense_entries_total_payment_positive` di database, supaya
 * user diberi tahu sebelum menekan Simpan, bukan setelah ditolak.
 */
export function validateAmounts(amounts: ExpenseAmounts): string | null {
  if (amounts.shippingAdmin < 0 || amounts.discountCashback < 0) {
    return 'Ongkir/Admin dan Discount/Cashback tidak boleh negatif.';
  }
  const payment = computeTotalPayment(amounts);
  if (payment <= 0) {
    return 'Total Payment harus lebih besar dari nol. Periksa apakah Discount/Cashback melebihi Total + Ongkir/Admin.';
  }
  return null;
}
