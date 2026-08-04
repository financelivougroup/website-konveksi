import { useState } from 'react'
import { Factory, Loader2 } from 'lucide-react'
import { signIn } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) {
      setErrorMsg('Username dan password harus diisi.')
      return
    }
    setSubmitting(true)
    setErrorMsg(null)

    const { error } = await signIn(username, password)

    if (error) {
      // Pesan yang sama untuk username tidak ada maupun password salah,
      // supaya tidak membocorkan username mana yang valid.
      setErrorMsg('Username atau password salah.')
      setSubmitting(false)
    }
    // Berhasil: onAuthStateChange di AuthGate yang mengambil alih.
    // Jangan reset submitting — biarkan tombol tetap nonaktif sampai
    // komponen ini dilepas, agar tidak ada kedipan.
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 font-sans">
      <Card className="w-full max-w-[360px] shadow-sm">
        <CardHeader className="flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-sky-500 flex items-center justify-center shadow-sm shadow-sky-200">
            <Factory className="w-5 h-5 text-white" />
          </div>
          <CardTitle className="text-[17px] font-semibold text-slate-800">Konveksi Pro</CardTitle>
          <CardDescription className="text-[12px] text-slate-500">
            Masuk untuk melanjutkan
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-username" className="text-[12px] text-slate-600">Username</Label>
              <Input
                id="login-username"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={submitting}
                className="h-9 text-[13px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="text-[12px] text-slate-600">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="h-9 text-[13px]"
              />
            </div>

            {errorMsg && (
              <p role="alert" className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {errorMsg}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="w-full h-9 text-[13px] bg-sky-500 hover:bg-sky-600">
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Memproses...
                </>
              ) : (
                'Masuk'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}