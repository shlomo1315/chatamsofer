'use client'
import { useState, useEffect } from 'react'
import { Loader2, CreditCard, AlertTriangle, Check, Eye, EyeOff } from 'lucide-react'
import { useCan } from '@/components/StaffPermissions'

// הגדרות ספק הסליקה.
//
// 🔴 המסך מבדיל בין *מה שהוזן* לבין *מה שפעיל*: ספק שהוזן חלקית, או
// שמצב הבדיקה דולק, נופל למדומה — והחנות מוכרת בלי לגבות. הצגת
// "נדרים" כשבפועל רץ המדומה היא בדיוק הדרך לגלות את זה מהבנק.
//
// ⚠️ קוד ה-API אינו נשלף מהשרת לעולם. השדה ריק תמיד, וריק פירושו
// "אל תשנה" — כך אפשר לערוך את קוד המוסד בלי להקליד אותו מחדש.

type State = {
  provider: string
  mosadId: string
  hasApiValid: boolean
  testMode: boolean
  activeProvider: string
}

export default function PaymentSettings() {
  const canEdit = useCan('book_fair', 'edit')

  const [s, setS] = useState<State | null>(null)
  const [apiValid, setApiValid] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // ⚠️ טעינה באפקט ולא ב-SSR: המסך הזה נטען נדיר, והוספת שליפה
  // לדף ההגדרות כולו הייתה מאטה אותו לכולם.
  useEffect(() => {
    let alive = true
    fetch('/api/admin/book-fair/payments')
      .then(r => r.json())
      .then(d => { if (alive && !d.error) setS(d) })
      .catch(() => { /* המסך פשוט לא יוצג */ })
    return () => { alive = false }
  }, [])

  async function save(patch: Record<string, unknown>, tag: string) {
    setBusy(tag); setMsg(null)
    try {
      const res = await fetch('/api/admin/book-fair/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ ok: false, text: d.error ?? 'השמירה נכשלה' }); return }
      setApiValid('')
      // רענון המצב, כולל מה שבאמת פעיל אחרי השינוי
      const fresh = await fetch('/api/admin/book-fair/payments').then(r => r.json())
      setS(fresh)
      setMsg({ ok: true, text: 'נשמר' })
    } catch {
      setMsg({ ok: false, text: 'השמירה נכשלה — בדקו את החיבור' })
    } finally {
      setBusy(null)
    }
  }

  async function test() {
    setBusy('test'); setMsg(null)
    try {
      const res = await fetch('/api/admin/book-fair/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      })
      const d = await res.json().catch(() => ({}))
      setMsg({ ok: d.ok === true, text: d.message ?? d.error ?? 'הבדיקה נכשלה' })
    } catch {
      setMsg({ ok: false, text: 'הבדיקה נכשלה — בדקו את החיבור' })
    } finally {
      setBusy(null)
    }
  }

  if (!s) return null

  const live = s.activeProvider !== 'mock'

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
        <CreditCard size={17} /> ספק הסליקה
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        חיבור לגביית תשלומים בכרטיס אשראי. נפרד לחלוטין מנדרים קארד (כרטיסי המזון).
      </p>

      {/* 🔴 מה פעיל *באמת* — הדבר החשוב ביותר במסך. */}
      <div className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
        live ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
             : 'border-red-200 bg-red-50 text-red-800'
      }`}>
        {live ? <Check size={16} className="mt-0.5 shrink-0" />
              : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
        <span>
          {live ? (
            <><strong>סליקה פעילה</strong> — התשלומים נגבים בפועל.</>
          ) : (
            <>
              <strong>סליקה מדומה</strong> — הזמנות מסומנות כ״שולמו״ ומורידות מהמלאי
              <strong> בלי שייגבה תשלום</strong>.
              {s.provider === 'nedarim' && s.testMode && ' מצב הבדיקה דולק.'}
              {s.provider === 'nedarim' && !s.testMode && !s.hasApiValid && ' חסר קוד API.'}
            </>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">ספק</span>
          <select
            value={s.provider}
            onChange={e => save({ provider: e.target.value }, 'provider')}
            disabled={!canEdit || !!busy}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">מדומה (בדיקות בלבד)</option>
            <option value="nedarim">נדרים פלוס — תשלומים</option>
          </select>
        </label>

        {s.provider === 'nedarim' && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">קוד מוסד</span>
              <input
                defaultValue={s.mosadId}
                onBlur={e => { if (e.target.value.trim() !== s.mosadId) save({ mosadId: e.target.value }, 'mosad') }}
                disabled={!canEdit || !!busy}
                dir="ltr" inputMode="numeric"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">
                קוד API
                {s.hasApiValid && <span className="mr-2 text-xs font-normal text-emerald-600">· הוזן</span>}
              </span>
              <div className="flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiValid}
                  onChange={e => setApiValid(e.target.value)}
                  placeholder={s.hasApiValid ? '••••••••  (ריק = ללא שינוי)' : 'הזינו את קוד ה-API'}
                  disabled={!canEdit || !!busy}
                  dir="ltr"
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="rounded-xl border border-slate-200 px-3 text-slate-500 hover:bg-slate-50"
                  title={showKey ? 'הסתרה' : 'הצגה'}
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button
                  onClick={() => save({ apiValid }, 'key')}
                  disabled={!canEdit || !!busy || !apiValid.trim()}
                  className="rounded-xl bg-slate-800 px-4 text-sm font-medium text-white disabled:opacity-40"
                >
                  {busy === 'key' ? <Loader2 size={14} className="animate-spin" /> : 'שמירה'}
                </button>
              </div>
            </label>

            {/* 🔴 המתג שמפריד בין בדיקה לגבייה אמיתית. */}
            <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
              <input
                type="checkbox"
                checked={s.testMode}
                onChange={e => save({ testMode: e.target.checked }, 'mode')}
                disabled={!canEdit || !!busy}
                className="mt-0.5 rounded"
              />
              <span className="text-sm">
                <span className="font-medium text-slate-800">מצב בדיקה</span>
                <span className="block text-xs text-slate-500">
                  כשמסומן — הסליקה מדומה גם אם הפרטים מלאים. כבו רק כשמוכנים לגבות באמת.
                </span>
              </span>
            </label>

            <div className="sm:col-span-2">
              <button
                onClick={test}
                disabled={!canEdit || !!busy}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                {busy === 'test' ? <Loader2 size={14} className="animate-spin" /> : 'בדיקת חיבור'}
              </button>
            </div>
          </>
        )}
      </div>

      {msg && (
        <p className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
          msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                 : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {msg.text}
        </p>
      )}
    </section>
  )
}
