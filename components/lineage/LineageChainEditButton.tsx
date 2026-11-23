'use client'
// כפתור "תיקון סדר הדורות" בכרטסת המוטב והיולדת ובחלונית היולדת — מזכירות ומנהל.
// שומר דרך /api/admin/lineage/chain ומרענן את הכרטסת בלי טעינת עמוד.
// ה-"+" בעורך מציע גם דור קיים מאותו גזע, מתוך /api/admin/lineage/generation.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListOrdered } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import LineageChainEditor, { type LineageChainEditorProps } from './LineageChainEditor'
import type { ChainStep, TreeNode } from '@/lib/lineageChainEdit'

export async function loadGenerationNodes(gen: number): Promise<TreeNode[]> {
  const res = await fetch(`/api/admin/lineage/generation?gen=${gen}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('load failed')
  const data = await res.json()
  return Array.isArray(data?.nodes) ? data.nodes : []
}

export default function LineageChainEditButton({ beneficiaryId, initialChain, label = 'תיקון סדר הדורות', compact, onSaved, loadTree = loadGenerationNodes }: {
  beneficiaryId: string
  initialChain: LineageChainEditorProps['initialChain']
  label?: string
  /** בכותרת חלונית — בלי שוליים ובלי הודעת "נשמר" לצד הכפתור */
  compact?: boolean
  onSaved?: () => void
  /** מקור צמתי העץ ל-"+" (ברירת מחדל: /api/admin/lineage/generation) */
  loadTree?: (gen: number) => Promise<TreeNode[]>
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
      onSaved?.()
      router.refresh()
    } catch { setError('שגיאת רשת') }
    finally { setSaving(false) }
  }

  return (
    <>
      <div className={compact ? 'flex items-center gap-2' : 'mt-2 flex items-center gap-2'}>
        <button type="button" onClick={() => { setOpen(true); setError(''); setDone(false) }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100">
          <ListOrdered size={14} /> {label}
        </button>
        {done && !compact && <span className="text-xs font-semibold text-green-700">סדר הדורות נשמר</span>}
      </div>
      <Modal open={open} onClose={() => { if (!saving) setOpen(false) }} title={label} size="lg">
        {open && (
          <LineageChainEditor initialChain={initialChain} onSave={save} saving={saving} error={error}
            loadTreeNodes={loadTree} onCancel={() => setOpen(false)} />
        )}
      </Modal>
    </>
  )
}
