'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { UserPen, Loader2, Check, X } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// חלונית התראה על בקשות שינוי שם ממתינות.
//
// 🔴 קופצת בכניסה לתוכנה: בקשת שינוי שם חוסמת את המשתמש — הוא רואה במסך
// שלו שם שגוי ואינו יכול לתקן בעצמו. התראה שממתינה לכניסה למסך ייעודי
// הייתה משאירה אותו כך לימים.
//
// ⚠️ סגירה אינה מכריעה: הבקשות נשארות גם ב"ממתינים לטיפול", כדי שמנהל
// שסגר בטעות לא יאבד אותן.
// ─────────────────────────────────────────────────────────────────────────────

/** פרטי הזיהוי של המשפחה — כדי להכריע בלי לפתוח את הכרטסת בחלון נפרד. */
interface BenInfo {
  familyName: string
  id_number: string | null
  family_name: string | null
  full_name: string | null
  spouse_name: string | null
  spouse_id_number: string | null
  city: string | null
  address: string | null
  phone: string | null
  email: string | null
  marital_status: string | null
  children_count: number | null
  lineage_chain: { generation: number; name: string; relation: 'son' | 'son_in_law' | null }[] | null
}

interface Req {
  id: string
  beneficiary_id: string
  target: 'self' | 'spouse' | 'family'
  old_name: string | null
  new_name: string
  requested_at: string
  familyName: string
  beneficiary: BenInfo | null
}

/** ⚠️ נזכר ב-sessionStorage ולא ב-localStorage: "לא עכשיו" תקף לסשן הזה
 *  בלבד. בקשה שלא הוכרעה חייבת לחזור ולהופיע מחר. */
const DISMISS_KEY = 'name-change-alert-dismissed'

/** שם השדה המבוקש — מוצג בכותרת הבקשה ומדגיש את השורה המתאימה. */
const TARGET_LABEL: Record<string, string> = {
  self: 'שם הבעל',
  spouse: 'שם האישה',
  family: 'שם המשפחה',
}

/**
 * שורת פרט בכרטיס. ⚠️ ערך חסר מוצג כ־"—" ולא מוסתר: היעדר ת"ז או כתובת
 * הוא עצמו מידע שרלוונטי להכרעה, ושורה שנעלמת מסיטה את כל הרשת.
 * ltr — לערכים מספריים (ת"ז, טלפון, מייל) שנשברים בתצוגת RTL.
 */
function Detail({ label, value, ltr, highlight }: {
  label: string; value: string | null; ltr?: boolean; highlight?: boolean
}) {
  return (
    <div className={`min-w-0 ${highlight ? 'rounded-md bg-amber-100 -mx-1 px-1 py-0.5' : ''}`}>
      <dt className="text-[10px] font-semibold text-slate-400">{label}</dt>
      <dd className={`truncate font-medium ${highlight ? 'text-amber-900' : 'text-slate-700'} ${ltr ? 'ltr-num text-right' : ''}`}
        dir={ltr ? 'ltr' : undefined} title={value ?? undefined}>
        {value || '—'}
      </dd>
    </div>
  )
}

