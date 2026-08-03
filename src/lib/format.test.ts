import { describe, expect, it } from 'vitest'
import { formatIDR, formatIDRShort, maskIDR, parseIDR } from './format'
import { can, canWrite, hasMinRole } from '@/auth/permissions'

describe('currency', () => {
  it('formats rupiah without cents', () => {
    // Intl separates the symbol with a non-breaking space
    expect(formatIDR(1250000).replace(/[^0-9A-Za-z.]/g, ' ')).toBe('Rp 1.250.000')
  })

  it('round-trips a masked amount', () => {
    expect(parseIDR(maskIDR('1250000'))).toBe(1250000)
  })

  it('ignores non-digits rather than producing NaN', () => {
    expect(parseIDR('Rp 2.500.000,-')).toBe(2500000)
    expect(parseIDR('')).toBe(0)
  })

  it('abbreviates for chart axes', () => {
    expect(formatIDRShort(2_500_000)).toBe('Rp 2.5 jt')
    expect(formatIDRShort(1_200_000_000)).toBe('Rp 1.2 M')
  })
})

describe('permissions', () => {
  it('ranks auditor above amil for reads', () => {
    expect(hasMinRole('auditor', 'amil')).toBe(true)
  })

  it('never lets an auditor write, despite the higher rank', () => {
    expect(canWrite('auditor')).toBe(false)
    expect(can.recordDonation('auditor')).toBe(false)
    expect(can.verifyDonation('auditor')).toBe(false)
  })

  it('keeps donor PII away from viewer', () => {
    expect(can.readDonorPII('viewer')).toBe(false)
    expect(can.readDonorPII('amil')).toBe(true)
  })

  it('restricts verification to finance and above', () => {
    expect(can.verifyDonation('amil')).toBe(false)
    expect(can.verifyDonation('finance')).toBe(true)
    expect(can.verifyDonation('super_admin')).toBe(true)
  })

  it('restricts user management to super_admin', () => {
    expect(can.manageUsers('finance')).toBe(false)
    expect(can.manageUsers('super_admin')).toBe(true)
  })
})
