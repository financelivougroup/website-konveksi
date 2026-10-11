import { supabase } from '@/lib/supabase'
import { publicUrlFor, removeFromR2, uploadToR2 } from '@/services/r2Storage'
import type { ExpenseEntry } from '@/lib/expenseEntries'
import { SALARY_SUB_CATEGORY } from '@/lib/staffSalary'

const TABLE = 'expense_entries'

/**
 * Jenis lampiran nota.
 *
 * Lampiran kini disimpan di Cloudflare R2 (satu bucket, awalan `expense-proofs/`).
 * Nilai ini tetap diekspor sebagai label jenis lampiran dan dipakai bersama
 * `r2Storage`; kolom `proof_path` di database tidak berubah.
 */
export const EXPENSE_PROOF_BUCKET = 'expense-proofs'

function mapRow(row: Record<string, unknown>): ExpenseEntry {
  return {
    id: row.id as number,
    // `entry_date` bertipe `date`; supabase-js dapat mengembalikannya sebagai
    // 'YYYY-MM-DD' dan itulah yang dipakai seluruh aplikasi. Diiris sepuluh
    // karakter sebagai pengaman bila suatu saat nilainya berbentuk timestamp.
    entryDate: String(row.entry_date ?? '').slice(0, 10),
    categoryId: (row.category_id as number | null) ?? null,
    itemId: (row.item_id as number | null) ?? null,
    vendorId: (row.vendor_id as number | null) ?? null,
    staffId: (row.staff_id as number | null) ?? null,
    vendorName: (row.vendor_name as string) ?? '',
    quantity: Number(row.quantity ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    total: Number(row.total ?? 0),
    shippingAdmin: Number(row.shipping_admin ?? 0),
    discountCashback: Number(row.discount_cashback ?? 0),
    totalPayment: Number(row.total_payment ?? 0),
    flowTransaction: (row.flow_transaction as string) ?? '',
    invoiceNumber: (row.invoice_number as string) ?? '',
    namaBarang: (row.nama_barang as string) ?? '',
    pic: (row.pic as string) ?? '',
    proofPaymentPath: (row.proof_payment_path as string | null) ?? null,
    proofPaymentUrl: (row.proof_payment_url as string | null) ?? null,
    typeName: (row.type_name as string) ?? '',
    mainCategoryName: (row.main_category_name as string) ?? '',
    subCategoryName: (row.sub_category_name as string) ?? '',
    itemName: (row.item_name as string) ?? '',
    categoryPath: (row.category_path as string) ?? '',
    note: (row.note as string) ?? '',
    proofPath: (row.proof_path as string | null) ?? null,
    proofUrl: (row.proof_url as string | null) ?? null,
    inputBy: (row.input_by as string | null) ?? null,
    createdAt: (row.created_at as string) ?? '',
  }
}

/**
 * Seluruh catatan biaya, KRONOLOGIS: tanggal terlama dulu.
 *
 * Permintaan user (verbatim): *"urutan baris di expense itu, semakin tanggalnya
 * terbaru. nambahnya ya kebawah bukan keatas"* — dengan urutan kronologis,
 * catatan baru bertanggal hari ini selalu muncul di PALING BAWAH, bukan
 * menyisip di atas.
 *
 * Sengaja BERBEDA dari halaman lain (Invoicing, Log, dll. semuanya terbaru di
 * atas) — ini permintaan eksplisit untuk halaman Expense saja, bukan
 * ketidakkonsistenan yang tak disadari. Pengurutan terjadi di sini, di satu
 * tempat, karena halaman tidak punya sort bawaan: `applySorts` mengembalikan
 * baris apa adanya selama user belum menyetel Sort.
 *
 * `id` menaik sebagai pemecah seri supaya dua catatan bertanggal sama tetap
 * stabil menurut urutan input — tanpa itu, baris kembar bisa bertukar tempat
 * antar-pemuatan.
 *
 * Catatan: catatan yang di-backdate (tanggalnya diisi mundur) masuk ke posisi
 * kronologisnya, bukan ke paling bawah. Itu memang arti urutan tanggal.
 */
export async function fetchAll(): Promise<{ data: ExpenseEntry[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('entry_date', { ascending: true })
    .order('id', { ascending: true })
  if (error) return { data: null, error }
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error: null }
}

export type ExpenseWriteInput = Omit<ExpenseEntry, 'id' | 'createdAt'>

/**
 * Baris gaji dalam bentuk yang dibutuhkan `buildSalaryLookup`.
 *
 * Sengaja TIDAK memakai `ExpenseEntry` penuh: pemakainya (Target Jahit, Utang
 * Staf) hanya butuh nama, bulan, dan nominal — dan kolom lain tidak perlu ikut
 * dibaca dari database.
 */
export interface SalaryRow {
  /** Nama karyawan penerima; harus sama persis dengan `target_jahit.nama`. */
  staffName: string
  /** `YYYY-MM-DD` — bulannya dipakai sebagai kunci. */
  entryDate: string
  /** Nominal gaji = `total_payment` (uang yang benar-benar keluar). */
  amount: number
}

/**
 * Ambil SEMUA baris gaji yang boleh dibaca pengguna ini.
 *
 * Penyaringan siapa-yang-boleh-melihat dilakukan RLS, bukan di sini: policy
 * `Read own salary or finance owner` yang memutuskan. Finance dan owner melihat
 * seluruh baris; seorang karyawan hanya melihat barisnya sendiri.
 *
 * Baris NON-gaji tidak ikut terambil — `staff_id is not null` plus kategori
 * SALARY, sama seperti definisi di `src/lib/staffSalary.ts`.
 *
 * `staffName` opsional: bila diisi, hanya gaji orang itu yang diambil (dipakai
 * `computeDebt`). Membiarkannya kosong mengambil semua yang boleh dibaca.
 */
export async function fetchSalaries(
  staffName?: string,
): Promise<{ data: SalaryRow[] | null; error: Error | null }> {
  let query = supabase
    .from(TABLE)
    .select('staff_id, vendor_name, entry_date, total_payment, sub_category_name')
    .not('staff_id', 'is', null)
    .eq('sub_category_name', SALARY_SUB_CATEGORY)
  // Untuk baris gaji `vendor_name` berisi NAMA KARYAWAN (lihat
  // `entryFromSelection`), jadi itulah kolom yang dicocokkan dengan nama staf.
  if (staffName !== undefined) query = query.eq('vendor_name', staffName)

  const { data, error } = await query
  if (error) return { data: null, error }

  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    staffName: (row.vendor_name as string) ?? '',
    entryDate: String(row.entry_date ?? '').slice(0, 10),
    amount: Number(row.total_payment ?? 0),
  }))
  return { data: rows, error: null }
}
/** Bentuk kolom database dari satu baris expense. */
function toDbInput(input: ExpenseWriteInput) {
  return {
    entry_date: input.entryDate,
    // `total` dan `total_payment` TIDAK dikirim: keduanya kolom generated dan
    // database yang menghitungnya. Mengirimkannya justru ditolak Postgres.
    quantity: input.quantity,
    unit_price: input.unitPrice,
    shipping_admin: input.shippingAdmin,
    discount_cashback: input.discountCashback,
    flow_transaction: input.flowTransaction,
    nama_barang: input.namaBarang,
    pic: input.pic,
    proof_payment_path: input.proofPaymentPath,
    proof_payment_url: input.proofPaymentUrl,
    category_id: input.categoryId,
    item_id: input.itemId,
    vendor_id: input.vendorId,
    staff_id: input.staffId,
    vendor_name: input.vendorName,
    type_name: input.typeName,
    main_category_name: input.mainCategoryName,
    sub_category_name: input.subCategoryName,
    item_name: input.itemName,
    category_path: input.categoryPath,
    note: input.note,
    proof_path: input.proofPath,
    proof_url: input.proofUrl,
    input_by: input.inputBy,
  }
}

