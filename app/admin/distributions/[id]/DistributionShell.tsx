'use client'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Phone, Loader2, AlertTriangle, CircleCheck, LayoutDashboard, Users, MapPin, Settings, X } from 'lucide-react'
import { PHASES, PHASE_LABEL, type DistPhase } from '@/lib/holidayDistPhase'

// ─────────────────────────────────────────────────────────────────────────────
// מסך החלוקה בשלבים — לפי המוקאפ שאושר (כיוון א, 23.11):
// פאנל כחול קבוע מימין (שלבים, "בטלפון עכשיו", כפתור זהב לשלב הבא, מונים)
// + 4 לשוניות: סקירה · נרשמים · מוקדים · הגדרות. כל דבר במקום אחד בלבד.
//
// 🔴 בורר השלב מחליף את המתגים הנפרדים (רישום / בחירת מוקדים / איסוף):
// השרת מיישר את שלושתם לפי השלב — ראו phaseGates ב-lib/holidayDistRules.
// ─────────────────────────────────────────────────────────────────────────────

type Info = {
  rules: { phase: DistPhase | null; testPhones: string[]; hoursPublished: boolean; phoneOnly: boolean }
  centers: { open: number; active: number }
  counts?: { registered: number; noCenter: number; approved: number }
  centersMissing?: { id: string; label: string; address: boolean; hours: boolean }[]
  defaultPhoneNumber?: string
}

type Tab = 'overview' | 'registrants' | 'centers' | 'settings'
const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'overview', label: 'סקירה', icon: LayoutDashboard },
  { id: 'registrants', label: 'נרשמים', icon: Users },
  { id: 'centers', label: 'מוקדים', icon: MapPin },
  { id: 'settings', label: 'הגדרות', icon: Settings },
]

/** מה המתקשר שומע בכל שלב — לפי מקש. */
const PHONE_BY_PHASE: Record<DistPhase, { k: string; t: string }[]> = {
  setup: [
    { k: '1', t: '"הרישום טרם נפתח" (מספרי ניסיון — נרשמים כרגיל)' },
    { k: '2', t: 'שמיעת זכאות' },
    { k: '3', t: 'שמיעת המוקד' },
    { k: '4', t: 'הודעות כלליות' },
  ],
  registration: [
    { k: '1', t: 'רישום מלא: ת"ז, תאריך לידה, טלפון, הצהרות, מוקד' },
    { k: '2', t: 'ת"ז + תאריך לידה ⇒ נרשם ואושר / זכאי להגיש' },
    { k: '3', t: 'שם המוקד (+ ימים ושעות אם פורסמו)' },
    { k: '4', t: 'הודעות כלליות' },
  ],
  closed: [
    { k: '1', t: '"הרישום נסגר, עדכון יישלח"' },
    { k: '2', t: 'נרשם ואושר / זמן הרישום חלף' },
    { k: '3', t: 'שם המוקד + "עדכון מדויק יימסר"' },
    { k: '4', t: 'הודעות כלליות' },
  ],
  distribution: [
    { k: '1', t: '"זמן הרישום חלף"' },
    { k: '2', t: 'נרשם ואושר / זמן הרישום חלף' },
    { k: '3', t: 'סכום, מוקד, כתובת ושעות ⇒ שיוך כרטיס' },
    { k: '4', t: 'הודעות כלליות' },
  ],
}

const NEXT_LABEL: Record<DistPhase, string | null> = {
  setup: 'פתיחת הרישום',
  registration: 'סגירת הרישום',
  closed: 'פתיחת החלוקה',
  distribution: null,
}

const CONFIRM_TEXT: Record<DistPhase, string> = {
  setup: 'החלוקה תחזור להכנה: הרישום ייסגר, ורק מספרי הניסיון יוכלו להירשם.',
  registration: 'הרישום ייפתח לכולם בקו הטלפוני (מקש 1), כולל בחירת מוקד.',
  closed: 'מקש 1 בקו ישמיע "הרישום נסגר, עדכון יישלח". אי אפשר יהיה להירשם עוד.',
  distribution: 'כל הנרשמים ישמעו במקש 3 את הסכום, המוקד, הכתובת והשעות ויוכלו לשייך כרטיס. כל המוקדים שטרם התחילו יתחילו לחלק.',
}

