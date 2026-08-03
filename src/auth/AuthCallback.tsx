import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button, Card } from '@/components/ui'

/**
 * Landing point for every provider and magic-link redirect.
 *
 * It exists to remove a race: the session is established asynchronously from
 * the URL, while route guards decide immediately. A guard that runs first
 * navigates away and takes the ?code= with it, after which the exchange can
 * never happen and the user is returned to the login form with no explanation.
 *
 * This route sits outside the guards, waits for the session, and — when nothing
 * arrives — reports what the URL actually contained instead of failing silently.
 */
export function AuthCallback() {
  const navigate = useNavigate()
  const [problem, setProblem] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)

  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const pick = (k: string) => search.get(k) ?? hash.get(k)

    const errorCode = pick('error_code') ?? pick('error')
    const description = pick('error_description')?.replace(/\+/g, ' ')

    if (errorCode || description) {
      setProblem(description ?? errorCode ?? 'Gagal masuk')
      setDetail(`error_code=${errorCode ?? '-'}`)
      return
    }

    const hasCode = Boolean(pick('code'))
    const hasToken = Boolean(pick('access_token'))

    // If a session is already stored, or arrives once the client finishes
    // reading the URL, go straight in.
    let done = false
    const finish = () => {
      if (done) return
      done = true
      navigate('/', { replace: true })
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish()
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish()
    })

    const timer = window.setTimeout(() => {
      if (done) return
      setProblem('Sesi tidak dapat dibuat dari tautan ini.')
      setDetail(
        hasCode ? 'Kode otorisasi diterima tetapi penukaran sesi gagal — '
          + 'biasanya karena proses masuk dimulai di peramban atau perangkat lain.'
        : hasToken ? 'Token diterima tetapi tidak dapat disimpan.'
        : 'Tautan tidak memuat kode maupun token. Pastikan URL callback '
          + 'terdaftar pada daftar Redirect URLs di Supabase.',
      )
    }, 8000)

    return () => {
      sub.subscription.unsubscribe()
      window.clearTimeout(timer)
    }
  }, [navigate])

  if (!problem) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Menyelesaikan proses masuk…
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-lg font-bold text-red-700 dark:text-red-400">Gagal masuk</h1>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{problem}</p>
        {detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}
        <Link to="/masuk">
          <Button variant="secondary" className="mt-5 w-full">Kembali ke halaman masuk</Button>
        </Link>
      </Card>
    </div>
  )
}
