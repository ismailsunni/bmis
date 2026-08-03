import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { roleFromAccessToken } from './jwt'
import type { UserRole } from '@/types/db'

interface AuthState {
  session: Session | null
  user: User | null
  /** The role RLS will actually apply, read from the access token's claims. */
  role: UserRole
  /**
   * True when the access token carries no user_role claim, i.e. the custom
   * access token hook is not wired up. `role` is then only a display value read
   * from profiles — the database still treats the caller as a viewer, so this
   * is a misconfiguration, not a cosmetic issue.
   */
  roleClaimMissing: boolean
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

/** Absolute session lifetime; PRD 7.1 requires logout after 12 idle hours. */
const IDLE_LIMIT_MS = 12 * 60 * 60 * 1000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileRole, setProfileRole] = useState<UserRole | null>(null)

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

  const claimRole = roleFromAccessToken(session?.access_token)

  // Consulted only when the claim is absent, so the UI can still name the real
  // role while warning that the hook is not delivering it.
  useEffect(() => {
    if (!session || claimRole) {
      setProfileRole(null)
      return
    }
    let alive = true
    supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (alive && data) setProfileRole(data.role as UserRole)
      })
    return () => {
      alive = false
    }
  }, [session, claimRole])

  useEffect(() => {
    if (!session) return
    let last = Date.now()
    const touch = () => {
      last = Date.now()
    }
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

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      role: claimRole ?? profileRole ?? 'viewer',
      roleClaimMissing: Boolean(session) && !claimRole,
      loading,
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, claimRole, profileRole, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return ctx
}
