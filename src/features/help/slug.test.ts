import { describe, expect, it } from 'vitest'
import guide from '@docs/ALUR-KERJA.md?raw'
import { slug } from './slug'

describe('slug', () => {
  it('matches GitHub for numbered Indonesian headings', () => {
    expect(slug('1. Siapa melakukan apa')).toBe('1-siapa-melakukan-apa')
    expect(slug('9. Laporan tahunan dan Bukti Setor Zakat')).toBe(
      '9-laporan-tahunan-dan-bukti-setor-zakat',
    )
  })

  it('drops punctuation rather than encoding it', () => {
    expect(slug('Kas & Bank')).toBe('kas-bank')
    expect(slug('Verifikasi (bendahara)')).toBe('verifikasi-bendahara')
  })

  it('collapses runs of whitespace', () => {
    expect(slug('  dua   spasi  ')).toBe('dua-spasi')
  })
})

describe('the operator guide', () => {
  const headingIds = new Set([...guide.matchAll(/^#{1,3} +(.+)$/gm)].map((m) => slug(m[1].trim())))
  const tocAnchors = [...guide.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1])

  it('has a table of contents to check', () => {
    expect(tocAnchors.length).toBeGreaterThan(10)
  })

  it('every in-page link resolves to a real heading', () => {
    const broken = tocAnchors.filter((a) => !headingIds.has(a))
    expect(broken, `anchors with no matching heading: ${broken.join(', ')}`).toEqual([])
  })

  it('describes the workflows the operators actually need', () => {
    // a guard against the guide being replaced by a stub
    for (const topic of [
      'Hamba Allah', // anonymous donations
      'QRIS',
      'Kode transfer', // the 3-digit programme codes
      'Verifikasi',
      'Tutup periode', // the monthly close
      'Bukti Setor Zakat',
    ]) {
      expect(guide, `guide no longer mentions ${topic}`).toContain(topic)
    }
  })
})
