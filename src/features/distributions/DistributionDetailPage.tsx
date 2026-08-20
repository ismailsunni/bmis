import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, HandCoins, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { can } from '@/auth/permissions'
import { useDistribution, useRpc } from '@/lib/queries'
import { PageHeader } from '@/components/AppShell'
import { ReasonDialog } from '@/components/ReasonDialog'
import { SignedImage } from '@/components/SignedImage'
import { RecordAudit, TrailNote, DetailRow as Row } from '@/components/RecordDetail'
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorNote,
  Spinner,
  type BadgeTone,
} from '@/components/ui'
import { formatDate, formatDateTime, formatIDR } from '@/lib/format'
import { asnafLabels, distributionStatusLabels, distributionTypeLabels } from '@/lib/labels'
import { DisburseDialog } from './DisburseDialog'
import type { DistributionStatus } from '@/types/db'

const statusTone: Record<DistributionStatus, BadgeTone> = {
  requested: 'warning',
  approved: 'info',
  disbursed: 'success',
  rejected: 'danger',
}

/**
 * One distribution, in full — the counterpart of the donation detail page.
 *
 * Penyaluran has more to account for than penghimpunan: three actors rather
 * than two (requested, approved, handed over), and two photos, since a
 * disbursement to a mustahik has to be evidenced at the moment it happens.
 * All of that lived in the database and nowhere on screen.
 */
