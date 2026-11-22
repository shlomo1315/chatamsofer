'use client'
import { useState, useEffect, useCallback } from 'react'
import { Phone, Loader2, ShieldAlert, Check, MapPin, Clock } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// כללי הרישום של החלוקה — "בטלפון בלבד" ושאר המתגים (חנוכה תשפ״ז ואילך).
//
// 🔴 "רישום בטלפון בלבד" סוגר את האזור האישי, הרישום הציבורי, המייל, טופס
// נדרים וקישורי ההזמנה, ומציג בכל אחד מהם הודעה בולטת עם מספר הקו. בקו
// עצמו נפתח מסלול רישום מלא (ת"ז, תאריך לידה, טלפון, הצהרות, בחירת מוקד).
// ─────────────────────────────────────────────────────────────────────────────

interface Rules {
  phoneOnly: boolean
  blockDeepReview: boolean
  autoApprove: boolean
  hoursPublished: boolean
  phoneNumber: string
}

export default function PhoneRulesPanel({ distributionId, canEdit }: { distributionId: string; canEdit: boolean }) {
  const [rules, setRules] = useState<Rules | null>(null)
  const [defaultPhone, setDefaultPhone] = useState('')
  const [centers, setCenters] = useState<{ open: number; active: number } | null>(null)
  const [deepCount, setDeepCount] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [phoneDraft, setPhoneDraft] = useState('')

  const url = `/api/admin/distributions/${encodeURIComponent(distributionId)}/rules`
  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'הטעינה נכשלה'); return }
      setRules(d.rules)
      setPhoneDraft(d.rules?.phoneNumber ?? '')
      setDefaultPhone(d.defaultPhoneNumber ?? '')
      setCenters(d.centers ?? null)
      setDeepCount(typeof d.deepReviewFamilies === 'number' ? d.deepReviewFamilies : null)
    } catch { setErr('שגיאת רשת') }
  }, [url])

  useEffect(() => { void load() }, [load])

  async function save(patch: Partial<Rules>, which: string) {
    setBusy(which); setErr('')
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: patch }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'השמירה נכשלה'); return }
      setRules(d.rules)
    } catch { setErr('שגיאת רשת') } finally { setBusy(null) }
  }

  async function openAllCenters() {
    setBusy('centers'); setErr('')
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open_all_centers' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'הפעולה נכשלה'); return }
      await load()
    } catch { setErr('שגיאת רשת') } finally { setBusy(null) }
  }

  if (!rules) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
        {err || <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />טוען את כללי הרישום…</span>}
      </div>
    )
  }

  const shownPhone = rules.phoneNumber || defaultPhone
  const toggle = ({ k, title, desc, icon, tone }: {
    k: keyof Omit<Rules, 'phoneNumber'>; title: string; desc: React.ReactNode; icon: React.ReactNode; tone: string
  }) => (
    <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 transition-colors ${
      rules[k] ? tone : 'border-slate-200 bg-slate-50/50'} ${!canEdit ? 'cursor-not-allowed opacity-70' : ''}`}>
      <input type="checkbox" checked={rules[k]} disabled={!canEdit || !!busy}
        onChange={e => void save({ [k]: e.target.checked }, k)}
        className="mt-1 h-5 w-5 rounded border-slate-300 text-navy focus:ring-gold" />
      <span className="flex-1">
        <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          {icon}{title}
          {busy === k && <Loader2 size={14} className="animate-spin text-slate-400" />}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-slate-600">{desc}</span>
      </span>
    </label>
  )

  return (
    <section className={`rounded-2xl border-2 p-5 ${rules.phoneOnly ? 'border-teal-400 bg-teal-50/40' : 'border-slate-200 bg-white'}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
          <Phone size={18} className="text-teal-700" /> כללי הרישום לחלוקה
        </h2>
        {rules.phoneOnly && (
          <span className="rounded-full bg-teal-600 px-3 py-1 text-xs font-extrabold text-white">
            📞 רישום בטלפון בלבד{shownPhone ? ` · ${shownPhone}` : ''}
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {toggle({
          k: 'phoneOnly', icon: <Phone size={15} className="text-teal-700" />, tone: 'border-teal-500 bg-teal-50',
          title: 'רישום בטלפון בלבד',
          desc: <>האתר, הרישום הציבורי, המייל, טופס נדרים וקישורי ההזמנה <strong>לא ירשמו</strong> ויציגו הודעה בולטת עם מספר הקו.
            בקו נפתח מסלול מלא: ת&quot;ז → תאריך לידה → טלפון → הצהרת ייחוס → הצהרת נזקקות → בחירת מוקד (מקש 5).</>,
        })}
        {toggle({
          k: 'blockDeepReview', icon: <ShieldAlert size={15} className="text-orange-600" />, tone: 'border-orange-400 bg-orange-50',
          title: 'חסימת משפחות בבדיקה מעמיקה',
          desc: <>משפחה שבכרטסת שלה הסטטוס &quot;בדיקה מעמיקה&quot; לא תוכל להירשם, ותשמע &quot;לפרטים נא לפנות למשרד&quot;.
            {deepCount !== null && <> כרגע במאגר: <strong>{deepCount.toLocaleString('he-IL')}</strong> משפחות.</>}</>,
        })}
        {toggle({
          k: 'autoApprove', icon: <Check size={15} className="text-emerald-700" />, tone: 'border-emerald-400 bg-emerald-50',
          title: 'אישור זכאות מיידי ברישום הטלפוני',
          desc: 'מי שעבר את כל השאלות בקו מאושר מיד, שומע שהוא זכאי ומקבל מייל על זכאותו. במקש 1 בקו ישמע "זכאי". בלי הסימון, הרישום ממתין לאישור ידני.',
        })}
        {toggle({
          k: 'hoursPublished', icon: <Clock size={15} className="text-indigo-700" />, tone: 'border-indigo-400 bg-indigo-50',
          title: 'הימים והשעות של המוקדים פורסמו בקו',
          desc: 'כל עוד לא מסומן, בקו מוקרא רק שם המוקד ו"הפירוט יפורסם מספר ימים לפני החלוקה". סמנו אחרי שעדכנתם לכל מוקד את השעות (בלשונית המוקדים למטה).',
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">מספר הקו שיוצג למשפחות באתר</label>
          <div className="flex gap-2">
            <input value={phoneDraft} onChange={e => setPhoneDraft(e.target.value)} dir="ltr" disabled={!canEdit}
              placeholder={defaultPhone || '076-5674006'}
              className="w-44 rounded-xl border border-slate-300 px-3 py-2 text-left text-sm focus:border-gold focus:outline-none" />
            <button type="button" disabled={!canEdit || !!busy || phoneDraft === rules.phoneNumber}
              onClick={() => void save({ phoneNumber: phoneDraft }, 'phone')}
              className="rounded-xl bg-navy px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
              {busy === 'phone' ? <Loader2 size={14} className="animate-spin" /> : 'שמירה'}
            </button>
          </div>
        </div>
        <div className="flex-1" />
        {centers && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
            <MapPin size={14} className="text-slate-500" />
            <span>מוקדים פתוחים לבחירה בחלוקה: <strong>{centers.open}</strong> מתוך {centers.active} פעילים</span>
            {canEdit && centers.open < centers.active && (
              <button type="button" disabled={!!busy} onClick={() => void openAllCenters()}
                className="mr-2 rounded-lg bg-teal-600 px-2.5 py-1 font-bold text-white disabled:opacity-50">
                {busy === 'centers' ? <Loader2 size={12} className="animate-spin" /> : 'פתיחת כל המוקדים'}
              </button>
            )}
          </div>
        )}
      </div>
      {err && <p className="mt-3 text-sm font-bold text-red-600">{err}</p>}
    </section>
  )
}
