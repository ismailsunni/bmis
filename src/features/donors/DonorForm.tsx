import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { friendlyDbError } from '@/lib/dbError'
import { donorTypeLabels } from '@/lib/labels'
import { Button, ErrorNote, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import type { Donor, DonorType } from '@/types/db'

interface Fields {
  full_name: string
  donor_type: DonorType
  nik: string
  npwp: string
  phone: string
  email: string
  address: string
  city: string
  province: string
  is_recurring: boolean
  notes: string
  tags: string
}

const EMPTY: Fields = {
  full_name: '',
  donor_type: 'individual',
  nik: '',
  npwp: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  province: '',
  is_recurring: false,
  notes: '',
  tags: '',
}

const fromDonor = (d: Donor): Fields => ({
  full_name: d.full_name ?? '',
  donor_type: d.donor_type,
  nik: d.nik ?? '',
  npwp: d.npwp ?? '',
  phone: d.phone ?? '',
  email: d.email ?? '',
  address: d.address ?? '',
  city: d.city ?? '',
  province: d.province ?? '',
  is_recurring: d.is_recurring,
  notes: d.notes ?? '',
  tags: d.tags.join(', '),
})

/**
 * One form for creating and editing a donor.
 *
 * `donor_code` is deliberately absent: it is allocated by the database and
 * printed on receipts already issued, so it is not the operator's to change.
 * Which users may edit which donors is decided by the donors_update policy —
 * this form only decides what to render.
 */
export function DonorForm({
  open,
  onClose,
  donor,
}: {
  open: boolean
  onClose: () => void
  /** Present when editing; absent when creating. */
  donor?: Donor | null
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [form, setForm] = useState<Fields>(EMPTY)
  const editing = Boolean(donor)

  // Reload whenever a different donor is opened, so the form never shows the
  // previous one's values.
  useEffect(() => {
    setForm(donor ? fromDonor(donor) : EMPTY)
  }, [donor, open])

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: form.full_name.trim(),
        donor_type: form.donor_type,
        nik: form.nik.trim() || null,
        npwp: form.npwp.trim() || null,
        phone: form.phone.replace(/\s+/g, '') || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        province: form.province.trim() || null,
        is_recurring: form.is_recurring,
        notes: form.notes.trim() || null,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }

      const { error } = donor
        ? await supabase.from('donors').update(payload).eq('id', donor.id)
        : await supabase.from('donors').insert({ ...payload, created_by: user!.id })

      if (error) throw new Error(friendlyDbError(error.message))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['donors'] })
      qc.invalidateQueries({ queryKey: ['donor'] })
      qc.invalidateQueries({ queryKey: ['donor-statement'] })
      onClose()
    },
  })

  const set = (patch: Partial<Fields>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Ubah data ${donor?.donor_code ?? 'donatur'}` : 'Donatur baru'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.full_name.trim()}>
            {save.isPending ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan'}
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
        <Field label="Catatan">
          <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
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

        {editing && (
          <p className="text-xs text-slate-500">
            Kode donatur {donor?.donor_code} tidak dapat diubah, karena sudah tercantum pada
            kwitansi yang terbit. Setiap perubahan tercatat di log audit.
          </p>
        )}

        <ErrorNote error={save.error} />
      </div>
    </Modal>
  )
}
