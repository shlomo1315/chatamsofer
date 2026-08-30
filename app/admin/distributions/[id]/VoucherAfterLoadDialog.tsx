'use client'
import { useState } from 'react'
import { X, Loader2, Send, Check, MapPin, User, Mail as MailIcon } from 'lucide-react'
import PdfCanvasView from '@/components/ui/PdfCanvasView'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// חלונית השובר שנפתחת אחרי טעינת כרטיס מוצלחת.
//
// 🔴 המייל אינו נשלח אוטומטית. הוא יוצא רק בלחיצה מפורשת, אחרי שרואים
// בדיוק מה יֵצא — השובר, המוקד, והכתובת שאליה זה הולך.
//
// ⚠️ הכתובת ניתנת לעריכה כאן: מייל שגוי בכרטסת מתגלה בדיוק ברגע הזה,
// ושליחה לכתובת שבורה נכשלת בשקט אצל הנמען ולא אצלנו.
// ─────────────────────────────────────────────────────────────────────────────

export interface VoucherTarget {
  id: string
  familyName: string
  idNumber: string | null
  email: string | null
  centerName: string | null
}

export default function VoucherAfterLoadDialog({
  target, distributionId, testMode, testEmail, onClose,
}: {
  target: VoucherTarget
  distributionId: string
  /** ⚠️ במצב בדיקה המייל לעולם אינו מגיע למשפחה — ראו lib/holidayTestMode. */
  testMode?: boolean
  testEmail?: string | null
  onClose: () => void
}) {
  const toast = useToast()
  const [email, setEmail] = useState(target.email ?? '')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const send = async () => {
    const to = email.trim()
    if (!to) { toast.error('אין כתובת מייל'); return }
    setSending(true)
    try {
      const res = await fetch('/api/admin/holiday-voucher/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distribution_id: distributionId, ids: [target.id],
          confirm: true, resend: true, email: to,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'השליחה נכשלה'); setSending(false); return }
      if (d.sent === 0) {
        // ⚠️ sent:0 אינו הצלחה: השרת מדווח כך גם כשאין נמען או שהמוקד חסר.
        toast.error(d.note ?? 'לא נשלח דבר — בדקו שיש מוקד וכתובת')
        setSending(false); return
      }
      toast.success(testMode ? `נשלח לכתובת הבדיקה` : 'השובר נשלח')
      setSent(true)
    } catch { toast.error('שגיאת רשת') }
    setSending(false)
  }

  const realRecipient = testMode ? (testEmail ?? '') : email.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="flex h-full max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h4 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
            <Check size={15} className="text-emerald-600" />
            {testMode ? 'מצב בדיקה — הכרטיס לא נטען' : 'הכרטיס נטען'}
          </h4>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {/* פרטי המשפחה */}
          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
            <p className="flex items-center gap-1.5 text-xs text-slate-700">
              <User size={13} className="flex-shrink-0 text-slate-400" />
              <strong>{target.familyName}</strong>
              {target.idNumber && <span className="font-mono text-slate-500 ltr-num">{target.idNumber}</span>}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-slate-700">
              <MapPin size={13} className="flex-shrink-0 text-slate-400" />
              {target.centerName ?? <span className="text-amber-700">לא נבחר מוקד</span>}
            </p>
          </div>

          {/* 🔴 בלי מוקד אין שובר: הוא כולו בנוי סביבו. */}
          {!target.centerName ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
              המשפחה טרם בחרה מוקד חלוקה, ולכן אי אפשר להפיק שובר — הוא כולו בנוי סביב
              המוקד, הכתובת והשעות. אחרי שתיבחר, אפשר לשלוח את השובר מכאן או מהשליחה הקבוצתית.
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-100 p-2">
                {/* ⚠️ asData: הנתיב מייצר PDF דינמית ודורש סשן צוות, ומשיכה
                    ישירה נחסמת ע"י נטפרי לפי סוג התוכן. */}
                <PdfCanvasView
                  url={`/api/admin/holiday-voucher/preview?recipient_id=${encodeURIComponent(target.id)}`}
                  name="שובר החלוקה" asData maxPages={1}
                  className="mx-auto w-full max-w-md" />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-600">
                  <MailIcon size={13} /> כתובת המייל
                </label>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" dir="ltr"
                  placeholder="לא הוזנה כתובת" disabled={sent}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-left text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50" />
                {testMode && (
                  <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-900">
                    🧪 מצב בדיקה — {realRecipient
                      ? <>המייל יישלח ל־<strong dir="ltr">{realRecipient}</strong> ולא למשפחה.</>
                      : <>לא הוגדרה כתובת בדיקה, ולכן לא יישלח מייל כלל.</>}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3">
          {target.centerName && !sent && (
            <button type="button" onClick={send} disabled={sending || !email.trim() || (testMode && !testEmail)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-40">
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              שליחת השובר במייל
            </button>
          )}
          {sent && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
              <Check size={14} /> נשלח
            </span>
          )}
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
            סגירה
          </button>
        </div>
      </div>
    </div>
  )
}
