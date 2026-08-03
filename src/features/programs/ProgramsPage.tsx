import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { can } from '@/auth/permissions'
import { useFundTypes, usePrograms } from '@/lib/queries'
import { PageHeader } from '@/components/AppShell'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui'
import { formatDate, formatIDR, maskIDR, parseIDR } from '@/lib/format'
import { programStatusLabels } from '@/lib/labels'
import type { ProgramStatus } from '@/types/db'

export function ProgramsPage() {
  const { role } = useAuth()
  const [open, setOpen] = useState(false)
  const { data: programs, isLoading, error } = usePrograms()

  // Per-program P&L: collected in, disbursed out. One query for all programs.
  const { data: totals } = useQuery({
    queryKey: ['program-totals'],
    queryFn: async () => {
      const [don, dis] = await Promise.all([
        supabase.from('donations').select('program_id, amount').eq('status', 'verified'),
        supabase.from('distributions').select('program_id, amount').eq('status', 'disbursed'),
      ])
      const agg = new Map<string, { collected: number; distributed: number }>()
      const bump = (key: string | null, field: 'collected' | 'distributed', value: number) => {
        if (!key) return
        const row = agg.get(key) ?? { collected: 0, distributed: 0 }
        row[field] += Number(value)
        agg.set(key, row)
      }
      don.data?.forEach((d) => bump(d.program_id, 'collected', d.amount))
      dis.data?.forEach((d) => bump(d.program_id, 'distributed', d.amount))
      return agg
    },
  })

  return (
    <>
      <PageHeader
        title="Program"
        action={
          can.managePrograms(role) && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus size={16} /> Program baru
            </Button>
          )
        }
      />

      <ErrorNote error={error} />
      {isLoading && <Spinner />}
      {programs?.length === 0 && <EmptyState title="Belum ada program" />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {programs?.map((p) => {
          const t = totals?.get(p.id) ?? { collected: 0, distributed: 0 }
          const pct = p.target_amount > 0 ? Math.round((t.collected / p.target_amount) * 100) : null
          const overdue =
            p.end_date &&
            new Date(p.end_date) < new Date() &&
            p.status === 'active' &&
            (pct ?? 100) < 100

          return (
            <Card key={p.id}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.code && (
                    <p className="text-xs text-slate-500">
                      Kode transfer <span className="font-mono">{p.code}</span>
                    </p>
                  )}
                </div>
                <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>
                  {programStatusLabels[p.status]}
                </Badge>
              </div>
              {p.description && (
                <p className="mb-3 line-clamp-2 text-sm text-slate-500">{p.description}</p>
              )}

              {pct != null && (
                <>
                  <div className="mb-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-brand-600"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <p className="mb-2 text-xs text-slate-500">
                    {pct}% dari target {formatIDR(p.target_amount)}
                  </p>
                </>
              )}

              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Terkumpul</dt>
                  <dd className="tabular-nums font-medium">{formatIDR(t.collected)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Tersalurkan</dt>
                  <dd className="tabular-nums font-medium">{formatIDR(t.distributed)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-1 dark:border-slate-700">
                  <dt className="text-slate-500">Sisa</dt>
                  <dd className="tabular-nums font-semibold">
                    {formatIDR(t.collected - t.distributed)}
                  </dd>
                </div>
              </dl>

              {p.end_date && (
                <p className={`mt-2 text-xs ${overdue ? 'text-amber-600' : 'text-slate-400'}`}>
                  Berakhir {formatDate(p.end_date)}
                  {overdue ? ' — target belum tercapai' : ''}
                </p>
              )}
            </Card>
          )
        })}
      </div>

      <ProgramForm open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function ProgramForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: fundTypes } = useFundTypes()
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    fund_type_id: '',
    target_amount: '',
    start_date: '',
    end_date: '',
    status: 'active' as ProgramStatus,
  })

  const save = useMutation({
    mutationFn: async () => {
      const slug = form.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      if (form.code && !/^\d{3}$/.test(form.code)) {
        throw new Error('Kode transfer harus tepat 3 angka')
      }
      const { error } = await supabase.from('programs').insert({
        name: form.name,
        code: form.code || null,
        slug: `${slug}-${Date.now().toString(36)}`,
        description: form.description || null,
        fund_type_id: form.fund_type_id || null,
        target_amount: parseIDR(form.target_amount),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
        created_by: user!.id,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programs'] })
      onClose()
    },
  })

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Program baru"
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
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Nama program" required>
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
          </div>
          <Field label="Kode transfer" hint="3 angka, disisipkan donatur di akhir nominal">
            <Input
              inputMode="numeric"
              maxLength={3}
              placeholder="153"
              value={form.code}
              onChange={(e) => set({ code: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
        </div>
        <Field label="Deskripsi">
          <Textarea
            rows={2}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jenis dana">
            <Select
              value={form.fund_type_id}
              onChange={(e) => set({ fund_type_id: e.target.value })}
            >
              <option value="">— semua —</option>
              {fundTypes?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Target">
            <Input
              inputMode="numeric"
              value={form.target_amount}
              onChange={(e) => set({ target_amount: maskIDR(e.target.value) })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mulai">
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => set({ start_date: e.target.value })}
            />
          </Field>
          <Field label="Berakhir">
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => set({ end_date: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Status">
          <Select
            value={form.status}
            onChange={(e) => set({ status: e.target.value as ProgramStatus })}
          >
            {Object.entries(programStatusLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  )
}
