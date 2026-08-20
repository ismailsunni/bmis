import type { DonationStatus, UserRole } from '@/types/db'

const RANK: Record<UserRole, number> = {
  super_admin: 5,
  finance: 4,
  auditor: 3,
  amil: 2,
  viewer: 1,
  none: 0,
}

/** Mirrors public.role_rank: an unknown role is no access, not viewer access. */
export const rank = (role: UserRole) => RANK[role] ?? 0
export const hasMinRole = (role: UserRole, required: UserRole) => rank(role) >= rank(required)

/**
 * Mirrors public.can_write(): auditor outranks amil for reads but must never
 * write, so write checks cannot be expressed as a rank comparison.
 */
export const canWrite = (role: UserRole) =>
  role === 'amil' || role === 'finance' || role === 'super_admin'

/**
 * How much of a donation a correction may touch.
 *
 * `full` while the entry is still in the queue, per donations_update_own and
 * donations_update_finance. `annotations` once it is verified — notes, payment
 * reference and proof only, mirroring guard_donation_immutable_after_queue(),
 * which freezes every column a balance, a report bucket or an issued receipt
 * depends on. `null` when this user may not correct the entry at all.
 *
 * Nobody edits a verified amount, not even a ketua: that money is already in
 * fund_balance() and on a receipt the donor is holding, so the correction is a
 * void and a re-entry.
 */
export const donationEditScope = (
  role: UserRole,
  own: boolean,
  status: DonationStatus,
): 'full' | 'annotations' | null => {
  const financeOrAbove = role === 'finance' || role === 'super_admin'
  if (status === 'draft' || status === 'pending') {
    return financeOrAbove || (role === 'amil' && own) ? 'full' : null
  }
  return status === 'verified' && financeOrAbove ? 'annotations' : null
}

/**
 * UI-level capability checks. These only decide what to render — every one of
 * them is enforced independently by RLS, and the database is what actually
 * says no. Never treat a `true` here as authorization.
 */
export const can = {
  recordDonation: (r: UserRole) => canWrite(r),
  verifyDonation: (r: UserRole) => r === 'finance' || r === 'super_admin',
  voidDonation: (r: UserRole) => r === 'finance' || r === 'super_admin',
  readDonorPII: (r: UserRole) => r !== 'viewer',
  manageDonors: (r: UserRole) => canWrite(r),
  /**
   * Mirrors the donors_update policy: finance and above may edit anyone, an amil
   * only the donors they created themselves.
   */
  editDonor: (r: UserRole, own: boolean) =>
    r === 'finance' || r === 'super_admin' || (r === 'amil' && own),
  mergeDonors: (r: UserRole) => r === 'finance' || r === 'super_admin',
  manageBeneficiaries: (r: UserRole) => canWrite(r),
  requestDistribution: (r: UserRole) => canWrite(r),
  approveDistribution: (r: UserRole) => r === 'finance' || r === 'super_admin',
  managePrograms: (r: UserRole) => r === 'finance' || r === 'super_admin',
  manageAccounts: (r: UserRole) => r === 'finance' || r === 'super_admin',
  lockPeriod: (r: UserRole) => r === 'finance' || r === 'super_admin',
  /**
   * Bypassing separation of duties — verifying or approving your own entry.
   * Mirrors public.guard_sod_override(), which enforces the same list on the
   * table itself so a direct API call cannot get around it.
   */
  overrideSeparationOfDuties: (r: UserRole) => r === 'finance' || r === 'super_admin',
  readAuditLog: (r: UserRole) => hasMinRole(r, 'auditor'),
  manageUsers: (r: UserRole) => r === 'super_admin',
  manageSettings: (r: UserRole) => r === 'super_admin',
  fullReports: (r: UserRole) => r !== 'viewer',
}
