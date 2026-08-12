'use client'
import { useState, useEffect, useCallback } from 'react'
import { LinkIcon, Copy, Check, Ban, Clock, Loader2, Plus, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

// ─────────────────────────────────────────────────────────────────────────────
// קישורי רישום עם תוקף — הפאנל במסך החלוקה.
//
// 🔴 מה הקישור עושה: פותח את הרישום לחלוקה הזו, בערוץ הפורטל בלבד, בתוך חלון
// הזמן שהוגדר לו. הוא אינו פותח את השלוחה הטלפונית, נדרים או המייל.
//
// ⚠️ הקישור משותף — אותו קישור נשלח לכל מי שצריך. לכן המסך מדגיש את מועד
// התפוגה ולא את מספר השימושים: הזמן הוא ההגבלה היחידה, וזה מה שהמנהל צריך
// לראות לפני ששולח.
// ─────────────────────────────────────────────────────────────────────────────

type InviteStatus = 'active' | 'scheduled' | 'expired' | 'revoked'

interface Invite {
  token: string
  url: string
  expires_at: string
  starts_at: string | null
  revoked_at: string | null
  label: string | null
  used_count: number
  created_at: string
  status: InviteStatus
}

const fmt = (d?: string | null) => d ? format(new Date(d), 'dd/MM/yy HH:mm', { locale: he }) : '—'

const STATUS: Record<InviteStatus, { label: string; cls: string }> = {
  active: { label: '🟢 פעיל', cls: 'bg-green-100 border-green-300 text-green-800' },
  scheduled: { label: '⏳ ממתין לפתיחה', cls: 'bg-amber-100 border-amber-300 text-amber-800' },
  expired: { label: 'פג תוקף', cls: 'bg-slate-100 border-slate-200 text-slate-500' },
  revoked: { label: 'בוטל', cls: 'bg-rose-100 border-rose-200 text-rose-700' },
}

/** ברירות מחדל נפוצות — כדי שלא צריך להקליד תאריך בשביל המקרה הרגיל. */
const PRESETS = [
  { label: 'יום', days: 1 },
  { label: '3 ימים', days: 3 },
  { label: 'שבוע', days: 7 },
  { label: 'שבועיים', days: 14 },
]

export default function InviteLinkPanel({ distributionId, canEdit }: { distributionId: string; canEdit: boolean }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [customDate, setCustomDate] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/distributions/invites?distribution_id=${distributionId}`, { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) setInvites(json.invites ?? [])
    } finally { setLoading(false) }
  }, [distributionId])

  useEffect(() => { load() }, [load])

  async function create(payload: { days?: number; expires_at?: string }) {
    setCreating(true); setError(null)
    try {
      const res = await fetch('/api/admin/distributions/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distribution_id: distributionId, ...payload }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'יצירת הקישור נכשלה'); return }
      setCustomDate('')
      await load()
    } catch { setError('שגיאת רשת') } finally { setCreating(false) }
  }

  async function revoke(token: string) {
    // ⚠️ אישור לפני ביטול: הקישור כבר נשלח למשפחות, וביטולו עוצר אותן באמצע.
    if (!confirm('לבטל את הקישור? מי שיפתח אותו מכאן ואילך לא יוכל להירשם.')) return
    await fetch('/api/admin/distributions/invites', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, revoke: true }),
    })
    await load()
  }

  async function copy(url: string, token: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* דפדפן ללא הרשאת clipboard — הכתובת מוצגת ממילא */ }
  }

  const active = invites.filter(i => i.status === 'active' || i.status === 'scheduled')
  const past = invites.filter(i => i.status === 'expired' || i.status === 'revoked')

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="font-extrabold text-slate-900 flex items-center gap-2">
          <LinkIcon size={17} className="text-indigo-600" /> קישור רישום עם תוקף
        </h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          קישור אחד שנשלח לכל מי שצריך. הוא פותח את הרישום <strong className="text-slate-700">רק בפורטל</strong> ו
          <strong className="text-slate-700">רק עד מועד התפוגה</strong> — בלי לפתוח את השלוחה הטלפונית, נדרים או המייל.
          כל משפחה מתחברת בת״ז שלה ונרשמת כעצמה.
        </p>
      </div>

      {canEdit && (
        <div className="px-5 py-4 bg-slate-50/60 border-b border-slate-100">
          <p className="text-[11px] font-extrabold text-slate-500 mb-2">יצירת קישור — עד מתי יהיה פתוח?</p>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.days} disabled={creating} onClick={() => create({ days: p.days })}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50 transition-colors">
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-1.5 mr-1">
              <input type="datetime-local" value={customDate} onChange={e => setCustomDate(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              <button disabled={creating || !customDate}
                onClick={() => create({ expires_at: new Date(customDate).toISOString() })}
                className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} צור
              </button>
            </div>
          </div>
          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-rose-700">
              <AlertTriangle size={13} /> {error}
            </p>
          )}
        </div>
      )}

      <div className="p-5 space-y-3">
        {loading ? (
          <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> טוען…</p>
        ) : invites.length === 0 ? (
          <p className="text-sm text-slate-400">עדיין לא נוצרו קישורים לחלוקה זו.</p>
        ) : (
          <>
            {active.map(inv => (
              <div key={inv.token} className="rounded-xl border border-slate-200 p-3.5">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${STATUS[inv.status].cls}`}>
                    {STATUS[inv.status].label}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <Clock size={12} className="text-slate-400" />
                    {inv.status === 'scheduled' ? `נפתח ${fmt(inv.starts_at)} · ` : ''}
                    פג ב־{fmt(inv.expires_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code dir="ltr" className="flex-1 min-w-0 truncate rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-600">
                    {inv.url}
                  </code>
                  <button onClick={() => copy(inv.url, inv.token)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 flex-shrink-0 transition-colors">
                    {copied === inv.token ? <><Check size={13} className="text-green-600" /> הועתק</> : <><Copy size={13} /> העתק</>}
                  </button>
                  {canEdit && (
                    <button onClick={() => revoke(inv.token)} title="ביטול הקישור"
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 flex-shrink-0 transition-colors">
                      <Ban size={13} /> בטל
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  נרשמו דרכו: <strong className="text-slate-600 ltr-num">{inv.used_count.toLocaleString('he-IL')}</strong>
                  {' · '}נוצר {fmt(inv.created_at)}
                </p>
              </div>
            ))}

            {past.length > 0 && (
              <details className="pt-1">
                <summary className="cursor-pointer text-xs font-bold text-slate-400 hover:text-slate-600">
                  קישורים שאינם פעילים ({past.length})
                </summary>
                <div className="mt-2 space-y-2">
                  {past.map(inv => (
                    <div key={inv.token} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex-wrap">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS[inv.status].cls}`}>
                        {STATUS[inv.status].label}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        פג {fmt(inv.expires_at)} · נרשמו {inv.used_count.toLocaleString('he-IL')}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  )
}
