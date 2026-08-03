import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useAccounts, useFundTypes } from '@/lib/queries'
import { readSheet } from '@/lib/export'
import { PageHeader } from '@/components/AppShell'
import { Badge, Button, Card, ErrorNote, Field, Input, Select } from '@/components/ui'
import { formatIDR } from '@/lib/format'
import { matchTransferCode, useDonationCodes } from '@/lib/transferCode'
import type { PaymentMethod } from '@/types/db'

/** Columns we need out of a bank statement export. */
const TARGET_FIELDS = ['donated_at', 'amount', 'payment_ref', 'donor_name', 'notes'] as const
type TargetField = (typeof TARGET_FIELDS)[number]

const FIELD_LABELS: Record<TargetField, string> = {
  donated_at: 'Tanggal', amount: 'Jumlah', payment_ref: 'Referensi / No. transaksi',
  donor_name: 'Nama pengirim', notes: 'Keterangan',
}

interface Staged {
  donated_at: string
  amount: number
  payment_ref: string | null
  donor_name: string | null
  notes: string | null
  duplicate: boolean
  /** Resolved from the trailing 3 digits of the amount, when they match a code. */
  code: string | null
  code_name: string | null
  fund_type_id: string | null
  program_id: string | null
  error?: string
}

/**
 * Bulk import of a bank statement batch. Nothing is written until the operator
 * has seen the mapped preview; rows whose payment_ref already exists are
 * flagged and skipped, since that reference is the dedup key in the database.
 *
 * Each row is attributed by the transfer code in the last three digits of its
 * amount — that code is the donor's only way of saying which programme they
 * meant. Rows without a recognised code fall back to the destination the
 * operator picks below, which is why that fallback is still required.
 */
