import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Upload, MessageCircle, Download, Rows3, Pencil, Ban } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { can, donationEditScope } from '@/auth/permissions'
import {
  useDonations,
  useFundTypes,
  useRpc,
  useSettings,
  type DonationFilters,
} from '@/lib/queries'
import { Badge, Button, EmptyState, ErrorNote, Input, Select, Spinner } from '@/components/ui'
import { PageHeader } from '@/components/AppShell'
import { Pagination } from '@/components/Pagination'
import { ReasonDialog } from '@/components/ReasonDialog'
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
  const { role, user } = useAuth()
  const [filters, setFilters] = useState<DonationFilters>({ page: 0 })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DonationRow | null>(null)
  const [voiding, setVoiding] = useState<DonationRow | null>(null)
  const { data, isLoading, error } = useDonations(filters)
  const { data: fundTypes } = useFundTypes()
  const { data: settings } = useSettings()

  const org = (settings?.organization ?? {}) as { name?: string; receipt_footer?: string }

  const set = (patch: Partial<DonationFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 0 }))

  // Voiding is the only reversal a verified donation has: it leaves the balances
  // and the reports but keeps the row, its receipt number and the stated reason.
  const voidDonation = useRpc<{ p_id: string; p_reason: string }>('rpc_void_donation', [
    'donations',
  ])

  const editScope = (row: DonationRow) =>
    donationEditScope(role, row.created_by === user?.id, row.status)

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
                <Link to="/donasi/massal">
                  <Button variant="secondary" size="sm">
                    <Rows3 size={16} /> Catat massal
                  </Button>
                </Link>
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
                        <div className="flex items-center gap-3">
                          {editScope(r) && (
                            <button
                              onClick={() => setEditing(r)}
                              title={
                                editScope(r) === 'annotations'
                                  ? 'Ubah catatan, referensi, atau bukti'
                                  : 'Ubah donasi'
                              }
                              className="text-slate-400 hover:text-brand-700 dark:hover:text-brand-400"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {r.status === 'verified' && (
                            <button
                              onClick={() => shareReceipt(r)}
                              title="Salin kwitansi & buka WhatsApp"
                              className="text-slate-400 hover:text-emerald-600"
                            >
                              <MessageCircle size={16} />
                            </button>
                          )}
                          {r.status === 'verified' && can.voidDonation(role) && (
                            <button
                              onClick={() => setVoiding(r)}
                              title="Batalkan donasi"
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <Ban size={16} />
                            </button>
                          )}
                        </div>
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
      <DonationForm
        open={!!editing}
        donation={editing}
        onClose={() => setEditing(null)}
        onSaved={() => setEditing(null)}
      />

      <ReasonDialog
        open={!!voiding}
        title={`Batalkan donasi ${voiding?.receipt_no ?? ''}`}
        description={
          `Donasi ${formatIDR(voiding?.amount ?? 0)} akan keluar dari saldo, dasbor, dan ` +
          'seluruh laporan. Datanya tetap tersimpan lengkap dengan alasan ini — tidak ada ' +
          'penghapusan di sistem ini. Kwitansi yang sudah terbit tidak ikut berubah, jadi ' +
          'beri tahu donatur bila kwitansinya perlu diganti.'
        }
        label="Alasan pembatalan"
        confirmLabel="Batalkan donasi"
        busy={voidDonation.isPending}
        error={voidDonation.error}
        onCancel={() => setVoiding(null)}
        onConfirm={async (reason) => {
          await voidDonation.mutateAsync({ p_id: voiding!.id, p_reason: reason })
          setVoiding(null)
        }}
      />
    </>
  )
}
