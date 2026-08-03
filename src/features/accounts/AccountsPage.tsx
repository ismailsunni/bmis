import { useState } from 'react'
import { Plus, Lock } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { can } from '@/auth/permissions'
import { useAccounts, useRpc } from '@/lib/queries'
import { PageHeader } from '@/components/AppShell'
import {
  Badge,
  Button,
  Card,
  CardTitle,
  ErrorNote,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
} from '@/components/ui'
import { formatDate, formatIDR, maskIDR, parseIDR } from '@/lib/format'
import type { AccountType } from '@/types/db'

const accountTypeLabels: Record<AccountType, string> = {
  cash: 'Kas tunai',
  bank: 'Rekening bank',
  ewallet: 'Dompet digital',
}

export function AccountsPage() {
  const { role } = useAuth()
  const [open, setOpen] = useState(false)
  const [lockOpen, setLockOpen] = useState(false)
  const { data: accounts, isLoading, error } = useAccounts()

  const { data: locks } = useQuery({
    queryKey: ['period_locks'],
    queryFn: async () => {
      const { data } = await supabase
        .from('period_locks')
        .select('*')
        .order('period', { ascending: false })
        .limit(12)
      return (data ?? []) as { period: string; locked_at: string; note: string | null }[]
    },
  })

  return (
    <>
      <PageHeader
        title="Kas & Bank"
        action={
          <>
            {can.lockPeriod(role) && (
              <Button size="sm" variant="secondary" onClick={() => setLockOpen(true)}>
                <Lock size={16} /> Tutup periode
              </Button>
            )}
            {can.manageAccounts(role) && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus size={16} /> Rekening baru
              </Button>
            )}
          </>
        }
      />

      <ErrorNote error={error} />
      {isLoading && <Spinner />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {accounts?.map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{a.name}</h3>
                  <p className="text-sm text-slate-500">
                    {accountTypeLabels[a.type]}
                    {a.bank_name && ` · ${a.bank_name}`}
                    {a.account_number && ` · ${a.account_number}`}
                  </p>
                </div>
                {!a.is_active && <Badge tone="neutral">Nonaktif</Badge>}
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Saldo awal{' '}
                <span className="tabular-nums font-medium text-slate-700 dark:text-slate-200">
                  {formatIDR(a.opening_balance)}
                </span>
              </p>
            </Card>
          ))}
        </div>

        <Card>
          <CardTitle>Periode terkunci</CardTitle>
          <p className="mb-2 text-xs text-slate-500">
            Setelah dikunci, tidak ada entri baru pada periode itu kecuali oleh ketua.
          </p>
          {locks?.length ? (
            <ul className="space-y-1 text-sm">
              {locks.map((l) => (
                <li key={l.period} className="flex justify-between gap-2">
                  <span className="font-medium">{l.period}</span>
                  <span className="text-xs text-slate-500">{formatDate(l.locked_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Belum ada periode yang dikunci.</p>
          )}
        </Card>
      </div>

      <AccountForm open={open} onClose={() => setOpen(false)} />
      <LockPeriodDialog open={lockOpen} onClose={() => setLockOpen(false)} />
    </>
  )
}

function AccountForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    type: 'bank' as AccountType,
    bank_name: '',
    account_number: '',
    opening_balance: '',
  })

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('accounts').insert({
        name: form.name,
        type: form.type,
        bank_name: form.bank_name || null,
        account_number: form.account_number || null,
        opening_balance: parseIDR(form.opening_balance),
        created_by: user!.id,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      onClose()
    },
  })

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rekening baru"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button disabled={!form.name || save.isPending} onClick={() => save.mutate()}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nama" required>
          <Input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="mis. BSI Zakat"
          />
        </Field>
        <Field label="Jenis" required>
          <Select value={form.type} onChange={(e) => set({ type: e.target.value as AccountType })}>
            {Object.entries(accountTypeLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {form.type !== 'cash' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nama bank / penyedia">
              <Input value={form.bank_name} onChange={(e) => set({ bank_name: e.target.value })} />
            </Field>
            <Field label="Nomor rekening">
              <Input
                value={form.account_number}
                onChange={(e) => set({ account_number: e.target.value })}
              />
            </Field>
          </div>
        )}
        <Field label="Saldo awal">
          <Input
            inputMode="numeric"
            value={form.opening_balance}
            onChange={(e) => set({ opening_balance: maskIDR(e.target.value) })}
          />
        </Field>
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  )
}

function LockPeriodDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [note, setNote] = useState('')
  const lock = useRpc<{ p_period: string; p_note: string | null }>('rpc_lock_period', [
    'period_locks',
  ])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tutup periode"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            disabled={lock.isPending}
            onClick={async () => {
              await lock.mutateAsync({ p_period: period, p_note: note || null })
              onClose()
            }}
          >
            Kunci periode
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          Setelah periode dikunci, donasi dan penyaluran dengan tanggal dalam periode tersebut tidak
          dapat ditambah atau diubah, kecuali oleh ketua.
        </p>
        <Field label="Periode" required>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
        <Field label="Catatan">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="mis. tutup buku Agustus"
          />
        </Field>
        <ErrorNote error={lock.error} />
      </div>
    </Modal>
  )
}
