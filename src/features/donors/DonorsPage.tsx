import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, GitMerge, Pencil } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { can } from '@/auth/permissions'
import { useDonors, useRpc } from '@/lib/queries'
import { DonorForm } from './DonorForm'
import { PageHeader } from '@/components/AppShell'
import { Pagination } from '@/components/Pagination'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  Spinner,
  Textarea,
} from '@/components/ui'
import { formatDate } from '@/lib/format'
import { donorTypeLabels } from '@/lib/labels'
import type { Donor } from '@/types/db'

export function DonorsPage() {
  const { role, user } = useAuth()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Donor | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const { data, isLoading, error } = useDonors(search, page)

  return (
    <>
      <PageHeader
        title="Donatur"
        subtitle="Data pribadi donatur adalah data pribadi menurut UU PDP 27/2022"
        action={
          <>
            {can.mergeDonors(role) && (
              <Button size="sm" variant="secondary" onClick={() => setMergeOpen(true)}>
                <GitMerge size={16} /> Gabungkan
              </Button>
            )}
            {can.manageDonors(role) && (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus size={16} /> Donatur baru
              </Button>
            )}
          </>
        }
      />

      <Input
        className="mb-4 sm:max-w-sm"
        placeholder="Cari nama, telepon, atau kode"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(0)
        }}
      />

      <ErrorNote error={error} />
      {isLoading && <Spinner />}

      {data &&
        (data.rows.length === 0 ? (
          <EmptyState title="Belum ada donatur" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama</th>
                    <th>Tipe</th>
                    <th>Telepon</th>
                    <th>Kota</th>
                    <th>Terdaftar</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((d) => (
                    <tr key={d.id}>
                      <td className="font-mono text-xs">{d.donor_code}</td>
                      <td>
                        <Link to={`/donatur/${d.id}`} className="font-medium hover:underline">
                          {d.full_name}
                        </Link>
                        {d.is_recurring && <Badge tone="info">Tetap</Badge>}
                      </td>
                      <td>{donorTypeLabels[d.donor_type]}</td>
                      <td>{d.phone ?? '—'}</td>
                      <td>{d.city ?? '—'}</td>
                      <td className="whitespace-nowrap">{formatDate(d.created_at)}</td>
                      <td>
                        {can.editDonor(role, d.created_by === user?.id) && (
                          <button
                            onClick={() => setEditing(d)}
                            aria-label={`Ubah ${d.full_name}`}
                            title="Ubah data donatur"
                            className="text-slate-400 hover:text-brand-700 dark:hover:text-brand-400"
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} count={data.count} onChange={setPage} />
          </>
        ))}

      <DonorForm open={formOpen} onClose={() => setFormOpen(false)} />
      <DonorForm open={!!editing} donor={editing} onClose={() => setEditing(null)} />
      <MergeDialog open={mergeOpen} onClose={() => setMergeOpen(false)} />
    </>
  )
}

function MergeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [source, setSource] = useState('')
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const merge = useRpc<{ p_source: string; p_target: string; p_reason: string }>(
    'rpc_merge_donors',
    ['donors'],
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gabungkan donatur duplikat"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            disabled={!source || !target || !reason.trim() || merge.isPending}
            onClick={async () => {
              await merge.mutateAsync({ p_source: source, p_target: target, p_reason: reason })
              onClose()
            }}
          >
            Gabungkan
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          Seluruh donasi dari donatur sumber dipindahkan ke donatur tujuan. Data sumber diarsipkan,
          tidak dihapus.
        </p>
        <Field label="ID donatur sumber (duplikat)" required>
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="uuid"
            className="font-mono text-xs"
          />
        </Field>
        <Field label="ID donatur tujuan (dipertahankan)" required>
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="uuid"
            className="font-mono text-xs"
          />
        </Field>
        <Field label="Alasan" required hint="Tercatat di log audit">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ErrorNote error={merge.error} />
      </div>
    </Modal>
  )
}
