import { useState } from 'react'
import { Button, ErrorNote, Field, Modal, Textarea } from '@/components/ui'

/**
 * Collects the mandatory reason for an action that overrides a rule.
 *
 * Separation of duties is a table constraint: the creator of an entry cannot
 * verify it, and a super_admin may only bypass that by recording why. Without a
 * dialog like this the database refuses every such attempt, so the capability
 * exists on paper and nowhere in the product.
 */
export function ReasonDialog({
  open,
  title,
  description,
  label = 'Alasan',
  confirmLabel = 'Lanjutkan',
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  description?: string
  label?: string
  confirmLabel?: string
  busy?: boolean
  error?: unknown
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')

  const close = () => {
    setReason('')
    onCancel()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Batal
          </Button>
          <Button disabled={!reason.trim() || busy} onClick={() => onConfirm(reason.trim())}>
            {busy ? 'Memproses…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {description && <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>}
        <Field label={label} required hint="Tercatat permanen pada data dan di log audit">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ErrorNote error={error} />
      </div>
    </Modal>
  )
}
