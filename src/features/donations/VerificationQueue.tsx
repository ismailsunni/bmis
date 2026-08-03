import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDonations, useRpc } from '@/lib/queries'
import { signedUrl } from '@/lib/storage'
import { PageHeader } from '@/components/AppShell'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  Spinner,
  Textarea,
} from '@/components/ui'
import { formatDate, formatIDR, timeAgo } from '@/lib/format'
import { paymentMethodLabels } from '@/lib/labels'
import type { DonationRow } from '@/types/db'

/**
 * Bendahara's working screen: the pending entry beside its proof image, with
 * verify and reject one tap away. Bulk verify handles a matched bank batch.
 */
export function VerificationQueue() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useDonations({ status: 'pending' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rejecting, setRejecting] = useState<DonationRow | null>(null)
  const [reason, setReason] = useState('')

  const verify = useRpc<{ p_id: string }>('rpc_verify_donation', ['donations'])
  const reject = useRpc<{ p_id: string; p_reason: string }>('rpc_reject_donation', ['donations'])

  const rows = data?.rows ?? []

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const verifyBatch = async () => {
    // Sequential on purpose: each verification re-checks separation of duties
    // and the caller needs to know exactly which one failed.
    for (const id of selected) {
      await verify.mutateAsync({ p_id: id }).catch(() => null)
    }
    setSelected(new Set())
    qc.invalidateQueries({ queryKey: ['donations'] })
  }

  return (
    <>
      <PageHeader
        title="Antrean verifikasi"
        subtitle={`${rows.length} donasi menunggu`}
        action={
          selected.size > 0 && (
            <Button size="sm" onClick={verifyBatch} disabled={verify.isPending}>
              Verifikasi {selected.size} terpilih
            </Button>
          )
        }
      />

      <ErrorNote error={error ?? verify.error ?? reject.error} />
      {isLoading && <Spinner />}

      {rows.length === 0 && !isLoading && (
        <EmptyState title="Tidak ada yang menunggu verifikasi" hint="Semua entri sudah diproses." />
      )}

      <div className="space-y-3">
        {rows.map((row) => (
          <QueueItem
            key={row.id}
            row={row}
            checked={selected.has(row.id)}
            onToggle={() => toggle(row.id)}
            onVerify={() => verify.mutate({ p_id: row.id })}
            onReject={() => {
              setRejecting(row)
              setReason('')
            }}
            busy={verify.isPending}
          />
        ))}
      </div>

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={`Tolak ${rejecting?.receipt_no ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Batal
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim() || reject.isPending}
              onClick={async () => {
                await reject.mutateAsync({ p_id: rejecting!.id, p_reason: reason.trim() })
                setRejecting(null)
              }}
            >
              Tolak donasi
            </Button>
          </>
        }
      >
        <Field label="Alasan penolakan" required hint="Alasan tercatat permanen di log audit">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
      </Modal>
    </>
  )
}

function QueueItem({
  row,
  checked,
  onToggle,
  onVerify,
  onReject,
  busy,
}: {
  row: DonationRow
  checked: boolean
  onToggle: () => void
  onVerify: () => void
  onReject: () => void
  busy: boolean
}) {
  const [proof, setProof] = useState<string | null>(null)

  useEffect(() => {
    // Signed URLs live 60 seconds, so they are fetched per view, not stored.
    let alive = true
    signedUrl('donation-proofs', row.proof_url).then((url) => {
      if (alive) setProof(url)
    })
    return () => {
      alive = false
    }
  }, [row.proof_url])

  const stale = Date.now() - new Date(row.created_at).getTime() > 3 * 864e5

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0"
          aria-label={`Pilih ${row.receipt_no}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{row.receipt_no}</span>
            {stale && <Badge tone="danger">Menunggu {timeAgo(row.created_at)}</Badge>}
          </div>
          <p className="mt-1 text-lg font-semibold">{formatIDR(row.amount)}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Row
              label="Donatur"
              value={row.is_anonymous ? 'Hamba Allah' : (row.donor_name ?? '—')}
            />
            <Row label="Jenis dana" value={row.fund_type_name} />
            <Row label="Metode" value={paymentMethodLabels[row.payment_method]} />
            <Row label="Tanggal" value={formatDate(row.donated_at)} />
            {row.payment_ref && <Row label="Referensi" value={row.payment_ref} />}
            <Row label="Dicatat oleh" value={row.created_by_name ?? '—'} />
          </dl>
          {row.notes && <p className="mt-2 text-sm text-slate-500">{row.notes}</p>}

          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={onVerify} disabled={busy}>
              Verifikasi
            </Button>
            <Button size="sm" variant="secondary" onClick={onReject}>
              Tolak
            </Button>
          </div>
        </div>

        <div className="sm:w-56 sm:shrink-0">
          {proof ? (
            <a href={proof} target="_blank" rel="noopener noreferrer">
              <img
                src={proof}
                alt={`Bukti untuk ${row.receipt_no}`}
                className="max-h-56 w-full rounded-lg border border-slate-200 object-cover dark:border-slate-600"
              />
            </a>
          ) : (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-600">
              Tanpa bukti
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <>
    <dt className="text-slate-500">{label}</dt>
    <dd className="truncate">{value}</dd>
  </>
)
