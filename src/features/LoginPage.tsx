import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Card, ErrorNote, Field, Input } from '@/components/ui'

type Mode = 'password' | 'magic'

/**
 * BASE_URL already ends in a slash and carries the /bmis/ prefix on Pages, so
 * this stays correct both locally and when served from a subpath.
 */
const callbackUrl = () =>
  `${window.location.origin}${import.meta.env.BASE_URL}auth/callback`

/** Google's mark, inlined so no request leaves the page to fetch it. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A8.99 8.99 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A8.99 8.99 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  )
}

export function LoginPage() {
  const { session, loading } = useAuth()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  // A failed provider redirect reports itself in the query string under the
  // PKCE flow and in the fragment under the implicit flow. Reading only one of
  // them silently swallows the reason and drops the user on a blank form.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const code = search.get('error_code') ?? hash.get('error_code')
    const description = search.get('error_description') ?? hash.get('error_description')
    if (!code && !description) return

    const text = description?.replace(/\+/g, ' ')
    setError(
      code === 'signup_disabled' || text?.toLowerCase().includes('signups not allowed')
        ? 'Pendaftaran lewat Google sedang dimatikan di server, sehingga akun Anda ' +
          'tidak dapat ditautkan. Hubungi pengurus.'
        : text ?? 'Gagal masuk dengan penyedia tersebut',
    )
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  if (loading) return null
  if (session) return <Navigate to="/" replace />

  const signInWithGoogle = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // BASE_URL keeps this correct under the /bmis/ path on Pages
      options: { redirectTo: callbackUrl() },
    })
    if (error) {
      setError(error.message)
      setBusy(false)
    }
  }

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
          email,
          options: { shouldCreateUser: false, emailRedirectTo: callbackUrl() },
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

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
              <span className="text-xs text-slate-400">atau</span>
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
            </div>

            <Button type="button" variant="secondary" className="w-full"
                    disabled={busy} onClick={signInWithGoogle}>
              <GoogleMark /> Masuk dengan Google
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
          Akun dibuat oleh pengurus. Pendaftaran mandiri tidak tersedia, termasuk
          melalui Google.
        </p>
      </Card>
    </div>
  )
}
