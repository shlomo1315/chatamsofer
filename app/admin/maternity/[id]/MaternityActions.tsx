'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Edit, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { deleteMaternityAid } from '../MaternityTable'
import type { MaternityAid } from '@/types'

export default function MaternityActions({ aid }: { aid: MaternityAid }) {
  const router = useRouter()
  const supabase = createClient()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`למחוק את תיק היולדת של "${aid.baby_name ?? 'התינוק'}" לצמיתות? פעולה זו אינה הפיכה.`)) return
    setDeleting(true)
    try {
      await deleteMaternityAid(supabase, aid)
      router.push('/admin/maternity')
      router.refresh()
    } catch (err: unknown) {
      alert(`שגיאה במחיקה: ${err instanceof Error ? err.message : String(err)}`)
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link href={`/admin/maternity/${aid.id}/edit`}>
        <button className="flex items-center gap-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-3 py-1.5 transition-colors">
          <Edit size={14} /> עריכה
        </button>
      </Link>
      <button onClick={handleDelete} disabled={deleting}
        className="flex items-center gap-1.5 text-sm text-red-600 hover:text-white hover:bg-red-600 border border-red-300 hover:border-red-600 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
        {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} מחיקה
      </button>
    </div>
  )
}
