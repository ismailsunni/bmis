/**
 * GitHub's heading-slug rules: lowercase, drop punctuation, spaces to dashes.
 *
 * The guide's own table of contents links against these — `[Menerima
 * donasi](#2-menerima-donasi)` has to match the id generated for
 * `## 2. Menerima donasi`. Reimplemented rather than pulling in rehype-slug for
 * six lines, and unit-tested against the real document so an edit that breaks
 * an anchor fails the build instead of producing a dead link.
 */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}
