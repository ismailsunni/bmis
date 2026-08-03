import { format, formatDistanceToNow } from 'date-fns'
import { id } from 'date-fns/locale'

const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})
const plain = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

export const formatIDR = (v: number | string | null | undefined) => idr.format(Number(v ?? 0))

export const formatNumber = (v: number | string | null | undefined) => plain.format(Number(v ?? 0))

/** Compact rupiah for chart axes: Rp 1,2 jt */
export const formatIDRShort = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1e12) return `Rp ${(v / 1e12).toFixed(1)} T`
  if (abs >= 1e9) return `Rp ${(v / 1e9).toFixed(1)} M`
  if (abs >= 1e6) return `Rp ${(v / 1e6).toFixed(1)} jt`
  if (abs >= 1e3) return `Rp ${(v / 1e3).toFixed(0)} rb`
  return `Rp ${v}`
}

/** Digits-only input to a number: "1.250.000" -> 1250000 */
export const parseIDR = (s: string) => Number(s.replace(/\D/g, '')) || 0

/** Live thousand separators while typing an amount. */
export const maskIDR = (s: string) => {
  const digits = s.replace(/\D/g, '')
  return digits ? plain.format(Number(digits)) : ''
}

const TZ = 'Asia/Jakarta'

export const formatDate = (v: string | Date | null | undefined, pattern = 'd MMM yyyy') =>
  v ? format(new Date(v), pattern, { locale: id }) : '—'

export const formatDateTime = (v: string | Date | null | undefined) =>
  formatDate(v, 'd MMM yyyy HH:mm')

export const timeAgo = (v: string | Date) =>
  formatDistanceToNow(new Date(v), { addSuffix: true, locale: id })

/** Today in Jakarta as YYYY-MM-DD, independent of the browser's timezone. */
export const todayJakarta = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return format(new Date(y, m - 1, 1), 'MMM yy', { locale: id })
}

/**
 * Approximate Hijri date for receipts. Intl's islamic-umalqura calendar is what
 * Indonesian institutions generally print alongside the Gregorian date.
 */
export const formatHijri = (v: string | Date = new Date()) =>
  new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  }).format(new Date(v))
