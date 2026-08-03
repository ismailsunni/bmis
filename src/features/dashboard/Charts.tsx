import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardTitle } from '@/components/ui'
import { formatIDR, formatIDRShort, monthLabel } from '@/lib/format'
import { paymentMethodLabels } from '@/lib/labels'
import { capSeries, useChartTheme } from './palette'
import type { DashboardSummary, UserRole } from '@/types/db'

/**
 * Every chart pairs with a table view. Three light-mode categorical slots fall
 * below 3:1 against the light surface, so identity must be readable without
 * relying on the fill — the table is that relief, and it doubles as the
 * accessible alternative.
 */
function Figure({
  title,
  table,
  children,
}: {
  title: string
  table: React.ReactNode
  children: React.ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <Card>
      <CardTitle
        action={
          <button
            onClick={() => setShowTable((v) => !v)}
            className="text-xs text-brand-700 hover:underline dark:text-brand-400"
            aria-expanded={showTable}
          >
            {showTable ? 'Grafik' : 'Tabel'}
          </button>
        }
      >
        {title}
      </CardTitle>
      {showTable ? <div className="table-wrap">{table}</div> : children}
    </Card>
  )
}

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="tbl min-w-0">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} className={i ? 'num' : ''}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={j ? 'num' : ''}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const tooltipStyle = (surface: string, ink: string) => ({
  contentStyle: {
    background: surface,
    border: 'none',
    borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0,0,0,.15)',
    color: ink,
    fontSize: 12,
  },
  itemStyle: { color: ink },
  labelStyle: { color: ink, fontWeight: 600 },
})

