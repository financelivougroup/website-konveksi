/**
 * Register Karyawan (tabel `register_penjahit`).
 *
 * Policy tulis yang dibutuhkan tabel ini: SELECT + INSERT, ditambah **UPDATE dan
 * DELETE untuk `authenticated`**. Dua yang terakhir baru ditambahkan pada
 * `supabase/migrations/2026-09-19-register-penjahit-tanggal-mulai-bekerja.sql` —
 * sebelumnya tidak ada sama sekali, sehingga update/hapus disaring habis tanpa
 * error dan aplikasi melaporkan "berhasil" padahal 0 baris yang berubah.
 */
import { supabase } from '@/lib/supabase'

const TABLE = 'register_penjahit'

// Row shape used by the UI (camelCase, matches viewConfig keys).
export interface RegisterPenjahitRow {
  id: number
  picPenjahit: string
  posisi: string | null
  status: string
  /** 'YYYY-MM-DD'; '' bila belum diisi (tiga karyawan lama). */
  tanggalMulaiBekerja: string
}

export const POSISI_OPTIONS = ['Leader', 'Penjahit', 'Finishing']

export const STATUS_OPTIONS = ['Aktif', 'Non-Aktif']

// Aturan "siapa yang boleh dipilih sebagai penjahit" ada di `src/lib/karyawan.ts`
// (murni, bisa diuji tanpa Supabase) dan di-ekspor ulang dari sini supaya
// pemanggil lama tetap punya satu pintu masuk. Jangan menyalin logikanya ke
// halaman mana pun — itulah yang dulu menyebabkan Entry Jahitan memakai daftar
// nama dummy sementara Planning sudah benar.
export { isActivePenjahit, activePenjahitNames, activeKancingNames, activeFinishingNames, type KaryawanSelectionRow } from '@/lib/karyawan'

/**
 * 'YYYY-MM-DD' dari kolom `date`, '' bila kosong.
 *
 * Penjaga regex penting: `String(new Date()).slice(0, 10)` menghasilkan
 * "Mon Sep 19" — teks yang lolos begitu saja sebagai nilai tanggal. Pola ini
 * meniru `toDateOnly` di src/lib/laporanCompute.ts (tidak diekspor ke sini
 * supaya modul komputasi laporan tidak ikut jadi ketergantungan service).
 */
function toDateOnly(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : ''
}

/** '' → null: kolom `date` MENOLAK string kosong (error 22007). */
function dateOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed || null
}

function mapRow(row: Record<string, unknown>): RegisterPenjahitRow {
  return {
    id: row.id as number,
    picPenjahit: row.pic_penjahit as string,
    posisi: (row.posisi as string | null) ?? null,
    status: (row.status as string) ?? 'Aktif',
    tanggalMulaiBekerja: toDateOnly(row.tanggal_mulai_bekerja),
  }
}

export async function fetchAll(): Promise<{ data: RegisterPenjahitRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true })
  if (error) return { data: null, error }
  return { data: (data as Record<string, unknown>[] | null)?.map(mapRow) ?? null, error: null }
}

export async function create(input: Omit<RegisterPenjahitRow, 'id'>): Promise<{ data: RegisterPenjahitRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      pic_penjahit: input.picPenjahit,
      posisi: input.posisi,
      status: input.status ?? 'Aktif',
      tanggal_mulai_bekerja: dateOrNull(input.tanggalMulaiBekerja),
    })
    .select()
    .single()
  if (error) return { data: null, error }
  return { data: data ? mapRow(data as Record<string, unknown>) : null, error: null }
}

export async function update(id: number, updates: Partial<RegisterPenjahitRow>): Promise<{ error: Error | null }> {
  const dbUpdates: Record<string, unknown> = {}
  if (updates.picPenjahit !== undefined) dbUpdates.pic_penjahit = updates.picPenjahit
  if (updates.posisi !== undefined) dbUpdates.posisi = updates.posisi
  if (updates.status !== undefined) dbUpdates.status = updates.status
  if (updates.tanggalMulaiBekerja !== undefined) {
    dbUpdates.tanggal_mulai_bekerja = dateOrNull(updates.tanggalMulaiBekerja)
  }
  // `.select('id')` WAJIB ada. Tanpa itu PostgREST membalas `error: null`
  // walaupun 0 baris cocok (policy RLS menolak, atau JWT kedaluwarsa sehingga
  // request jatuh ke peran `anon`), dan pemanggil melaporkan "berhasil" palsu.
  const { data, error } = await supabase
    .from(TABLE)
    .update(dbUpdates)
    .eq('id', id)
    .select('id')
  if (error) return { error }
  if (!data || data.length === 0) {
    return { error: new Error(`Tidak ada baris yang terupdate (id ${id}). Periksa policy RLS atau id-nya.`) }
  }
  return { error: null }
}

export async function remove(id: number): Promise<{ error: Error | null }> {
  // Alasan `.select('id')` sama dengan di `update` di atas.
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return { error }
  if (!data || data.length === 0) {
    return { error: new Error(`Tidak ada baris yang terhapus (id ${id}). Periksa policy RLS atau id-nya.`) }
  }
  return { error: null }
}