export function DonationImportPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: fundTypes } = useFundTypes()
  const { data: accounts } = useAccounts()
  const { data: codes } = useDonationCodes()

  const [raw, setRaw] = useState<Record<string, unknown>[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [mapping, setMapping] = useState<Partial<Record<TargetField, string>>>({})
  const [fundTypeId, setFundTypeId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('transfer')
  const [staged, setStaged] = useState<Staged[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File) => {
    setError(null); setStaged(null)
    try {
      const rows = await readSheet(file)
      setRaw(rows)
      const cols = Object.keys(rows[0] ?? {})
      setColumns(cols)
      // best-effort auto-map on common Indonesian bank export headers
      const guess = (patterns: RegExp) => cols.find((c) => patterns.test(c.toLowerCase()))
      setMapping({
        donated_at: guess(/tanggal|date|tgl/),
        amount: guess(/jumlah|amount|kredit|nominal/),
        payment_ref: guess(/ref|transaksi|trx|no\./),
        donor_name: guess(/nama|pengirim|sender|uraian/),
        notes: guess(/keterangan|berita|remark/),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Berkas tidak terbaca')
    }
  }

  const buildPreview = async () => {
    setError(null)
    if (!mapping.amount || !mapping.donated_at) {
      setError('Kolom tanggal dan jumlah wajib dipetakan')
      return
    }
    const rows: Staged[] = raw.map((r) => {
      const amount = Number(String(r[mapping.amount!] ?? '').replace(/[^\d.-]/g, ''))
      const rawDate = r[mapping.donated_at!]
      const date = rawDate instanceof Date ? rawDate : new Date(String(rawDate))
      const match = matchTransferCode(amount, codes)
      return {
        donated_at: Number.isNaN(date.getTime()) ? '' : date.toISOString(),
        amount,
        payment_ref: mapping.payment_ref ? String(r[mapping.payment_ref] ?? '') || null : null,
        donor_name: mapping.donor_name ? String(r[mapping.donor_name] ?? '') || null : null,
        notes: mapping.notes ? String(r[mapping.notes] ?? '') || null : null,
        duplicate: false,
        code: match?.code ?? null,
        code_name: match?.name ?? null,
        fund_type_id: match?.fund_type_id ?? null,
        program_id: match?.program_id ?? null,
        error: !amount || amount <= 0 ? 'Jumlah tidak valid'
          : Number.isNaN(date.getTime()) ? 'Tanggal tidak valid' : undefined,
      }
    })

    const refs = rows.map((r) => r.payment_ref).filter(Boolean) as string[]
    if (refs.length) {
      const { data } = await supabase.from('donations')
        .select('payment_ref').in('payment_ref', refs).neq('status', 'voided')
      const existing = new Set((data ?? []).map((d) => d.payment_ref))
      rows.forEach((r) => { r.duplicate = !!r.payment_ref && existing.has(r.payment_ref) })
    }
    setStaged(rows)
  }

  const importable = staged?.filter((r) => !r.error && !r.duplicate) ?? []

  const commit = useMutation({
    mutationFn: async () => {
      if (!fundTypeId || !accountId) throw new Error('Pilih jenis dana dan rekening tujuan')
      const payload = importable.map((r) => ({
        is_anonymous: true,
        // the donor's own code wins over the operator's fallback
        fund_type_id: r.fund_type_id ?? fundTypeId,
        program_id: r.program_id,
        account_id: accountId,
        amount: r.amount,
        payment_method: method,
        payment_ref: r.payment_ref,
        donated_at: r.donated_at,
        status: 'pending' as const,
        notes: [r.donor_name, r.notes, r.code ? `kode ${r.code}` : null]
          .filter(Boolean).join(' — ') || null,
        created_by: user!.id,
      }))
      const { error } = await supabase.from('donations').insert(payload)
      if (error) throw new Error(error.message)
      return payload.length
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['donations'] })
      setStaged(null); setRaw([]); setColumns([])
    },
  })

  return (
    <>
      <PageHeader
        title="Impor mutasi bank"
        subtitle="Baris masuk sebagai donasi anonim berstatus menunggu verifikasi, untuk dicocokkan bendahara"
      />

      <div className="space-y-4">
        <Card>
          <Field label="Berkas CSV atau XLSX" hint="Baris pertama dianggap sebagai judul kolom">
            <Input type="file" accept=".csv,.xlsx,.xls"
                   onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </Field>
          <ErrorNote error={error} />
        </Card>

        {columns.length > 0 && (
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Pemetaan kolom</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TARGET_FIELDS.map((field) => (
                <Field key={field} label={FIELD_LABELS[field]}
                       required={field === 'amount' || field === 'donated_at'}>
                  <Select
                    value={mapping[field] ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value || undefined }))}
                  >
                    <option value="">— tidak dipakai —</option>
                    {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Jenis dana bila kode tidak dikenali" required
                     hint="Dipakai hanya untuk baris tanpa kode yang cocok">
                <Select value={fundTypeId} onChange={(e) => setFundTypeId(e.target.value)}>
                  <option value="">— pilih —</option>
                  {fundTypes?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </Field>
              <Field label="Rekening tujuan" required>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">— pilih —</option>
                  {accounts?.filter((a) => a.is_active)
                    .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
              <Field label="Metode">
                <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  <option value="transfer">Transfer</option>
                  <option value="qris">QRIS</option>
                  <option value="ewallet">E-Wallet</option>
                </Select>
              </Field>
            </div>

            <Button className="mt-4" onClick={buildPreview}>Pratinjau {raw.length} baris</Button>
          </Card>
        )}

        {staged && (
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge tone="success">{importable.length} siap diimpor</Badge>
                <Badge tone="info">
                  {staged.filter((r) => r.code).length} terbaca dari kode
                </Badge>
                <Badge tone="warning">{staged.filter((r) => r.duplicate).length} duplikat</Badge>
                <Badge tone="danger">{staged.filter((r) => r.error).length} bermasalah</Badge>
              </div>
              <Button disabled={importable.length === 0 || commit.isPending}
                      onClick={() => commit.mutate()}>
                {commit.isPending ? 'Mengimpor…' : `Impor ${importable.length} baris`}
              </Button>
            </div>

            <ErrorNote error={commit.error} />

            <div className="table-wrap max-h-96 overflow-y-auto">
              <table className="tbl">
                <thead>
                  <tr><th>Tanggal</th><th className="num">Jumlah</th><th>Kode / tujuan</th>
                      <th>Referensi</th><th>Pengirim</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {staged.map((r, i) => (
                    <tr key={i} className={r.error || r.duplicate ? 'opacity-60' : ''}>
                      <td>{r.donated_at ? r.donated_at.slice(0, 10) : '—'}</td>
                      <td className="num">{formatIDR(r.amount)}</td>
                      <td>
                        {r.code
                          ? <><span className="font-mono text-xs">{r.code}</span>
                              <span className="ml-1">{r.code_name}</span></>
                          : <span className="text-slate-400">sedekah umum</span>}
                      </td>
                      <td className="font-mono text-xs">{r.payment_ref ?? '—'}</td>
                      <td className="max-w-[200px] truncate">{r.donor_name ?? '—'}</td>
                      <td>
                        {r.error ? <Badge tone="danger">{r.error}</Badge>
                          : r.duplicate ? <Badge tone="warning">Sudah ada</Badge>
                          : <Badge tone="success">Siap</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
