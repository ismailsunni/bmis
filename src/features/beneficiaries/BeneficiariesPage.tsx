import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { can } from '@/auth/permissions'
import { useBeneficiaries, useSettings } from '@/lib/queries'
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
import { formatIDR, maskIDR, parseIDR } from '@/lib/format'
import { asnafLabels, verificationStatusLabels } from '@/lib/labels'
import type { Asnaf, Beneficiary, VerificationStatus } from '@/types/db'

const statusTone: Record<VerificationStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  unverified: 'neutral',
  survey_scheduled: 'warning',
  verified: 'success',
  rejected: 'danger',
}

export function BeneficiariesPage() {
  const { role } = useAuth()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [detail, setDetail] = useState<Beneficiary | null>(null)
  const { data, isLoading, error } = useBeneficiaries(search, page)

  return (
    <>
      <PageHeader
        title="Mustahik"
        subtitle="Zakat hanya boleh disalurkan kepada mustahik yang sudah terverifikasi"
        action={
          can.manageBeneficiaries(role) && (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus size={16} /> Daftarkan mustahik
            </Button>
          )
        }
      />

      <Input
        className="mb-4 sm:max-w-sm"
        placeholder="Cari nama atau kode"
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
          <EmptyState title="Belum ada mustahik terdaftar" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama</th>
                    <th>Asnaf</th>
                    <th>Wilayah</th>
                    <th className="num">Jiwa</th>
                    <th>Status survei</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((b) => (
                    <tr key={b.id} className="cursor-pointer" onClick={() => setDetail(b)}>
                      <td className="font-mono text-xs">{b.beneficiary_code}</td>
                      <td className="font-medium">{b.full_name}</td>
                      <td>{asnafLabels[b.asnaf]}</td>
                      <td>{[b.village, b.district].filter(Boolean).join(', ') || '—'}</td>
                      <td className="num">{b.family_size ?? '—'}</td>
                      <td>
                        <Badge tone={statusTone[b.verification_status]}>
                          {verificationStatusLabels[b.verification_status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} count={data.count} onChange={setPage} />
          </>
        ))}

      <BeneficiaryForm open={formOpen} onClose={() => setFormOpen(false)} />
      <BeneficiaryDetail beneficiary={detail} onClose={() => setDetail(null)} />
    </>
  )
}

function BeneficiaryForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [form, setForm] = useState({
    full_name: '',
    nik: '',
    asnaf: 'fakir' as Asnaf,
    phone: '',
    address: '',
    rt_rw: '',
    village: '',
    district: '',
    city: '',
    family_size: '',
    monthly_income: '',
    survey_notes: '',
  })

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('beneficiaries').insert({
        full_name: form.full_name,
        nik: form.nik || null,
        asnaf: form.asnaf,
        phone: form.phone || null,
        address: form.address || null,
        rt_rw: form.rt_rw || null,
        village: form.village || null,
        district: form.district || null,
        city: form.city || null,
        family_size: form.family_size ? Number(form.family_size) : null,
        monthly_income: form.monthly_income ? parseIDR(form.monthly_income) : null,
        survey_notes: form.survey_notes || null,
        created_by: user!.id,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['beneficiaries'] })
      onClose()
    },
  })

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Daftarkan mustahik"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button disabled={!form.full_name || save.isPending} onClick={() => save.mutate()}>
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
          <Field label="Asnaf" required hint="Menentukan dana zakat yang boleh diterima">
            <Select value={form.asnaf} onChange={(e) => set({ asnaf: e.target.value as Asnaf })}>
              {Object.entries(asnafLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="NIK">
            <Input
              inputMode="numeric"
              maxLength={16}
              value={form.nik}
              onChange={(e) => set({ nik: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Telepon">
          <Input
            inputMode="tel"
            value={form.phone}
            onChange={(e) => set({ phone: e.target.value })}
          />
        </Field>
        <Field label="Alamat">
          <Textarea
            rows={2}
            value={form.address}
            onChange={(e) => set({ address: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="RT/RW">
            <Input
              value={form.rt_rw}
              onChange={(e) => set({ rt_rw: e.target.value })}
              placeholder="003/005"
            />
          </Field>
          <Field label="Desa/Kelurahan">
            <Input value={form.village} onChange={(e) => set({ village: e.target.value })} />
          </Field>
          <Field label="Kecamatan">
            <Input value={form.district} onChange={(e) => set({ district: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jumlah tanggungan">
            <Input
              inputMode="numeric"
              value={form.family_size}
              onChange={(e) => set({ family_size: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="Penghasilan bulanan">
            <Input
              inputMode="numeric"
              value={form.monthly_income}
              onChange={(e) => set({ monthly_income: maskIDR(e.target.value) })}
            />
          </Field>
        </div>
        <Field label="Catatan survei">
          <Textarea
            rows={2}
            value={form.survey_notes}
            onChange={(e) => set({ survey_notes: e.target.value })}
          />
        </Field>
        <ErrorNote error={save.error} />
        <p className="text-xs text-slate-500">
          Status awal <strong>belum disurvei</strong>. Mustahik harus terverifikasi sebelum dapat
          menerima dana zakat.
        </p>
      </div>
    </Modal>
  )
}

/** Assistance history plus the duplicate-aid warning required by PRD 8.4. */
function BeneficiaryDetail({
  beneficiary,
  onClose,
}: {
  beneficiary: Beneficiary | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { role } = useAuth()
  const { data: settings } = useSettings()
  const windowDays = Number(
    (settings?.rules as { duplicate_aid_days?: number })?.duplicate_aid_days ?? 90,
  )

  const { data: history } = useQuery({
    queryKey: ['beneficiary-history', beneficiary?.id],
    enabled: !!beneficiary,
    queryFn: async () => {
      const { data } = await supabase
        .from('distributions_v')
        .select(
          'id, ref_no, amount, distributed_at, status, fund_type_name, program_name, program_id',
        )
        .eq('beneficiary_id', beneficiary!.id)
        .order('distributed_at', { ascending: false })
      return (data ?? []) as {
        id: string
        ref_no: string
        amount: number
        distributed_at: string
        status: string
        fund_type_name: string
        program_name: string | null
        program_id: string | null
      }[]
    },
  })

  const advance = useMutation({
    mutationFn: async (next: VerificationStatus) => {
      const { error } = await supabase
        .from('beneficiaries')
        .update({ verification_status: next })
        .eq('id', beneficiary!.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['beneficiaries'] })
      onClose()
    },
  })

  if (!beneficiary) return null

  const cutoff = Date.now() - windowDays * 864e5
  const recentPrograms = new Set(
    (history ?? [])
      .filter((h) => h.program_id && new Date(h.distributed_at).getTime() > cutoff)
      .map((h) => h.program_name),
  )

  const nextStatus: Record<VerificationStatus, VerificationStatus | null> = {
    unverified: 'survey_scheduled',
    survey_scheduled: 'verified',
    verified: null,
    rejected: null,
  }
  const next = nextStatus[beneficiary.verification_status]

  return (
    <Modal
      open
      onClose={onClose}
      title={beneficiary.full_name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          {next && can.manageBeneficiaries(role) && (
            <Button disabled={advance.isPending} onClick={() => advance.mutate(next)}>
              Tandai {verificationStatusLabels[next].toLowerCase()}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone={statusTone[beneficiary.verification_status]}>
            {verificationStatusLabels[beneficiary.verification_status]}
          </Badge>
          <Badge>{asnafLabels[beneficiary.asnaf]}</Badge>
          <Badge>{beneficiary.beneficiary_code}</Badge>
        </div>

        {recentPrograms.size > 0 && (
          <div className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            Peringatan bantuan ganda: mustahik ini menerima bantuan dari{' '}
            {[...recentPrograms].join(', ')} dalam {windowDays} hari terakhir.
          </div>
        )}

        {beneficiary.survey_notes && <p className="text-slate-500">{beneficiary.survey_notes}</p>}

        <div>
          <h4 className="mb-1 font-medium">Riwayat bantuan</h4>
          {history?.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {history.map((h) => (
                <li key={h.id} className="flex justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate">
                    {h.fund_type_name}
                    {h.program_name && <span className="text-slate-500"> · {h.program_name}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatIDR(h.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400">Belum pernah menerima bantuan.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
