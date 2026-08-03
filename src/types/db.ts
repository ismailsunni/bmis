/**
 * 'none' is what the access token hook emits for an account with no profile or
 * one not yet activated. It ranks below viewer and reaches no data at all.
 */
export type UserRole = 'none' | 'viewer' | 'amil' | 'auditor' | 'finance' | 'super_admin'
export type DonorType = 'individual' | 'organization' | 'anonymous'
export type PaymentMethod = 'cash' | 'transfer' | 'qris' | 'ewallet' | 'in_kind'
export type DonationStatus = 'draft' | 'pending' | 'verified' | 'rejected' | 'voided'
export type Asnaf =
  | 'fakir' | 'miskin' | 'amil' | 'muallaf'
  | 'riqab' | 'gharimin' | 'fisabilillah' | 'ibnu_sabil'
export type VerificationStatus = 'unverified' | 'survey_scheduled' | 'verified' | 'rejected'
export type DistributionType = 'cash' | 'goods' | 'service' | 'scholarship'
export type DistributionStatus = 'requested' | 'approved' | 'disbursed' | 'rejected'
export type AccountType = 'cash' | 'bank' | 'ewallet'
export type ProgramStatus = 'draft' | 'active' | 'completed' | 'cancelled'

export interface Profile {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  role: UserRole
  branch_id: string | null
  is_active: boolean
  last_login_at: string | null
}

export interface FundType {
  id: string
  code: string
  /** 3-digit code donors append to the transfer amount, when the fund type has one. */
  transfer_code: string | null
  name: string
  is_zakat: boolean
  allowed_asnaf: Asnaf[]
  preserve_principal: boolean
  requires_program: boolean
  amil_share_max: number
  sort_order: number
  is_active: boolean
}

export interface Account {
  id: string
  name: string
  type: AccountType
  bank_name: string | null
  account_number: string | null
  opening_balance: number
  is_active: boolean
}

export interface Program {
  id: string
  name: string
  slug: string
  /** 3-digit code donors append to the transfer amount. */
  code: string | null
  description: string | null
  fund_type_id: string | null
  target_amount: number
  start_date: string | null
  end_date: string | null
  status: ProgramStatus
  pic_user_id: string | null
}

export interface Donor {
  id: string
  donor_code: string
  donor_type: DonorType
  full_name: string
  nik: string | null
  npwp: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  province: string | null
  is_recurring: boolean
  notes: string | null
  tags: string[]
  merged_into_id: string | null
  deleted_at: string | null
  created_at: string
}

export interface Donation {
  id: string
  receipt_no: string
  donor_id: string | null
  is_anonymous: boolean
  fund_type_id: string
  program_id: string | null
  account_id: string
  amount: number
  payment_method: PaymentMethod
  payment_ref: string | null
  in_kind_description: string | null
  donated_at: string
  status: DonationStatus
  verified_by: string | null
  verified_at: string | null
  reject_reason: string | null
  void_reason: string | null
  proof_url: string | null
  notes: string | null
  created_by: string
  created_at: string
}

/** donations_v — the base row plus resolved names for list screens. */
export interface DonationRow extends Donation {
  fund_type_name: string
  fund_type_code: string
  donor_name: string | null
  donor_code: string | null
  program_name: string | null
  account_name: string | null
  created_by_name: string | null
  verified_by_name: string | null
}

export interface Beneficiary {
  id: string
  beneficiary_code: string
  full_name: string
  nik: string | null
  asnaf: Asnaf
  phone: string | null
  address: string | null
  rt_rw: string | null
  village: string | null
  district: string | null
  city: string | null
  family_size: number | null
  monthly_income: number | null
  verification_status: VerificationStatus
  surveyed_by: string | null
  survey_notes: string | null
  documents: { path: string; label: string }[]
  is_active: boolean
  created_at: string
}

export interface Distribution {
  id: string
  ref_no: string
  beneficiary_id: string | null
  program_id: string | null
  fund_type_id: string
  account_id: string
  amount: number
  distribution_type: DistributionType
  description: string | null
  distributed_at: string
  status: DistributionStatus
  requested_by: string
  approved_by: string | null
  approved_at: string | null
  proof_url: string | null
  recipient_signature_url: string | null
  notes: string | null
  created_at: string
}

export interface DistributionRow extends Distribution {
  fund_type_name: string
  fund_type_code: string
  beneficiary_name: string | null
  beneficiary_code: string | null
  asnaf: Asnaf | null
  program_name: string | null
  account_name: string | null
  requested_by_name: string | null
  approved_by_name: string | null
}

export interface AuditEntry {
  id: number
  table_name: string
  record_id: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  actor_id: string | null
  actor_role: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  reason: string | null
  created_at: string
}

export interface FundBalanceRow {
  fund_type_id: string
  fund_type_code: string
  fund_type_name: string
  opening: number
  collected: number
  distributed: number
  closing: number
}

export interface DashboardSummary {
  period: { from: string; to: string }
  refreshed_at: string | null
  kpi: {
    collected: number
    collected_prev: number
    collected_delta_pct: number | null
    collected_ytd: number
    annual_target: number
    distributed: number
    acr: number | null
    available_balance: number
    active_donors: number
    pending: { count: number; amount: number }
  }
  balances: { fund_type_id: string; code: string; name: string; balance: number }[]
  trend: { month: string; fund_type_id: string; fund_type_name: string; collected: number }[]
  composition: { name: string; code: string; amount: number }[]
  collection_vs_distribution: { month: string; collected: number; distributed: number }[]
  asnaf: { asnaf: Asnaf; name: string; amount: number }[]
  programs: { id: string; name: string; target: number; collected: number; end_date: string | null }[]
  payment_methods: { method: PaymentMethod; amount: number; count: number }[]
  recent?: {
    id: string; receipt_no: string; amount: number
    donated_at: string; donor_name: string; fund_type_name: string
  }[]
  top_donors?: { id: string; name: string; amount: number; count: number }[]
  alerts?: {
    stale_pending: number
    negative_funds: string[]
    at_risk_donors: number
  }
  mine?: { collected: number; pending_count: number }
  audit_summary?: { action: string; count: number }[]
}
