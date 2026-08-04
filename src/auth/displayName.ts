/**
 * Picks the name to show for the signed-in user.
 *
 * `profiles.full_name` wins because an admin curates it; a provider's own
 * metadata is the fallback, since a Google account supplies `name` while an
 * account created by hand in the Supabase dashboard may supply nothing.
 *
 * Returns null when there is no name worth showing — including the case where
 * the stored name is just the email address again, which would otherwise print
 * the same string twice in the sidebar.
 */
export function displayName(
  profileName: string | null | undefined,
  metadata: { full_name?: unknown; name?: unknown } | undefined,
  email: string | null | undefined,
): string | null {
  const fromMetadata = [metadata?.full_name, metadata?.name].find(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  )
  const candidate = profileName?.trim() || fromMetadata?.trim()
  if (!candidate) return null
  if (email && candidate.toLowerCase() === email.trim().toLowerCase()) return null
  return candidate
}
