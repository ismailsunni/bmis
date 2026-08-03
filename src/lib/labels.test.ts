import { describe, expect, it } from 'vitest'
import {
  asnafLabels,
  distributionStatusLabels,
  distributionTypeLabels,
  donationStatusLabels,
  donorTypeLabels,
  paymentMethodLabels,
  programStatusLabels,
  roleLabels,
  verificationStatusLabels,
} from './labels'

/**
 * The Postgres enums and their TypeScript unions are maintained by hand, and a
 * label map with a missing key renders `undefined` in the UI rather than failing
 * to compile. These lists mirror the enum values in migration 001; adding a
 * value there without a label here fails the build.
 */
const EXPECTED: Record<string, [Record<string, string>, string[]]> = {
  user_role: [roleLabels, ['none', 'viewer', 'amil', 'auditor', 'finance', 'super_admin']],
  donor_type: [donorTypeLabels, ['individual', 'organization', 'anonymous']],
  payment_method: [paymentMethodLabels, ['cash', 'transfer', 'qris', 'ewallet', 'in_kind']],
  donation_status: [donationStatusLabels, ['draft', 'pending', 'verified', 'rejected', 'voided']],
  asnaf: [
    asnafLabels,
    ['fakir', 'miskin', 'amil', 'muallaf', 'riqab', 'gharimin', 'fisabilillah', 'ibnu_sabil'],
  ],
  verification_status: [
    verificationStatusLabels,
    ['unverified', 'survey_scheduled', 'verified', 'rejected'],
  ],
  distribution_type: [distributionTypeLabels, ['cash', 'goods', 'service', 'scholarship']],
  distribution_status: [
    distributionStatusLabels,
    ['requested', 'approved', 'disbursed', 'rejected'],
  ],
  program_status: [programStatusLabels, ['draft', 'active', 'completed', 'cancelled']],
}

describe('Indonesian labels cover every enum value', () => {
  for (const [enumName, [labels, values]] of Object.entries(EXPECTED)) {
    it(`${enumName} has a label for each value and no extras`, () => {
      for (const value of values) {
        expect(labels[value], `${enumName}.${value} has no label`).toBeTruthy()
      }
      expect(Object.keys(labels).sort()).toEqual([...values].sort())
    })
  }

  it('covers all eight asnaf, since zakat eligibility depends on them', () => {
    expect(Object.keys(asnafLabels)).toHaveLength(8)
  })

  it('labels the unadmitted role, which users do see on the pending screen', () => {
    expect(roleLabels.none).toBeTruthy()
  })
})
