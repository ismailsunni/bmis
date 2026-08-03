import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Upload, MessageCircle, Download } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { can } from '@/auth/permissions'
import { useDonations, useFundTypes, useSettings, type DonationFilters } from '@/lib/queries'
import { Badge, Button, EmptyState, ErrorNote, Input, Select, Spinner } from '@/components/ui'
import { PageHeader } from '@/components/AppShell'
import { Pagination } from '@/components/Pagination'
import { formatDate, formatIDR } from '@/lib/format'
import { donationStatusLabels, paymentMethodLabels } from '@/lib/labels'
import { copyToClipboard, receiptText, whatsappLink } from '@/lib/receipt'
import { exportXLSX } from '@/lib/export'
import { DonationForm } from './DonationForm'
import type { DonationRow, DonationStatus } from '@/types/db'

const statusTone: Record<DonationStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  pending: 'warning',
  verified: 'success',
  rejected: 'danger',
  voided: 'danger',
}

export function DonationsPage() {
  const { role } = useAuth()
  const [filters, setFilters] = useState<DonationFilters>({ page: 0 })
  const [formOpen, setFormOpen] = useState(false)
  const { data, isLoading, error } = useDonations(filters)
  const { data: fundTypes } = useFundTypes()
  const { data: settings } = useSettings()

  const org = (settings?.organization ?? {}) as { name?: string; receipt_footer?: string }

  const set = (patch: Partial<DonationFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 0 }))

  const shareReceipt = async (row: DonationRow) => {
    const text = receiptText(row, org)
    await copyToClipboard(text)
    window.open(whatsappLink(text), '_blank', 'noopener')
  }

  return (
    <>
      <PageHeader
        title="Donasi"
        subtitle="Hanya donasi terverifikasi yang dihitung dalam saldo dan laporan"
        action={
          <>
            {data && data.rows.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  exportXLSX(
                    data.rows.map((r) => ({
                      Kwitansi: r.receipt_no,
                      Tanggal: formatDate(r.donated_at),
                      Donatur: r.is_anonymous ? 'Hamba Allah' : r.donor_name,
                      'Jenis dana': r.fund_type_name,
                      Program: r.program_name ?? '',
                      Jumlah: Number(r.amount),
                      Metode: paymentMethodLabels[r.payment_method],
                      Status: donationStatusLabels[r.status],
                    })),
                    'donasi',
                  )
                }
              >
                <Download size={16} /> Ekspor
              </Button>
            )}
            {can.recordDonation(role) && (
              <>
                <Link to="/donasi/impor">
                  <Button variant="secondary" size="sm">
                    <Upload size={16} /> Impor
                  </Button>
                </Link>
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus size={16} /> Catat donasi
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Cari kwitansi atau donatur"
          onChange={(e) => set({ search: e.target.value || undefined })}
        />
        <Select
          value={filters.status ?? ''}
          onChange={(e) => set({ status: e.target.value || undefined })}
        >
          <option value="">Semua status</option>
          {Object.entries(donationStatusLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select
          value={filters.fundTypeId ?? ''}
          onChange={(e) => set({ fundTypeId: e.target.value || undefined })}
        >
          <option value="">Semua jenis dana</option>
          {fundTypes?.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Input
            type="date"
            aria-label="Dari"
            onChange={(e) => set({ from: e.target.value || undefined })}
          />
          <Input
            type="date"
            aria-label="Sampai"
            onChange={(e) => set({ to: e.target.value || undefined })}
          />
        </div>
      </div>

      <ErrorNote error={error} />
      {isLoading && <Spinner />}

      {data &&
        (data.rows.length === 0 ? (
          <EmptyState title="Belum ada donasi" hint="Catat donasi pertama untuk memulai." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Kwitansi</th>
                    <th>Tanggal</th>
                    <th>Donatur</th>
                    <th>Jenis dana</th>
                    <th className="num">Jumlah</th>
                    <th>Metode</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-xs">{r.receipt_no}</td>
                      <td className="whitespace-nowrap">{formatDate(r.donated_at)}</td>
                      <td>
                        {r.is_anonymous ? (
                          <span className="text-slate-500">Hamba Allah</span>
                        ) : r.donor_id ? (
                          <Link to={`/donatur/${r.donor_id}`} className="hover:underline">
                            {r.donor_name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{r.fund_type_name}</td>
                      <td className="num font-medium">{formatIDR(r.amount)}</td>
                      <td>{paymentMethodLabels[r.payment_method]}</td>
                      <td>
                        <Badge tone={statusTone[r.status]}>{donationStatusLabels[r.status]}</Badge>
                      </td>
                      <td>
                        {r.status === 'verified' && (
                          <button
                            onClick={() => shareReceipt(r)}
                            title="Salin kwitansi & buka WhatsApp"
                            className="text-slate-400 hover:text-emerald-600"
                          >
                            <MessageCircle size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={filters.page ?? 0}
              count={data.count}
              onChange={(p) => setFilters((f) => ({ ...f, page: p }))}
            />
          </>
        ))}

      <DonationForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => setFormOpen(false)}
      />
    </>
  )
}
