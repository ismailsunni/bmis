import type { UserRole } from '@/types/db'

/**
 * Reads the role out of a Supabase access token.
 *
 * The custom access token hook writes `app_metadata.user_role` into the JWT
 * claims, and that is what RLS reads through `current_role()`. Deliberately not
 * taken from `session.user.app_metadata`, which mirrors
 * `auth.users.raw_app_meta_data` — a field the hook never writes. Reading the
 * wrong one made a super_admin render as a viewer while the database disagreed.
 *
 * Never throws: a malformed or absent token yields null, and callers treat that
 * as "no role claim", which is a configuration problem rather than a crash.
 */
export function roleFromAccessToken(token: string | undefined | null): UserRole | null {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as {
      app_metadata?: { user_role?: string }
    }
    const role = claims.app_metadata?.user_role
    return role ? (role as UserRole) : null
  } catch {
    return null
  }
}
