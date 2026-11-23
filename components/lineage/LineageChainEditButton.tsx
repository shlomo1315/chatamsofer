'use client'
// כפתור "עריכת סדר הדורות" בכרטסת המוטב והיולדת — מזכירות ומנהל.
// שומר דרך /api/admin/lineage/chain ומרענן את הכרטסת בלי טעינת עמוד.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListOrdered } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import LineageChainEditor, { type LineageChainEditorProps } from './LineageChainEditor'
import type { ChainStep } from '@/lib/lineageChainEdit'

export default function LineageChainEditButton({ beneficiaryId, initialChain }: {
  beneficiaryId: string
  initialChain: LineageChainEditorProps['initialChain']
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const save = async (chain: ChainStep[]) => {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/lineage/chain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiaryId, chain }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) { setError(data.error || 'השמירה נכשלה'); return }
      setOpen(false); setDone(true)
      router.refresh()
    } catch { setError('שגיאת רשת') }
    finally { setSaving(false) }
  }

  return (
    <>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => { setOpen(true); setError(''); setDone(false) }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100">
          <ListOrdered size={14} /> עריכת סדר הדורות
        </button>
        {done && <span className="text-xs font-semibold text-green-700">סדר הדורות נשמר</span>}
      </div>
      <Modal open={open} onClose={() => { if (!saving) setOpen(false) }} title="עריכת סדר הדורות" size="lg">
        {open && (
          <LineageChainEditor initialChain={initialChain} onSave={save} saving={saving} error={error}
            onCancel={() => setOpen(false)} />
        )}
      </Modal>
    </>
  )
}
