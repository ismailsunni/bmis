import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProfiles } from '@/lib/queries'
import { PageHeader } from '@/components/AppShell'
import {
  Badge, Button, ErrorNote, Field, Input, Modal, Select, Spinner,
} from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { roleLabels } from '@/lib/labels'
import type { UserRole } from '@/types/db'

export function UsersPage() {
  const { data: profiles, isLoading, error } = useProfiles()
  const [inviteOpen, setInviteOpen] = useState(false)
  const qc = useQueryClient()

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })

  const resetPassword = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) throw new Error(error.message)
    },
  })

  return (
    <>
      <PageHeader
        title="Pengguna"
        subtitle="Peran menentukan akses di tingkat basis data, bukan hanya tampilan"
        action={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus size={16} /> Undang pengguna
          </Button>
        }
      />

      <ErrorNote error={error ?? update.error ?? resetPassword.error} />
      {isLoading && <Spinner />}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Nama</th><th>Email</th><th>Peran</th><th>Status</th>
                <th>Terakhir masuk</th><th /></tr>
          </thead>
          <tbody>
            {profiles?.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.full_name || '—'}</td>
                <td>{p.email}</td>
                <td>
                  <Select
                    className="h-9 w-auto"
                    value={p.role}
                    onChange={(e) => update.mutate({
                      id: p.id, patch: { role: e.target.value as UserRole },
                    })}
                  >
                    {Object.entries(roleLabels).map(([k, v]) =>
                      <option key={k} value={k}>{v}</option>)}
                  </Select>
                </td>
                <td>
                  <Badge tone={p.is_active ? 'success' : 'neutral'}>
                    {p.is_active ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </td>
                <td className="whitespace-nowrap text-xs text-slate-500">
                  {p.last_login_at ? formatDateTime(p.last_login_at) : 'belum pernah'}
                </td>
                <td className="whitespace-nowrap">
                  <Button size="sm" variant="ghost"
                          onClick={() => update.mutate({
                            id: p.id, patch: { is_active: !p.is_active },
                          })}>
                    {p.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                  </Button>
                  {p.email && (
                    <Button size="sm" variant="ghost"
                            onClick={() => resetPassword.mutate(p.email!)}>
                      Reset sandi
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Peran baru berlaku setelah pengguna masuk kembali — peran dibawa di dalam token sesi.
      </p>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  )
}

/**
 * Inviting needs the service role, which must never exist in the browser, so
 * this posts to the invite-user Edge Function instead of calling auth.admin.
 */
function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('amil')

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email, full_name: fullName, role },
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      setEmail(''); setFullName('')
      onClose()
    },
  })

  return (
    <Modal
      open={open} onClose={onClose} title="Undang pengguna"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button disabled={!email || invite.isPending} onClick={() => invite.mutate()}>
            {invite.isPending ? 'Mengirim…' : 'Kirim undangan'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Nama lengkap">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Peran" required>
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <ErrorNote error={invite.error} />
        <p className="text-xs text-slate-500">
          Peran ketua dan bendahara wajib mengaktifkan autentikasi dua faktor.
        </p>
      </div>
    </Modal>
  )
}
