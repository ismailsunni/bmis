import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { UserRole } from '@/types/db'

interface AuthState {
  session: Session | null
  user: User | null
  /** Read from the JWT claim set by the custom access token hook. */
  role: UserRole
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

/** Absolute session lifetime; PRD 7.1 requires logout after 12 idle hours. */
const IDLE_LIMIT_MS = 12 * 60 * 60 * 1000

const roleFromSession = (session: Session | null): UserRole => {
  const claim = (session?.user?.app_metadata as { user_role?: string } | undefined)?.user_role
  return (claim as UserRole) ?? 'viewer'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let last = Date.now()
    const touch = () => { last = Date.now() }
    const events = ['mousedown', 'keydown', 'touchstart', 'visibilitychange']
    events.forEach((e) => window.addEventListener(e, touch))
    const timer = window.setInterval(() => {
      if (Date.now() - last > IDLE_LIMIT_MS) supabase.auth.signOut()
    }, 60_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      window.clearInterval(timer)
    }
  }, [session])

  const value = useMemo<AuthState>(() => ({
    session,
    user: session?.user ?? null,
    role: roleFromSession(session),
    loading,
    signOut: async () => { await supabase.auth.signOut() },
  }), [session, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return ctx
}
