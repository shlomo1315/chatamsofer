'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Edit, Trash2, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export default function BeneficiaryActions({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!(await confirm({ title: 'מחיקת נתמך', message: `למחוק את "${name}" לצמיתות? הפעולה תמחק אותם גם מעץ הדורות (אם אין להם צאצאים בעץ). פעולה זו אינה הפיכה.`, confirmLabel: 'מחיקה', danger: true }))) return
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/beneficiaries/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'שגיאה במחיקה')
      toast.success(`"${name}" נמחק/ה${d.treeRemoved ? ' (כולל מעץ הדורות)' : ''}`)
      router.push('/admin/beneficiaries')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`שגיאה במחיקה: ${msg}`)
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link href={`/admin/beneficiaries/${id}/edit`}>
        <button className="flex items-center gap-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-3 py-1.5 transition-colors">
          <Edit size={14} />
          עריכה
        </button>
      </Link>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="flex items-center gap-1.5 text-sm text-red-600 hover:text-white hover:bg-red-600 border border-red-300 hover:border-red-600 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
      >
        {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        מחיקה
      </button>
      {confirmDialog}
    </div>
  )
}
