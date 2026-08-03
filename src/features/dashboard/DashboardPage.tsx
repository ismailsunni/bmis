import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useDashboard } from '@/lib/queries'
import { DateRangeFilter, useDateRange } from '@/components/DateRangeFilter'
import { PageHeader } from '@/components/AppShell'
import { Badge, Card, CardTitle, ErrorNote, Spinner } from '@/components/ui'
import { formatIDR, formatNumber, timeAgo } from '@/lib/format'
import { Charts } from './Charts'
import type { DashboardSummary } from '@/types/db'

export function DashboardPage() {
  const { role } = useAuth()
  const { from, to } = useDateRange()
  const { data, isLoading, error } = useDashboard(from, to)

  return (
    <>
      <PageHeader
        title="Dasbor"
        subtitle={data?.refreshed_at
          ? `Agregat berat diperbarui ${timeAgo(data.refreshed_at)}`
          : undefined}
        action={<DateRangeFilter />}
      />
      <ErrorNote error={error} />
      {isLoading && <Spinner />}
      {data && (
        <div className="space-y-4">
          <KpiGrid data={data} />
          {data.alerts && <Alerts alerts={data.alerts} />}
          {data.mine && (
            <Card>
              <CardTitle>Kinerja saya periode ini</CardTitle>
              <div className="flex gap-8">
                <Metric label="Terhimpun" value={formatIDR(data.mine.collected)} />
                <Metric label="Menunggu diverifikasi"
                        value={formatNumber(data.mine.pending_count)} />
              </div>
            </Card>
          )}
          <Charts data={data} role={role} />
          {data.recent && <RecentActivity rows={data.recent} />}
          {data.top_donors && data.top_donors.length > 0 && (
            <TopDonors rows={data.top_donors} />
          )}
        </div>
      )}
    </>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}

function Kpi({
  label, value, sub, tone, to,
}: {
  label: string; value: string; sub?: React.ReactNode
  tone?: 'success' | 'warning' | 'danger'; to?: string
}) {
  const body = (
    <Card className="h-full">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${
        tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : ''
      }`}>
        {value}
      </p>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  )
  return to ? <Link to={to} className="block">{body}</Link> : body
}

function KpiGrid({ data }: { data: DashboardSummary }) {
  const k = data.kpi
  const delta = k.collected_delta_pct
  const targetPct = k.annual_target > 0
    ? Math.round((k.collected_ytd / k.annual_target) * 100)
    : null

  // ACR is the BAZNAS efficiency indicator: below 70% funds are piling up
  // undisbursed, above 100% the period is spending reserves.
  const acrTone = k.acr == null ? undefined
    : k.acr < 70 ? 'warning' : k.acr > 100 ? 'danger' : undefined

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="Penghimpunan periode ini"
        value={formatIDR(k.collected)}
        sub={delta != null && (
          <span className={delta >= 0 ? 'text-emerald-600' : 'text-red-600'}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs periode sebelumnya
          </span>
        )}
      />
      <Kpi
        label="Penghimpunan tahun berjalan"
        value={formatIDR(k.collected_ytd)}
        sub={targetPct != null && (
          <>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-brand-600"
                   style={{ width: `${Math.min(targetPct, 100)}%` }} />
            </div>
            <span>{targetPct}% dari target</span>
          </>
        )}
      />
      <Kpi label="Penyaluran periode ini" value={formatIDR(k.distributed)} />
      <Kpi
        label="ACR (penyaluran ÷ penghimpunan)"
        value={k.acr == null ? '—' : `${k.acr}%`}
        tone={acrTone}
        sub={acrTone === 'warning' ? 'Di bawah 70% — dana menumpuk'
          : acrTone === 'danger' ? 'Di atas 100% — memakai saldo periode lalu' : undefined}
      />
      <Kpi label="Saldo tersedia" value={formatIDR(k.available_balance)}
           sub={`${data.balances.length} jenis dana`} />
      <Kpi label="Donatur aktif (12 bulan)" value={formatNumber(k.active_donors)} />
      <Kpi
        label="Menunggu verifikasi"
        value={formatNumber(k.pending.count)}
        sub={formatIDR(k.pending.amount)}
        to="/verifikasi"
        tone={k.pending.count > 0 ? 'warning' : undefined}
      />
      <Card>
        <CardTitle>Saldo per jenis dana</CardTitle>
        <ul className="space-y-1 text-xs">
          {data.balances.slice(0, 5).map((b) => (
            <li key={b.fund_type_id} className="flex justify-between gap-2">
              <span className="truncate text-slate-500">{b.name}</span>
              <span className={`tabular-nums font-medium ${b.balance < 0 ? 'text-red-600' : ''}`}>
                {formatIDR(b.balance)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function Alerts({ alerts }: { alerts: NonNullable<DashboardSummary['alerts']> }) {
  const items = [
    alerts.stale_pending > 0 && (
      <Link key="pending" to="/verifikasi" className="hover:underline">
        {alerts.stale_pending} donasi menunggu verifikasi lebih dari 3 hari
      </Link>
    ),
    alerts.negative_funds.length > 0 && (
      <span key="neg">Saldo negatif: {alerts.negative_funds.join(', ')}</span>
    ),
    alerts.at_risk_donors > 0 && (
      <span key="risk">{alerts.at_risk_donors} donatur tetap belum berdonasi 2 bulan terakhir</span>
    ),
  ].filter(Boolean)

  if (items.length === 0) return null
  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20">
      <CardTitle>Perlu perhatian</CardTitle>
      <ul className="space-y-1 text-sm text-amber-900 dark:text-amber-200">
        {items.map((item, i) => <li key={i}>• {item}</li>)}
      </ul>
    </Card>
  )
}

function RecentActivity({ rows }: { rows: NonNullable<DashboardSummary['recent']> }) {
  return (
    <Card>
      <CardTitle action={<Link to="/donasi" className="text-xs text-brand-700 hover:underline">Semua</Link>}>
        Aktivitas terbaru
      </CardTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Belum ada donasi terverifikasi.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.donor_name}</p>
                <p className="text-xs text-slate-500">
                  {r.fund_type_name} · {r.receipt_no}
                </p>
              </div>
              <span className="shrink-0 tabular-nums font-medium">{formatIDR(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function TopDonors({ rows }: { rows: NonNullable<DashboardSummary['top_donors']> }) {
  return (
    <Card>
      <CardTitle>10 donatur terbesar periode ini</CardTitle>
      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
        {rows.map((d, i) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <Link to={`/donatur/${d.id}`} className="min-w-0 truncate hover:underline">
              <span className="mr-2 text-slate-400">{i + 1}.</span>{d.name}
            </Link>
            <span className="flex shrink-0 items-center gap-2">
              <Badge>{d.count}×</Badge>
              <span className="tabular-nums font-medium">{formatIDR(d.amount)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
