'use client'

// מסך אימות כתובות המייל: מספרים מדויקים, הרשימה המלאה של מי שטרם אימת,
// סימון כתובות פגומות, ושליחת בקשה לאמת.
import { useState, useEffect } from 'react'
import { Loader2, Search, MailCheck, AlertTriangle, Send, CheckCircle2, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'

type Family = {
  id: string
  name: string
  email: string
  phone: string | null
  createdAt: string | null
  requestedAt: string | null
  problem: string | null
  sendable: boolean
}

type Stats = {
  total: number
  withEmail: number
  noEmail: number
  verified: number
  unverified: number
  invalid: number
  sendable: number
  requested: number
  verifiedSinceTracking: number
  verifiedLast7Days: number
  percentVerified: number
}

const he = (n: number) => n.toLocaleString('he-IL')
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString('he-IL') : '—')

type ColKey = 'name' | 'email' | 'phone' | 'createdAt' | 'requestedAt'

const COLUMNS: ColDef<ColKey>[] = [
  { key: 'name', label: 'משפחה', def: true },
  { key: 'email', label: 'כתובת מייל', def: true },
  { key: 'phone', label: 'טלפון', def: true },
  { key: 'createdAt', label: 'נרשם', def: true },
  { key: 'requestedAt', label: 'נשלחה בקשה', def: true },
]

