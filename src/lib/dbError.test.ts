import { describe, expect, it } from 'vitest'
import { friendlyDbError } from './dbError'

describe('friendlyDbError', () => {
  it('explains a duplicate donor phone, the most likely edit failure', () => {
    const raw = 'duplicate key value violates unique constraint "donors_phone_uniq"'
    expect(friendlyDbError(raw)).toContain('sudah terdaftar pada donatur lain')
  })

  it('explains a repeated payment reference', () => {
    expect(
      friendlyDbError(
        'duplicate key value violates unique constraint "donations_payment_ref_uniq"',
      ),
    ).toContain('sudah pernah dicatat')
  })

  it('turns an RLS refusal into plain language', () => {
    expect(friendlyDbError('new row violates row-level security policy for table "donors"')).toBe(
      'Anda tidak berwenang melakukan perubahan ini.',
    )
    expect(friendlyDbError('permission denied for table donors')).toBe(
      'Anda tidak berwenang melakukan perubahan ini.',
    )
  })

  it('passes an unrecognised message through rather than hiding it', () => {
    // a database rule we have not mapped is still more useful raw than replaced
    // by something vague — Indonesian trigger messages are already readable
    const raw = 'Periode 2026-08 sudah dikunci'
    expect(friendlyDbError(raw)).toBe(raw)
  })
})
