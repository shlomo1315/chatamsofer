'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, BadgeCheck, AlertCircle, Pencil, Check, X, Loader2, Send } from 'lucide-react'
import QuickEmailModal from '@/components/QuickEmailModal'
import { useToast } from '@/components/ui/Toast'
import { useCan } from '@/components/StaffPermissions'

// שורת פרטי "אימייל" בכרטיס הצאצא — לחיצה פותחת חלונית שליחת מייל מתוך המערכת.
//
// ⚠️ חיווי האימות אינו קישוט: מרגע שאימות המייל ניתן לכיבוי בהגדרות, יש
// במערכת כתובות שמעולם לא אומתו. מזכיר שרואה "לא מאומת" יודע שתלונת
// "לא קיבלתי מייל" עשויה לנבוע מכתובת שגויה, ולא מתקלת מסירה.
//
// ⚠️ תיקון מהיר של הכתובת + שליחת בקשת אימות מוצעים **רק** כשהכתובת טרם
// אומתה. כתובת מאומתת היא כתובת שהמשפחה הוכיחה בעלות עליה; החלפתה
// בלחיצה אחת הייתה מאפשרת להסיט את הדואר שלה. שינוי כזה עובר בטופס
// העריכה המלא. השרת אוכף את אותו כלל — הסתרת הכפתור לבדה אינה הגנה.
export default function EmailRow({
  email, name, verifiedAt, beneficiaryId,
}: {
  email?: string | null
  name: string
  // null/undefined = טרם אומת. ראו beneficiaries.email_verified_at.
  verifiedAt?: string | null
  beneficiaryId: string
}) {
  const router = useRouter()
  const toast = useToast()
  const canEdit = useCan('beneficiaries', 'edit')

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(email ?? '')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)

  const unverified = !verifiedAt
  const canQuickEdit = canEdit && unverified

  const startEdit = () => { setDraft(email ?? ''); setEditing(true) }

  const save = async () => {
    const next = draft.trim()
    if (!next) { toast.error('יש להזין כתובת מייל'); return }
    if (next === (email ?? '').trim()) { setEditing(false); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/beneficiaries/${beneficiaryId}/email`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'עדכון הכתובת נכשל')
      toast.success('כתובת המייל עודכנה')
      setEditing(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // שליחת בקשת אימות למשפחה הזו בלבד.
  // ⚠️ נתיב ייעודי ולא /api/admin/email-verification — האחרון מנהל-בלבד
  // (הרשימה שם חושפת את כל המשפחות), והכפתור כאן מוצג גם למזכירה.
  const sendVerification = async () => {
    setSending(true)
    try {
      const res = await fetch(`/api/admin/beneficiaries/${beneficiaryId}/email`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'שליחת הבקשה נכשלה')
      const sent = typeof json.sent === 'number' ? json.sent : null
      if (sent === 0) toast.error('הבקשה לא נשלחה — ייתכן שהכתובת פגומה')
      else toast.success('בקשת אימות נשלחה')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5 py-1">
        <span className="text-xs text-slate-500">אימייל</span>
        <div className="flex items-center gap-1.5">
          <input
            type="email"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); save() }
              if (e.key === 'Escape') setEditing(false)
            }}
            dir="ltr"
            autoFocus
            disabled={saving}
            placeholder="name@example.com"
            className="flex-1 rounded-lg border border-indigo-300 px-2 py-1 text-sm text-slate-900 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
          />
          <button
            onClick={save} disabled={saving} title="שמור"
            className="rounded-lg bg-green-600 p-1.5 text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
          <button
            onClick={() => setEditing(false)} disabled={saving} title="ביטול"
            className="rounded-lg border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-60 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-slate-500 flex-shrink-0">אימייל</span>
      {email ? (
        <span className="inline-flex items-center gap-1.5 flex-wrap justify-end">
          {verifiedAt ? (
            <span title={`אומת בתאריך ${new Date(verifiedAt).toLocaleDateString('he-IL')}`}
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5">
              <BadgeCheck size={11} /> מאומת
            </span>
          ) : (
            <>
              <span title="הכתובת לא אומתה בקוד — ייתכן שאינה תקינה"
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                <AlertCircle size={11} /> לא מאומת
              </span>
              {canQuickEdit && (
                <>
                  <button
                    type="button" onClick={startEdit} title="תיקון הכתובת"
                    className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button" onClick={sendVerification} disabled={sending}
                    title="שליחת בקשת אימות לכתובת זו"
                    className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60 transition-colors"
                  >
                    {sending ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                    {sending ? 'שולח…' : 'שלח בקשת אימות'}
                  </button>
                </>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="שליחת מייל מתוך המערכת"
            dir="ltr"
            className="text-sm text-indigo-600 hover:underline ltr-num text-left inline-flex items-center gap-1.5"
          >
            <Mail size={13} className="flex-shrink-0" />
            {email}
          </button>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          {canEdit && (
            <button
              type="button" onClick={startEdit}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
            >
              <Pencil size={11} /> הוסף כתובת
            </button>
          )}
          <span className="text-sm text-slate-800 ltr-num text-left">—</span>
        </span>
      )}

      {open && email && (
        <QuickEmailModal to={email} toName={name} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
