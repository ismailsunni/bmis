import { useSearchParams } from 'react-router-dom'
import { endOfMonth, endOfQuarter, format, startOfMonth, startOfQuarter,
  startOfYear, subMonths } from 'date-fns'
import { Select, Input } from '@/components/ui'
import { todayJakarta } from '@/lib/format'

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

const PRESETS: Record<string, () => [string, string]> = {
  this_month: () => [iso(startOfMonth(new Date())), todayJakarta()],
  last_month: () => {
    const d = subMonths(new Date(), 1)
    return [iso(startOfMonth(d)), iso(endOfMonth(d))]
  },
  this_quarter: () => [iso(startOfQuarter(new Date())), iso(endOfQuarter(new Date()))],
  ytd: () => [iso(startOfYear(new Date())), todayJakarta()],
}

const LABELS: Record<string, string> = {
  this_month: 'Bulan ini', last_month: 'Bulan lalu',
  this_quarter: 'Kuartal ini', ytd: 'Tahun berjalan', custom: 'Kustom',
}

/**
 * Range lives in the URL so a board member can paste a dashboard link and the
 * recipient sees the same figures (PRD 9.4).
 */
export function useDateRange() {
  const [params, setParams] = useSearchParams()
  const preset = params.get('rentang') ?? 'this_month'
  const [defFrom, defTo] = (PRESETS[preset] ?? PRESETS.this_month)()
  const from = params.get('dari') ?? defFrom
  const to = params.get('sampai') ?? defTo

  const set = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => merged.set(k, v))
    setParams(merged, { replace: true })
  }
  return { preset, from, to, set }
}

export function DateRangeFilter() {
  const { preset, from, to, set } = useDateRange()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Rentang waktu"
        className="w-auto"
        value={preset}
        onChange={(e) => {
          const next = e.target.value
          if (next === 'custom') return set({ rentang: next })
          const [f, t] = PRESETS[next]()
          set({ rentang: next, dari: f, sampai: t })
        }}
      >
        {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      {preset === 'custom' && (
        <>
          <Input type="date" className="w-auto" value={from} aria-label="Dari tanggal"
                 onChange={(e) => set({ dari: e.target.value })} />
          <Input type="date" className="w-auto" value={to} aria-label="Sampai tanggal"
                 onChange={(e) => set({ sampai: e.target.value })} />
        </>
      )}
    </div>
  )
}
