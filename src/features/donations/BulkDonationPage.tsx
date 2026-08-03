import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
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
 * Column template shared by the header and every row, so the two stay aligned
 * without a table. Below sm the grid is off entirely and each field stacks.
 */
// Kept as one unbroken literal: Tailwind scans source text, so a class name
// split across concatenated strings is never generated at all.
const GRID_COLS =
  'sm:grid-cols-[2rem_minmax(190px,3fr)_minmax(120px,1.6fr)_minmax(130px,1.8fr)_minmax(130px,1.8fr)_minmax(105px,1.2fr)_minmax(110px,1.2fr)_1.75rem]'

// Phones get two columns so the short fields pair up and a card stays scannable;
// from sm the explicit template takes over and rows align under the header.
const ROW = `grid grid-cols-2 gap-2 sm:items-start ${GRID_COLS}`
const HEADER = `hidden sm:grid sm:gap-2 ${GRID_COLS}`

/** Spans two columns on a phone, one under the desktop template. */
const WIDE = 'col-span-2 sm:col-span-1'

/** Field labels are needed on the card layout and redundant under the header row. */
function Cell({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <span className="mb-1 block text-xs font-medium text-slate-500 sm:hidden">{label}</span>
      {children}
    </div>
  )
}

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

      {/* One markup tree for both layouts: a card stack on phones, aligned
          columns from sm up. Duplicating the rows per breakpoint would mean two
          DonorPickers per line, each with its own query state. */}
      <div className="sm:overflow-x-auto">
        <div className="sm:min-w-[940px]">
          <div
            className={cn(
              HEADER,
              'border-b border-slate-200 pb-1.5 text-xs font-medium text-slate-500 dark:border-slate-700',
            )}
          >
            <span>#</span>
            <span>Donatur</span>
            <span>Jumlah</span>
            <span>Jenis dana</span>
            <span>Program</span>
            <span>Metode</span>
            <span>Referensi</span>
            <span />
          </div>

          <div className="space-y-3 sm:space-y-0">
            {rows.map((row, i) => {
              const problem = problemFor(row.key)
              const match = matchTransferCode(parseIDR(row.amount), codes)
              const matchApplied =
                match &&
                match.fund_type_id === row.fundTypeId &&
                (match.program_id ?? '') === row.programId

              return (
                <div
                  key={row.key}
                  className={cn(
                    ROW,
                    'rounded-xl border p-3 sm:rounded-none sm:border-0 sm:border-b sm:p-0 sm:pb-2 sm:pt-2',
                    problem
                      ? 'border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-900/10'
                      : 'border-slate-200 dark:border-slate-700',
                  )}
                >
                  {/* Card header on phones; a plain row number from sm up. */}
                  <div className={cn(WIDE, 'flex items-center justify-between sm:block')}>
                    <span className="text-sm font-medium text-slate-500 sm:text-xs sm:text-slate-400">
                      <span className="sm:hidden">Baris </span>
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      aria-label={`Hapus baris ${i + 1}`}
                      className="text-slate-400 hover:text-red-600 sm:hidden"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <Cell label="Donatur" className={WIDE}>
                    {row.anonymous ? (
                      <p className="py-2 text-sm text-slate-500">Hamba Allah</p>
                    ) : (
                      <DonorPicker
                        value={row.donorId}
                        onChange={(id) => patch(row.key, { donorId: id })}
                      />
                    )}
                    <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={row.anonymous}
                        onChange={(e) =>
                          patch(row.key, { anonymous: e.target.checked, donorId: null })
                        }
                      />
                      Anonim
                    </label>
                  </Cell>

                  <Cell label="Jumlah" className={WIDE}>
                    <Input
                      inputMode="numeric"
                      placeholder="0"
                      className="text-right text-lg font-semibold sm:text-sm"
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
                  </Cell>

                  <Cell label="Jenis dana">
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
                  </Cell>

                  <Cell label="Program">
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
                  </Cell>

                  <Cell label="Metode">
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
                  </Cell>

                  <Cell label="Referensi">
                    <Input
                      value={row.paymentRef}
                      placeholder="opsional"
                      onChange={(e) => patch(row.key, { paymentRef: e.target.value })}
                    />
                  </Cell>

                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    aria-label={`Hapus baris ${i + 1}`}
                    className="hidden text-slate-400 hover:text-red-600 sm:block sm:pt-2"
                  >
                    <Trash2 size={16} />
                  </button>

                  {problem && (
                    <p className={cn(WIDE, 'text-xs text-red-700 dark:text-red-400 sm:hidden')}>
                      {problem}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="mt-3 hidden space-y-1 text-sm text-red-700 dark:text-red-400 sm:block">
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
