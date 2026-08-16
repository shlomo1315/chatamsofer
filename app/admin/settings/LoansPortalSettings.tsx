'use client'
import { useState, useEffect } from 'react'
import { Lock, CheckCircle2, Copy, ExternalLink, AlertCircle, Loader2, Mail, Send, FileSignature } from 'lucide-react'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
      title="העתק"
      className="text-slate-400 hover:text-indigo-600 transition-colors"
    >
      {copied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
    </button>
  )
}

export default function LoansPortalSettings() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // דוח שבועי
  const [reportEmail, setReportEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [sendingNow, setSendingNow] = useState(false)
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // קוד הבדיקה הנסתר (עוקף את שער המחלקה). מנהל בלבד — השרת אינו מחזיר
  // אותו לאיש צוות רגיל, ולכן ריק אצלו והבלוק מציג הודעה במקום.
  const [previewCode, setPreviewCode] = useState('')
  const [pvCopied, setPvCopied] = useState(false)
  const [pvBusy, setPvBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/department-gates').then(r => r.json())
      .then(d => { if (typeof d.previewCode === 'string') setPreviewCode(d.previewCode) })
      .catch(() => {})
  }, [])

  const regeneratePreview = async () => {
    setPvBusy(true)
    try {
      const r = await fetch('/api/admin/department-gates', { method: 'PUT' })
      const d = await r.json()
      if (d.previewCode) setPreviewCode(d.previewCode)
    } catch { /* שקט */ }
    setPvBusy(false)
  }

  const portalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/shared/loans`
    : ''
  // ⚠️ ?preview= על הדף הציבורי (הטופס שהלווה ממלא) — לא על /shared/loans,
  // שהוא פורטל הביצוע לגורם חיצוני. שני קישורים שונים לגמרי.
  //
  // ⚠️ &action=loan — הקישור הזה הוא של הגמ"ח, ולכן הוא נוגע *רק* בהלוואות:
  // מיד אחרי הזיהוי נפתחת חלונית בקשת ההלוואה, ואף מחלקה אחרת אינה מוצגת
  // (השרת מצמצם את השערים לפי ה-action). קודם הוא פתח את כל המחלקות והנחית
  // את הבודק באזור האישי עם כל האפשרויות, בלי לפתוח את הטופס שבא לבדוק.
  const previewLink = typeof window !== 'undefined' && previewCode
    ? `${window.location.origin}/?preview=${previewCode}&action=loan` : ''

  useEffect(() => {
    fetch('/api/admin/portal/report-email')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.email) setReportEmail(d.email) })
      .catch(() => {})
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)
    if (password !== confirm) { setResult({ ok: false, msg: 'הסיסמאות אינן תואמות' }); return }
    if (password.length < 8) { setResult({ ok: false, msg: 'הסיסמה חייבת להכיל לפחות 8 תווים' }); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/portal/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const d = await res.json()
      if (res.ok) { setResult({ ok: true, msg: 'הסיסמה עודכנה בהצלחה ✓' }); setPassword(''); setConfirm('') }
      else setResult({ ok: false, msg: d.error ?? 'שגיאה' })
    } catch { setResult({ ok: false, msg: 'שגיאת תקשורת' }) }
    finally { setSaving(false) }
  }

  const saveEmail = async () => {
    setEmailResult(null)
    setSavingEmail(true)
    try {
      const res = await fetch('/api/admin/portal/report-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: reportEmail.trim() }),
      })
      const d = await res.json()
      if (res.ok) setEmailResult({ ok: true, msg: reportEmail.trim() ? 'הכתובת נשמרה ✓' : 'הדוח השבועי בוטל' })
      else setEmailResult({ ok: false, msg: d.error ?? 'שגיאה' })
    } catch { setEmailResult({ ok: false, msg: 'שגיאת תקשורת' }) }
    finally { setSavingEmail(false) }
  }

  const sendTest = async () => {
    setEmailResult(null)
    setSendingTest(true)
    try {
      // שולח לכתובת שמופיעה בשדה — עובד גם לפני שמירה
      const res = await fetch('/api/admin/portal/report-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send: true, email: reportEmail.trim() }),
      })
      const d = await res.json()
      if (res.ok) setEmailResult({ ok: true, msg: `נשלח דוח בדיקה ל-${d.sentTo} ✓` })
      else setEmailResult({ ok: false, msg: d.error ?? 'שליחה נכשלה' })
    } catch { setEmailResult({ ok: false, msg: 'שגיאת תקשורת' }) }
    finally { setSendingTest(false) }
  }

  // שליחה אמיתית עכשיו — שולח את כל ההלוואות החדשות מאז הדוח הקודם ומקדם את החותמת
  const sendNow = async () => {
    setEmailResult(null)
    setSendingNow(true)
    try {
      const res = await fetch('/api/admin/portal/report-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendNow: true, email: reportEmail.trim() }),
      })
      const d = await res.json()
      if (res.ok) setEmailResult({ ok: true, msg: `הדוח נשלח ל-${d.sentTo} · ${d.count} הלוואות מאושרות ✓` })
      else setEmailResult({ ok: false, msg: d.error ?? 'שליחה נכשלה' })
    } catch { setEmailResult({ ok: false, msg: 'שגיאת תקשורת' }) }
    finally { setSendingNow(false) }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
          <Lock size={16} className="text-indigo-500" />
        </div>
        <h2 className="text-sm font-semibold text-slate-700">פורטל הלוואות — שיתוף חיצוני</h2>
      </div>

      {/* Portal URL */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-slate-500">קישור לשיתוף עם גורמי ביצוע:</p>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
          <span dir="ltr" className="text-xs text-slate-700 font-mono flex-1 truncate">{portalUrl || '/shared/loans'}</span>
          {portalUrl && <CopyButton text={portalUrl} />}
          <a href="/shared/loans" target="_blank" rel="noopener noreferrer" title="פתח פורטל" className="text-slate-400 hover:text-indigo-600 transition-colors">
            <ExternalLink size={14} />
          </a>
        </div>
        <p className="text-[11px] text-amber-600 flex items-center gap-1">
          <AlertCircle size={11} />
          כל מי שיש לו את הסיסמה יוכל לסמן הלוואות כבוצעות
        </p>
      </div>

      {/* ── קישור בדיקה נסתר — הגשת בקשת הלוואה כשהמחלקה סגורה ──
          ⚠️ שני קישורים שונים לגמרי באותו מסך, ולכן ההפרדה הוויזואלית:
          זה שלמעלה הוא פורטל *הביצוע* (גורם חיצוני מסמן הלוואות כבוצעות),
          וזה כאן הוא הצד *הציבורי* — הטופס שהלווה ממלא.
          מחלקה סגורה חסומה בשרת, ולכן אי אפשר לבדוק את הזרימה לפני
          הפתיחה לציבור; פתיחה זמנית "רק כדי לבדוק" חושפת את הטופס לכולם. */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
        <p className="text-xs font-bold text-amber-900">🔒 קישור בדיקה נסתר — הגשת בקשה כשהגמ״ח סגור</p>
        <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
          פותח את טופס בקשת ההלוואה גם כשמתג המחלקה סגור, למי שנכנס דרך הקישור בלבד.
          כך אפשר לעבור על כל הזרימה — טופס, שליחה, מייל וכרטסת — לפני הפתיחה לציבור.
          <br />
          מיד לאחר הזיהוי נפתחת חלונית בקשת ההלוואה. הקישור נוגע בהלוואות בלבד — אף מחלקה אחרת אינה מוצגת בו.
        </p>
        {previewCode ? (
          <>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <input readOnly value={previewLink} dir="ltr" onFocus={e => e.currentTarget.select()}
                className="flex-1 min-w-[200px] rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700" />
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(previewLink); setPvCopied(true); setTimeout(() => setPvCopied(false), 1800) }}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700">
                {pvCopied ? '✓ הועתק' : 'העתקה'}
              </button>
              <a href={previewLink} target="_blank" rel="noopener noreferrer"
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100">
                פתח לבדיקה ↗
              </a>
              <button type="button" onClick={regeneratePreview} disabled={pvBusy}
                title="יצירת קוד חדש — מבטלת מיידית כל קישור שהופץ"
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                {pvBusy ? '…' : '↻ קוד חדש'}
              </button>
            </div>
            <p className="mt-2 text-[10px] text-amber-600">
              ⚠️ כל מי שהקישור מגיע לידיו יוכל להגיש בקשה גם כשהמחלקה סגורה. הופץ בטעות? לחצו ״קוד חדש״.
            </p>
          </>
        ) : (
          <p className="mt-2 text-[11px] text-amber-600">הקוד זמין למנהל בלבד.</p>
        )}
      </div>

      {/* Password form */}
      <form onSubmit={submit} className="flex flex-col gap-3 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">סיסמה חדשה</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="לפחות 8 תווים"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-shadow"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">אימות סיסמה</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="הזן שוב..."
              className={`w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-shadow ${
                confirm && confirm !== password ? 'border-red-300 focus:ring-red-300/40' : 'border-slate-200 focus:ring-indigo-500/40 focus:border-indigo-400'
              }`}
            />
          </div>
        </div>

        {result && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${result.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {result.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {result.msg}
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !password || !confirm}
          className="self-start flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 shadow-sm shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
          שמור סיסמה
        </button>
      </form>

      {/* Weekly report email */}
      <div className="border-t border-slate-100 pt-5 flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center">
            <Mail size={16} className="text-violet-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700">דוח שבועי במייל</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">סיכום הלוואות + קישור לפורטל — נשלח כל יום ראשון בבוקר</p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">כתובת לקבלת הדוח</label>
          <input
            type="email"
            dir="ltr"
            value={reportEmail}
            onChange={e => setReportEmail(e.target.value)}
            placeholder="name@example.com (ריק = ללא דוח)"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 text-left placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 transition-shadow"
          />
        </div>

        {emailResult && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${emailResult.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {emailResult.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {emailResult.msg}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={saveEmail}
            disabled={savingEmail}
            className="flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-4 py-2 shadow-sm shadow-violet-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {savingEmail ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
            שמור כתובת
          </button>
          <button
            onClick={sendNow}
            disabled={sendingNow || !reportEmail.trim()}
            title={!reportEmail.trim() ? 'יש להזין כתובת תחילה' : 'שלח עכשיו את כל ההלוואות החדשות מאז הדוח הקודם'}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 shadow-sm shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sendingNow ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            שלח עכשיו
          </button>
          <button
            onClick={sendTest}
            disabled={sendingTest || !reportEmail.trim()}
            title={!reportEmail.trim() ? 'יש להזין כתובת תחילה' : 'שלח דוח בדיקה לכתובת שבשדה'}
            className="flex items-center gap-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sendingTest ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            שלח בדיקה
          </button>
        </div>
        <p className="text-[11px] text-slate-400 -mt-1">
          <strong>שלח עכשיו</strong> = שולח את כל ההלוואות שנכנסו מאז הדוח הקודם ומאפס את הספירה ·
          <strong> שלח בדיקה</strong> = שולח עותק לכתובת שבשדה בלי לאפס
        </p>
      </div>

      {/* ─── טופס אישור רב — כיול מיקומי השדות על הבלאנק ───
          ⚠️ מסך הכיול היה קיים אך לא היה מקושר משום מקום, ולכן לא היה
          דרך להגיע אליו בלי לדעת את הכתובת בעל-פה. */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <FileSignature size={16} className="text-indigo-600" />
          <h3 className="font-bold text-slate-900 text-sm">טופס אישור רב</h3>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          עריכת מיקום כל שדה על גבי הבלאנק — שם המבקש, תעודת זהות, סכום ומספר תשלומים.
          המסך מציג תצוגה מקדימה חיה של הטופס בדיוק כפי שהמבקש מקבל אותו.
        </p>
        <a
          href="/admin/settings/rabbi-form"
          className="self-start flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 shadow-sm shadow-indigo-200 transition-colors"
        >
          <FileSignature size={13} /> עריכת הטופס
        </a>
      </div>
    </div>
  )
}
