import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, GitMerge } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { can } from '@/auth/permissions'
import { useDonors, useRpc } from '@/lib/queries'
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
  Select,
  Spinner,
  Textarea,
} from '@/components/ui'
import { formatDate } from '@/lib/format'
import { donorTypeLabels } from '@/lib/labels'
import type { DonorType } from '@/types/db'

export function DonorsPage() {
  const { role, user } = useAuth()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} count={data.count} onChange={setPage} />
          </>
        ))}

      <DonorForm open={formOpen} onClose={() => setFormOpen(false)} createdBy={user!.id} />
      <MergeDialog open={mergeOpen} onClose={() => setMergeOpen(false)} />
    </>
  )
}

function DonorForm({
  open,
  onClose,
  createdBy,
}: {
  open: boolean
  onClose: () => void
  createdBy: string
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    full_name: '',
    donor_type: 'individual' as DonorType,
    nik: '',
    npwp: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    province: '',
    is_recurring: false,
    tags: '',
  })

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('donors').insert({
        ...form,
        nik: form.nik || null,
        npwp: form.npwp || null,
        phone: form.phone || null,
        email: form.email || null,
        tags: form.tags
          ? form.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        created_by: createdBy,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['donors'] })
      onClose()
    },
  })

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Donatur baru"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.full_name}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nama lengkap" required>
          <Input value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipe">
            <Select
              value={form.donor_type}
              onChange={(e) => set({ donor_type: e.target.value as DonorType })}
            >
              {Object.entries(donorTypeLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Telepon" hint="Dipakai untuk mencegah duplikat">
            <Input
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="NIK" hint="Opsional, hanya untuk keperluan resmi">
            <Input
              inputMode="numeric"
              maxLength={16}
              value={form.nik}
              onChange={(e) => set({ nik: e.target.value })}
            />
          </Field>
          <Field label="NPWP" hint="Diperlukan untuk Bukti Setor Zakat">
            <Input value={form.npwp} onChange={(e) => set({ npwp: e.target.value })} />
          </Field>
        </div>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Alamat">
          <Textarea
            rows={2}
            value={form.address}
            onChange={(e) => set({ address: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kota">
            <Input value={form.city} onChange={(e) => set({ city: e.target.value })} />
          </Field>
          <Field label="Provinsi">
            <Input value={form.province} onChange={(e) => set({ province: e.target.value })} />
          </Field>
        </div>
        <Field label="Tag" hint="Pisahkan dengan koma, mis. alumni, karyawan_pt_x">
          <Input value={form.tags} onChange={(e) => set({ tags: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={form.is_recurring}
            onChange={(e) => set({ is_recurring: e.target.checked })}
          />
          Donatur tetap
        </label>
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  )
}

/** Merging keeps every donation and writes the reason to the audit log. */
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