export function DistributionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { role, user } = useAuth()
  const { data: dist, isLoading, error } = useDistribution(id)
  const [rejecting, setRejecting] = useState(false)
  const [overriding, setOverriding] = useState(false)
  const [disbursing, setDisbursing] = useState(false)

  const approve = useRpc<{ p_id: string; p_override_reason?: string }>('rpc_approve_distribution', [
    'distributions',
    'distribution',
  ])
  const reject = useRpc<{ p_id: string; p_reason: string }>('rpc_reject_distribution', [
    'distributions',
    'distribution',
  ])

  // The requester may not approve their own submission; a ketua or bendahara may,
  // but only by recording why — the same rule as donations, enforced on the table.
  const own = dist?.requested_by === user?.id
  const canOverride = can.overrideSeparationOfDuties(role)

  return (
    <>
      <PageHeader
        title={dist?.ref_no ?? 'Penyaluran'}
        subtitle={dist ? formatIDR(dist.amount) : undefined}
        action={
          dist && (
            <>
              {dist.status === 'requested' && can.approveDistribution(role) && (
                <>
                  <Button
                    size="sm"
                    disabled={(own && !canOverride) || approve.isPending}
                    title={
                      own && !canOverride
                        ? 'Anda yang mengajukan; mintalah pengurus lain menyetujuinya'
                        : undefined
                    }
                    onClick={() => (own ? setOverriding(true) : approve.mutate({ p_id: dist.id }))}
                  >
                    <Check size={16} /> {own ? 'Setujui (alasan)' : 'Setujui'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
                    <X size={16} /> Tolak
                  </Button>
                </>
              )}
              {dist.status === 'approved' && can.requestDistribution(role) && (
                <Button size="sm" onClick={() => setDisbursing(true)}>
                  <HandCoins size={16} /> Serahkan
                </Button>
              )}
            </>
          )
        }
      />

      <ErrorNote error={error ?? approve.error} />
      {isLoading && <Spinner />}

      {!isLoading && !dist && (
        <EmptyState
          title="Penyaluran tidak ditemukan"
          hint="Nomor ini tidak ada, atau bukan data yang boleh Anda lihat."
        />
      )}

      {dist && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardTitle>Penyaluran</CardTitle>
            <div className="mb-3 flex items-center gap-2">
              <Badge tone={statusTone[dist.status]}>{distributionStatusLabels[dist.status]}</Badge>
              {dist.status === 'approved' && (
                <span className="text-xs text-slate-500">sudah membebani saldo</span>
              )}
            </div>
            <dl className="space-y-1.5 text-sm">
              <Row
                label="Penerima"
                value={
                  dist.beneficiary_name ? (
                    <>
                      {dist.beneficiary_name}
                      {dist.asnaf && (
                        <span className="ml-1 text-xs text-slate-500">
                          ({asnafLabels[dist.asnaf]})
                        </span>
                      )}
                    </>
                  ) : (
                    (dist.program_name ?? '—')
                  )
                }
              />
              <Row label="Kode mustahik" value={dist.beneficiary_code ?? '—'} />
              <Row label="Jenis dana" value={dist.fund_type_name} />
              <Row
                label="Program"
                value={
                  dist.program_name ? (
                    <Link to="/program" className="hover:underline">
                      {dist.program_name}
                    </Link>
                  ) : (
                    '—'
                  )
                }
              />
              <Row label="Sumber dana" value={dist.account_name ?? '—'} />
              <Row label="Bentuk" value={distributionTypeLabels[dist.distribution_type]} />
              <Row label="Tanggal" value={formatDate(dist.distributed_at)} />
            </dl>
            {dist.description && <p className="mt-3 text-sm">{dist.description}</p>}
            {dist.notes && (
              <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-500 dark:border-slate-700">
                {dist.notes}
              </p>
            )}
          </Card>

          <Card>
            <CardTitle>Jejak</CardTitle>
            <dl className="space-y-1.5 text-sm">
              <Row label="Diajukan oleh" value={dist.requested_by_name ?? '—'} />
              <Row label="Waktu pengajuan" value={formatDateTime(dist.created_at)} />
              <Row label="Disetujui oleh" value={dist.approved_by_name ?? '—'} />
              <Row
                label="Waktu persetujuan"
                value={dist.approved_at ? formatDateTime(dist.approved_at) : '—'}
              />
              <Row
                label="Diserahkan"
                value={dist.disbursed_at ? formatDateTime(dist.disbursed_at) : 'belum'}
              />
            </dl>
            {dist.sod_override_reason && (
              <TrailNote tone="warning" label="Pemisahan tugas diterobos">
                {dist.sod_override_reason}
              </TrailNote>
            )}
            {dist.reject_reason && (
              <TrailNote tone="danger" label="Alasan penolakan">
                {dist.reject_reason}
              </TrailNote>
            )}
          </Card>

          <Card>
            <CardTitle>Bukti penyerahan</CardTitle>
            <SignedImage
              bucket="distribution-proofs"
              path={dist.proof_url}
              alt="Foto penyerahan"
              empty="Belum ada foto penyerahan."
            />
            <p className="mb-1 mt-3 text-xs text-slate-500">Tanda tangan penerima</p>
            <SignedImage
              bucket="distribution-proofs"
              path={dist.recipient_signature_url}
              alt="Tanda tangan penerima"
              empty="Belum ada tanda tangan."
            />
          </Card>

          {can.readAuditLog(role) && <RecordAudit table="distributions" id={dist.id} />}
        </div>
      )}

      <ReasonDialog
        open={overriding}
        title={`Setujui pengajuan sendiri — ${dist?.ref_no ?? ''}`}
        description={
          'Penyaluran ini Anda ajukan sendiri. Sebagai ketua atau bendahara Anda boleh tetap ' +
          'menyetujuinya, namun alasannya wajib dicatat karena menerobos aturan pemisahan ' +
          'tugas. Tuliskan alasan yang jelas, minimal 10 karakter.'
        }
        label="Alasan menerobos pemisahan tugas"
        confirmLabel="Setujui"
        busy={approve.isPending}
        error={approve.error}
        onCancel={() => setOverriding(false)}
        onConfirm={async (text) => {
          await approve.mutateAsync({ p_id: dist!.id, p_override_reason: text })
          setOverriding(false)
        }}
      />

      <ReasonDialog
        open={rejecting}
        title={`Tolak ${dist?.ref_no ?? ''}`}
        description="Pengajuan yang ditolak tetap tersimpan beserta alasannya."
        label="Alasan penolakan"
        confirmLabel="Tolak pengajuan"
        busy={reject.isPending}
        error={reject.error}
        onCancel={() => setRejecting(false)}
        onConfirm={async (text) => {
          await reject.mutateAsync({ p_id: dist!.id, p_reason: text })
          setRejecting(false)
        }}
      />

      {disbursing && <DisburseDialog row={dist ?? null} onClose={() => setDisbursing(false)} />}
    </>
  )
}
