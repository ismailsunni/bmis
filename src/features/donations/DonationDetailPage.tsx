import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Ban, MessageCircle, Pencil } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { can, donationEditScope } from '@/auth/permissions'
import { useDonation, useRecordAudit, useRpc, useSettings } from '@/lib/queries'
import { signedUrl } from '@/lib/storage'
import { PageHeader } from '@/components/AppShell'
import { ReasonDialog } from '@/components/ReasonDialog'
import { Badge, Button, Card, CardTitle, EmptyState, ErrorNote, Spinner } from '@/components/ui'
import { formatDate, formatDateTime, formatIDR } from '@/lib/format'
import { donationStatusLabels, paymentMethodLabels } from '@/lib/labels'
import { copyToClipboard, receiptText, whatsappLink } from '@/lib/receipt'
import { DonationForm } from './DonationForm'
import type { DonationRow, DonationStatus } from '@/types/db'

const statusTone: Record<DonationStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  pending: 'warning',
  verified: 'success',
  rejected: 'danger',
  voided: 'danger',
}

/**
 * One donation, in full. A page rather than a modal on purpose: this is the
 * thing somebody links to an auditor or opens beside a bank statement, so it
 * needs an address of its own — and it has more to say than a dialog can hold,
 * including the proof image and, for an auditor, the record's own audit trail.
 *
 * Every action here is the same action as on the list, gated by the same
 * helpers; RLS decides what actually happens.
 */
