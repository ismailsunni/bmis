import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useAccounts, useFundTypes, usePrograms } from '@/lib/queries'
import { formatIDR, maskIDR, parseIDR, todayJakarta } from '@/lib/format'
import { paymentMethodLabels } from '@/lib/labels'
import { matchTransferCode, useDonationCodes } from '@/lib/transferCode'
import { PageHeader } from '@/components/AppShell'
import { Badge, Button, Card, ErrorNote, Field, Input, Select } from '@/components/ui'
import { DonorPicker } from '@/features/donors/DonorPicker'
import {
  batchTotal,
  blankRow,
  buildPayload,
  filledRows,
  validateRows,
  type BulkDefaults,
  type BulkRow,
} from './bulkEntry'
import type { PaymentMethod } from '@/types/db'

/**
 * Entering many donations at once — a Friday collection, a counted cash box, an
 * event. The file importer covers bank statements; this covers the case where
 * the amil has a stack of slips and a keyboard.
 *
 * Date and account are set once for the batch, because a collection is almost
 * always one day into one account. Everything that genuinely varies per donor
 * stays on the row.
 */
export function BulkDonationPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: fundTypes } = useFundTypes()
  const { data: accounts } = useAccounts()
  const { data: programs } = usePrograms()
  const { data: codes } = useDonationCodes()

  const [defaults, setDefaults] = useState<BulkDefaults>({
    donatedAt: todayJakarta(),
    accountId: '',
    fundTypeId: '',
    method: 'cash',
  })
  const [rows, setRows] = useState<BulkRow[]>([])
  const [saved, setSaved] = useState<{ count: number; total: number } | null>(null)

  // Seed the defaults, then open with a handful of blank lines to type into.
  useEffect(() => {
    if (!fundTypes?.length || !accounts?.length || defaults.fundTypeId) return
    const next: BulkDefaults = {
      ...defaults,
      fundTypeId: fundTypes[0].id,
      accountId: accounts.find((a) => a.is_active)?.id ?? '',
    }
    setDefaults(next)
    setRows(Array.from({ length: 5 }, () => blankRow(next)))
  }, [fundTypes, accounts, defaults])

  const problems = useMemo(() => validateRows(rows, fundTypes ?? []), [rows, fundTypes])
  const problemFor = (key: string) => problems.find((p) => p.key === key)?.message
  const ready = filledRows(rows)
  const total = batchTotal(rows)

  const patch = (key: string, changes: Partial<BulkRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...changes } : r)))

  const addRow = () => setRows((rs) => [...rs, blankRow(defaults)])
  const removeRow = (key: string) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs))

  // Typing in the last row means the operator is still going; keep one spare.
  useEffect(() => {
    const last = rows[rows.length - 1]
    if (last && parseIDR(last.amount) > 0) addRow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const applyFundTypeToAll = () =>
    setRows((rs) => rs.map((r) => ({ ...r, fundTypeId: defaults.fundTypeId })))

  const save = useMutation({
    mutationFn: async () => {
      if (!defaults.accountId) throw new Error('Pilih rekening penerima')
      if (ready.length === 0) throw new Error('Belum ada baris yang diisi')
      if (problems.length > 0) throw new Error('Perbaiki baris yang ditandai terlebih dahulu')

      const payload = buildPayload(rows, defaults, user!.id)
      // One statement, so the batch either lands whole or not at all — no
      // half-entered collection to reconcile afterwards.
      const { error } = await supabase.from('donations').insert(payload)
      if (error) throw new Error(error.message)
      return { count: payload.length, total }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['donations'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setSaved(result)
      setRows(Array.from({ length: 5 }, () => blankRow(defaults)))
    },
  })

  return (
    <>
      <PageHeader
        title="Catat donasi massal"
        subtitle="Semua baris tersimpan menunggu verifikasi, dalam satu kali simpan"
        action={
          <Link to="/donasi">
            <Button variant="secondary" size="sm">
              Kembali ke daftar
            </Button>
          </Link>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tanggal donasi" required>
            <Input
              type="date"
              value={defaults.donatedAt}
              max={todayJakarta()}
              onChange={(e) => setDefaults({ ...defaults, donatedAt: e.target.value })}
            />
          </Field>
          <Field label="Rekening penerima" required>
            <Select
              value={defaults.accountId}
              onChange={(e) => setDefaults({ ...defaults, accountId: e.target.value })}
            >
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
          <Field label="Jenis dana bawaan" hint="Dipakai untuk baris baru">
            <Select
              value={defaults.fundTypeId}
              onChange={(e) => setDefaults({ ...defaults, fundTypeId: e.target.value })}
            >
              {fundTypes?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.transfer_code ? `${f.transfer_code} — ${f.name}` : f.name}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={applyFundTypeToAll}
              className="mt-1 text-xs text-brand-700 hover:underline dark:text-brand-400"
            >
              Terapkan ke semua baris
            </button>
          </Field>
          <Field label="Metode bawaan">
            <Select
              value={defaults.method}
              onChange={(e) =>
                setDefaults({ ...defaults, method: e.target.value as PaymentMethod })
              }
            >
              {Object.entries(paymentMethodLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {saved && (
        <div
          role="status"
          className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-900/25 dark:text-emerald-100"
        >
          {saved.count} donasi tersimpan, total {formatIDR(saved.total)}. Menunggu verifikasi
          bendahara —{' '}
          <Link to="/donasi" className="underline">
            lihat daftar donasi
          </Link>
          .
        </div>
      )}

      <div className="table-wrap">
        <table className="tbl min-w-[1000px]">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th className="min-w-[220px]">Donatur</th>
              <th className="min-w-[140px]">Jumlah</th>
              <th className="min-w-[160px]">Jenis dana</th>
              <th className="min-w-[150px]">Program</th>
              <th className="min-w-[110px]">Metode</th>
              <th className="min-w-[120px]">Referensi</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const problem = problemFor(row.key)
              const match = matchTransferCode(parseIDR(row.amount), codes)
              const matchApplied =
                match &&
                match.fund_type_id === row.fundTypeId &&
                (match.program_id ?? '') === row.programId

              return (
                <tr key={row.key} className={problem ? 'bg-red-50/60 dark:bg-red-900/10' : ''}>
                  <td className="text-xs text-slate-400">{i + 1}</td>

                  <td>
                    {row.anonymous ? (
                      <span className="text-sm text-slate-500">Hamba Allah</span>
                    ) : (
                      <DonorPicker
                        value={row.donorId}
                        onChange={(id) => patch(row.key, { donorId: id })}
                      />
                    )}
                    <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={row.anonymous}
                        onChange={(e) =>
                          patch(row.key, { anonymous: e.target.checked, donorId: null })
                        }
                      />
                      Anonim
                    </label>
                  </td>

                  <td>
                    <Input
                      inputMode="numeric"
                      placeholder="0"
                      className="text-right font-medium"
                      value={row.amount}
                      onChange={(e) => patch(row.key, { amount: maskIDR(e.target.value) })}
                    />
                    {match && !matchApplied && (
                      <button
                        type="button"
                        onClick={() =>
                          patch(row.key, {
                            fundTypeId: match.fund_type_id,
                            programId: match.program_id ?? '',
                          })
                        }
                        className="mt-1 text-left text-xs text-brand-700 hover:underline dark:text-brand-400"
                      >
                        kode {match.code} → {match.name}
                      </button>
                    )}
                  </td>

                  <td>
                    <Select
                      value={row.fundTypeId}
                      onChange={(e) => patch(row.key, { fundTypeId: e.target.value })}
                    >
                      {fundTypes?.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </Select>
                  </td>

                  <td>
                    <Select
                      value={row.programId}
                      onChange={(e) => patch(row.key, { programId: e.target.value })}
                    >
                      <option value="">— tanpa program —</option>
                      {programs
                        ?.filter((p) => p.status === 'active')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code ? `${p.code} — ${p.name}` : p.name}
                          </option>
                        ))}
                    </Select>
                  </td>

                  <td>
                    <Select
                      value={row.method}
                      onChange={(e) => patch(row.key, { method: e.target.value as PaymentMethod })}
                    >
                      {Object.entries(paymentMethodLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </td>

                  <td>
                    <Input
                      value={row.paymentRef}
                      placeholder="opsional"
                      onChange={(e) => patch(row.key, { paymentRef: e.target.value })}
                    />
                  </td>

                  <td>
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      aria-label={`Hapus baris ${i + 1}`}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {problems.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-red-700 dark:text-red-400">
          {problems.map((p, i) => {
            const index = rows.findIndex((r) => r.key === p.key) + 1
            return (
              <li key={i}>
                Baris {index}: {p.message}
              </li>
            )
          })}
        </ul>
      )}

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={addRow}>
            <Plus size={16} /> Tambah baris
          </Button>
          <span className="text-sm text-slate-500">
            <Badge tone={ready.length > 0 ? 'info' : 'neutral'}>{ready.length} baris</Badge>{' '}
            <strong className="ml-1 tabular-nums text-slate-800 dark:text-slate-100">
              {formatIDR(total)}
            </strong>
          </span>
        </div>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || ready.length === 0 || problems.length > 0}
        >
          {save.isPending ? 'Menyimpan…' : `Simpan ${ready.length} donasi`}
        </Button>
      </div>

      <div className="mt-3">
        <ErrorNote error={save.error} />
      </div>
    </>
  )
}