export async function create(input: ExpenseWriteInput): Promise<{ data: ExpenseEntry | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(toDbInput(input))
    .select()
    .single()
  if (error) return { data: null, error }
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error: null }
}

export async function update(id: number, input: ExpenseWriteInput): Promise<{ data: ExpenseEntry | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(toDbInput(input))
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) return { data: null, error }
  // Tanpa pemeriksaan ini, pengubahan yang tidak mengenai baris apa pun akan
  // dilaporkan sukses — idiom yang sama dipakai `removeInvoice`.
  if (!data) return { data: null, error: new Error('Catatan biaya tidak ditemukan.') }
  return { data: mapRow(data as Record<string, unknown>), error: null }
}

export interface RemoveExpenseResult {
  /** Operasi gagal dan tidak ada yang berubah — baris masih ada. */
  error: Error | null
}

/**
 * Hapus satu catatan biaya beserta lampirannya.
 *
 * URUTANNYA PENTING DAN SENGAJA: objek di R2 dihapus **sebelum** baris
 * database. Kalau barisnya dihapus lebih dulu, `proof_path` ikut hilang dan
 * berkasnya menjadi yatim permanen di penyimpanan — tidak ada lagi yang tahu path-nya.
 *
 * Kalau penghapusan objek gagal, seluruh operasi dibatalkan dan baris tetap utuh.
 * Ini aturan yang sama dengan `deleteInvoice` di services/invoices.ts: lebih baik
 * data utuh daripada baris hilang dengan lampiran yang sudah lenyap.
 */