export function DonationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { role, user } = useAuth()
  const { data: donation, isLoading, error } = useDonation(id)
  const { data: settings } = useSettings()
  const [editing, setEditing] = useState(false)
  const [voiding, setVoiding] = useState(false)

  const voidDonation = useRpc<{ p_id: string; p_reason: string }>('rpc_void_donation', [
    'donations',
    'donation',
  ])

  const org = (settings?.organization ?? {}) as { name?: string; receipt_footer?: string }
  const scope = donation
    ? donationEditScope(role, donation.created_by === user?.id, donation.status)
    : null

  const shareReceipt = async (row: DonationRow) => {
    const text = receiptText(row, org)
    await copyToClipboard(text)
    window.open(whatsappLink(text), '_blank', 'noopener')
  }

  return (
    <>
      <PageHeader
        title={donation?.receipt_no ?? 'Donasi'}
        subtitle={donation ? formatIDR(donation.amount) : undefined}
        action={
          donation && (
            <>
              {scope && (
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil size={16} /> {scope === 'annotations' ? 'Catatan & bukti' : 'Ubah donasi'}
                </Button>
              )}
              {donation.status === 'verified' && (
                <Button size="sm" variant="secondary" onClick={() => shareReceipt(donation)}>
                  <MessageCircle size={16} /> Kirim kwitansi
                </Button>
              )}
              {donation.status === 'verified' && can.voidDonation(role) && (
                <Button size="sm" variant="danger" onClick={() => setVoiding(true)}>
                  <Ban size={16} /> Batalkan
                </Button>
              )}
            </>
          )
        }
      />

      <ErrorNote error={error} />
      {isLoading && <Spinner />}

      {!isLoading && !donation && (
        <EmptyState
          title="Donasi tidak ditemukan"
          hint="Nomor ini tidak ada, atau bukan entri yang boleh Anda lihat."
        />
      )}

      {donation && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardTitle>Donasi</CardTitle>
            <div className="mb-3 flex items-center gap-2">
              <Badge tone={statusTone[donation.status]}>
                {donationStatusLabels[donation.status]}
              </Badge>
              {donation.status !== 'verified' && (
                <span className="text-xs text-slate-500">belum dihitung dalam saldo</span>
              )}
            </div>
            <dl className="space-y-1.5 text-sm">
              <Row
                label="Donatur"
                value={
                  donation.is_anonymous ? (
                    'Hamba Allah'
                  ) : donation.donor_id ? (
                    <Link to={`/donatur/${donation.donor_id}`} className="hover:underline">
                      {donation.donor_name}
                    </Link>
                  ) : (
                    '—'
                  )
                }
              />
              <Row label="Jenis dana" value={donation.fund_type_name} />
              <Row label="Program" value={donation.program_name ?? '—'} />
              <Row label="Rekening" value={donation.account_name ?? '—'} />
              <Row label="Metode" value={paymentMethodLabels[donation.payment_method]} />
              <Row label="Referensi" value={donation.payment_ref ?? '—'} />
              <Row label="Tanggal donasi" value={formatDate(donation.donated_at)} />
              {donation.in_kind_description && (
                <Row label="Barang" value={donation.in_kind_description} />
              )}
            </dl>
            {donation.notes && (
              <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-500 dark:border-slate-700">
                {donation.notes}
              </p>
            )}
          </Card>

          <Card>
            <CardTitle>Jejak</CardTitle>
            <dl className="space-y-1.5 text-sm">
              <Row label="Dicatat oleh" value={donation.created_by_name ?? '—'} />
              <Row label="Waktu dicatat" value={formatDateTime(donation.created_at)} />
              <Row label="Diverifikasi oleh" value={donation.verified_by_name ?? '—'} />
              <Row
                label="Waktu verifikasi"
                value={donation.verified_at ? formatDateTime(donation.verified_at) : '—'}
              />
            </dl>
            {donation.sod_override_reason && (
              <Note tone="warning" label="Pemisahan tugas diterobos">
                {donation.sod_override_reason}
              </Note>
            )}
            {donation.reject_reason && (
              <Note tone="danger" label="Alasan penolakan">
                {donation.reject_reason}
              </Note>
            )}
            {donation.void_reason && (
              <Note tone="danger" label="Alasan pembatalan">
                {donation.void_reason}
              </Note>
            )}
          </Card>

          <Proof path={donation.proof_url} />

          {can.readAuditLog(role) && <AuditTrail id={donation.id} />}
        </div>
      )}

      <DonationForm
        open={editing}
        donation={donation ?? null}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />

      <ReasonDialog
        open={voiding}
        title={`Batalkan donasi ${donation?.receipt_no ?? ''}`}
        description={
          `Donasi ${formatIDR(donation?.amount ?? 0)} akan keluar dari saldo, dasbor, dan ` +
          'seluruh laporan. Datanya tetap tersimpan lengkap dengan alasan ini — tidak ada ' +
          'penghapusan di sistem ini. Kwitansi yang sudah terbit tidak ikut berubah, jadi ' +
          'beri tahu donatur bila kwitansinya perlu diganti.'
        }
        label="Alasan pembatalan"
        confirmLabel="Batalkan donasi"
        busy={voidDonation.isPending}
        error={voidDonation.error}
        onCancel={() => setVoiding(false)}
        onConfirm={async (reason) => {
          await voidDonation.mutateAsync({ p_id: donation!.id, p_reason: reason })
          setVoiding(false)
        }}
      />
    </>
  )
}

function Proof({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    // Signed URLs live 60 seconds, so they are fetched per view, never stored.
    let alive = true
    signedUrl('donation-proofs', path).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [path])

  return (
    <Card>
      <CardTitle>Bukti transfer</CardTitle>
      {!path ? (
        <p className="text-sm text-slate-400">Tidak ada bukti yang diunggah.</p>
      ) : url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img
            src={url}
            alt="Bukti transfer"
            className="max-h-64 w-full rounded-lg object-contain"
          />
        </a>
      ) : (
        <Spinner />
      )}
    </Card>
  )
}

function AuditTrail({ id }: { id: string }) {
  const { data } = useRecordAudit('donations', id)

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

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between gap-2">
    <dt className="shrink-0 text-slate-500">{label}</dt>
    <dd className="truncate text-right">{value}</dd>
  </div>
)

const Note = ({
  tone,
  label,
  children,
}: {
  tone: 'warning' | 'danger'
  label: string
  children: React.ReactNode
}) => (
  <div className="mt-3 text-sm">
    <Badge tone={tone}>{label}</Badge>
    <p className="mt-1 text-slate-600 dark:text-slate-300">{children}</p>
  </div>
)
