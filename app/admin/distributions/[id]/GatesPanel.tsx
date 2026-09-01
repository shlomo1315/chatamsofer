'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Check, X, Clock, CalendarClock, AlertTriangle } from 'lucide-react'
import { formatCountdown } from '@/lib/centerDeadline'

// ─────────────────────────────────────────────────────────────────────────────
// לוח השערים של החלוקה — מה פתוח כרגע, בשורה אחת.
//
// 🔴 למה זה קיים: שני השערים חיו במקומות רחוקים — "מצב הרישום" בכרטיס
// שבראש המסך, ובחירת המוקדים בתוך טאב "מוקדי חלוקה" שנפתח רק בלחיצה.
// המנהל לא יכול היה לראות בשום מסך *מה פתוח כרגע*, ובפועל זה עלה ביוקר:
// בחירת המוקדים נפתחה בזמן שהרישום היה סגור, ואיש לא ראה שהמשפחות
// מקבלות "הרישום סגור כעת" במקום את רשימת המוקדים.
//
// ⚠️ שני שערים עצמאיים ולא מתג אחד: הבחירה נפתחת דווקא *אחרי* שהרישום
// נסגר. איחודם היה חוסם את הבחירה בדיוק כשהיא אמורה לפעול.
//
// ⚠️ הספירה מגיעה מהשרת (ms_left) ולא מחושבת מהתאריך בדפדפן: שעון מוסט
// היה מראה למנהל מספר אחר ממה שהמשפחות שומעות בטלפון.
// ─────────────────────────────────────────────────────────────────────────────

