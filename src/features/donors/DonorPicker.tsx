import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Input } from '@/components/ui'
import type { Donor } from '@/types/db'

/**
 * Searchable donor field with inline create — the "create new" step is what
 * keeps a first-time donor from breaking the sub-45-second entry flow.
 */
export function DonorPicker({
  value, onChange,
}: { value: string | null; onChange: (id: string | null) => void }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 250)
    return () => clearTimeout(t)
  }, [term])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const { data: selected } = useQuery({
    queryKey: ['donor', value],
    enabled: !!value,
    queryFn: async () => {
      const { data } = await supabase.from('donors').select('*').eq('id', value!).single()
      return data as Donor | null
    },
  })

  const { data: results } = useQuery({
    queryKey: ['donor-search', debounced],
    enabled: open && debounced.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('donors')
        .select('id, donor_code, full_name, phone, city')
        .is('deleted_at', null)
        .or(`full_name.ilike.%${debounced}%,phone.ilike.%${debounced}%,donor_code.ilike.%${debounced}%`)
        .limit(8)
      return (data ?? []) as Pick<Donor, 'id' | 'donor_code' | 'full_name' | 'phone' | 'city'>[]
    },
  })

  const createInline = async () => {
    setError(null)
    setCreating(true)
    try {
      const looksLikePhone = /^[0-9+\s-]{7,}$/.test(term.trim())
      const { data, error } = await supabase
        .from('donors')
        .insert({
          full_name: looksLikePhone ? 'Donatur Baru' : term.trim(),
          phone: looksLikePhone ? term.replace(/\D/g, '') : null,
          created_by: user!.id,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      qc.invalidateQueries({ queryKey: ['donors'] })
      onChange(data.id)
      setOpen(false)
      setTerm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat donatur')
    } finally {
      setCreating(false)
    }
  }

  if (value && selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{selected.full_name}</p>
          <p className="text-xs text-slate-500">
            {selected.donor_code}{selected.phone ? ` · ${selected.phone}` : ''}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Ganti</Button>
      </div>
    )
  }

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={term}
        placeholder="Cari nama, telepon, atau kode donatur"
        onChange={(e) => { setTerm(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        aria-autocomplete="list"
      />
      {open && term.length >= 2 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {results?.map((d) => (
            <button
              key={d.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
              onClick={() => { onChange(d.id); setOpen(false); setTerm('') }}
            >
              <span className="font-medium">{d.full_name}</span>
              <span className="ml-2 text-xs text-slate-500">
                {d.donor_code}{d.phone ? ` · ${d.phone}` : ''}
              </span>
            </button>
          ))}
          {results?.length === 0 && (
            <button
              type="button"
              disabled={creating}
              className="block w-full px-3 py-2 text-left text-sm text-brand-700 hover:bg-slate-50 dark:text-brand-400 dark:hover:bg-slate-700"
              onClick={createInline}
            >
              {creating ? 'Membuat…' : `+ Buat donatur baru “${term}”`}
            </button>
          )}
          {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
