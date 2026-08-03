import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSettings } from '@/lib/queries'
import { PageHeader } from '@/components/AppShell'
import { Button, Card, CardTitle, ErrorNote, Field, Input, Spinner, Textarea } from '@/components/ui'
import { maskIDR, parseIDR } from '@/lib/format'

export function SettingsPage() {
  const { data, isLoading } = useSettings()
  const qc = useQueryClient()
  const [org, setOrg] = useState({ name: '', address: '', phone: '', email: '', receipt_footer: '' })
  const [zakat, setZakat] = useState({ nisab_gold_gram: '', gold_price_idr: '', amil_share_pct: '' })
  const [target, setTarget] = useState('')
  const [dupDays, setDupDays] = useState('')

  useEffect(() => {
    if (!data) return
    const o = (data.organization ?? {}) as Record<string, string>
    setOrg({
      name: o.name ?? '', address: o.address ?? '', phone: o.phone ?? '',
      email: o.email ?? '', receipt_footer: o.receipt_footer ?? '',
    })
    const z = (data.zakat ?? {}) as Record<string, number>
    setZakat({
      nisab_gold_gram: String(z.nisab_gold_gram ?? ''),
      gold_price_idr: maskIDR(String(z.gold_price_idr ?? '')),
      amil_share_pct: String(z.amil_share_pct ?? ''),
    })
    setTarget(maskIDR(String((data.targets as Record<string, number>)?.annual_target ?? '')))
    setDupDays(String((data.rules as Record<string, number>)?.duplicate_aid_days ?? ''))
  }, [data])

  const save = useMutation({
    mutationFn: async () => {
      const rows = [
        { key: 'organization', value: org },
        {
          key: 'zakat',
          value: {
            nisab_gold_gram: Number(zakat.nisab_gold_gram) || 0,
            gold_price_idr: parseIDR(zakat.gold_price_idr),
            amil_share_pct: Number(zakat.amil_share_pct) || 0,
          },
        },
        { key: 'targets', value: { annual_target: parseIDR(target) } },
        { key: 'rules', value: { duplicate_aid_days: Number(dupDays) || 90 } },
      ]
      const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'key' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  if (isLoading) return <Spinner />

  return (
    <>
      <PageHeader
        title="Pengaturan"
        action={
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Menyimpan…' : 'Simpan'}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Identitas lembaga</CardTitle>
          <div className="space-y-3">
            <Field label="Nama lembaga">
              <Input value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} />
            </Field>
            <Field label="Alamat">
              <Textarea rows={2} value={org.address}
                        onChange={(e) => setOrg({ ...org, address: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telepon">
                <Input value={org.phone} onChange={(e) => setOrg({ ...org, phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={org.email}
                       onChange={(e) => setOrg({ ...org, email: e.target.value })} />
              </Field>
            </div>
            <Field label="Penutup kwitansi" hint="Muncul pada kwitansi WhatsApp dan cetak">
              <Textarea rows={2} value={org.receipt_footer}
                        onChange={(e) => setOrg({ ...org, receipt_footer: e.target.value })} />
            </Field>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle>Parameter zakat</CardTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nisab (gram emas)">
                <Input inputMode="numeric" value={zakat.nisab_gold_gram}
                       onChange={(e) => setZakat({ ...zakat, nisab_gold_gram: e.target.value })} />
              </Field>
              <Field label="Harga emas / gram">
                <Input inputMode="numeric" value={zakat.gold_price_idr}
                       onChange={(e) => setZakat({ ...zakat, gold_price_idr: maskIDR(e.target.value) })} />
              </Field>
              <Field label="Hak amil (%)">
                <Input inputMode="decimal" value={zakat.amil_share_pct}
                       onChange={(e) => setZakat({ ...zakat, amil_share_pct: e.target.value })} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Batas hak amil yang mengikat penyaluran ditegakkan per jenis dana di basis data;
              nilai di sini dipakai untuk perhitungan dan tampilan.
            </p>
          </Card>

          <Card>
            <CardTitle>Target & aturan</CardTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Target penghimpunan tahunan">
                <Input inputMode="numeric" value={target}
                       onChange={(e) => setTarget(maskIDR(e.target.value))} />
              </Field>
              <Field label="Jendela bantuan ganda (hari)"
                     hint="Peringatan bila mustahik menerima dari program sama">
                <Input inputMode="numeric" value={dupDays}
                       onChange={(e) => setDupDays(e.target.value.replace(/\D/g, ''))} />
              </Field>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-4"><ErrorNote error={save.error} /></div>
    </>
  )
}
