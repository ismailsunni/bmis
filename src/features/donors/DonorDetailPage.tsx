import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSettings } from '@/lib/queries'
import { PageHeader } from '@/components/AppShell'
import { Badge, Button, Card, CardTitle, ErrorNote, Spinner } from '@/components/ui'
import { formatDate, formatHijri, formatIDR } from '@/lib/format'
import { printBSZ } from '@/lib/receipt'
import type { Donor } from '@/types/db'

interface Statement {
  donor: Donor
  total: number
  by_fund: { name: string; amount: number }[]
  donations: {
    id: string; receipt_no: string; amount: number
    donated_at: string; fund_type_name: string
  }[]
}

export function DonorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: settings } = useSettings()
  const year = new Date().getFullYear()

  const { data, isLoading, error } = useQuery({
    queryKey: ['donor-statement', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_donor_statement', { p_donor_id: id })
      if (error) throw new Error(error.message)
      return data as unknown as Statement
    },
  })

  const { data: donor } = useQuery({
    queryKey: ['donor', id],
    queryFn: async () => {
      const { data } = await supabase.from('donors').select('*').eq('id', id!).single()
      return data as Donor
    },
  })

  const org = (settings?.organization ?? {}) as { name?: string; address?: string }

  // "At risk" per PRD 8.3: a recurring donor silent for more than two periods.
  const lastDonation = data?.donations[0]?.donated_at
  const atRisk = donor?.is_recurring && lastDonation &&
    Date.now() - new Date(lastDonation).getTime() > 60 * 864e5

  const printStatement = () => {
    if (!data || !donor) return
    const thisYear = data.donations.filter(
      (d) => new Date(d.donated_at).getFullYear() === year)
    const total = thisYear.reduce((s, d) => s + Number(d.amount), 0)
    printBSZ(`
      <h1>${org.name ?? 'Baitul Maal'}</h1>
      <div class="sub">${org.address ?? ''}</div>
      <h1>BUKTI SETOR ZAKAT</h1>
      <div class="sub">Tahun ${year}</div>
      <table>
        <tr><td>Nama muzakki</td><td>: ${donor.full_name}</td></tr>
        <tr><td>NPWP</td><td>: ${donor.npwp ?? '-'}</td></tr>
        <tr><td>Alamat</td><td>: ${donor.address ?? '-'}</td></tr>
        <tr><td>Jumlah setoran</td><td>: <span class="total">${formatIDR(total)}</span></td></tr>
        <tr><td>Jumlah transaksi</td><td>: ${thisYear.length}</td></tr>
      </table>
      <p>Bukti setor ini diterbitkan sebagai keterangan pembayaran zakat yang dapat
      digunakan sebagai pengurang penghasilan kena pajak sesuai ketentuan yang berlaku.</p>
      <div class="foot">
        ${formatDate(new Date())} / ${formatHijri()}<br/><br/><br/>
        ${org.name ?? 'Baitul Maal'}
      </div>`)
  }

  return (
    <>
      <PageHeader
        title={donor?.full_name ?? 'Donatur'}
        subtitle={donor?.donor_code}
        action={
          <Button size="sm" variant="secondary" onClick={printStatement} disabled={!data}>
            <FileText size={16} /> Cetak BSZ {year}
          </Button>
        }
      />

      <ErrorNote error={error} />
      {isLoading && <Spinner />}

      {data && donor && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardTitle>Profil</CardTitle>
            <dl className="space-y-1.5 text-sm">
              <Row label="Telepon" value={donor.phone ?? '—'} />
              <Row label="Email" value={donor.email ?? '—'} />
              <Row label="NIK" value={donor.nik ? `${donor.nik.slice(0, 4)}••••••••` : '—'} />
              <Row label="NPWP" value={donor.npwp ?? '—'} />
              <Row label="Kota" value={donor.city ?? '—'} />
              <Row label="Terdaftar" value={formatDate(donor.created_at)} />
            </dl>
            <div className="mt-3 flex flex-wrap gap-1">
              {donor.is_recurring && <Badge tone="info">Donatur tetap</Badge>}
              {atRisk && <Badge tone="warning">Berisiko berhenti</Badge>}
              {donor.tags.map((t) => <Badge key={t}>{t}</Badge>)}
            </div>
          </Card>

          <Card>
            <CardTitle>Total seumur hidup</CardTitle>
            <p className="text-2xl font-bold">{formatIDR(data.total)}</p>
            <p className="mt-1 text-xs text-slate-500">
              {data.donations.length} donasi terverifikasi
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {data.by_fund.map((f) => (
                <li key={f.name} className="flex justify-between gap-2">
                  <span className="truncate text-slate-500">{f.name}</span>
                  <span className="tabular-nums">{formatIDR(f.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="lg:col-span-3">
            <CardTitle>Riwayat donasi</CardTitle>
            {data.donations.length === 0 ? (
              <p className="text-sm text-slate-400">Belum ada donasi terverifikasi.</p>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>Kwitansi</th><th>Tanggal</th><th>Jenis dana</th>
                        <th className="num">Jumlah</th></tr>
                  </thead>
                  <tbody>
                    {data.donations.map((d) => (
                      <tr key={d.id}>
                        <td className="font-mono text-xs">{d.receipt_no}</td>
                        <td className="whitespace-nowrap">{formatDate(d.donated_at)}</td>
                        <td>{d.fund_type_name}</td>
                        <td className="num font-medium">{formatIDR(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      <p className="mt-4 text-sm">
        <Link to="/donatur" className="text-brand-700 hover:underline dark:text-brand-400">
          ← Kembali ke daftar donatur
        </Link>
      </p>
    </>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-2">
    <dt className="text-slate-500">{label}</dt>
    <dd className="truncate">{value}</dd>
  </div>
)
