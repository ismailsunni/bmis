import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type {
  Account, Beneficiary, DashboardSummary, DistributionRow, DonationRow,
  Donor, FundBalanceRow, FundType, Profile, Program,
} from '@/types/db'

/** Any PostgREST error becomes a plain Error carrying the database message. */
const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message)
  return data as T
}

export const PAGE_SIZE = 50

export function useFundTypes() {
  return useQuery({
    queryKey: ['fund_types'],
    staleTime: 30 * 60_000,
    queryFn: async () => unwrap(
      await supabase.from('fund_types').select('*').eq('is_active', true).order('sort_order'),
    ) as FundType[],
  })
}

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    staleTime: 10 * 60_000,
    queryFn: async () => unwrap(
      await supabase.from('accounts').select('*').order('name'),
    ) as Account[],
  })
}

export function usePrograms() {
  return useQuery({
    queryKey: ['programs'],
    staleTime: 5 * 60_000,
    queryFn: async () => unwrap(
      await supabase.from('programs').select('*').order('name'),
    ) as Program[],
  })
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => unwrap(
      await supabase.from('profiles').select('*').order('full_name'),
    ) as Profile[],
  })
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const rows = unwrap(await supabase.from('settings').select('key, value')) as
        { key: string; value: Record<string, unknown> }[]
      return Object.fromEntries(rows.map((r) => [r.key, r.value]))
    },
  })
}

export interface DonationFilters {
  status?: string
  fundTypeId?: string
  programId?: string
  from?: string
  to?: string
  search?: string
  page?: number
}

export function useDonations(filters: DonationFilters = {}) {
  return useQuery({
    queryKey: ['donations', filters],
    queryFn: async () => {
      const page = filters.page ?? 0
      let q = supabase
        .from('donations_v')
        .select('*', { count: 'exact' })
        .order('donated_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      if (filters.status) q = q.eq('status', filters.status)
      if (filters.fundTypeId) q = q.eq('fund_type_id', filters.fundTypeId)
      if (filters.programId) q = q.eq('program_id', filters.programId)
      if (filters.from) q = q.gte('donated_at', filters.from)
      if (filters.to) q = q.lte('donated_at', `${filters.to}T23:59:59`)
      if (filters.search) {
        q = q.or(`receipt_no.ilike.%${filters.search}%,donor_name.ilike.%${filters.search}%`)
      }

      const { data, error, count } = await q
      if (error) throw new Error(error.message)
      return { rows: (data ?? []) as DonationRow[], count: count ?? 0 }
    },
  })
}

export function useDonors(search = '', page = 0) {
  return useQuery({
    queryKey: ['donors', search, page],
    queryFn: async () => {
      let q = supabase
        .from('donors')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (search) {
        q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,donor_code.ilike.%${search}%`)
      }
      const { data, error, count } = await q
      if (error) throw new Error(error.message)
      return { rows: (data ?? []) as Donor[], count: count ?? 0 }
    },
  })
}

export function useBeneficiaries(search = '', page = 0) {
  return useQuery({
    queryKey: ['beneficiaries', search, page],
    queryFn: async () => {
      let q = supabase
        .from('beneficiaries')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (search) {
        q = q.or(`full_name.ilike.%${search}%,beneficiary_code.ilike.%${search}%`)
      }
      const { data, error, count } = await q
      if (error) throw new Error(error.message)
      return { rows: (data ?? []) as Beneficiary[], count: count ?? 0 }
    },
  })
}

export function useDistributions(status?: string, page = 0) {
  return useQuery({
    queryKey: ['distributions', status, page],
    queryFn: async () => {
      let q = supabase
        .from('distributions_v')
        .select('*', { count: 'exact' })
        .order('distributed_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (status) q = q.eq('status', status)
      const { data, error, count } = await q
      if (error) throw new Error(error.message)
      return { rows: (data ?? []) as DistributionRow[], count: count ?? 0 }
    },
  })
}

export function useDashboard(from: string, to: string) {
  return useQuery({
    queryKey: ['dashboard', from, to],
    staleTime: 60_000,
    queryFn: async () => unwrap(
      await supabase.rpc('rpc_dashboard_summary', { p_from: from, p_to: to }),
    ) as unknown as DashboardSummary,
  })
}

export function useFundBalanceReport(from: string, to: string) {
  return useQuery({
    queryKey: ['fund_balance', from, to],
    queryFn: async () => unwrap(
      await supabase.rpc('rpc_fund_balance_report', { p_from: from, p_to: to }),
    ) as unknown as FundBalanceRow[],
  })
}

/** Every mutation invalidates the aggregates too — balances shift on each one. */
export function useRpc<TArgs extends Record<string, unknown>>(fn: string, invalidate: string[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: TArgs) => unwrap(await supabase.rpc(fn, args)),
    onSuccess: () => {
      [...invalidate, 'dashboard', 'fund_balance'].forEach((key) =>
        qc.invalidateQueries({ queryKey: [key] }))
    },
  })
}
