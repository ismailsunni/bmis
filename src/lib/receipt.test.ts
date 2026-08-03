import { describe, expect, it } from 'vitest'
import { receiptText, whatsappLink } from './receipt'
import type { DonationRow } from '@/types/db'

const row = (over: Partial<DonationRow> = {}) =>
  ({
    receipt_no: 'KW/2026/08/0001',
    amount: 250000,
    donated_at: '2026-08-03T05:00:00Z',
    fund_type_name: 'Sedekah',
    donor_name: 'Ahmad Fauzi',
    program_name: null,
    is_anonymous: false,
    ...over,
  }) as DonationRow

describe('receiptText', () => {
  it('includes the receipt number, fund type and formatted amount', () => {
    const text = receiptText(row(), { name: 'Baitul Maal Muhajirin' })
    expect(text).toContain('KW/2026/08/0001')
    expect(text).toContain('Sedekah')
    expect(text).toContain('Ahmad Fauzi')
    expect(text).toMatch(/Rp.?250\.000/)
    expect(text).toContain('Baitul Maal Muhajirin')
  })

  it('names an anonymous donor Hamba Allah rather than leaving it blank', () => {
    const text = receiptText(row({ is_anonymous: true, donor_name: null }))
    expect(text).toContain('Hamba Allah')
  })

  it('omits the program line entirely when there is no program', () => {
    expect(receiptText(row())).not.toContain('Program')
    expect(receiptText(row({ program_name: 'Sedekah Yatim' }))).toContain('Sedekah Yatim')
  })

  it('prints a Hijri date alongside the Gregorian one', () => {
    // receipts carry both; the Hijri year for 2026 is in the 1447-1448 range
    expect(receiptText(row())).toMatch(/144[5-9]/)
  })
})

describe('whatsappLink', () => {
  it('normalises an Indonesian leading zero to the 62 country code', () => {
    expect(whatsappLink('hi', '081234567890')).toContain('wa.me/6281234567890')
  })

  it('does not double the country code on an already-prefixed number', () => {
    expect(whatsappLink('hi', '6281234567890')).toContain('wa.me/6281234567890')
    expect(whatsappLink('hi', '+62 812-3456-7890')).toContain('wa.me/6281234567890')
  })

  it('leaves the recipient open when no number is known', () => {
    // the amil then picks the contact in WhatsApp
    expect(whatsappLink('hi', null)).toContain('wa.me/?text=')
  })

  it('encodes the message so newlines survive', () => {
    expect(whatsappLink('a\nb')).toContain('a%0Ab')
  })
})
