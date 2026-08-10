'use client'

// מסך אימות כתובות המייל: מספרים מדויקים, הרשימה המלאה של מי שטרם אימת,
// סימון כתובות פגומות, ושליחת בקשה לאמת.
import { useState } from 'react'
import { Loader2, Search, MailCheck, AlertTriangle, Send, CheckCircle2, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

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

export default function EmailVerificationManager() {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [families, setFamilies] = useState<Family[]>([])
  const [sending, setSending] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [onlyProblems, setOnlyProblems] = useState(false)

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

  async function send(ids: string[] | 'all') {
    const count = ids === 'all' ? (stats?.sendable ?? 0) : ids.length
    if (!count) { toast.error('אין כתובות תקינות לשליחה'); return }
    if (!confirm(`לשלוח בקשת אימות ל-${count} משפחות?\n\nכתובות פגומות מדולגות אוטומטית.`)) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/email-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids === 'all' ? { all: true } : { ids }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה')
      toast.success(d.summary)
      await load(true)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה') }
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

      {/* ── פעולות ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => send('all')} disabled={sending || !stats?.sendable}>
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          שלח לכל {he(stats?.sendable ?? 0)} שטרם אימתו
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
        <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-2 w-8">
                  <input type="checkbox"
                    checked={picked.size > 0 && picked.size === shown.filter(f => f.sendable).length}
                    onChange={e => setPicked(e.target.checked ? new Set(shown.filter(f => f.sendable).map(f => f.id)) : new Set())} />
                </th>
                <th className="px-3 py-2 font-medium">משפחה</th>
                <th className="px-3 py-2 font-medium">כתובת מייל</th>
                <th className="px-3 py-2 font-medium">טלפון</th>
                <th className="px-3 py-2 font-medium">נרשם</th>
                <th className="px-3 py-2 font-medium">נשלחה בקשה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map(f => (
                <tr key={f.id} className={!f.sendable ? 'bg-red-50/60' : 'hover:bg-slate-50'}>
                  <td className="px-2 py-2">
                    <input type="checkbox" disabled={!f.sendable} checked={picked.has(f.id)}
                      title={!f.sendable ? 'כתובת פגומה — לא ניתן לשלוח' : undefined}
                      onChange={e => setPicked(p => {
                        const next = new Set(p)
                        if (e.target.checked) next.add(f.id); else next.delete(f.id)
                        return next
                      })} />
                  </td>
                  <td className="px-3 py-2">{f.name}</td>
                  <td className="px-3 py-2">
                    <span dir="ltr" className="break-all text-slate-700">{f.email}</span>
                    {f.problem && (
                      <span className={`inline-flex items-center gap-1 mr-2 align-middle text-[10px] font-bold rounded-full px-1.5 py-0.5 border ${f.sendable ? 'text-amber-800 bg-amber-100 border-amber-200' : 'text-red-700 bg-red-100 border-red-200'}`}>
                        <AlertTriangle size={9} /> {f.problem}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500" dir="ltr">{f.phone || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{date(f.createdAt)}</td>
                  <td className="px-3 py-2 text-slate-500">{date(f.requestedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
