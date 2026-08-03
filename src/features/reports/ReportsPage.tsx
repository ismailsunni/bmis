import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useFundBalanceReport, useSettings } from '@/lib/queries'
import { DateRangeFilter, useDateRange } from '@/components/DateRangeFilter'
import { PageHeader } from '@/components/AppShell'
import { Button, Card, CardTitle, ErrorNote, Select, Spinner } from '@/components/ui'
import { formatDate, formatIDR } from '@/lib/format'
import { asnafLabels, paymentMethodLabels } from '@/lib/labels'
import { exportXLSX } from '@/lib/export'
import type { Asnaf, PaymentMethod } from '@/types/db'

type Tab = 'balance' | 'collection' | 'distribution'

const TABS: Record<Tab, string> = {
  balance: 'Saldo dana',
  collection: 'Penghimpunan',
  distribution: 'Penyaluran',
}

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('balance')
  const { from, to } = useDateRange()
  const { data: settings } = useSettings()
  const org = (settings?.organization ?? {}) as { name?: string; address?: string }

  return (
    <>
      <PageHeader
        title="Laporan"
        subtitle={`${formatDate(from)} — ${formatDate(to)}`}
        action={
          <>
            <DateRangeFilter />
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer size={16} /> Cetak
            </Button>
          </>
        }
      />

      <div className="mb-4 no-print">
        <Select className="sm:max-w-xs" value={tab} onChange={(e) => setTab(e.target.value as Tab)}>
          {Object.entries(TABS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-4 hidden print:block">
        <h2 className="text-lg font-bold">{org.name ?? 'Baitul Maal'}</h2>
        <p className="text-sm text-slate-600">{org.address}</p>
        <p className="mt-2 font-semibold">
          Laporan {TABS[tab]} — {formatDate(from)} s.d. {formatDate(to)}
        </p>
      </div>

      {tab === 'balance' && <FundBalanceReport from={from} to={to} />}
      {tab === 'collection' && <CollectionReport from={from} to={to} />}
      {tab === 'distribution' && <DistributionReport from={from} to={to} />}
    </>
  )
}

/** The report the board actually needs: opening, in, out, closing per fund. */
function FundBalanceReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading, error } = useFundBalanceReport(from, to)
  if (isLoading) return <Spinner />

  const totals = (data ?? []).reduce(
    (acc, r) => ({
      opening: acc.opening + Number(r.opening),
      collected: acc.collected + Number(r.collected),
      distributed: acc.distributed + Number(r.distributed),
      closing: acc.closing + Number(r.closing),
    }),
    { opening: 0, collected: 0, distributed: 0, closing: 0 },
  )

  return (
    <Card>
      <ErrorNote error={error} />
      <CardTitle
        action={
          <Button
            size="sm"
            variant="secondary"
            className="no-print"
            onClick={() =>
              exportXLSX(
                (data ?? []).map((r) => ({
                  'Jenis dana': r.fund_type_name,
                  'Saldo awal': Number(r.opening),
                  Penerimaan: Number(r.collected),
                  Penyaluran: Number(r.distributed),
                  'Saldo akhir': Number(r.closing),
                })),
                `saldo-dana-${from}-${to}`,
              )
            }
          >
            <Download size={16} /> XLSX
          </Button>
        }
      >
        Laporan saldo per jenis dana
      </CardTitle>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Jenis dana</th>
              <th className="num">Saldo awal</th>
              <th className="num">Penerimaan</th>
              <th className="num">Penyaluran</th>
              <th className="num">Saldo akhir</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.fund_type_id}>
                <td>{r.fund_type_name}</td>
                <td className="num">{formatIDR(r.opening)}</td>
                <td className="num text-emerald-700 dark:text-emerald-400">
                  {formatIDR(r.collected)}
                </td>
                <td className="num text-amber-700 dark:text-amber-400">
                  {formatIDR(r.distributed)}
                </td>
                <td className={`num font-semibold ${Number(r.closing) < 0 ? 'text-red-600' : ''}`}>
                  {formatIDR(r.closing)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td>Total</td>
              <td className="num">{formatIDR(totals.opening)}</td>
              <td className="num">{formatIDR(totals.collected)}</td>
              <td className="num">{formatIDR(totals.distributed)}</td>
              <td className="num">{formatIDR(totals.closing)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

function CollectionReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['report-collection', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donations_v')
        .select('amount, payment_method, fund_type_name, created_by_name, donated_at')
        .eq('status', 'verified')
        .gte('donated_at', from)
        .lte('donated_at', `${to}T23:59:59`)
      if (error) throw new Error(error.message)
      return (data ?? []) as {
        amount: number
        payment_method: PaymentMethod
        fund_type_name: string
        created_by_name: string | null
        donated_at: string
      }[]
    },
  })

  if (isLoading) return <Spinner />

  const group = <K extends string>(key: (r: NonNullable<typeof data>[number]) => K) => {
    const map = new Map<K, { amount: number; count: number }>()
    data?.forEach((r) => {
      const k = key(r)
      const row = map.get(k) ?? { amount: 0, count: 0 }
      row.amount += Number(r.amount)
      row.count += 1
      map.set(k, row)
    })
    return [...map].sort((a, b) => b[1].amount - a[1].amount)
  }

  return (
    <div className="space-y-4">
      <ErrorNote error={error} />
      <Breakdown
        title="Menurut jenis dana"
        rows={group((r) => r.fund_type_name)}
        filename={`penghimpunan-jenis-dana-${from}`}
      />
      <Breakdown
        title="Menurut metode pembayaran"
        rows={group((r) => paymentMethodLabels[r.payment_method])}
        filename={`penghimpunan-metode-${from}`}
      />
      <Breakdown
        title="Menurut amil"
        rows={group((r) => r.created_by_name ?? '—')}
        filename={`penghimpunan-amil-${from}`}
      />
    </div>
  )
}

function DistributionReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['report-distribution', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distributions_v')
        .select('amount, asnaf, fund_type_name, program_name')
        .eq('status', 'disbursed')
        .gte('distributed_at', from)
        .lte('distributed_at', `${to}T23:59:59`)
      if (error) throw new Error(error.message)
      return (data ?? []) as {
        amount: number
        asnaf: Asnaf | null
        fund_type_name: string
        program_name: string | null
      }[]
    },
  })

  if (isLoading) return <Spinner />

  const group = (key: (r: NonNullable<typeof data>[number]) => string) => {
    const map = new Map<string, { amount: number; count: number }>()
    data?.forEach((r) => {
      const k = key(r)
      const row = map.get(k) ?? { amount: 0, count: 0 }
      row.amount += Number(r.amount)
      row.count += 1
      map.set(k, row)
    })
    return [...map].sort((a, b) => b[1].amount - a[1].amount)
  }

  return (
    <div className="space-y-4">
      <ErrorNote error={error} />
      <Breakdown
        title="Menurut jenis dana"
        rows={group((r) => r.fund_type_name)}
        filename={`penyaluran-jenis-dana-${from}`}
      />
      <Breakdown
        title="Menurut asnaf"
        rows={group((r) => (r.asnaf ? asnafLabels[r.asnaf] : 'Kolektif / program'))}
        filename={`penyaluran-asnaf-${from}`}
      />
      <Breakdown
        title="Menurut program"
        rows={group((r) => r.program_name ?? 'Tanpa program')}
        filename={`penyaluran-program-${from}`}
      />
    </div>
  )
}

function Breakdown({
  title,
  rows,
  filename,
}: {
  title: string
  rows: [string, { amount: number; count: number }][]
  filename: string
}) {
  const total = rows.reduce((s, [, v]) => s + v.amount, 0)
  return (
    <Card>
      <CardTitle
        action={
          <Button
            size="sm"
            variant="secondary"
            className="no-print"
            onClick={() =>
              exportXLSX(
                rows.map(([k, v]) => ({
                  Kategori: k,
                  Jumlah: v.amount,
                  Transaksi: v.count,
                  'Porsi (%)': total ? Math.round((v.amount / total) * 1000) / 10 : 0,
                })),
                filename,
              )
            }
          >
            <Download size={16} /> XLSX
          </Button>
        }
      >
        {title}
      </CardTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Tidak ada data pada periode ini.</p>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Kategori</th>
                <th className="num">Transaksi</th>
                <th className="num">Jumlah</th>
                <th className="num">Porsi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num">{v.count}</td>
                  <td className="num font-medium">{formatIDR(v.amount)}</td>
                  <td className="num">{total ? Math.round((v.amount / total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td>Total</td>
                <td className="num">{rows.reduce((s, [, v]) => s + v.count, 0)}</td>
                <td className="num">{formatIDR(total)}</td>
                <td className="num">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  )
}
