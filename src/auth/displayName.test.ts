import { describe, expect, it } from 'vitest'
import { displayName } from './displayName'

describe('displayName', () => {
  it('prefers the curated profile name over provider metadata', () => {
    expect(displayName('Ismail Sunni', { name: 'ismail s' }, 'bm.mmgta@gmail.com')).toBe(
      'Ismail Sunni',
    )
  })

  it("falls back to the provider's name when the profile has none", () => {
    // a Google account supplies `name`; a dashboard-created user supplies nothing
    expect(displayName('', { name: 'Ahmad Fauzi' }, 'a@b.c')).toBe('Ahmad Fauzi')
    expect(displayName(null, { full_name: 'Siti Aminah' }, 'a@b.c')).toBe('Siti Aminah')
  })

  it('returns null when there is no name at all, so only the email shows', () => {
    expect(displayName(null, undefined, 'a@b.c')).toBeNull()
    expect(displayName('   ', {}, 'a@b.c')).toBeNull()
  })

  it('returns null when the name is just the email again', () => {
    // avoids printing the same string on both sidebar lines
    expect(displayName('a@b.c', undefined, 'a@b.c')).toBeNull()
    expect(displayName('A@B.C', undefined, 'a@b.c')).toBeNull()
  })

  it('ignores non-string metadata rather than rendering it', () => {
    expect(displayName(null, { name: 42, full_name: null }, 'a@b.c')).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(displayName('  Ismail  ', undefined, 'a@b.c')).toBe('Ismail')
  })
})
