import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useAccounts, useFundTypes, usePrograms } from '@/lib/queries'
import { uploadProof } from '@/lib/storage'
import { dateInputJakarta, formatIDR, maskIDR, parseIDR, todayJakarta } from '@/lib/format'
import { baseAmountOf, matchTransferCode, useDonationCodes } from '@/lib/transferCode'
import { friendlyDbError } from '@/lib/dbError'
import { paymentMethodLabels } from '@/lib/labels'
import { Button, ErrorNote, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { DonorPicker } from '@/features/donors/DonorPicker'
import type { DonationRow, PaymentMethod } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: (donationId: string) => void
  /** Present when correcting an existing entry; absent when recording a new one. */
  donation?: DonationRow | null
}

/**
 * Quick-entry form, tuned for a phone in the field: today's date prefilled,
 * amount masked with thousand separators, donor searchable with inline create,
 * camera capture for the transfer slip. Target is under 45 seconds.
 *
 * The same form corrects an unverified entry. `receipt_no`, `status` and
 * `created_by` are deliberately absent: the number is allocated by the database,
 * and a correction must not move the row out of the verification queue or
 * reassign its author — separation of duties is decided from `created_by`.
 */
export function DonationForm({ open, onClose, onSaved, donation }: Props) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: fundTypes } = useFundTypes()
  const { data: accounts } = useAccounts()
  const { data: programs } = usePrograms()
  const { data: codes } = useDonationCodes()

  const [donorId, setDonorId] = useState<string | null>(null)
  const [anonymous, setAnonymous] = useState(false)
  const [fundTypeId, setFundTypeId] = useState('')
  const [programId, setProgramId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [paymentRef, setPaymentRef] = useState('')
  const [inKind, setInKind] = useState('')
  const [donatedAt, setDonatedAt] = useState(todayJakarta())
  const [notes, setNotes] = useState('')
  const [proof, setProof] = useState<File | null>(null)

  const editing = Boolean(donation)

  // Reload whenever a different donation is opened, so the form never shows the
  // previous one's values.
  useEffect(() => {
    if (!donation) return
    setDonorId(donation.donor_id)
    setAnonymous(donation.is_anonymous)
    setFundTypeId(donation.fund_type_id)
    setProgramId(donation.program_id ?? '')
    setAccountId(donation.account_id)
    setAmount(maskIDR(String(Math.round(donation.amount))))
    setMethod(donation.payment_method)
    setPaymentRef(donation.payment_ref ?? '')
    setInKind(donation.in_kind_description ?? '')
    setDonatedAt(dateInputJakarta(donation.donated_at))
    setNotes(donation.notes ?? '')
    setProof(null)
  }, [donation, open])

  useEffect(() => {
    if (fundTypes?.length && !fundTypeId) setFundTypeId(fundTypes[0].id)
    if (accounts?.length && !accountId) setAccountId(accounts.find((a) => a.is_active)?.id ?? '')
  }, [fundTypes, accounts, fundTypeId, accountId])

  const fundType = fundTypes?.find((f) => f.id === fundTypeId)
  const programRequired = fundType?.requires_program ?? false

  // A transferred amount usually carries the programme code in its last three
  // digits. Surfacing the match lets the amil confirm the donor's intent rather
  // than guess at it, and it is only ever a suggestion.
  const matched = matchTransferCode(parseIDR(amount), codes)
  const applyMatch = () => {
    if (!matched) return
    setFundTypeId(matched.fund_type_id)
    setProgramId(matched.program_id ?? '')
  }
  const matchApplied = matched
    ? matched.fund_type_id === fundTypeId && (matched.program_id ?? '') === programId
    : false

  const reset = () => {
    setDonorId(null)
    setAnonymous(false)
    setAmount('')
    setPaymentRef('')
    setInKind('')
    setNotes('')
    setProof(null)
    setProgramId('')
    setDonatedAt(todayJakarta())
  }

  const save = useMutation({
    mutationFn: async () => {
      const value = parseIDR(amount)
      if (value <= 0) throw new Error('Jumlah donasi harus lebih dari nol')
      if (!anonymous && !donorId) throw new Error('Pilih donatur atau tandai sebagai anonim')
      if (programRequired && !programId) {
        throw new Error(`${fundType?.name} harus dikaitkan dengan program`)
      }

      const proofPath = proof ? await uploadProof('donation-proofs', proof) : null

      const fields = {
        donor_id: anonymous ? null : donorId,
        is_anonymous: anonymous,
        fund_type_id: fundTypeId,
        program_id: programId || null,
        account_id: accountId,
        amount: value,
        payment_method: method,
        payment_ref: paymentRef || null,
        in_kind_description: method === 'in_kind' ? inKind : null,
        donated_at: new Date(`${donatedAt}T12:00:00+07:00`).toISOString(),
        notes: notes || null,
        // A new file replaces the slip; no file leaves the stored one alone.
        ...(proofPath ? { proof_url: proofPath } : {}),
      }

      const { data, error } = donation
        ? await supabase
            .from('donations')
            .update(fields)
            .eq('id', donation.id)
            .select('id')
            .single()
        : await supabase
            .from('donations')
            .insert({ ...fields, status: 'pending', proof_url: proofPath, created_by: user!.id })
            .select('id')
            .single()

      if (error) throw new Error(friendlyDbError(error.message))
      return data.id as string
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['donations'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      if (!editing) reset()
      onSaved(id)
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Ubah donasi ${donation!.receipt_no}` : 'Catat donasi'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
          />
          Donasi anonim (dicatat sebagai “Hamba Allah”)
        </label>

        {!anonymous && (
          <Field label="Donatur" required>
            <DonorPicker value={donorId} onChange={setDonorId} />
          </Field>
        )}

        <Field label="Jumlah" required hint="Rupiah penuh, tanpa sen">
          <Input
            inputMode="numeric"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(maskIDR(e.target.value))}
            className="text-lg font-semibold"
          />
        </Field>

        {matched && (
          <div className="rounded-lg bg-brand-50 p-3 text-sm dark:bg-brand-900/20">
            <p>
              Kode <strong>{matched.code}</strong> pada nominal ini merujuk{' '}
              <strong>{matched.name}</strong> (donasi {formatIDR(baseAmountOf(parseIDR(amount)))} +
              kode).
            </p>
            {!matchApplied && (
              <button
                type="button"
                onClick={applyMatch}
                className="mt-1 font-medium text-brand-700 hover:underline dark:text-brand-300"
              >
                Terapkan
              </button>
            )}
          </div>
        )}

        <Field label="Jenis dana" required>
          <Select value={fundTypeId} onChange={(e) => setFundTypeId(e.target.value)}>
            {fundTypes?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.transfer_code ? `${f.transfer_code} — ${f.name}` : f.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Program"
          required={programRequired}
          hint={programRequired ? 'Wajib untuk dana terikat' : 'Opsional'}
        >
          <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">— tanpa program —</option>
            {programs
              ?.filter((p) => p.status === 'active')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} — ${p.name}` : p.name}
                </option>
              ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Metode" required>
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(paymentMethodLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tanggal donasi" required>
            <Input
              type="date"
              value={donatedAt}
              max={todayJakarta()}
              onChange={(e) => setDonatedAt(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Rekening penerima" required>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts
              ?.filter((a) => a.is_active)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
        </Field>

        {method !== 'cash' && method !== 'in_kind' && (
          <Field
            label="Referensi pembayaran"
            hint="Nomor transaksi bank / QRIS — dipakai untuk deteksi duplikat"
          >
            <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
          </Field>
        )}

        {method === 'in_kind' && (
          <Field label="Deskripsi barang" required>
            <Input
              value={inKind}
              onChange={(e) => setInKind(e.target.value)}
              placeholder="mis. 10 karung beras 25 kg"
            />
          </Field>
        )}

        <Field
          label="Bukti transfer / foto"
          hint={
            editing && donation!.proof_url
              ? 'Bukti yang ada tetap tersimpan bila tidak diganti'
              : 'Diambil langsung dari kamera atau galeri'
          }
        >
          <Input
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={(e) => setProof(e.target.files?.[0] ?? null)}
          />
        </Field>

        <Field label="Catatan">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        <ErrorNote error={save.error} />
        <p className="text-xs text-slate-500">
          {editing ? (
            <>
              Perubahan tercatat di log audit. Status donasi tidak berubah — hanya donasi{' '}
              <strong>terverifikasi</strong> yang dihitung dalam saldo.
            </>
          ) : (
            <>
              Donasi tersimpan berstatus <strong>menunggu verifikasi</strong> dan belum dihitung
              dalam saldo sampai diverifikasi bendahara.
            </>
          )}
        </p>
      </div>
    </Modal>
  )
}
