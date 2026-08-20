import { useState } from 'react'
import { useRpc } from '@/lib/queries'
import { uploadProof } from '@/lib/storage'
import { Button, ErrorNote, Field, Input, Modal } from '@/components/ui'
import { formatIDR } from '@/lib/format'
import type { DistributionRow } from '@/types/db'

/**
 * Marks an approved distribution as handed over, with the two photos taken in
 * the field. Shared by the distributions list and the detail page so there is
 * one disbursement flow rather than two that can drift.
 */
export function DisburseDialog({
  row,
  onClose,
}: {
  row: DistributionRow | null
  onClose: () => void
}) {
  const [proof, setProof] = useState<File | null>(null)
  const [signature, setSignature] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const disburse = useRpc<{
    p_id: string
    p_proof_url: string | null
    p_signature_url: string | null
  }>('rpc_disburse_distribution', ['distributions', 'distribution'])

  if (!row) return null

  const submit = async () => {
    setError(null)
    try {
      const proofPath = proof ? await uploadProof('distribution-proofs', proof) : null
      const sigPath = signature ? await uploadProof('distribution-proofs', signature) : null
      await disburse.mutateAsync({
        p_id: row.id,
        p_proof_url: proofPath,
        p_signature_url: sigPath,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyerahkan')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Serahkan ${row.ref_no}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button disabled={disburse.isPending} onClick={submit}>
            Tandai tersalurkan
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">
          {row.beneficiary_name ?? row.program_name} — <strong>{formatIDR(row.amount)}</strong>
        </p>
        <Field label="Foto penyerahan" hint="Diambil saat penyerahan di lapangan">
          <Input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setProof(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="Tanda tangan penerima">
          <Input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setSignature(e.target.files?.[0] ?? null)}
          />
        </Field>
        <ErrorNote error={error ?? disburse.error} />
      </div>
    </Modal>
  )
}