export function Charts({ data, role }: { data: DashboardSummary; role: UserRole }) {
  const t = useChartTheme()
  const tip = tooltipStyle(t.surface, t.ink)
  const isViewer = role === 'viewer'

  // Trend arrives as one row per (month, fund type); pivot to one row per month
  // with a column per fund type, capped so the palette is never cycled.
  const { trendRows, trendKeys } = useMemo(() => {
    const totals = new Map<string, number>()
    data.trend.forEach((r) =>
      totals.set(r.fund_type_name, (totals.get(r.fund_type_name) ?? 0) + Number(r.collected)),
    )
    const keep = capSeries(
      [...totals].map(([name, amount]) => ({ name, amount })),
      (r) => r.name,
    ).map((r) => r.name)

    const byMonth = new Map<string, Record<string, number | string>>()
    data.trend.forEach((r) => {
      const row = byMonth.get(r.month) ?? { month: r.month }
      const key = keep.includes(r.fund_type_name) ? r.fund_type_name : 'Lainnya'
      row[key] = (Number(row[key]) || 0) + Number(r.collected)
      byMonth.set(r.month, row)
    })
    return {
      trendRows: [...byMonth.values()].sort((a, b) =>
        String(a.month).localeCompare(String(b.month)),
      ),
      trendKeys: keep,
    }
  }, [data.trend])

  const composition = useMemo(
    () =>
      capSeries(
        data.composition.map((c) => ({ ...c, amount: Number(c.amount) })),
        (c) => c.name,
      ),
    [data.composition],
  )

  const methods = useMemo(
    () =>
      capSeries(
        data.payment_methods.map((m) => ({ ...m, amount: Number(m.amount) })),
        (m) => paymentMethodLabels[m.method] ?? m.method,
      ),
    [data.payment_methods],
  )

  const asnaf = data.asnaf.map((a) => ({ name: a.name, amount: Number(a.amount) }))
  const programs = data.programs.map((p) => ({
    name: p.name,
    collected: Number(p.collected),
    target: Number(p.target),
  }))
  const cvd = data.collection_vs_distribution.map((r) => ({
    month: r.month,
    collected: Number(r.collected),
    distributed: Number(r.distributed),
  }))

  const axisProps = {
    stroke: t.axis,
    tick: { fill: t.axis, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: t.grid },
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Figure
        title="Tren penghimpunan 12 bulan"
        table={
          <SimpleTable
            head={['Bulan', ...trendKeys]}
            rows={trendRows.map((r) => [
              monthLabel(String(r.month).slice(0, 7)),
              ...trendKeys.map((k) => formatIDR(Number(r[k]) || 0)),
            ])}
          />
        }
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={trendRows} margin={{ left: 4, right: 4, top: 4 }}>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis
              dataKey="month"
              {...axisProps}
              tickFormatter={(v: string) => monthLabel(v.slice(0, 7))}
            />
            <YAxis {...axisProps} width={64} tickFormatter={formatIDRShort} />
            <Tooltip
              {...tip}
              formatter={(v) => formatIDR(Number(v))}
              labelFormatter={(v) => monthLabel(String(v).slice(0, 7))}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: t.axis }} />
            {trendKeys.map((key, i) => (
              // 2px surface gap between stacked segments keeps adjacent fills apart
              <Bar
                key={key}
                dataKey={key}
                stackId="a"
                fill={t.series[i % t.series.length]}
                stroke={t.surface}
                strokeWidth={2}
                radius={i === trendKeys.length - 1 ? [4, 4, 0, 0] : 0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Figure>

      <Figure
        title="Komposisi dana periode ini"
        table={
          <SimpleTable
            head={['Jenis dana', 'Jumlah']}
            rows={composition.map((c) => [c.name, formatIDR(c.amount)])}
          />
        }
      >
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={composition}
              dataKey="amount"
              nameKey="name"
              innerRadius={58}
              outerRadius={92}
              paddingAngle={2}
              stroke={t.surface}
              strokeWidth={2}
            >
              {composition.map((_, i) => (
                <Cell key={i} fill={t.series[i % t.series.length]} />
              ))}
            </Pie>
            <Tooltip {...tip} formatter={(v) => formatIDR(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 12, color: t.axis }} />
          </PieChart>
        </ResponsiveContainer>
      </Figure>

      {!isViewer && (
        <Figure
          title="Penghimpunan vs penyaluran"
          table={
            <SimpleTable
              head={['Bulan', 'Terhimpun', 'Tersalurkan']}
              rows={cvd.map((r) => [
                monthLabel(r.month),
                formatIDR(r.collected),
                formatIDR(r.distributed),
              ])}
            />
          }
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cvd} margin={{ left: 4, right: 4, top: 4 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={t.grid} />
              <XAxis dataKey="month" {...axisProps} tickFormatter={monthLabel} />
              <YAxis {...axisProps} width={64} tickFormatter={formatIDRShort} />
              <Tooltip
                {...tip}
                formatter={(v) => formatIDR(Number(v))}
                labelFormatter={(v) => monthLabel(String(v))}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: t.axis }} />
              <Bar name="Terhimpun" dataKey="collected" fill={t.series[0]} radius={[4, 4, 0, 0]} />
              <Bar
                name="Tersalurkan"
                dataKey="distributed"
                fill={t.series[1]}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Figure>
      )}

      <Figure
        title="Penyaluran zakat per asnaf"
        table={
          <SimpleTable
            head={['Asnaf', 'Jumlah']}
            rows={asnaf.map((a) => [a.name, formatIDR(a.amount)])}
          />
        }
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={asnaf} layout="vertical" margin={{ left: 4, right: 16 }}>
            <CartesianGrid horizontal={false} stroke={t.grid} />
            <XAxis type="number" {...axisProps} tickFormatter={formatIDRShort} />
            <YAxis type="category" dataKey="name" {...axisProps} width={92} />
            <Tooltip {...tip} formatter={(v) => formatIDR(Number(v))} />
            {/* one series, so the title names it and no legend box is needed */}
            <Bar
              dataKey="amount"
              name="Tersalurkan"
              fill={t.series[0]}
              radius={[0, 4, 4, 0]}
              barSize={14}
            />
          </BarChart>
        </ResponsiveContainer>
      </Figure>

      <Figure
        title="Progres 5 program teratas"
        table={
          <SimpleTable
            head={['Program', 'Terkumpul', 'Target']}
            rows={programs.map((p) => [p.name, formatIDR(p.collected), formatIDR(p.target)])}
          />
        }
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={programs} layout="vertical" margin={{ left: 4, right: 16 }} barGap={2}>
            <CartesianGrid horizontal={false} stroke={t.grid} />
            <XAxis type="number" {...axisProps} tickFormatter={formatIDRShort} />
            <YAxis type="category" dataKey="name" {...axisProps} width={110} />
            <Tooltip {...tip} formatter={(v) => formatIDR(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 12, color: t.axis }} />
            <Bar
              name="Terkumpul"
              dataKey="collected"
              fill={t.series[0]}
              radius={[0, 4, 4, 0]}
              barSize={12}
            />
            <Bar
              name="Target"
              dataKey="target"
              fill={t.series[1]}
              radius={[0, 4, 4, 0]}
              barSize={12}
            />
          </BarChart>
        </ResponsiveContainer>
      </Figure>

      {!isViewer && (
        <Figure
          title="Metode pembayaran"
          table={
            <SimpleTable
              head={['Metode', 'Jumlah']}
              rows={methods.map((m) => [m.name, formatIDR(m.amount)])}
            />
          }
        >
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={methods}
                dataKey="amount"
                nameKey="name"
                innerRadius={58}
                outerRadius={92}
                paddingAngle={2}
                stroke={t.surface}
                strokeWidth={2}
              >
                {methods.map((_, i) => (
                  <Cell key={i} fill={t.series[i % t.series.length]} />
                ))}
              </Pie>
              <Tooltip {...tip} formatter={(v) => formatIDR(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12, color: t.axis }} />
            </PieChart>
          </ResponsiveContainer>
        </Figure>
      )}
    </div>
  )
}
