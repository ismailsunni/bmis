import { describe, expect, it } from 'vitest'
import { roleFromAccessToken } from './jwt'

/** Builds a token shaped like Supabase's, without signing it. */
const token = (claims: unknown) => {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.signature`
}

describe('roleFromAccessToken', () => {
  it('reads the role the access token hook injects', () => {
    expect(roleFromAccessToken(token({ app_metadata: { user_role: 'super_admin' } }))).toBe(
      'super_admin',
    )
  })

  it('returns null when the hook is not configured, rather than guessing', () => {
    // this is the case that must be distinguishable: no claim means the hook is
    // missing, which is a misconfiguration, not "this user is a viewer"
    expect(roleFromAccessToken(token({ app_metadata: { provider: 'email' } }))).toBeNull()
    expect(roleFromAccessToken(token({ sub: 'abc' }))).toBeNull()
  })

  it('ignores user_role placed outside app_metadata', () => {
    // RLS only reads app_metadata.user_role, so neither may the client
    expect(roleFromAccessToken(token({ user_role: 'super_admin' }))).toBeNull()
    expect(roleFromAccessToken(token({ user_metadata: { user_role: 'finance' } }))).toBeNull()
  })

  it('never throws on absent or malformed input', () => {
    expect(roleFromAccessToken(undefined)).toBeNull()
    expect(roleFromAccessToken(null)).toBeNull()
    expect(roleFromAccessToken('')).toBeNull()
    expect(roleFromAccessToken('not-a-jwt')).toBeNull()
    expect(roleFromAccessToken('a.b')).toBeNull()
    expect(roleFromAccessToken('header.!!!not-base64!!!.sig')).toBeNull()
    expect(roleFromAccessToken('header.eyJub3QtY2xvc2VkIjo.sig')).toBeNull()
  })

  it('decodes base64url payloads containing non-ASCII names', () => {
    // atob alone yields latin1 and would mangle these; TextDecoder is required
    const t = token({ app_metadata: { user_role: 'amil' }, name: 'Zulfikar Aliâ€™ Hüseyin' })
    expect(roleFromAccessToken(t)).toBe('amil')
  })

  it('passes through the unadmitted role so the UI can act on it', () => {
    expect(roleFromAccessToken(token({ app_metadata: { user_role: 'none' } }))).toBe('none')
  })
})
