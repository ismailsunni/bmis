import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProfiles } from '@/lib/queries'
import { PageHeader } from '@/components/AppShell'
import { Pagination } from '@/components/Pagination'
import { Badge, Card, EmptyState, ErrorNote, Input, Modal, Select, Spinner } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { roleLabels } from '@/lib/labels'
import type { AuditEntry, UserRole } from '@/types/db'

const TABLES = [
  'donations', 'distributions', 'donors', 'beneficiaries', 'programs',
  'accounts', 'profiles', 'settings', 'period_locks', 'fund_types',
]

const actionTone = { INSERT: 'success', UPDATE: 'info', DELETE: 'danger' } as const

export function AuditLogPage() {
  const [filters, setFilters] = useState({ table: '', actor: '', action: '', from: '' })
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<AuditEntry | null>(null)
  const { data: profiles } = useProfiles()

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', filters, page],
    queryFn: async () => {
      let q = supabase.from('audit_log')
        .select('*', { count: 'exact' })
        .order('id', { ascending: false })
        .range(page * 50, page * 50 + 49)
      if (filters.table) q = q.eq('table_name', filters.table)
      if (filters.actor) q = q.eq('actor_id', filters.actor)
      if (filters.action) q = q.eq('action', filters.action)
      if (filters.from) q = q.gte('created_at', filters.from)
      const { data, error, count } = await q
      if (error) throw new Error(error.message)
      return { rows: (data ?? []) as AuditEntry[], count: count ?? 0 }
    },
  })

  const set = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(0)
  }

  const nameOf = (id: string | null) =>
    profiles?.find((p) => p.id === id)?.full_name ?? id?.slice(0, 8) ?? 'sistem'

  return (
    <>
      <PageHeader
        title="Log audit"
        subtitle="Catatan hanya bisa ditambah — tidak ada peran yang dapat mengubah atau menghapusnya"
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={filters.table} onChange={(e) => set({ table: e.target.value })}>
          <option value="">Semua tabel</option>
          {TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select value={filters.actor} onChange={(e) => set({ actor: e.target.value })}>
          <option value="">Semua pengguna</option>
          {profiles?.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
        </Select>
        <Select value={filters.action} onChange={(e) => set({ action: e.target.value })}>
          <option value="">Semua aksi</option>
          <option value="INSERT">Tambah</option>
          <option value="UPDATE">Ubah</option>
          <option value="DELETE">Hapus</option>
        </Select>
        <Input type="date" aria-label="Sejak" onChange={(e) => set({ from: e.target.value })} />
      </div>

      <ErrorNote error={error} />
      {isLoading && <Spinner />}

      {data && (data.rows.length === 0 ? (
        <EmptyState title="Tidak ada catatan yang cocok" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Waktu</th><th>Pelaku</th><th>Peran</th><th>Tabel</th>
                    <th>Aksi</th><th>Alasan</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                    <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                    <td>{nameOf(r.actor_id)}</td>
                    <td className="text-xs text-slate-500">
                      {r.actor_role ? roleLabels[r.actor_role as UserRole] ?? r.actor_role : '—'}
                    </td>
                    <td className="font-mono text-xs">{r.table_name}</td>
                    <td><Badge tone={actionTone[r.action]}>{r.action}</Badge></td>
                    <td className="max-w-[240px] truncate">{r.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={data.count} onChange={setPage} />
        </>
      ))}

      {detail && <DiffView entry={detail} onClose={() => setDetail(null)} />}
    </>
  )
}

/** Only the fields that actually changed — a full row dump hides the edit. */
function DiffView({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const before = entry.old_value ?? {}
  const after = entry.new_value ?? {}
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))

  const show = (v: unknown) =>
    v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)

  return (
    <Modal open onClose={onClose} title={`${entry.action} pada ${entry.table_name}`}>
      <div className="space-y-3 text-sm">
        {entry.reason && (
          <Card className="bg-slate-50 dark:bg-slate-900">
            <p className="text-xs text-slate-500">Alasan</p>
            <p>{entry.reason}</p>
          </Card>
        )}
        {keys.length === 0 ? (
          <p className="text-slate-400">Tidak ada perubahan nilai.</p>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Kolom</th><th>Sebelum</th><th>Sesudah</th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k}>
                    <td className="font-mono text-xs">{k}</td>
                    <td className="text-red-700 dark:text-red-400">{show(before[k])}</td>
                    <td className="text-emerald-700 dark:text-emerald-400">{show(after[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}
