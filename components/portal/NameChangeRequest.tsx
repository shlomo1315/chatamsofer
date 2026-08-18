'use client'
import { useState, useEffect, useCallback } from 'react'
import { UserPen, Loader2, Clock, X, Check } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// בקשת שינוי שם פרטי מהאזור האישי.
//
// 🔴 השם אינו משתנה כאן. הוא מזהה את האדם מול המשרד, מול עץ הדורות ומול
// החלוקות — ושינוי חופשי שלו היה מאפשר להחליף זהות של רשומה מאושרת, כולל
// את הזכאות שנצברה לה. הבקשה נשמרת, ההנהלה מכריעה.
//
// ⚠️ רכיב נפרד ולא שדה בטופס העדכון: כל שאר השדות נשמרים מיד, וערבוב שדה
// שדורש אישור ביניהם היה יוצר טופס שחציו נשמר וחציו ממתין — בלי שהמשתמש
// יודע מה קרה למה.
// ─────────────────────────────────────────────────────────────────────────────

interface PendingRequest {
  id: string
  target: 'self' | 'spouse' | 'family'
  new_name: string
  status: 'pending' | 'rejected'
  requested_at: string
  reject_reason?: string | null
}

export default function NameChangeRequest({ beneficiaryId, currentName, spouseName, familyName, hasSpouse }: {
  beneficiaryId: string
  currentName: string
  spouseName?: string | null
  /** שם המשפחה — יעד שלישי לבקשת תיקון (טעון אישור, כמו השאר). */
  familyName?: string | null
  hasSpouse: boolean
}) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<'self' | 'spouse' | 'family'>('self')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pending, setPending] = useState<PendingRequest[]>([])

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/portal/name-change', { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (r.ok) setPending(d.requests ?? [])
    } catch { /* נשאר ריק */ }
  }, [])

  useEffect(() => { void load() }, [load])

  const currentFor = (t: 'self' | 'spouse' | 'family') =>
    (t === 'spouse' ? spouseName : t === 'family' ? familyName : currentName) ?? ''

  const submit = async () => {
    const v = value.trim()
    if (!v) { setMsg({ kind: 'err', text: 'יש להזין שם' }); return }
    if (v === currentFor(target).trim()) {
      setMsg({ kind: 'err', text: 'השם שהוזן זהה לשם הקיים' }); return
    }
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/portal/name-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiary_id: beneficiaryId, target, new_name: v }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ kind: 'err', text: d?.error || 'שליחת הבקשה נכשלה' }); return }
      setMsg({ kind: 'ok', text: 'הבקשה נשלחה להנהלה. השם יתעדכן לאחר האישור.' })
      setValue('')
      setOpen(false)
      await load()
    } catch {
      setMsg({ kind: 'err', text: 'שליחת הבקשה נכשלה' })
    } finally { setBusy(false) }
  }

  const openPending = pending.filter(p => p.status === 'pending')
  const rejected = pending.filter(p => p.status === 'rejected')

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <UserPen size={16} className="text-indigo-500" />
        <h3 className="text-sm font-bold text-slate-800">תיקון שם</h3>
      </div>

      {/* ⚠️ נאמר מראש שזה טעון אישור — משתמש שמצפה לשינוי מיידי ולא רואה
          אותו מניח שהמערכת לא עבדה, ומנסה שוב ושוב. */}
      <p className="text-[12px] text-slate-500">
        שינוי שם טעון אישור ההנהלה — כולל שם המשפחה. תעודת הזהות מתעדכנת במשרד בלבד.
      </p>

      {/* בקשות ממתינות */}
      {openPending.map(p => (
        <div key={p.id} className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <Clock size={13} className="shrink-0" />
          <span>
            {/* ← ולא →: ממשק RTL, הקריאה מימין לשמאל */}
            ממתין לאישור: {p.target === 'spouse' ? 'שם האישה' : p.target === 'family' ? 'שם המשפחה' : 'שם הבעל'} ← <b>{p.new_name}</b>
          </span>
        </div>
      ))}

      {/* בקשות שנדחו — ⚠️ מוצגות כדי שהמשתמש לא יחשוב שהבקשה נעלמה */}
      {rejected.map(p => (
        <div key={p.id} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">
          <span className="flex items-center gap-1.5 font-bold">
            <X size={13} /> הבקשה ל־{p.new_name} לא אושרה
          </span>
          {p.reject_reason && <span className="mt-0.5 block text-rose-800">{p.reject_reason}</span>}
        </div>
      ))}

      {msg && (
        <p className={`text-[12px] ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>
          {msg.kind === 'ok' && <Check size={12} className="inline ml-1" />}
          {msg.text}
        </p>
      )}

      {!open ? (
        <button type="button" onClick={() => { setOpen(true); setValue(currentFor(target)) }}
          className="self-start rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600">
          בקשת תיקון שם
        </button>
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* ⚠️ הבוררים מוצגים תמיד, ולא רק כשיש בן/בת זוג: שם המשפחה הוא
              יעד חוקי גם למשפחה בלי בן/בת זוג רשומים. קודם כל הבורר היה
              עטוף ב-hasSpouse, ומי שאין לו בן/בת זוג לא יכול היה לבחור
              כלל — כולל את שם המשפחה. */}
          {(hasSpouse || familyName) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                ...(hasSpouse ? [
                  { v: 'self' as const, l: 'שם הבעל' },
                  { v: 'spouse' as const, l: 'שם האישה' },
                ] : []),
                ...(familyName ? [{ v: 'family' as const, l: 'שם המשפחה' }] : []),
              ]).map(o => (
                <button key={o.v} type="button"
                  onClick={() => { setTarget(o.v); setValue(currentFor(o.v)) }}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                    target === o.v
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300'
                  }`}>{o.l}</button>
              ))}
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-slate-500">
              השם הנכון (כרגע: {currentFor(target) || '—'})
            </span>
            <input value={value} onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void submit() }}
              maxLength={60}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
          </label>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void submit()} disabled={busy || !value.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              שליחה לאישור
            </button>
            <button type="button" onClick={() => { setOpen(false); setMsg(null) }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50">
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
