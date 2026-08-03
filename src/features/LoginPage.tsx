import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Card, ErrorNote, Field, Input } from '@/components/ui'

type Mode = 'password' | 'magic'

export function LoginPage() {
  const { session, loading } = useAuth()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (loading) return null
  if (session) return <Navigate to="/" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email, options: { shouldCreateUser: false },
        })
        if (error) throw error
        setSent(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand-800 dark:text-brand-300">BMIS</h1>
          <p className="text-sm text-slate-500">Sistem Informasi Baitul Maal</p>
        </div>

        {sent ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Tautan masuk telah dikirim ke <strong>{email}</strong>. Silakan cek kotak masuk Anda.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email" required>
              <Input type="email" required autoComplete="email" value={email}
                     onChange={(e) => setEmail(e.target.value)} />
            </Field>

            {mode === 'password' && (
              <Field label="Kata sandi" required>
                <Input type="password" required autoComplete="current-password"
                       value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            )}

            <ErrorNote error={error} />

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Memproses…' : mode === 'password' ? 'Masuk' : 'Kirim tautan masuk'}
            </Button>

            <button
              type="button"
              className="w-full text-center text-sm text-brand-700 hover:underline dark:text-brand-400"
              onClick={() => { setMode(mode === 'password' ? 'magic' : 'password'); setError(null) }}
            >
              {mode === 'password' ? 'Masuk dengan tautan email' : 'Masuk dengan kata sandi'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Akun dibuat oleh pengurus. Pendaftaran mandiri tidak tersedia.
        </p>
      </Card>
    </div>
  )
}
