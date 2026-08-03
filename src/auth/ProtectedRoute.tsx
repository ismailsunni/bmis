import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import type { UserRole } from '@/types/db'

/**
 * Route gating is cosmetic: it keeps people out of screens that would only
 * show them empty tables anyway. The database refuses the data regardless.
 */
export function ProtectedRoute({
  children, allow,
}: { children: ReactNode; allow?: (role: UserRole) => boolean }) {
  const { session, role, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Memuat…
      </div>
    )
  }
  if (!session) return <Navigate to="/masuk" state={{ from: location }} replace />
  if (allow && !allow(role)) return <Navigate to="/" replace />
  return <>{children}</>
}
