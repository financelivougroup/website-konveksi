import type { AppRole } from '@/types/pipeline'

/**
 * Siapa yang boleh **mengubah atau menghapus** baris log produksi
 * (Sewing / Kancing / Finishing).
 *
 * Permintaan user (verbatim): *"tolong buat settingan kalau khusus role finance
 * dan owner bisa delete/edit row di bagian sewing, kancing, finishing. selain
 * role tsb hanya bisa read dan input di awal aja."*
 *
 * Jadi aturannya:
 * - `owner` dan `finance` → boleh baca, input, **ubah, dan hapus**.
 * - `inventory` → boleh baca dan input (membuat entri baru), **tidak** boleh
 *   mengubah atau menghapus.
 *
 * Aturan ini hidup di SATU tempat karena dipakai dua sisi yang tidak boleh
 * berbeda: tombol di UI (Production Monitoring) dan policy RLS di database
 * (`supabase/migrations/2026-09-24-production-log-role-restriction.sql`).
 * Kalau daftar role-nya ditulis ulang di halaman, cepat atau lambat tombol dan
 * policy akan berbeda — persis pola yang dulu membuat Entry Jahitan memakai
 * daftar penjahit dummy sementara Planning sudah benar.
 */
export const PRODUCTION_LOG_EDITOR_ROLES: readonly AppRole[] = ['owner', 'finance']

/**
 * True bila role ini boleh mengubah/menghapus baris log produksi.
 *
 * Ditulis sebagai allow-list eksplisit (bukan "semua kecuali inventory") supaya
 * role baru yang kelak ditambahkan ke `public.profiles.role` otomatis TIDAK
 * mendapat hak ubah/hapus sampai sengaja dimasukkan ke sini.
 *
 * `null`/`undefined` (belum ada profil) juga ditolak — gagal ke arah aman.
 */
export function canEditProductionLog(role: AppRole | null | undefined): boolean {
  return role === 'owner' || role === 'finance'
}

/**
 * Kalimat penjelas untuk pengguna yang tidak berhak.
 *
 * Disimpan di sini supaya tooltip, `aria-label`, dan pesan penolakan berbunyi
 * sama persis di semua tempat — dan supaya perubahan kebijakan cukup diubah
 * sekali.
 */
export const PRODUCTION_LOG_EDIT_HINT =
  'Hanya role Owner dan Finance yang bisa mengubah atau menghapus catatan ini.'

/**
 * Siapa yang boleh **mencatat, mengubah, atau menghapus** baris GAJI.
 *
 * Permintaan user (verbatim): *"yang isi cuma boleh finance"*. Owner boleh
 * **melihat**, tidak mengisi.
 *
 * Bedanya dengan `PRODUCTION_LOG_EDITOR_ROLES`: di log produksi owner ikut
 * boleh mengubah; di sini TIDAK. Itu sebabnya daftarnya terpisah, bukan
 * dipakai ulang — memakai ulang daftar yang menerima owner akan diam-diam
 * memberi owner hak tulis yang user tidak minta.
 *
 * Seperti aturan log produksi, aturan ini hidup di SATU tempat karena dipakai
 * dua sisi yang tidak boleh berbeda: tombol di UI (halaman Expense) dan policy
 * RLS di database (`supabase/migrations/2026-09-25-expense-salary-entries.sql`,
 * lewat fungsi `public.is_finance()`).
 */
export const SALARY_EDITOR_ROLES: readonly AppRole[] = ['finance']

/**
 * True bila role ini boleh menulis baris gaji.
 *
 * Allow-list eksplisit (bukan "semua kecuali X") supaya role baru yang kelak
 * ditambahkan otomatis TIDAK mendapat hak tulis sampai sengaja dimasukkan.
 * `null`/`undefined` juga ditolak — gagal ke arah aman.
 */
export function canEditSalary(role: AppRole | null | undefined): boolean {
  return role === 'finance'
}

/** Kalimat penjelas untuk pengguna yang tidak berhak menulis baris gaji. */
export const SALARY_EDIT_HINT =
  'Hanya role Finance yang bisa mencatat atau mengubah gaji.'

/** UI affordance only; the permanent-delete RPC enforces this independently. */
export function canPermanentlyDelete(role: AppRole | null | undefined): boolean {
  return role === 'owner' || role === 'finance'
}

/**
 * Benar bila role ini boleh melihat penghasilan **semua** staf — gaji, biaya,
 * utang, dan benefit — bukan hanya miliknya sendiri.
 *
 * Permintaan user (verbatim): *"kalau finance dan owner ya bisa lihat semua
 * fitur. gak ada yang di lock"*. Siapa pun selain dua role ini hanya melihat
 * barisnya sendiri (dipetakan lewat `profiles.orang_id`).
 *
 * Dipasangkan dengan `public.staff_settlement_read` di database, yang memakai
 * aturan yang sama: owner/finance menerima seluruh staf, selain itu hanya
 * `orang_id` miliknya. Keduanya harus tetap sama — UI tidak boleh menjanjikan
 * data yang kemudian ditolak server, dan sebaliknya.
 */
export function canViewAllStaffMoney(role: AppRole | null | undefined): boolean {
  return role === 'owner' || role === 'finance'
}
