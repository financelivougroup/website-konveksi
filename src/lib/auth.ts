import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/types/pipeline'

// Supabase Auth memerlukan email. Aplikasi ini hanya punya tiga akun tetap
// dan pengguna login dengan username, jadi username dipetakan ke alamat
// internal. Domain ini tidak nyata — reset password lewat email tidak akan
// berfungsi; password diganti lewat dashboard Supabase.
const EMAIL_DOMAIN = '@konveksi.local'

export interface Profile {
  id: string
  username: string
  displayName: string
  role: AppRole
  /**
   * `register_penjahit.id` milik akun ini; `null` untuk akun tanpa data
   * karyawan (owner, finance, inventory).
   *
   * Dipakai halaman Target Jahit untuk menampilkan **hanya baris sendiri**
   * pada tab Utang Staff/Benefit. Kolom ini sudah ada di database sejak
   * `2026-10-19-kpi-produksi-fase1.sql` dan dipakai KPI; jangan diturunkan
   * dengan mencocokkan `displayName` ke `pic_penjahit` — nama bisa berubah,
   * `orang_id` tidak.
   */
  orangId: number | null
}

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}${EMAIL_DOMAIN}`
}

export async function signIn(username: string, password: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  })
  return { error }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export async function fetchProfile(userId: string): Promise<{ data: Profile | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, role, orang_id')
    .eq('id', userId)
    .single()

  if (error || !data) return { data: null, error }

  return {
    data: {
      id: data.id as string,
      username: data.username as string,
      displayName: data.display_name as string,
      role: data.role as AppRole,
      orangId: (data.orang_id as number | null) ?? null,
    },
    error: null,
  }
}
