import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchProfile, signOut as authSignOut } from '@/lib/auth'
import type { Profile } from '@/lib/auth'
import { AuthProvider } from '@/contexts/AuthContext'
import LoginPage from '@/pages/LoginPage'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await fetchProfile(userId)
    if (data) {
      setProfile(data)
    } else {
      // Sesi sah tapi baris profiles tidak ada — data tidak konsisten.
      // Jangan render aplikasi tanpa identitas; paksa keluar.
      await authSignOut()
      setProfile(null)
    }
    setChecking(false)
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setChecking(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setChecking(false)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  if (checking) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
      </div>
    )
  }

  if (!profile) return <LoginPage />

  const value = { profile, signOut: authSignOut }
  return <AuthProvider value={value}>{children}</AuthProvider>
}
