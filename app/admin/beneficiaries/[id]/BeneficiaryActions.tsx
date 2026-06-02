'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Edit, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function BeneficiaryActions({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`למחוק את "${name}" לצמיתות? פעולה זו אינה הפיכה.`)) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('beneficiaries').delete().eq('id', id)
      if (error) throw error
      router.push('/admin/beneficiaries')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(`שגיאה במחיקה: ${msg}`)
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
    </div>
  )
}