export async function remove(entry: Pick<ExpenseEntry, 'id' | 'proofPath'>): Promise<RemoveExpenseResult> {
  if (entry.proofPath) {
    const { error: storageError } = await removeFromR2('expense-proofs', [entry.proofPath])
    if (storageError) {
      return {
        error: new Error(
          `Nota gagal dihapus dari Storage — catatan dibatalkan: ${storageError.message}`,
        ),
      }
    }
  }

  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', entry.id)
    .select('id')
    .maybeSingle()
  if (error) return { error }
  return { error: data ? null : new Error('Catatan biaya tidak ditemukan.') }
}

export interface UploadProofResult {
  path: string | null
  url: string | null
  error: Error | null
}

/**
 * Unggah satu foto nota ke R2.
 *
 * Path dibangun dari id catatan + timestamp + nama berkas yang sudah dibersihkan,
 * mengikuti `complainFiles.ts`. Timestamp membuat unggahan ulang tidak menimpa
 * lampiran lama saat user mengganti foto pada catatan yang sama.
 */
export async function uploadProof(entryId: number, file: File): Promise<UploadProofResult> {
  // `-` di akhir karakter class sudah literal, jadi tidak perlu di-escape.
  const safeName = file.name.replace(/[^\w.-]+/g, '_')
  const path = `expense-${entryId}/${Date.now()}-${safeName}`

  const { error: uploadError } = await uploadToR2({
    logicalBucket: 'expense-proofs',
    path,
    file,
  })
  if (uploadError) return { path: null, url: null, error: uploadError }

  return { path, url: publicUrlFor('expense-proofs', path), error: null }
}

/**
 * Hapus objek nota lama yang sudah tidak dipakai.
 *
 * Dipakai saat user mengganti foto pada catatan yang sudah ada: foto lama harus
 * dibersihkan, dan kegagalannya tidak boleh menggagalkan penyimpanan — catatan
 * yang tersimpan dengan satu berkas yatim masih jauh lebih baik daripada
 * perubahan user yang hilang. Karena itu hasilnya dikembalikan, bukan dilempar.
 */
export async function removeProofObject(path: string): Promise<{ error: Error | null }> {
  return removeFromR2('expense-proofs', [path])
}
