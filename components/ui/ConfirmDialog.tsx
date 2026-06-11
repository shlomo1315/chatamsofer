'use client'
import { ReactNode, useCallback, useRef, useState } from 'react'
import Modal from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title?: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title = 'אישור פעולה',
  message,
  confirmLabel = 'אישור',
  cancelLabel = 'ביטול',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm text-slate-700 whitespace-pre-line">{message}</p>
    </Modal>
  )
}

interface ConfirmOptions {
  title?: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

// hook נוח להחלפת window.confirm: const { confirm, confirmDialog } = useConfirm()
// ואז: if (!(await confirm({ message: '...', danger: true }))) return
// אין לשכוח לרנדר את {confirmDialog} בתוך הקומפוננטה.
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts)
    return new Promise<boolean>(resolve => {
      resolverRef.current = resolve
    })
  }, [])

  const close = useCallback((ok: boolean) => {
    setOptions(null)
    resolverRef.current?.(ok)
    resolverRef.current = null
  }, [])

  const confirmDialog = options ? (
    <ConfirmDialog
      open
      title={options.title}
      message={options.message}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      danger={options.danger}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null

  return { confirm, confirmDialog }
}