const fmtCur = (n: number) => `${n.toLocaleString('he-IL')} ₪`

export default function DistributionShell({
  distributionId, name, amount, canEdit, initialPhase, registrants, centers, settings,
}: {
  distributionId: string
  name: string
  amount: number
  canEdit: boolean
  initialPhase: DistPhase | null
  registrants: ReactNode
  centers: ReactNode
  settings: ReactNode
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<DistPhase | null>(initialPhase)
  const [info, setInfo] = useState<Info | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  // ⚠️ לשונית נטענת רק בכניסה הראשונה ואז נשארת (מוסתרת) — כך הנרשמים
  // לא נטענים מחדש בכל מעבר, ומוקדים לא יורים קריאות עד שנכנסים אליהם.
  const [visited, setVisited] = useState<Set<Tab>>(new Set(['overview']))
  const [confirm, setConfirm] = useState<DistPhase | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/distributions/${encodeURIComponent(distributionId)}/rules`, { cache: 'no-store' })
      if (!res.ok) return
      const d = (await res.json()) as Info
      setInfo(d)
      setPhase(d.rules.phase)
    } catch { /* הפאנל נשאר עם הערכים הקודמים */ }
  }, [distributionId])

  useEffect(() => {
    // ⚠️ בתזמון ולא קריאה ישירה — הכלל set-state-in-effect.
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  const go = (t: Tab) => { setTab(t); setVisited(v => (v.has(t) ? v : new Set(v).add(t))) }

  async function applyPhase(p: DistPhase) {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/admin/distributions/${encodeURIComponent(distributionId)}/rules`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_phase', phase: p }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'המעבר נכשל'); return }
      setPhase(p); setConfirm(null)
      await load()
      router.refresh()
    } catch { setErr('שגיאת רשת') } finally { setBusy(false) }
  }

  const idx = phase ? PHASES.indexOf(phase) : -1
  const next = phase ? (NEXT_LABEL[phase] ? PHASES[idx + 1] : null) : 'setup'
  const nextLabel = phase ? NEXT_LABEL[phase] : 'מעבר לניהול בשלבים'
  const c = info?.counts
  const missing = info?.centersMissing ?? []

  // ── רשימת המוכנות ──
  const checks: { ok: boolean; title: string; detail: string; fix?: Tab }[] = [
    { ok: amount > 0, title: 'סכום למשפחה', detail: amount > 0 ? `${fmtCur(amount)} למשפחה` : 'לא הוגדר — בעריכת החלוקה', fix: 'settings' },
    {
      ok: (info?.centers.open ?? 0) > 0,
      title: 'מוקדים פתוחים לבחירה',
      detail: info ? `${info.centers.open} מתוך ${info.centers.active} מוקדים פעילים` : '…',
      fix: 'settings',
    },
    {
      ok: missing.length === 0,
      title: 'כתובת וימים ושעות לכל מוקד',
      detail: missing.length ? `${missing.length} מוקדים חסרים: ${missing.slice(0, 3).map(m => m.label).join(', ')}${missing.length > 3 ? '…' : ''}` : 'הכל מלא',
      fix: 'centers',
    },
    {
      ok: (info?.rules.testPhones.length ?? 0) > 0,
      title: 'מספרי ניסיון',
      detail: info?.rules.testPhones.length ? `${info.rules.testPhones.length} מספרים יכולים להתנסות` : 'לא הוגדרו — מומלץ לפני הפתיחה',
      fix: 'settings',
    },
    {
      ok: !!info?.rules.hoursPublished,
      title: 'הימים והשעות מוקראים בקו',
      detail: info?.rules.hoursPublished ? 'פורסמו — מקש 3 מקריא אותם' : 'עדיין לא — מקש 3 אומר "עדכון מדויק יימסר"',
      fix: 'settings',
    },
  ]

  return (
    <div dir="rtl" className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-6 items-start">
      {/* ── הפאנל הכחול ── */}
      <aside className="lg:sticky lg:top-4 rounded-2xl bg-[#132a52] text-[#dfe4ee] bg-[radial-gradient(120%_60%_at_100%_0%,rgba(217,181,110,0.12),transparent_60%)] p-5 flex flex-col gap-5 mb-5 lg:mb-0">
        <div>
          <p className="text-xs font-bold text-[#d9b56e]">חלוקת חגים</p>
          <h2 className="text-xl font-extrabold text-white mt-0.5">{name}</h2>
          {amount > 0 && <p className="text-sm mt-0.5">{fmtCur(amount)} למשפחה</p>}
        </div>

        {/* שלבים */}
        <ol className="flex flex-col gap-1.5">
          {PHASES.map((p, i) => {
            const current = p === phase
            const done = idx > i
            return (
              <li key={p}>
                <button type="button" disabled={!canEdit || current || busy}
                  onClick={() => setConfirm(p)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-right transition ${
                    current ? 'bg-[#d9b56e] text-[#132a52]' : 'hover:bg-white/5 disabled:hover:bg-transparent'}`}>
                  <span className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-[13px] font-bold border ${
                    current ? 'border-[#132a52] bg-[#132a52] text-[#d9b56e]'
                      : done ? 'border-[#7fb79a] bg-[#2c6a4e] text-white' : 'border-white/30 text-white/70'}`}>
                    {done ? <Check size={14} /> : i + 1}
                  </span>
                  <span className={`font-bold text-[15px] ${current ? '' : done ? 'text-white/80' : 'text-white/60'}`}>{PHASE_LABEL[p]}</span>
                  {current && <span className="ms-auto text-[11px] font-extrabold">עכשיו</span>}
                </button>
              </li>
            )
          })}
        </ol>

        {/* בטלפון עכשיו */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-3.5">
          <p className="text-xs font-bold text-[#d9b56e] mb-2 flex items-center gap-1.5"><Phone size={13} /> בטלפון עכשיו</p>
          {phase ? (
            <ul className="flex flex-col gap-1.5 text-[13px] leading-snug">
              {PHONE_BY_PHASE[phase].map(r => (
                <li key={r.k} className="flex gap-2">
                  <span className="w-5 h-5 shrink-0 rounded-md bg-white/10 grid place-items-center text-[11px] font-bold text-white">{r.k}</span>
                  <span>{r.t}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px]">חלוקה זו מנוהלת בשערים הישנים (תפריט תשרי).</p>
          )}
        </div>

        {canEdit && next && nextLabel && (
          <button type="button" disabled={busy} onClick={() => setConfirm(next)}
            className="w-full min-h-[50px] rounded-xl bg-[#d9b56e] text-[#132a52] font-extrabold text-[16px] hover:bg-[#e6c788] disabled:opacity-60">
            {nextLabel} ←
          </button>
        )}

        {/* מונים */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { l: 'נרשמו', v: c ? c.registered.toLocaleString('he-IL') : '…' },
            { l: 'צפי תקציב', v: c ? fmtCur(c.registered * amount) : '…' },
            { l: 'מאושרים', v: c ? c.approved.toLocaleString('he-IL') : '…' },
            { l: 'לא בחרו מוקד', v: c ? c.noCenter.toLocaleString('he-IL') : '…' },
          ].map(k => (
            <div key={k.l} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
              <p className="text-[11px] text-white/60 font-bold">{k.l}</p>
              <p className="text-lg font-extrabold text-white ltr-num">{k.v}</p>
            </div>
          ))}
        </div>
      </aside>

      {/* ── לשוניות ── */}
      <div className="min-w-0 flex flex-col gap-5">
        <div className="flex flex-wrap gap-1 rounded-2xl bg-[#fffdf8] border border-[#e3dbcc] p-1.5">
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button key={t.id} type="button" onClick={() => go(t.id)}
                className={`flex-1 min-w-[110px] inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                  active ? 'bg-[#132a52] text-white' : 'text-[#465068] hover:bg-[#f2efe8]'}`}>
                <Icon size={16} /> {t.label}
                {t.id === 'centers' && missing.length > 0 && (
                  <span className="rounded-full bg-amber-400 text-[#132a52] text-[11px] px-1.5">{missing.length}</span>
                )}
              </button>
            )
          })}
        </div>

        {tab === 'overview' && (
          <div className="flex flex-col gap-5">
            <section className="bg-[#fffdf8] border border-[#e3dbcc] rounded-[14px] p-5">
              <h3 className="font-extrabold text-[#132a52] text-lg">
                {next ? `מוכנים ל${nextLabel ? `"${nextLabel}"` : 'שלב הבא'}?` : 'החלוקה פתוחה'}
              </h3>
              <p className="text-sm text-[#6b6352] mt-0.5">מה כבר מוכן ומה עוד חסר.</p>
              <ul className="mt-4 flex flex-col divide-y divide-[#efe8da]">
                {checks.map(ch => (
                  <li key={ch.title} className="flex items-center gap-3 py-3">
                    {ch.ok
                      ? <CircleCheck size={20} className="text-[#2c6a4e] shrink-0" />
                      : <AlertTriangle size={20} className="text-[#b7791f] shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-bold text-[#1b2338] text-[15px]">{ch.title}</p>
                      <p className="text-[13px] text-[#6b6352]">{ch.detail}</p>
                    </div>
                    <span className={`ms-auto text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${
                      ch.ok ? 'bg-[#e3efe8] text-[#2c6a4e]' : 'bg-[#fbf0d9] text-[#7d5310]'}`}>
                      {ch.ok ? 'הושלם' : 'חסר'}
                    </span>
                    {!ch.ok && ch.fix && (
                      <button type="button" onClick={() => go(ch.fix!)}
                        className="text-xs font-bold text-[#1e3d73] hover:underline shrink-0">להשלמה ←</button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-[#fffdf8] border border-[#e3dbcc] rounded-[14px] p-5">
              <h3 className="font-extrabold text-[#132a52] text-lg">מה שומעים בטלפון בכל שלב</h3>
              <p className="text-sm text-[#6b6352] mt-0.5">תפריט קבוע: 1 רישום · 2 זכאות · 3 המוקד · 4 הודעות כלליות.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {PHASES.map(p => (
                  <div key={p} className={`rounded-xl border p-3.5 ${p === phase ? 'border-[#d9b56e] bg-[#fbf6ea]' : 'border-[#e3dbcc]'}`}>
                    <p className="font-bold text-[#132a52] text-sm mb-2">
                      {PHASE_LABEL[p]} {p === phase && <span className="text-[11px] text-[#7d5310]">· עכשיו</span>}
                    </p>
                    <ul className="flex flex-col gap-1 text-[13px] text-[#1b2338]">
                      {PHONE_BY_PHASE[p].map(r => (
                        <li key={r.k} className="flex gap-2"><b className="text-[#132a52]">{r.k}</b><span>{r.t}</span></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="text-[12px] text-[#6b6352] mt-3">
                הנוסחים עצמם (כולל ההודעות הכלליות במקש 4) נערכים במסך נוסחי שלוחת החגים, ואחרי שינוי לוחצים &quot;צור הקלטות בקולי&quot;.
              </p>
            </section>
          </div>
        )}

        <div className={tab === 'registrants' ? '' : 'hidden'}>{visited.has('registrants') && registrants}</div>
        <div className={tab === 'centers' ? '' : 'hidden'}>{visited.has('centers') && centers}</div>
        <div className={tab === 'settings' ? '' : 'hidden'}>{visited.has('settings') && settings}</div>
      </div>

      {/* ── אישור מעבר שלב — באמצע המסך עם טשטוש ── */}
      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#132a52]/40 backdrop-blur-sm p-4" onClick={() => !busy && setConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-[#fffdf8] border border-[#e3dbcc] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-extrabold text-[#132a52]">מעבר לשלב &quot;{PHASE_LABEL[confirm]}&quot;?</h3>
              <button type="button" onClick={() => setConfirm(null)} className="text-[#958c78] hover:text-[#132a52]"><X size={18} /></button>
            </div>
            <p className="text-[15px] text-[#1b2338] mt-3 leading-relaxed">{CONFIRM_TEXT[confirm]}</p>
            {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{err}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" disabled={busy} onClick={() => void applyPhase(confirm)}
                className="flex-1 min-h-[46px] rounded-xl bg-[#132a52] text-white font-bold hover:bg-[#1e3d73] disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {busy && <Loader2 size={16} className="animate-spin" />} כן, לעבור
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirm(null)}
                className="min-h-[46px] px-5 rounded-xl border border-[#e3dbcc] font-bold text-[#465068]">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