export default function EmailVerificationManager() {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [families, setFamilies] = useState<Family[]>([])
  const [sending, setSending] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [onlyProblems, setOnlyProblems] = useState(false)
  // התקדמות חיה בזמן שליחה — null כשלא שולחים
  const [progress, setProgress] = useState<{ sent: number; failed: number; total: number } | null>(null)
  // גודל מנת החימום. '' = בלי הגבלה (הכל).
  const [batchSize, setBatchSize] = useState<number | ''>(50)

  // ⚠️ ה-hook לפני ה-return המוקדם (`!loaded`) — hook אחרי return מותנה
  // משנה את סדר ה-hooks בין רינדורים ושובר את React.
  // extraCols=1: תיבת הסימון היא הראשונה ואינה בבורר, ולכן ידית הגרירה מקבלת i+1.
  const tc = useTableColumns('email-verification', COLUMNS, { extraCols: 1 })

  const cell = (c: ColDef<ColKey>, f: Family) => {
    switch (c.key) {
      case 'name': return <span>{f.name}</span>
      case 'email':
        return (
          <>
            <span dir="ltr" className="break-all text-slate-700">{f.email}</span>
            {f.problem && (
              <span className={`inline-flex items-center gap-1 mr-2 align-middle text-[10px] font-bold rounded-full px-1.5 py-0.5 border ${f.sendable ? 'text-amber-800 bg-amber-100 border-amber-200' : 'text-red-700 bg-red-100 border-red-200'}`}>
                <AlertTriangle size={9} /> {f.problem}
              </span>
            )}
          </>
        )
      case 'phone': return <span className="text-slate-500" dir="ltr">{f.phone || '—'}</span>
      case 'createdAt': return <span className="text-slate-500">{date(f.createdAt)}</span>
      case 'requestedAt': return <span className="text-slate-500">{date(f.requestedAt)}</span>
    }
  }

  // נטען בלחיצה ולא באפקט — הסריקה עוברת על כל טבלת הצאצאים, ואין סיבה
  // שכל פתיחה של מסך ההגדרות תשלם עליה.
  async function load(quiet = false) {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/email-verification')
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה')
      setStats(d.stats)
      setFamilies(d.families ?? [])
      setPicked(new Set())
      setLoaded(true)
    } catch (e) { if (!quiet) toast.error(e instanceof Error ? e.message : 'שגיאה') }
    finally { setLoading(false) }
  }

  // 🔴 רענון אוטומטי אחרי שהרשימה נטענה.
  //
  // הסינון עצמו תקין — listUnverified מסננת `.is('email_verified_at', null)`,
  // כלומר מי שאימת אכן יורד. אבל הרשימה נטענה רק בלחיצה ידנית, ולכן משפחה
  // שאימתה את המייל *אחרי* הטעינה המשיכה להופיע על המסך — ונראה כאילו
  // האימות לא נקלט. הרענון סוגר את הפער בלי לחיצה.
  //
  // ⚠️ רק אחרי הטעינה הראשונה (loaded): הסריקה עוברת על כל טבלת המוטבים,
  // ואין סיבה שכל פתיחה של מסך ההגדרות תשלם עליה.
  // ⚠️ מדלג כשהלשונית מוסתרת, ומרענן מיד בחזרה אליה.
  // ⚠️ לא בזמן שליחה (sending): רשימה שמתחלפת תוך כדי מנה מאפסת את
  // הבחירה ומקפיצה את המסך מתחת לידיים.
  useEffect(() => {
    if (!loaded) return
    const tick = () => { if (!document.hidden && !sending) void load(true) }
    const t = setInterval(tick, 30_000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(t); window.removeEventListener('focus', tick) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, sending])

  /**
   * שליחת בקשות אימות, עם מונה חי.
   *
   * ⚠️ קורא תשובת NDJSON ומעדכן את ההתקדמות מייל-מייל. קודם הוצג עיגול
   * מסתובב בלבד: השליחה סדרתית ואורכת דקות, ולא הייתה שום דרך לדעת כמה
   * כבר יצאו או אם התהליך בכלל מתקדם.
   *
   * limit — מנת חימום. ראו ההערה בצד השרת: המגבלה אינה טכנית אלא מוניטין
   * הדומיין, שקודי האימות תלויים בו.
   */
  async function send(ids: string[] | 'all', limit?: number) {
    const available = ids === 'all' ? (stats?.sendable ?? 0) : ids.length
    const count = limit ? Math.min(limit, available) : available
    if (!count) { toast.error('אין כתובות תקינות לשליחה'); return }
    if (!confirm(
      `לשלוח בקשת אימות ל-${count} משפחות?` +
      (limit && available > limit ? `\n\n(מתוך ${available} שטרם אימתו — מנה מבוקרת לחימום הדומיין)` : '') +
      '\n\nכתובות פגומות מדולגות אוטומטית.'
    )) return

    setSending(true)
    setProgress({ sent: 0, failed: 0, total: count })
    try {
      const res = await fetch('/api/admin/email-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(ids === 'all' ? { all: true } : { ids }),
          ...(limit ? { limit } : {}),
          stream: true,
        }),
      })
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'שגיאה')
      }

      // קריאת NDJSON שורה-שורה. ⚠️ שומרים שארית: מנה מהרשת עלולה להיחתך
      // באמצע שורה, ו-JSON.parse עליה ייכשל.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let final: { summary?: string } | null = null
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const l of lines) {
          if (!l.trim()) continue
          let ev: { type?: string; sent?: number; failed?: number; total?: number; summary?: string }
          try { ev = JSON.parse(l) } catch { continue }
          if (ev.type === 'start') {
            // ⚠️ start משדר total בלבד (בלי sent/failed). קודם הוא טופל יחד
            // עם progress, ו-`ev.sent ?? 0` דרס את המונה באפס.
            setProgress(p => ({ sent: p?.sent ?? 0, failed: p?.failed ?? 0, total: ev.total ?? count }))
          } else if (ev.type === 'progress') {
            setProgress({ sent: ev.sent ?? 0, failed: ev.failed ?? 0, total: ev.total ?? count })
          } else if (ev.type === 'done') {
            setProgress({ sent: ev.sent ?? 0, failed: ev.failed ?? 0, total: ev.total ?? count })
            final = ev
          }
        }
      }
      toast.success(final?.summary ?? 'השליחה הסתיימה')
      await load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
      setProgress(null)   // בשגיאה המונה חסר משמעות — מוסר
    }
    // 🔴 הסרגל *נשאר* על המסך אחרי הסיום, ומציג את הסיכום הסופי.
    //
    // ⚠️ הבאג שהיה כאן: `finally { setProgress(null) }` רץ מיד בתום הלולאה
    // ומחק את אירוע ה-done שזה עתה התקבל. הסרגל נעלם באותו רגע, והמשתמש
    // ראה "0 נשלחו" — לא כי דבר לא נשלח, אלא כי המונה נמחק לפני שהספיק
    // להיקרא. המספרים היו נכונים לאורך כל הדרך ונמחקו בשורה האחרונה.
    finally { setSending(false) }
  }

  if (!loaded) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-600 leading-relaxed">
          מאז שאימות המייל ברישום הפך לאופציונלי, יש נרשמים שכתובתם לא אומתה.
          כאן אפשר לראות בדיוק מי ומה המצב, ולשלוח להם בקשה לאמת.
        </p>
        <Button onClick={() => load()} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          בדוק מצב אימות המיילים
        </Button>
      </div>
    )
  }

  const shown = onlyProblems ? families.filter(f => f.problem) : families

  return (
    <div className="space-y-4">
      {/* ── המספרים ── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="מאומתים" value={he(stats.verified)} tone="green"
            sub={`${stats.percentVerified}% מתוך ${he(stats.withEmail)} עם כתובת`} />
          <Stat label="טרם אומתו" value={he(stats.unverified)} tone={stats.unverified ? 'amber' : 'green'}
            sub={`${he(stats.sendable)} ניתנים לשליחה`} />
          <Stat label="כתובות פגומות" value={he(stats.invalid)} tone={stats.invalid ? 'red' : 'green'}
            sub="לא יאומתו — דורשות תיקון ידני" />
          <Stat label="אין כתובת בכלל" value={he(stats.noEmail)} tone="slate"
            sub={`מתוך ${he(stats.total)} נרשמים`} />
        </div>
      )}

      {/* ── קצב ההתקדמות ── */}
      {stats && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <MailCheck size={15} className="text-indigo-500" />
            <p className="text-xs font-bold text-slate-700">קצב ההתקדמות</p>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min(100, stats.percentVerified)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
            <span>אומתו בפועל מאז 05/08: <strong>{he(stats.verifiedSinceTracking)}</strong></span>
            <span>בשבוע האחרון: <strong>{he(stats.verifiedLast7Days)}</strong></span>
            <span>נשלחה להם בקשה: <strong>{he(stats.requested)}</strong></span>
          </div>
          {/* ⚠️ בלי ההסבר הזה המספרים מטעים: המיגרציה סימנה למפרע כל מי שיש לו
              מייל כמאומת בתאריך ההרשמה שלו. */}
          <p className="mt-2 text-[10px] text-slate-400 leading-relaxed">
            ⚠️ &quot;{he(stats.verified)} מאומתים&quot; כולל גם נרשמים ותיקים שסומנו למפרע כמאומתים בעת המעבר (05/08),
            כי עד אז אימות המייל היה חובה ברישום. המספרים &quot;מאז 05/08&quot; ו&quot;בשבוע האחרון&quot; הם אימותים אמיתיים בלבד.
          </p>
        </div>
      )}

      {/* ── מנת החימום ──
          🔴 המגבלה אינה טכנית. Resend עומד בנפח (Batch API + throttle),
          אבל שליחה בבת אחת לרשימה שלא אומתה מעולם מייצרת bounce גבוה,
          והספקים מורידים את דירוג הדומיין — ואז גם קודי האימות נופלים
          לספאם. מנה יומית מאפשרת לראות את שיעור ה-bounce לפני הנזק. */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <MailCheck size={15} className="text-amber-600" />
          <p className="text-xs font-bold text-amber-900">כמות לשליחה (חימום הדומיין)</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {([25, 50, 100, 200, 300] as const).map(n => (
            <button key={n} type="button" onClick={() => setBatchSize(n)} disabled={sending}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                batchSize === n
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100'
              }`}>{n}</button>
          ))}
          <input type="number" min={1} inputMode="numeric" disabled={sending}
            value={batchSize === '' ? '' : batchSize}
            onChange={e => {
              const v = e.target.value
              setBatchSize(v === '' ? '' : Math.max(1, Math.floor(Number(v) || 0)))
            }}
            placeholder="אחר"
            className="w-24 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs text-amber-900 placeholder:text-amber-400 disabled:opacity-50" />
          <button type="button" onClick={() => setBatchSize('')} disabled={sending}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
              batchSize === ''
                ? 'border-red-600 bg-red-600 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
            }`}>ללא הגבלה</button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-amber-800">
          מומלץ להתחיל ב-50 ליום, לבדוק את שיעור ה-bounce ב-Resend, ורק אז להעלות.
          {batchSize === '' && <span className="font-bold"> ⚠️ &quot;ללא הגבלה&quot; שולח לכולם בבת אחת — מסכן את מוניטין הדומיין.</span>}
        </p>
      </div>

      {/* ── מונה חי בזמן שליחה ── */}
      {progress && (
        <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin" /> שולח…
            </p>
            <p className="text-sm font-black text-indigo-800 ltr-num" dir="ltr">
              {he(progress.sent)} / {he(progress.total)}
            </p>
          </div>
          <div className="h-2.5 w-full rounded-full bg-indigo-200 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-600 transition-all duration-200"
              style={{ width: `${progress.total ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 text-[11px] text-indigo-800">
            <span>נשלחו: <strong>{he(progress.sent)}</strong></span>
            {progress.failed > 0 && <span className="text-red-700">נכשלו: <strong>{he(progress.failed)}</strong></span>}
            <span>נותרו: <strong>{he(Math.max(0, progress.total - progress.sent - progress.failed))}</strong></span>
          </div>
        </div>
      )}

      {/* ── פעולות ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => send('all', batchSize === '' ? undefined : batchSize)}
          disabled={sending || !stats?.sendable}>
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {sending && progress
            ? `שולח… ${he(progress.sent)}/${he(progress.total)}`
            : batchSize === ''
              ? `שלח לכל ${he(stats?.sendable ?? 0)} שטרם אימתו`
              : `שלח ל-${he(Math.min(batchSize, stats?.sendable ?? 0))} (מתוך ${he(stats?.sendable ?? 0)})`}
        </Button>
        {picked.size > 0 && (
          <Button variant="ghost" onClick={() => send([...picked])} disabled={sending}>
            <Send size={15} /> שלח ל-{he(picked.size)} המסומנים
          </Button>
        )}
        <button type="button" onClick={() => load()} disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} רענן
        </button>
        {!!stats?.invalid && (
          <label className="mr-auto inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} />
            הצג רק כתובות פגומות
          </label>
        )}
      </div>

      {/* ── הרשימה ── */}
      {shown.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle2 size={16} /> {onlyProblems ? 'אין כתובות פגומות.' : 'כל הכתובות אומתו.'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tc.picker}
          {/* ⚠️ גלילה אנכית בלבד — הכלל: אין גלילה לרוחב בשום טבלה. */}
          <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-right text-sm" style={tc.rt.tableStyle}>
              <colgroup>{tc.rt.cols}</colgroup>
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-2 py-2 w-8">
                    <input type="checkbox"
                      checked={picked.size > 0 && picked.size === shown.filter(f => f.sendable).length}
                      onChange={e => setPicked(e.target.checked ? new Set(shown.filter(f => f.sendable).map(f => f.id)) : new Set())} />
                  </th>
                  {tc.shown.map((c, i) => (
                    <th key={c.key} className={`px-3 py-2 font-medium ${tc.headClass(c)}`}>
                      {c.label}{tc.rt.handle(i + 1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(f => (
                  <tr key={f.id} className={!f.sendable ? 'bg-red-50/60' : 'hover:bg-slate-50'}>
                    <td className="px-2 py-2 align-top">
                      <input type="checkbox" disabled={!f.sendable} checked={picked.has(f.id)}
                        title={!f.sendable ? 'כתובת פגומה — לא ניתן לשלוח' : undefined}
                        onChange={e => setPicked(p => {
                          const next = new Set(p)
                          if (e.target.checked) next.add(f.id); else next.delete(f.id)
                          return next
                        })} />
                    </td>
                    {tc.shown.map(c => (
                      <td key={c.key} className={`px-3 py-2 ${tc.cellClass(c)}`}>{cell(c, f)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub, tone }: {
  label: string; value: string; sub?: string
  tone: 'green' | 'amber' | 'red' | 'slate'
}) {
  const tones = {
    green: 'border-green-100 bg-green-50 text-green-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  }
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold opacity-80">{label}</p>
      <p className="text-xl font-black leading-tight">{value}</p>
      {sub && <p className="text-[10px] opacity-70 mt-0.5 leading-snug">{sub}</p>}
    </div>
  )
}
