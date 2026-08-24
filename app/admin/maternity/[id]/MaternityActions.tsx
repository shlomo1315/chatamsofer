'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Edit, Trash2, Loader2, MailPlus, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { deleteMaternityAid } from '../maternityStatus'
import type { MaternityAid } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import MaternityInquiryPanel from './MaternityInquiryPanel'

export default function MaternityActions({ aid }: { aid: MaternityAid }) {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const [deleting, setDeleting] = useState(false)
  const [sendingNameFix, setSendingNameFix] = useState(false)
  const [inquiryOpen, setInquiryOpen] = useState(false)

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

  // ⚠️ שלושה סגנונות בלבד, אחידים בגודל וברדיוס. קודם כל כפתור עוצב
  // בנפרד — "תיקון שם" החליף מילוי/מתאר לפי מצב, "עריכה" היה מלא
  // ו"מחיקה" מתאר — והשורה נראתה כמו אוסף מקרי.
  const BTN = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50'
  const PRIMARY = `${BTN} bg-indigo-600 text-white hover:bg-indigo-700`
  const OUTLINE = `${BTN} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`
  const DANGER = `${BTN} border border-red-300 bg-white text-red-600 hover:border-red-600 hover:bg-red-600 hover:text-white`

  const ben = (aid as { beneficiary?: { email?: string | null } | null }).beneficiary
  const motherName = (aid as { beneficiary?: { family_name?: string | null; spouse_name?: string | null } | null })
    .beneficiary
  const motherLabel = [motherName?.family_name, motherName?.spouse_name].filter(Boolean).join(' ')

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 🔴 בירור מול היולדת — עד כה לא הייתה דרך לברר בתיק שממתין
          לאישור: המזכיר שלח מייל מהתיבה הרגילה והתשובה נעלמה מהתיק. */}
      <button onClick={() => setInquiryOpen(true)} className={OUTLINE}
        title="פתיחת שרשור בירור מול היולדת — ההתכתבות נשמרת בתיק">
        <MessageSquare size={14} /> בירור
      </button>

      {/* ⚠️ "תיקון שם" נשאר מודגש כשסומן "עדיין אין שם" — זו אינדיקציה
          למשימה פתוחה, ולא קישוט. שאר הזמן הוא כפתור מתאר ככל השאר. */}
      <button onClick={sendNameFix} disabled={sendingNameFix}
        className={(aid as { baby_name_pending?: boolean }).baby_name_pending
          ? `${BTN} bg-amber-500 text-white hover:bg-amber-600`
          : OUTLINE}
        title="שליחת קישור אישי למייל היולדת להזנת/תיקון שם התינוק">
        {sendingNameFix ? <Loader2 size={14} className="animate-spin" /> : <MailPlus size={14} />} תיקון שם
      </button>

      <Link href={`/admin/maternity/${aid.id}/edit`}>
        <button className={PRIMARY}><Edit size={14} /> עריכה</button>
      </Link>

      <button onClick={handleDelete} disabled={deleting} className={DANGER}>
        {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} מחיקה
      </button>

      {inquiryOpen && (
        <MaternityInquiryPanel
          aidId={aid.id}
          motherName={motherLabel || undefined}
          hasEmail={!!ben?.email}
          onClose={() => setInquiryOpen(false)}
        />
      )}
      {confirmDialog}
    </div>
  )
}
