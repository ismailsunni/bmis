import { describe, expect, it } from 'vitest'
import { dateInputJakarta, formatIDR, formatIDRShort, maskIDR, parseIDR } from './format'
import { can, canWrite, donationEditScope, hasMinRole } from '@/auth/permissions'
import { baseAmountOf, matchTransferCode, transferCodeOf } from './transferCode'

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

describe('dates', () => {
  it("reads a timestamp as its Jakarta calendar day, not the browser's", () => {
    // 23:30 UTC is already the next day in Jakarta (UTC+7); the edit form
    // prefills from this, so an off-by-one here silently moves a donation
    expect(dateInputJakarta('2026-08-19T23:30:00Z')).toBe('2026-08-20')
    expect(dateInputJakarta('2026-08-20T05:00:00+07:00')).toBe('2026-08-20')
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

  it('lets an amil edit only the donors they created', () => {
    // mirrors the donors_update policy: own rows for an amil, anyone for finance
    expect(can.editDonor('amil', true)).toBe(true)
    expect(can.editDonor('amil', false)).toBe(false)
    expect(can.editDonor('finance', false)).toBe(true)
    expect(can.editDonor('super_admin', false)).toBe(true)
  })

  it('allows a full correction only while the donation is still in the queue', () => {
    // mirrors donations_update_own / donations_update_finance
    expect(donationEditScope('amil', true, 'pending')).toBe('full')
    expect(donationEditScope('amil', true, 'draft')).toBe('full')
    expect(donationEditScope('amil', false, 'pending')).toBe(null)
    expect(donationEditScope('finance', false, 'pending')).toBe('full')
    expect(donationEditScope('auditor', true, 'pending')).toBe(null)
    expect(donationEditScope('viewer', true, 'pending')).toBe(null)
  })

  it('narrows a verified donation to its annotations, for every role', () => {
    // mirrors guard_donation_immutable_after_queue(): the figures are already in
    // the balances and on an issued receipt, so they change by void and re-entry
    expect(donationEditScope('finance', false, 'verified')).toBe('annotations')
    expect(donationEditScope('super_admin', false, 'verified')).toBe('annotations')
    // an amil has no update policy for a verified row at all, own or not
    expect(donationEditScope('amil', true, 'verified')).toBe(null)
    // voided and rejected are terminal: re-enter instead
    expect(donationEditScope('super_admin', false, 'voided')).toBe(null)
    expect(donationEditScope('finance', false, 'rejected')).toBe(null)
  })

  it('never lets a read-only role edit a donor', () => {
    expect(can.editDonor('auditor', true)).toBe(false)
    expect(can.editDonor('viewer', true)).toBe(false)
    expect(can.editDonor('none', true)).toBe(false)
  })

  it('restricts user management to super_admin', () => {
    expect(can.manageUsers('finance')).toBe(false)
    expect(can.manageUsers('super_admin')).toBe(true)
  })
})

describe('transfer codes', () => {
  it('reads the code from the trailing three digits', () => {
    // the poster's own example: Rp100.153 is Rp 100.000 for code 153
    expect(transferCodeOf(100_153)).toBe('153')
    expect(baseAmountOf(100_153)).toBe(100_000)
  })

  it('pads a code that starts with a zero', () => {
    expect(transferCodeOf(50_012)).toBe('012')
  })

  it('has no code below a thousand, where the digits are just the amount', () => {
    expect(transferCodeOf(500)).toBeNull()
    expect(transferCodeOf(999)).toBeNull()
  })

  it('treats a round amount as uncoded, matching the general-sedekah rule', () => {
    const codes = [
      {
        code: '153',
        name: 'Sedekah Bantu Petani',
        kind: 'program' as const,
        fund_type_id: 'ft-sedekah',
        program_id: 'p-petani',
      },
    ]
    expect(matchTransferCode(100_000, codes)).toBeNull()
    expect(matchTransferCode(100_153, codes)?.name).toBe('Sedekah Bantu Petani')
  })

  it('does not invent a destination for an unpublished code', () => {
    expect(matchTransferCode(100_999, [])).toBeNull()
  })
})
