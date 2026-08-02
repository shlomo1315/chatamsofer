'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Edit, Trash2, Loader2, MailPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { deleteMaternityAid } from '../maternityStatus'
import type { MaternityAid } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export default function MaternityActions({ aid }: { aid: MaternityAid }) {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const [deleting, setDeleting] = useState(false)
  const [sendingNameFix, setSendingNameFix] = useState(false)

  // שליחת קישור תיקון/השלמת שם התינוק למייל היולדת
  const sendNameFix = async () => {
    if (!(await confirm({
      title: 'שליחת קישור לתיקון שם',
      message: 'לשלוח למייל היולדת קישור אישי (תקף 7 ימים) להזנת/תיקון שם התינוק?',
      confirmLabel: 'שליחה',
    }))) return
    setSendingNameFix(true)
    try {
      const res = await fetch('/api/admin/maternity/send-name-fix', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aidId: aid.id }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { toast.error(data.error || 'השליחה נכשלה'); return }
      toast.success(`קישור לתיקון השם נשלח ל-${data.sentTo}`)
    } catch {
      toast.error('שגיאת רשת — נסו שוב')
    } finally {
      setSendingNameFix(false)
    }
  }

  const handleDelete = async () => {
    if (!(await confirm({ title: 'מחיקת תיק יולדת', message: `למחוק את תיק היולדת של "${aid.baby_name ?? 'התינוק'}" לצמיתות? פעולה זו אינה הפיכה.`, confirmLabel: 'מחיקה', danger: true }))) return
    setDeleting(true)
    try {
      await deleteMaternityAid(supabase, aid)
      toast.success('תיק היולדת נמחק')
      router.push('/admin/maternity')
      router.refresh()
    } catch (err: unknown) {
      toast.error(`שגיאה במחיקה: ${err instanceof Error ? err.message : String(err)}`)
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* קישור תיקון שם למייל היולדת — בולט כשסומן "עדיין אין שם" */}
      <button onClick={sendNameFix} disabled={sendingNameFix}
        className={`flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 ${
          (aid as { baby_name_pending?: boolean }).baby_name_pending
            ? 'text-white bg-amber-500 hover:bg-amber-600'
            : 'text-amber-700 border border-amber-300 hover:bg-amber-50'
        }`}
        title="שליחת קישור אישי למייל היולדת להזנת/תיקון שם התינוק">
        {sendingNameFix ? <Loader2 size={14} className="animate-spin" /> : <MailPlus size={14} />} תיקון שם
      </button>
      <Link href={`/admin/maternity/${aid.id}/edit`}>
        <button className="flex items-center gap-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-3 py-1.5 transition-colors">
          <Edit size={14} /> עריכה
        </button>
      </Link>
      <button onClick={handleDelete} disabled={deleting}
        className="flex items-center gap-1.5 text-sm text-red-600 hover:text-white hover:bg-red-600 border border-red-300 hover:border-red-600 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
        {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} מחיקה
      </button>
      {confirmDialog}
    </div>
  )
}
