import { parseIDR } from '@/lib/format'
import type { FundType, PaymentMethod } from '@/types/db'

/** One line of the bulk entry grid. `amount` stays masked while being typed. */
export interface BulkRow {
  key: string
  donorId: string | null
  anonymous: boolean
  amount: string
  fundTypeId: string
  programId: string
  method: PaymentMethod
  paymentRef: string
  notes: string
}

/** Set once for the whole batch: a collection is normally one day, one account. */
export interface BulkDefaults {
  donatedAt: string
  accountId: string
  fundTypeId: string
  method: PaymentMethod
}

export interface RowProblem {
  key: string
  message: string
}

let counter = 0
export const blankRow = (defaults: BulkDefaults): BulkRow => ({
  key: `row-${++counter}`,
  donorId: null,
  anonymous: false,
  amount: '',
  fundTypeId: defaults.fundTypeId,
  programId: '',
  method: defaults.method,
  paymentRef: '',
  notes: '',
})

/**
 * A row nobody has touched. The grid always keeps a spare row at the bottom, and
 * those must not be treated as incomplete entries.
 */
export const isRowEmpty = (row: BulkRow): boolean =>
  parseIDR(row.amount) === 0 && !row.donorId && !row.anonymous && !row.paymentRef

export const filledRows = (rows: BulkRow[]): BulkRow[] => rows.filter((r) => !isRowEmpty(r))

export const batchTotal = (rows: BulkRow[]): number =>
  filledRows(rows).reduce((sum, r) => sum + parseIDR(r.amount), 0)

/**
 * Everything the database would reject, checked up front so the operator sees
 * which line is wrong instead of one opaque error after pressing save. The
 * database still enforces all of it — this only spares a wasted round trip.
 */
export function validateRows(rows: BulkRow[], fundTypes: FundType[]): RowProblem[] {
  const problems: RowProblem[] = []
  const refSeen = new Map<string, string>()

  for (const row of filledRows(rows)) {
    const amount = parseIDR(row.amount)
    if (amount <= 0) {
      problems.push({ key: row.key, message: 'Jumlah harus lebih dari nol' })
    }
    if (!row.anonymous && !row.donorId) {
      problems.push({ key: row.key, message: 'Pilih donatur atau tandai anonim' })
    }
    if (!row.fundTypeId) {
      problems.push({ key: row.key, message: 'Jenis dana belum dipilih' })
      continue
    }

    const fundType = fundTypes.find((f) => f.id === row.fundTypeId)
    if (fundType?.requires_program && !row.programId) {
      problems.push({ key: row.key, message: `${fundType.name} memerlukan program` })
    }

    // The database has a unique index on payment_ref; catching a collision
    // inside the batch here keeps the whole insert from failing at once.
    const ref = row.paymentRef.trim()
    if (ref) {
      if (refSeen.has(ref)) {
        problems.push({ key: row.key, message: `Referensi ${ref} dipakai dua kali` })
      } else {
        refSeen.set(ref, row.key)
      }
    }
  }

  return problems
}

/** Noon Jakarta, so the stored instant lands on the intended calendar day. */
const jakartaNoon = (day: string) => new Date(`${day}T12:00:00+07:00`).toISOString()

export function buildPayload(rows: BulkRow[], defaults: BulkDefaults, userId: string) {
  return filledRows(rows).map((row) => ({
    donor_id: row.anonymous ? null : row.donorId,
    is_anonymous: row.anonymous,
    fund_type_id: row.fundTypeId,
    program_id: row.programId || null,
    account_id: defaults.accountId,
    amount: parseIDR(row.amount),
    payment_method: row.method,
    payment_ref: row.paymentRef.trim() || null,
    donated_at: jakartaNoon(defaults.donatedAt),
    status: 'pending' as const,
    notes: row.notes.trim() || null,
    created_by: userId,
  }))
}
