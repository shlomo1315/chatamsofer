'use client'
import { useState } from 'react'
import { GitBranch, X, Check, Copy } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// כפתור שליחת קישור אישי לתיקון סדר הדורות.
//
// משמש בשני מקומות: סרגל הפעולות בכרטסת הצאצא, ועמודת הפעולות ברשימה
// הראשית. הווריאנט 'icon' הוא הגרסה הקומפקטית לשורת טבלה.
export default function SendLineageLinkButton({
  beneficiaryId, name, email, variant = 'button',
}: {
  beneficiaryId: string
  name?: string
  email?: string | null
  variant?: 'button' | 'icon'
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [addr, setAddr] = useState(email ?? '')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const send = async () => {
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/admin/beneficiaries/send-lineage-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiaryId, email: addr.trim() }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'השליחה נכשלה'); return }
      // ⚠️ mailError = ההזמנה נוצרה אך המייל לא יצא. מציגים את הקישור כדי
      // שהמנהל יעתיק ידנית במקום לאבד את הטוקן שכבר נוצר.
      if (d.mailError) {
        setLink(d.link)
        setErr('הקישור נוצר אך שליחת המייל נכשלה — העתיקו ושלחו ידנית')
        return
      }
      toast.success(`הקישור נשלח אל ${d.sentTo}`)
      setOpen(false)
    } catch {
      setErr('שגיאת רשת — נסו שוב')
    } finally { setBusy(false) }
  }

  return (
    <>
      {variant === 'icon' ? (
        <button type="button"
          onClick={e => { e.stopPropagation(); e.preventDefault(); setOpen(true) }}
          title="שליחת קישור לתיקון סדר הדורות"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors">
          <GitBranch size={14} /> דורות
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100 transition-colors">
          <GitBranch size={15} /> שלח תיקון דורות
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          onClick={e => { e.stopPropagation(); if (!busy) setOpen(false) }}>
          <div dir="rtl" onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-indigo-600 px-5 py-4 text-white flex items-start gap-3">
              <GitBranch size={20} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-base">שליחת קישור לתיקון סדר הדורות</p>
                <p className="text-indigo-100 text-xs mt-1 leading-relaxed">
                  {name ? `${name} ` : ''}יקבל/ו קישור אישי שבו יופיעו הפרטים ושרשרת הדורות, עם אפשרות לתקן את הסדר.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-indigo-200 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-xs font-semibold text-slate-600">כתובת מייל</label>
              <input value={addr} onChange={e => setAddr(e.target.value)} type="email" dir="ltr"
                placeholder="name@example.com"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm" />
              {!email && (
                <p className="text-[11px] text-amber-600">לצאצא זה אין מייל שמור בכרטסת — יש להזין כתובת.</p>
              )}
              {err && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err}</p>}
              {link && (
                <button onClick={() => { void navigator.clipboard?.writeText(link); toast.success('הקישור הועתק') }}
                  className="w-full flex items-center justify-center gap-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2.5 hover:bg-indigo-100">
                  <Copy size={13} /> העתקת הקישור
                </button>
              )}
              <p className="text-[11px] text-slate-400 leading-relaxed">
                התיקון שיישלח <strong>אינו נכנס ישירות למאגר</strong> — הוא מגיע לאישור הצוות במסך עץ הדורות.
              </p>
            </div>
            <div className="flex gap-2 p-4 border-t border-slate-100">
              <button onClick={() => setOpen(false)} disabled={busy}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 disabled:opacity-40">ביטול</button>
              <button onClick={send} disabled={busy || !addr.trim()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
                {busy ? '...' : <><Check size={15} /> שלח קישור</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
