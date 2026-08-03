import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { can } from '@/auth/permissions'
import { useAccounts, useDistributions, useFundTypes, usePrograms, useRpc } from '@/lib/queries'
import { uploadProof } from '@/lib/storage'
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
import { formatDate, formatIDR, maskIDR, parseIDR, todayJakarta } from '@/lib/format'
import { asnafLabels, distributionStatusLabels, distributionTypeLabels } from '@/lib/labels'
import type { Beneficiary, DistributionRow, DistributionStatus, DistributionType } from '@/types/db'

const statusTone: Record<DistributionStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  requested: 'warning',
  approved: 'info' as 'neutral',
  disbursed: 'success',
  rejected: 'danger',
}

export function DistributionsPage() {
  const { role } = useAuth()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [disbursing, setDisbursing] = useState<DistributionRow | null>(null)
  const { data, isLoading, error } = useDistributions(status || undefined, page)

  const approve = useRpc<{ p_id: string }>('rpc_approve_distribution', ['distributions'])
  const reject = useRpc<{ p_id: string; p_reason: string }>('rpc_reject_distribution', [
    'distributions',
  ])

  return (
    <>
      <PageHeader
        title="Penyaluran"
        subtitle="Pengajuan → persetujuan → penyerahan, dengan pemeriksaan saldo per jenis dana"
        action={
          can.requestDistribution(role) && (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus size={16} /> Ajukan penyaluran
            </Button>
          )
        }
      />

      <Select
        className="mb-4 sm:max-w-xs"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value)
          setPage(0)
        }}
      >
        <option value="">Semua status</option>
        {Object.entries(distributionStatusLabels).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>

      <ErrorNote error={error ?? approve.error ?? reject.error} />
      {isLoading && <Spinner />}

      {data &&
        (data.rows.length === 0 ? (
          <EmptyState title="Belum ada penyaluran" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>No. rujukan</th>
                    <th>Tanggal</th>
                    <th>Penerima</th>
                    <th>Jenis dana</th>
                    <th className="num">Jumlah</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-xs">{r.ref_no}</td>
                      <td className="whitespace-nowrap">{formatDate(r.distributed_at)}</td>
                      <td>
                        {r.beneficiary_name ?? r.program_name ?? '—'}
                        {r.asnaf && (
                          <span className="ml-1 text-xs text-slate-500">
                            ({asnafLabels[r.asnaf]})
                          </span>
                        )}
                      </td>
                      <td>{r.fund_type_name}</td>
                      <td className="num font-medium">{formatIDR(r.amount)}</td>
                      <td>
                        <Badge tone={statusTone[r.status]}>
                          {distributionStatusLabels[r.status]}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap">
                        {r.status === 'requested' && can.approveDistribution(role) && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => approve.mutate({ p_id: r.id })}
                            >
                              Setujui
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const reason = window.prompt('Alasan penolakan')
                                if (reason?.trim()) reject.mutate({ p_id: r.id, p_reason: reason })
                              }}
                            >
                              Tolak
                            </Button>
                          </>
                        )}
                        {r.status === 'approved' && can.requestDistribution(role) && (
                          <Button size="sm" variant="ghost" onClick={() => setDisbursing(r)}>
                            Serahkan
                          </Button>
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

      <DistributionForm open={formOpen} onClose={() => setFormOpen(false)} />
      <DisburseDialog row={disbursing} onClose={() => setDisbursing(null)} />
    </>
  )
}

function DistributionForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: fundTypes } = useFundTypes()
  const { data: accounts } = useAccounts()
  const { data: programs } = usePrograms()

  const [fundTypeId, setFundTypeId] = useState('')
  const [beneficiaryId, setBeneficiaryId] = useState('')
  const [programId, setProgramId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<DistributionType>('cash')
  const [when, setWhen] = useState(todayJakarta())
  const [description, setDescription] = useState('')

  const fundType = fundTypes?.find((f) => f.id === fundTypeId)

  // Zakat may only reach a verified mustahik whose asnaf the fund type permits,
  // so the picker is narrowed to exactly that set. The database enforces it too.
  const { data: beneficiaries } = useQuery({
    queryKey: ['eligible-beneficiaries', fundTypeId],
    enabled: !!fundType,
    queryFn: async () => {
      let q = supabase
        .from('beneficiaries')
        .select('id, full_name, beneficiary_code, asnaf')
        .eq('is_active', true)
        .order('full_name')
      if (fundType!.is_zakat) {
        q = q.eq('verification_status', 'verified')
        if (fundType!.allowed_asnaf.length) q = q.in('asnaf', fundType!.allowed_asnaf)
      }
      const { data } = await q.limit(200)
      return (data ?? []) as Pick<Beneficiary, 'id' | 'full_name' | 'beneficiary_code' | 'asnaf'>[]
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const value = parseIDR(amount)
      if (value <= 0) throw new Error('Jumlah penyaluran harus lebih dari nol')
      if (fundType?.preserve_principal) {
        throw new Error(`Pokok ${fundType.name} tidak boleh disalurkan`)
      }
      if (!beneficiaryId && !programId) {
        throw new Error('Pilih mustahik atau program penerima')
      }
      const { error } = await supabase.from('distributions').insert({
        fund_type_id: fundTypeId,
        beneficiary_id: beneficiaryId || null,
        program_id: programId || null,
        account_id: accountId,
        amount: value,
        distribution_type: type,
        description: description || null,
        distributed_at: new Date(`${when}T12:00:00+07:00`).toISOString(),
        status: 'requested',
        requested_by: user!.id,
        created_by: user!.id,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['distributions'] })
      setAmount('')
      setDescription('')
      setBeneficiaryId('')
      onClose()
    },
  })

  const selectableFundTypes = fundTypes?.filter((f) => !f.preserve_principal) ?? []

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajukan penyaluran"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Ajukan
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field
          label="Sumber dana"
          required
          hint="Wakaf uang tidak tersedia: pokoknya wajib dipertahankan"
        >
          <Select
            value={fundTypeId}
            onChange={(e) => {
              setFundTypeId(e.target.value)
              setBeneficiaryId('')
            }}
          >
            <option value="">— pilih —</option>
            {selectableFundTypes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Mustahik"
          required={fundType?.is_zakat}
          hint={
            fundType?.is_zakat
              ? 'Hanya mustahik terverifikasi dengan asnaf yang berhak atas dana ini'
              : 'Boleh dikosongkan untuk penyaluran kolektif melalui program'
          }
        >
          <Select
            value={beneficiaryId}
            disabled={!fundTypeId}
            onChange={(e) => setBeneficiaryId(e.target.value)}
          >
            <option value="">— tanpa mustahik perorangan —</option>
            {beneficiaries?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.full_name} · {asnafLabels[b.asnaf]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Program">
          <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">— tanpa program —</option>
            {programs
              ?.filter((p) => p.status === 'active')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </Field>

        <Field label="Jumlah" required>
          <Input
            inputMode="numeric"
            value={amount}
            className="text-lg font-semibold"
            onChange={(e) => setAmount(maskIDR(e.target.value))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Bentuk" required>
            <Select value={type} onChange={(e) => setType(e.target.value as DistributionType)}>
              {Object.entries(distributionTypeLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tanggal" required>
            <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        </div>

        <Field label="Rekening sumber" required>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">— pilih —</option>
            {accounts
              ?.filter((a) => a.is_active)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
        </Field>

        <Field label="Keterangan">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <ErrorNote error={save.error} />
        <p className="text-xs text-slate-500">
          Saldo dana diperiksa saat persetujuan; pengajuan yang melebihi saldo akan ditolak.
        </p>
      </div>
    </Modal>
  )
}

function DisburseDialog({ row, onClose }: { row: DistributionRow | null; onClose: () => void }) {
  const [proof, setProof] = useState<File | null>(null)
  const [signature, setSignature] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const disburse = useRpc<{
    p_id: string
    p_proof_url: string | null
    p_signature_url: string | null
  }>('rpc_disburse_distribution', ['distributions'])

  if (!row) return null

  const submit = async () => {
    setError(null)
    try {
      const proofPath = proof ? await uploadProof('distribution-proofs', proof) : null
      const sigPath = signature ? await uploadProof('distribution-proofs', signature) : null
      await disburse.mutateAsync({
        p_id: row.id,
        p_proof_url: proofPath,
        p_signature_url: sigPath,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyerahkan')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Serahkan ${row.ref_no}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button disabled={disburse.isPending} onClick={submit}>
            Tandai tersalurkan
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">
          {row.beneficiary_name ?? row.program_name} — <strong>{formatIDR(row.amount)}</strong>
        </p>
        <Field label="Foto penyerahan" hint="Diambil saat penyerahan di lapangan">
          <Input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setProof(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="Tanda tangan penerima">
          <Input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setSignature(e.target.files?.[0] ?? null)}
          />
        </Field>
        <ErrorNote error={error ?? disburse.error} />
      </div>
    </Modal>
  )
}
