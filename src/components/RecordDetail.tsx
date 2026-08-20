import type { ReactNode } from 'react'
import { useRecordAudit } from '@/lib/queries'
import { Badge, Card, CardTitle, type BadgeTone } from '@/components/ui'
import { formatDateTime } from '@/lib/format'

/** A label/value line inside a detail card's <dl>. */
export const DetailRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex justify-between gap-2">
    <dt className="shrink-0 text-slate-500">{label}</dt>
    <dd className="truncate text-right">{value}</dd>
  </div>
)

/** A stated reason on a record — an override, a rejection, a void. */
export const TrailNote = ({
  tone,
  label,
  children,
}: {
  tone: BadgeTone
  label: string
  children: ReactNode
}) => (
  <div className="mt-3 text-sm">
    <Badge tone={tone}>{label}</Badge>
    <p className="mt-1 text-slate-600 dark:text-slate-300">{children}</p>
  </div>
)

/**
 * One record's own audit trail. Rendered only where the caller has already
 * checked can.readAuditLog — audit_log's own RLS refuses everyone below auditor
 * regardless, so a mistake here is an empty card, not a leak.
 */
export function RecordAudit({ table, id }: { table: string; id: string }) {
  const { data } = useRecordAudit(table, id)

  return (
    <Card className="lg:col-span-3">
      <CardTitle>Log audit</CardTitle>
      {!data?.length ? (
        <p className="text-sm text-slate-400">Belum ada catatan.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {data.map((e) => (
            <li key={e.id} className="border-l-2 border-slate-200 pl-3 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{e.action}</span>
                <span className="text-slate-500">{e.actor_role ?? '—'}</span>
                <span className="text-xs text-slate-400">{formatDateTime(e.created_at)}</span>
              </div>
              {e.reason && <p className="text-slate-500">“{e.reason}”</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
