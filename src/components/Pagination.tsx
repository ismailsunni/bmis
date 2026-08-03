import { Button } from '@/components/ui'
import { PAGE_SIZE } from '@/lib/queries'
import { formatNumber } from '@/lib/format'

export function Pagination({
  page,
  count,
  onChange,
}: {
  page: number
  count: number
  onChange: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  if (count <= PAGE_SIZE) return null
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-sm text-slate-500">
      <span>{formatNumber(count)} baris</span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
        >
          Sebelumnya
        </Button>
        <span>
          {page + 1} / {pages}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={page + 1 >= pages}
          onClick={() => onChange(page + 1)}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  )
}