export default function NameChangeAlert() {
  const router = useRouter()
  const [reqs, setReqs] = useState<Req[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/name-changes', { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (r.ok) setReqs(d.requests ?? [])
    } catch { /* שקט — לא מפילים את הכניסה לתוכנה */ }
  }, [])

  useEffect(() => {
    try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1') } catch { setDismissed(false) }
    void load()
  }, [load])

  const decide = async (id: string, approve: boolean) => {
    setBusy(id)
    try {
      const r = await fetch('/api/admin/name-changes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approve }),
      })
      if (r.ok) {
        setReqs(prev => prev.filter(x => x.id !== id))
        router.refresh()
      }
    } catch { /* נשאר ברשימה — ניסיון חוזר */ }
    finally { setBusy(null) }
  }

  const close = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setDismissed(true)
  }

  if (dismissed || !reqs.length) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      {/* ⚠️ הורחב מ-max-w-lg: עם פרטי הזיהוי וסדר הדורות התוכן נדחס
          לעמודה צרה והשמות נחתכו. */}
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <UserPen size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800">בקשות לתיקון שם</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {reqs.length} ממתינות לאישורך
            </p>
          </div>
          <button type="button" onClick={close} aria-label="סגירה"
            className="text-slate-400 transition hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 flex flex-col gap-2.5">
          {reqs.map(r => (
            <div key={r.id} className="rounded-xl border border-slate-200 px-3.5 py-3">
              <p className="text-[13px] font-bold text-slate-800">{r.familyName}</p>
              {/* ⚠️ שם השדה המבוקש נאמר במפורש — כולל שם המשפחה, שהוא
                  היעד השלישי. בלעדיו אי אפשר לדעת מה עומד להשתנות. */}
              <p className="mt-1 text-[12px] text-slate-600">
                <span className="inline-block rounded bg-slate-100 px-1.5 py-px font-bold text-slate-700">
                  {TARGET_LABEL[r.target] ?? 'שם'}
                </span>{' '}
                <span className="text-rose-600 line-through">{r.old_name || '—'}</span>
                {/* ⚠️ ← ולא →: הממשק בעברית (RTL) והקריאה מימין לשמאל.
                    הישן מופיע מימין והחדש משמאל, ולכן חץ ימינה מצביע
                    הפוך מכיוון השינוי. */}
                <span className="mx-1.5 text-slate-400">←</span>
                <span className="font-bold text-emerald-700">{r.new_name}</span>
              </p>

              {/* 🔴 פרטי המשפחה — ההכרעה נעשית כאן, ולכן הנתונים שצריך כדי
                  להכריע נמצאים כאן. בלעדיהם "דבי → חיים" אינו אומר דבר:
                  שמות פרטיים חוזרים על עצמם, וצריך ת"ז/כתובת כדי לדעת
                  באיזו משפחה מדובר. */}
              {r.beneficiary && (
                <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-slate-50 px-3 py-2.5 text-[11.5px]">
                  <Detail label="שם משפחה" value={r.beneficiary.family_name}
                    highlight={r.target === 'family'} />
                  <Detail label="תעודת זהות" value={r.beneficiary.id_number} ltr />
                  {/* ⚠️ בן/בת הזוג מודגש כשהוא *נושא השינוי* — זה השדה שעומד
                      להשתנות, והעין צריכה ליפול עליו. */}
                  <Detail label="שם הבעל" value={r.beneficiary.full_name}
                    highlight={r.target === 'self'} />
                  <Detail label="שם האישה" value={r.beneficiary.spouse_name}
                    highlight={r.target === 'spouse'} />
                  <Detail label="ת״ז בת הזוג" value={r.beneficiary.spouse_id_number} ltr />
                  <Detail label="מצב משפחתי" value={r.beneficiary.marital_status} />
                  <Detail label="עיר" value={r.beneficiary.city} />
                  <Detail label="כתובת" value={r.beneficiary.address} />
                  <Detail label="טלפון" value={r.beneficiary.phone} ltr />
                  <Detail label="מייל" value={r.beneficiary.email} ltr />
                  <Detail label="מספר ילדים"
                    value={r.beneficiary.children_count != null ? String(r.beneficiary.children_count) : null} />
                </dl>
              )}

              {/* ── סדר הדורות, שורה אחרי שורה ──
                  ⚠️ ממוין לפי דור: הסדר הוא כל המשמעות של הייחוס, ורשימה
                  לא ממוינת מציגה שרשרת שבורה. דור 1 הוא רבינו החתם סופר. */}
              {r.beneficiary?.lineage_chain?.length ? (
                <div className="mt-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <p className="text-[10px] font-semibold text-slate-400 mb-1.5">סדר הדורות</p>
                  <ol className="flex flex-col gap-1">
                    {r.beneficiary.lineage_chain
                      .slice()
                      .sort((a, b) => a.generation - b.generation)
                      .map((g, i) => (
                        <li key={`${g.generation}-${i}`} className="flex items-start gap-2 text-[11.5px] leading-snug">
                          <span className="mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-indigo-50 text-[9px] font-bold text-indigo-600">
                            {g.generation}
                          </span>
                          <span className="min-w-0 flex-1 font-medium text-slate-700">{g.name}</span>
                          {g.relation && (
                            <span className="flex-shrink-0 rounded px-1.5 py-px text-[9px] font-bold text-slate-500 bg-slate-100">
                              {g.relation === 'son' ? 'בן' : 'חתן'}
                            </span>
                          )}
                        </li>
                      ))}
                  </ol>
                </div>
              ) : (
                <p className="mt-2.5 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-400">
                  לא נרשם סדר דורות למשפחה זו
                </p>
              )}

              {/* קישור לכרטסת — לכל מה שלא נכנס לכאן */}
              <a href={`/admin/beneficiaries/${r.beneficiary_id}`} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-block text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline">
                פתיחת הכרטסת המלאה ↗
              </a>
              <div className="mt-2.5 flex items-center gap-2">
                <button type="button" onClick={() => void decide(r.id, true)} disabled={busy === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                  {busy === r.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  אישור
                </button>
                <button type="button" onClick={() => void decide(r.id, false)} disabled={busy === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500 transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-50">
                  <X size={11} /> דחייה
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ⚠️ נאמר במפורש: סגירה אינה מוחקת. אחרת מנהל שממהר חושש לסגור. */}
        <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">
            הבקשות נשמרות גם ב״ממתינים לטיפול״
          </span>
          <button type="button" onClick={close}
            className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50">
            לא עכשיו
          </button>
        </div>
      </div>
    </div>
  )
}
