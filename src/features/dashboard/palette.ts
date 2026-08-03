import { useEffect, useState } from 'react'

/**
 * Categorical slots are assigned in fixed order and never cycled — the order
 * itself is what keeps adjacent series distinguishable under colour-vision
 * deficiency. Both columns are validated against their own surface
 * (adjacent-pair CVD ΔE ≥ 8, normal-vision ΔE ≥ 15).
 *
 * Three light slots sit below 3:1 contrast on the light surface, so every
 * chart here ships a legend and a table view rather than relying on the fill
 * alone to carry identity.
 */
const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'] as const
const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'] as const

export const MAX_SERIES = LIGHT.length

export function useChartTheme() {
  const [dark, setDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return {
    dark,
    series: (dark ? DARK : LIGHT) as readonly string[],
    grid: dark ? '#334155' : '#e2e8f0',
    axis: dark ? '#94a3b8' : '#64748b',
    surface: dark ? '#1e293b' : '#ffffff',
    ink: dark ? '#f1f5f9' : '#0f172a',
  }
}

/**
 * A seventh category is never a new hue: the tail folds into "Lainnya" so the
 * palette is never cycled.
 */
export function capSeries<T extends { amount: number }>(rows: T[], nameOf: (r: T) => string) {
  const sorted = [...rows].sort((a, b) => b.amount - a.amount)
  if (sorted.length <= MAX_SERIES) return sorted.map((r) => ({ name: nameOf(r), amount: r.amount }))
  const head = sorted.slice(0, MAX_SERIES - 1).map((r) => ({ name: nameOf(r), amount: r.amount }))
  const tail = sorted.slice(MAX_SERIES - 1).reduce((sum, r) => sum + r.amount, 0)
  return [...head, { name: 'Lainnya', amount: tail }]
}
