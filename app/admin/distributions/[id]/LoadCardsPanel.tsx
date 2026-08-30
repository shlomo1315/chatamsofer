'use client'
import { useState } from 'react'
import { Loader2, Wallet, AlertTriangle, Check, X } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// טעינת הכרטיסים — הפעולה הכספית.
//
// 🔴 שני שלבים מפורשים, תמיד: תצוגה מקדימה → אישור. אין מסלול שבו לחיצה
// אחת מוציאה כסף. הסכום הכולל מוצג בגדול לפני האישור.
//
// ⚠️ מדווח במפורש מי *לא* ייטען ולמה. בלי זה ההפרש בין "6,000 נרשמים"
// ל"4,200 ייטענו" נראה כתקלה, והמשתמש אינו יודע שחסרה ת"ז או אישור.
// ─────────────────────────────────────────────────────────────────────────────

interface Preview {
  amount: number
  eligible: number
  total: number
  alreadyLoaded: number
  failed: number
  skipped: { notApproved: number; noId: number }
  /** ⚠️ מגיע מהחלוקה — ראו lib/holidayTestMode. */
  testMode?: boolean
  testEmail?: string | null
}

const fmt = (n: number) => new Intl.NumberFormat('he-IL').format(n)

export default function LoadCardsPanel({ distributionId }: { distributionId: string }) {
  const [amount, setAmount] = useState(500)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  async function loadPreview() {
    setBusy(true); setErr(''); setDone('')
    try {
      const res = await fetch(
        `/api/admin/holiday-load?distribution_id=${encodeURIComponent(distributionId)}&amount=${amount}`,
        { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'הטעינה נכשלה'); return }
      setPreview(d)
    } catch { setErr('שגיאת רשת') } finally { setBusy(false) }
  }

  async function run() {
    if (!preview) return
    // ⚠️ אישור אחרון בטקסט חופשי — הסכום נאמר שוב, במילים של המשתמש.
    // 🔴 נוסח שונה במצב בדיקה: "הפעולה אינה הפיכה" על הרצת בדיקה מרתיע
    // מיותר, ו"נטענו X" בלי אזהרה מטעה לכיוון ההפוך.
    const msg = preview.testMode
      ? `מצב בדיקה — לא ייטען שום כרטיס ולא ייצא שקל.\n\nהמסלול ירוץ על ${fmt(preview.eligible)} משפחות${
          preview.testEmail ? `, והמיילים יישלחו ל-${preview.testEmail} בלבד` : ' (בלי שליחת מייל — אין כתובת בדיקה)'}.\n\nלהמשיך?`
      : `לטעון ${fmt(preview.total)} ₪ ל-${fmt(preview.eligible)} כרטיסים?\n\nהפעולה אינה הפיכה.`
    if (!confirm(msg)) return

    setBusy(true); setErr(''); setDone('')
    try {
      const res = await fetch('/api/admin/holiday-load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distribution_id: distributionId, amount, confirm: true }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'הטעינה נכשלה'); return }
      // 🔴 "נטענו" בלי סיוג אחרי הרצת בדיקה הוא בדיוק המשפט שגורם לחשוב
      // שהעבודה נגמרה — בזמן שאף כרטיס אינו טעון.
      setDone(d.testMode
        ? `🧪 מצב בדיקה — ${fmt(d.loaded ?? 0)} משפחות עברו את המסלול. לא נטען שום כרטיס.`
        : `${fmt(d.loaded ?? 0)} כרטיסים נטענו` + (d.failed ? ` · ${fmt(d.failed)} נכשלו` : ''))
      setPreview(null)
    } catch { setErr('שגיאת רשת') } finally { setBusy(false) }
  }

  return (
    <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-extrabold text-emerald-900">
        <Wallet size={15} /> טעינת כרטיסים
      </h3>
      <p className="mb-3 text-[11px] text-slate-500">
        נטענים רק מאושרים שטרם נטענו ויש להם תעודת זהות.
        <strong className="text-slate-700"> הפעולה רצה רק מכאן ולעולם לא אוטומטית.</strong>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
          סכום לכרטיס
          <input type="number" min={1} value={amount}
            onChange={e => { setAmount(Number(e.target.value)); setPreview(null) }}
            className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          ₪
        </label>
        <button type="button" onClick={loadPreview} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40">
          {busy && !preview ? <Loader2 size={13} className="animate-spin" /> : null}
          בדיקה לפני טעינה
        </button>
      </div>

      {preview && (
        <div className="mt-3 rounded-xl border border-emerald-300 bg-white p-3.5">
          {/* 🔴 באנר מצב הבדיקה — לפני המספרים, לא אחריהם: הסכום הגדול
              מושך את העין, ובלי האזהרה מעליו קל להניח שזו טעינה אמיתית. */}
          {preview.testMode && (
            <div className="mb-3 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2">
              <p className="text-xs font-extrabold text-amber-900">🧪 החלוקה במצב בדיקה</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
                לא ייטען שום כרטיס ולא ייצא שקל. {preview.testEmail
                  ? <>המיילים יישלחו ל־<strong dir="ltr">{preview.testEmail}</strong> בלבד.</>
                  : <>לא תוגדר כתובת בדיקה — לא יישלח מייל כלל.</>}
              </p>
            </div>
          )}
          <p className="text-sm text-slate-700">
            ייטענו <strong className="text-emerald-800">{fmt(preview.eligible)}</strong> כרטיסים
            × {fmt(preview.amount)} ₪
          </p>
          <p className="my-2 text-2xl font-extrabold text-emerald-900">{fmt(preview.total)} ₪</p>

          <ul className="mb-3 flex flex-col gap-0.5 text-[11px] text-slate-500">
            {preview.alreadyLoaded > 0 && <li>· {fmt(preview.alreadyLoaded)} כבר נטענו ולא ייטענו שוב</li>}
            {preview.skipped.notApproved > 0 && <li>· {fmt(preview.skipped.notApproved)} טרם אושרו</li>}
            {preview.skipped.noId > 0 && (
              <li className="text-amber-700">· {fmt(preview.skipped.noId)} מאושרים בלי תעודת זהות — לא ייטענו</li>
            )}
            {preview.failed > 0 && <li>· {fmt(preview.failed)} נכשלו בעבר וייכללו בנסיון חוזר</li>}
          </ul>

          {preview.eligible > 0 ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={run} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:opacity-40">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                כן, טען {fmt(preview.total)} ₪
              </button>
              <button type="button" onClick={() => setPreview(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-700">ביטול</button>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <AlertTriangle size={13} /> אין כרטיסים לטעינה
            </p>
          )}
        </div>
      )}

      {done && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          <Check size={15} /> {done}
        </p>
      )}
      {err && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <X size={15} /> {err}
        </p>
      )}
    </div>
  )
}
