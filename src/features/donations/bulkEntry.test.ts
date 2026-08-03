import { describe, expect, it } from 'vitest'
import {
  batchTotal,
  blankRow,
  buildPayload,
  filledRows,
  isRowEmpty,
  validateRows,
  type BulkDefaults,
  type BulkRow,
} from './bulkEntry'
import type { FundType } from '@/types/db'

const defaults: BulkDefaults = {
  donatedAt: '2026-08-03',
  accountId: 'acct-1',
  fundTypeId: 'ft-sedekah',
  method: 'cash',
}

const FUND_TYPES = [
  { id: 'ft-sedekah', name: 'Sedekah', requires_program: false },
  { id: 'ft-terikat', name: 'Infaq Terikat', requires_program: true },
] as FundType[]

const row = (over: Partial<BulkRow> = {}): BulkRow => ({ ...blankRow(defaults), ...over })

describe('empty rows', () => {
  it('treats an untouched row as empty so trailing spares are ignored', () => {
    expect(isRowEmpty(row())).toBe(true)
  })

  it('counts a row with only an anonymous flag as started', () => {
    expect(isRowEmpty(row({ anonymous: true }))).toBe(false)
  })

  it('counts a row with only a reference as started', () => {
    expect(isRowEmpty(row({ paymentRef: 'TRX99' }))).toBe(false)
  })

  it('excludes empty rows from the batch and its total', () => {
    const rows = [row({ amount: '100.000', anonymous: true }), row(), row()]
    expect(filledRows(rows)).toHaveLength(1)
    expect(batchTotal(rows)).toBe(100_000)
  })
})

describe('validateRows', () => {
  it('accepts a complete anonymous row', () => {
    expect(validateRows([row({ amount: '50.000', anonymous: true })], FUND_TYPES)).toEqual([])
  })

  it('requires a donor unless the row is anonymous', () => {
    const problems = validateRows([row({ amount: '50.000' })], FUND_TYPES)
    expect(problems).toHaveLength(1)
    expect(problems[0].message).toMatch(/donatur|anonim/i)
  })

  it('rejects a row with a donor but no amount', () => {
    const problems = validateRows([row({ donorId: 'd-1' })], FUND_TYPES)
    expect(problems[0].message).toMatch(/lebih dari nol/i)
  })

  it('requires a program for a fund type that demands one', () => {
    const problems = validateRows(
      [row({ amount: '50.000', anonymous: true, fundTypeId: 'ft-terikat' })],
      FUND_TYPES,
    )
    expect(problems[0].message).toContain('Infaq Terikat')
  })

  it('accepts that same fund type once a program is chosen', () => {
    expect(
      validateRows(
        [row({ amount: '50.000', anonymous: true, fundTypeId: 'ft-terikat', programId: 'p-1' })],
        FUND_TYPES,
      ),
    ).toEqual([])
  })

  it('catches a payment reference repeated inside the batch', () => {
    // the database has a unique index on payment_ref; finding the clash here
    // saves the whole insert from being rejected
    const problems = validateRows(
      [
        row({ amount: '10.000', anonymous: true, paymentRef: 'TRX1' }),
        row({ amount: '20.000', anonymous: true, paymentRef: 'TRX1' }),
      ],
      FUND_TYPES,
    )
    expect(problems).toHaveLength(1)
    expect(problems[0].message).toContain('TRX1')
  })

  it('ignores blank references, which are not duplicates of each other', () => {
    expect(
      validateRows(
        [row({ amount: '10.000', anonymous: true }), row({ amount: '20.000', anonymous: true })],
        FUND_TYPES,
      ),
    ).toEqual([])
  })

  it('reports every offending row, not just the first', () => {
    const problems = validateRows(
      [row({ amount: '10.000' }), row({ amount: '20.000' })],
      FUND_TYPES,
    )
    expect(problems).toHaveLength(2)
  })
})

describe('buildPayload', () => {
  it('marks every row pending, never verified', () => {
    const payload = buildPayload([row({ amount: '75.000', anonymous: true })], defaults, 'user-1')
    expect(payload[0].status).toBe('pending')
    expect(payload[0].created_by).toBe('user-1')
  })

  it('drops the donor on an anonymous row even if one was picked earlier', () => {
    const payload = buildPayload(
      [row({ amount: '75.000', anonymous: true, donorId: 'd-1' })],
      defaults,
      'user-1',
    )
    expect(payload[0].donor_id).toBeNull()
    expect(payload[0].is_anonymous).toBe(true)
  })

  it('stamps the batch date at Jakarta noon so it lands on the intended day', () => {
    const payload = buildPayload([row({ amount: '1.000', anonymous: true })], defaults, 'u')
    // noon UTC+7 is 05:00Z on the same date, well clear of either midnight
    expect(payload[0].donated_at).toBe('2026-08-03T05:00:00.000Z')
  })

  it('parses masked amounts into plain rupiah', () => {
    const payload = buildPayload([row({ amount: '1.250.000', anonymous: true })], defaults, 'u')
    expect(payload[0].amount).toBe(1_250_000)
  })

  it('normalises blank optional fields to null rather than empty strings', () => {
    const payload = buildPayload([row({ amount: '1.000', anonymous: true })], defaults, 'u')
    expect(payload[0].payment_ref).toBeNull()
    expect(payload[0].notes).toBeNull()
    expect(payload[0].program_id).toBeNull()
  })

  it('carries the batch account onto every row', () => {
    const payload = buildPayload(
      [row({ amount: '1.000', anonymous: true }), row({ amount: '2.000', anonymous: true })],
      defaults,
      'u',
    )
    expect(payload.map((p) => p.account_id)).toEqual(['acct-1', 'acct-1'])
  })
})
