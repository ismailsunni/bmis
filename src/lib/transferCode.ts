import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export interface DonationCode {
  code: string
  name: string
  kind: 'fund_type' | 'program'
  fund_type_id: string
  program_id: string | null
}

export function useDonationCodes() {
  return useQuery({
    queryKey: ['donation_codes'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('donation_codes_v').select('*').order('code')
      if (error) throw new Error(error.message)
      return (data ?? []) as DonationCode[]
    },
  })
}

/**
 * Donors are asked to append a 3-digit programme code to the transfer amount:
 * Rp 100.153 means Rp 100.000 intended for code 153. The code is the trailing
 * three digits of the rupiah amount.
 *
 * Returns null below 1000, where there is no room for a base amount and a code
 * and any trailing digits are just the amount itself.
 */
export function transferCodeOf(amount: number): string | null {
  if (!Number.isFinite(amount) || amount < 1000) return null
  return String(Math.floor(amount) % 1000).padStart(3, '0')
}

/** The round part the donor meant to give, i.e. the amount without its code. */
export function baseAmountOf(amount: number): number {
  return Math.floor(amount / 1000) * 1000
}

export function matchTransferCode(amount: number, codes: DonationCode[] | undefined) {
  const code = transferCodeOf(amount)
  if (!code || !codes?.length) return null
  return codes.find((c) => c.code === code) ?? null
}
