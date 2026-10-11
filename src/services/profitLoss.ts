/**
 * Sumber data laporan Profit & Loss.
 *
 * Modul ini SENGAJA tidak punya tabel sendiri — ia membaca dua tabel yang sudah
 * ada, memakai service yang sudah ada pula:
 *   - income  → `invoices`      lewat `@/services/invoices`
 *   - expense → `expense_entries` lewat `@/services/expenseEntries`
 *
 * Kenapa TIDAK ada query `select` sendiri di sini: kalau modul ini menyusun
 * daftar kolomnya sendiri, ia bisa diam-diam menyimpang dari `mapRow` milik
 * kedua service itu — mis. lupa bahwa `entry_date` harus diiris 10 karakter.
 * Dengan memakai ulang service-nya, definisi "income" dan "biaya" di halaman ini
 * dijamin identik dengan halaman Invoicing dan Expense.
 */
import { fetchAllInvoices } from '@/services/invoices'
import { fetchAll as fetchAllExpenses } from '@/services/expenseEntries'
import {
  buildCategoryBreakdown,
  buildProfitLossMonths,
  type MainCategoryRow,
  type ProfitLossMonth,
} from '@/lib/profitLoss'
import type { InvoiceRow } from '@/types/pipeline'
import type { ExpenseEntry } from '@/lib/expenseEntries'

export interface ProfitLossData {
  /** Dua baris mentahnya, dipakai halaman untuk menghitung bulan terpilih. */
  invoices: InvoiceRow[]
  expenses: ExpenseEntry[]
  /** Tren lintas bulan — dipakai grafik. */
  months: ProfitLossMonth[]
}

/**
 * Ambil seluruh invoice dan catatan biaya sekali jalan.
 *
 * Keduanya diambil PARALEL: tidak ada ketergantungan di antara keduanya, jadi
 * menjalankannya berurutan hanya menambah waktu tunggu tanpa manfaat.
 *
 * Tanpa filter tanggal di sisi database, dengan sengaja: laporan ini butuh tren
 * lintas bulan, jadi seluruh riwayat memang harus ada di klien. Ini sama dengan
 * yang dilakukan halaman Expense. Bila kelak datanya membesar sampai taraf yang
 * memberatkan, yang perlu diubah adalah query-nya (agregasi per bulan di
 * database), bukan pemanggilnya — sehingga halaman tidak perlu ikut berubah.
 */
export async function fetchProfitLossData(): Promise<{ data: ProfitLossData | null; error: Error | null }> {
  const [invoiceResult, expenseResult] = await Promise.all([
    fetchAllInvoices(),
    fetchAllExpenses(),
  ])

  if (invoiceResult.error) return { data: null, error: invoiceResult.error }
  if (expenseResult.error) return { data: null, error: expenseResult.error }

  const invoices = invoiceResult.data ?? []
  const expenses = expenseResult.data ?? []

  return {
    data: {
      invoices,
      expenses,
      months: buildProfitLossMonths(expenses, invoices),
    },
    error: null,
  }
}

/** Rincian biaya per Main → Sub Category untuk himpunan baris tertentu. */
export function categoryBreakdownFor(expenses: readonly ExpenseEntry[]): MainCategoryRow[] {
  return buildCategoryBreakdown(expenses)
}