/** המרת ISO לערך של <input type="datetime-local"> בשעון המקומי. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Pill({ open, label }: { open: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
      open ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {label}
    </span>
  )
}

export default function GatesPanel({
  distributionId, registrationOpen, onToggleRegistration, registrationBusy, canEdit,
}: {
  distributionId: string
  registrationOpen: boolean
  onToggleRegistration: () => void
  registrationBusy: boolean
  canEdit: boolean
}) {
  const [centersOpen, setCentersOpen] = useState<boolean | null>(null)
  // 🔴 שער האיסוף — "אפשר כבר לבוא למוקד". נפרד משער הבחירה: הבחירה
  // נסגרת דווקא לפני שהאיסוף נפתח.
  const [pickupOpen, setPickupOpen] = useState<boolean | null>(null)
  const [note, setNote] = useState('')
  const [deadline, setDeadline] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [msLeft, setMsLeft] = useState<number | null>(null)
  const [passed, setPassed] = useState(false)
  const [busy, setBusy] = useState<'gate' | 'deadline' | 'pickup' | 'note' | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/distributions/${encodeURIComponent(distributionId)}/centers-open`,
        { cache: 'no-store' },
      )
      const d = await res.json().catch(() => ({}))
      if (!res.ok) return
      setCentersOpen(!!d.centers_open)
      setPickupOpen(!!d.pickup_open)
      setNote(d.pickup_note ?? '')
      setDeadline(d.centers_deadline ?? null)
      setDraft(toLocalInput(d.centers_deadline ?? null))
      setMsLeft(typeof d.ms_left === 'number' ? d.ms_left : null)
      setPassed(!!d.deadline_passed)
    } catch { /* טעינה שנכשלה משאירה את הלוח במצב "טוען" ואינה מפילה את המסך */ }
  }, [distributionId])

  useEffect(() => { void load() }, [load])

  // ⚠️ ספירה מקומית בין רענונים, על בסיס הערך מהשרת — כדי שהמספר יזוז
  // בלי לתחקר את השרת בכל שנייה.
  useEffect(() => {
    if (msLeft === null) return
    const t = setInterval(() => {
      setMsLeft(prev => (prev === null ? null : Math.max(0, prev - 1000)))
    }, 1000)
    return () => clearInterval(t)
  }, [msLeft === null])

  async function post(body: Record<string, unknown>, which: 'gate' | 'deadline' | 'pickup' | 'note') {
    setBusy(which); setErr('')
    try {
      const res = await fetch(
        `/api/admin/distributions/${encodeURIComponent(distributionId)}/centers-open`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      )
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'העדכון נכשל'); return }
      await load()
    } catch { setErr('שגיאת רשת') } finally { setBusy(null) }
  }

  // 🔴 השער האפקטיבי — מה שהמשפחה באמת פוגשת. מתג פתוח שהמועד שלו
  // חלף הוא סגור בפועל, וזו בדיוק הטעות שקשה לראות בלי להציג אותה.
  const centersEffective = !!centersOpen && !passed

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-extrabold text-slate-900">מה פתוח כרגע</h3>
        <Pill open={registrationOpen} label={`רישום ${registrationOpen ? 'פתוח' : 'סגור'}`} />
        <Pill open={centersEffective} label={`בחירת מוקדים ${centersEffective ? 'פתוחה' : 'סגורה'}`} />
        <Pill open={!!pickupOpen} label={`איסוף במוקד ${pickupOpen ? 'פתוח' : 'סגור'}`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* ── שער הרישום ── */}
        <div className={`rounded-xl border-2 p-3.5 ${
          registrationOpen ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
          <p className="text-[11px] font-bold text-slate-500">שער הרישום</p>
          <p className={`mt-0.5 text-sm font-extrabold ${
            registrationOpen ? 'text-emerald-800' : 'text-slate-600'}`}>
            {registrationOpen ? 'משפחות יכולות להירשם' : 'הרישום סגור'}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            חל על הפורטל, השלוחה הטלפונית, נדרים והמייל.
          </p>
          {canEdit && (
            <button type="button" onClick={onToggleRegistration} disabled={registrationBusy}
              className={`mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white transition disabled:opacity-50 ${
                registrationOpen ? 'bg-slate-600 hover:bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {registrationBusy ? <Loader2 size={13} className="animate-spin" />
                : registrationOpen ? <X size={13} /> : <Check size={13} />}
              {registrationOpen ? 'סגור את הרישום' : 'פתח את הרישום'}
            </button>
          )}
        </div>

        {/* ── שער בחירת המוקדים ── */}
        <div className={`rounded-xl border-2 p-3.5 ${
          centersEffective ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
          <p className="text-[11px] font-bold text-slate-500">בחירת מוקדים</p>
          <p className={`mt-0.5 text-sm font-extrabold ${
            centersEffective ? 'text-emerald-800' : 'text-slate-600'}`}>
            {centersOpen === null ? 'טוען…'
              : centersEffective ? 'משפחות מאושרות יכולות לבחור'
              : passed ? 'המועד חלף — סגור בפועל'
              : 'הבחירה סגורה'}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            ⚠️ עצמאי משער הרישום — נפתח דווקא אחרי סגירתו.
          </p>
          {canEdit && centersOpen !== null && (
            <button type="button" disabled={busy === 'gate'}
              onClick={() => void post({ centers_open: !centersOpen }, 'gate')}
              className={`mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
                centersOpen
                  ? 'bg-slate-600 text-white hover:bg-slate-700'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
              {busy === 'gate' ? <Loader2 size={13} className="animate-spin" />
                : centersOpen ? <X size={13} /> : <Check size={13} />}
              {centersOpen ? 'סגור בחירה' : 'פתח בחירה'}
            </button>
          )}
        </div>
      </div>

      {/* ── שער האיסוף ──
          🔴 עד שהוא נפתח המשפחה יודעת *לאן* אבל לא *מתי*, ורואה הודעת
          המתנה מפורשת. ברגע הפתיחה מוצגות לה הכתובת המדויקת והשעות
          של המוקד שבחרה — מתוך פרטי המוקד עצמו. */}
      <div className={`mt-3 rounded-xl border-2 p-3.5 ${
        pickupOpen ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500">איסוף במוקד</p>
            <p className={`mt-0.5 text-sm font-extrabold ${
              pickupOpen ? 'text-emerald-800' : 'text-slate-600'}`}>
              {pickupOpen === null ? 'טוען…'
                : pickupOpen ? 'המשפחות רואות כתובת ושעות'
                : 'טרם נפתח — המשפחות רואות הודעת המתנה'}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              ⚠️ לפתוח רק כשהכרטיסים מוכנים במוקדים — הכתובות הן בתים פרטיים של מתנדבים.
            </p>
          </div>
          {canEdit && pickupOpen !== null && (
            <button type="button" disabled={busy === 'pickup'}
              onClick={() => void post({ pickup_open: !pickupOpen }, 'pickup')}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50 ${
                pickupOpen ? 'bg-slate-600 hover:bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {busy === 'pickup' ? <Loader2 size={13} className="animate-spin" />
                : pickupOpen ? <X size={13} /> : <Check size={13} />}
              {pickupOpen ? 'סגור איסוף' : 'פתח איסוף'}
            </button>
          )}
        </div>

        {/* הודעה חופשית שמוצגת לצד השעות (למשל "יש להביא תעודת זהות"). */}
        {canEdit && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="הודעה למשפחות לצד השעות (לא חובה)"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700" />
            <button type="button" disabled={busy === 'note'}
              onClick={() => void post({ pickup_note: note }, 'note')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50">
              {busy === 'note' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              שמור הודעה
            </button>
          </div>
        )}
      </div>

      {/* ── המועד האחרון לבחירה ── */}
      {canEdit && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
            <CalendarClock size={13} className="text-slate-400" /> עד מתי הבחירה פתוחה
          </p>

          {/* 🔴 הספירה שהמשפחה רואה באתר ושומעת בטלפון — אותו מספר בדיוק. */}
          {msLeft !== null && !passed && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1 text-[12px] font-extrabold text-emerald-800">
              <Clock size={12} /> נותרו {formatCountdown(msLeft) || 'פחות מדקה'}
            </p>
          )}
          {passed && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-[12px] font-extrabold text-amber-800">
              <AlertTriangle size={12} /> המועד חלף — הבחירה סגורה גם אם המתג פתוח
            </p>
          )}
          {deadline === null && (
            <p className="mt-1 text-[11px] text-slate-500">
              לא הוגדר מועד — הבחירה נשלטת במתג בלבד.
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input type="datetime-local" value={draft} onChange={e => setDraft(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700" />
            <button type="button" disabled={busy === 'deadline'}
              onClick={() => void post(
                { centers_deadline: draft ? new Date(draft).toISOString() : null },
                'deadline',
              )}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              {busy === 'deadline' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              שמור מועד
            </button>
            {/* ⚠️ ניקוי מפורש — ריק נשלח כ-null, אחרת "מחקתי את התאריך" לא עושה דבר. */}
            {deadline && (
              <button type="button" disabled={busy === 'deadline'}
                onClick={() => { setDraft(''); void post({ centers_deadline: null }, 'deadline') }}
                className="text-[11px] font-semibold text-slate-500 underline hover:text-rose-600">
                הסרת המועד
              </button>
            )}
          </div>
        </div>
      )}

      {err && (
        <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700">{err}</p>
      )}
    </div>
  )
}
