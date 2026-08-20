import { describe, expect, it } from 'vitest'
import { matchRoutes } from 'react-router-dom'

/**
 * The record pages are dynamic routes sharing a prefix with static siblings:
 * /donasi/:id sits beside /donasi/massal and /donasi/impor. React
 * Router ranks a literal segment above a dynamic one regardless of declaration
 * order, which is the only reason the static pages still work — this pins that
 * behaviour so a future reshuffle cannot quietly send "Catat massal" to the
 * detail page with id="massal".
 */
const routes = [
  { path: '/donasi', id: 'list' },
  { path: '/donasi/massal', id: 'bulk' },
  { path: '/donasi/impor', id: 'import' },
  { path: '/donasi/:id', id: 'detail' },
  { path: '/penyaluran', id: 'dist-list' },
  { path: '/penyaluran/:id', id: 'dist-detail' },
]

const matched = (pathname: string) => matchRoutes(routes, pathname)?.at(-1)?.route.id

describe('route ranking', () => {
  it('sends the static paths to their own pages', () => {
    expect(matched('/donasi')).toBe('list')
    expect(matched('/donasi/massal')).toBe('bulk')
    expect(matched('/donasi/impor')).toBe('import')
  })

  it('sends anything else to the detail page', () => {
    expect(matched('/donasi/0e5d1e6a-1111-2222-3333-444455556666')).toBe('detail')
  })

  it('routes penyaluran the same way', () => {
    expect(matched('/penyaluran')).toBe('dist-list')
    expect(matched('/penyaluran/0e5d1e6a-1111-2222-3333-444455556666')).toBe('dist-detail')
  })
})
