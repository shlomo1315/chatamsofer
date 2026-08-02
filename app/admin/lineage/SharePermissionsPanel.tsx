'use client'
import { useEffect, useState, useCallback } from 'react'
import { X, Loader2, Link2, Check, Trash2, ShieldCheck, RotateCcw, GitBranch } from 'lucide-react'

interface Invite {
  token: string
  root_node_id: string
  recipient_name: string | null
  recipient_email: string | null
  created_at: string
  expires_at: string
  revoked_at: string | null
  last_used_at: string | null
  node_name: string | null
  node_generation: number | null
}

const fmt = (s?: string | null) => s ? new Date(s).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

// מרכז שליטה מרכזי בכל הרשאות שיתוף עץ הדורות — טבלה של כל הקישורים שנשלחו:
// לאיזה ענף (שם+דור), למי (שם+מייל), מתי, כניסה אחרונה, סטטוס, וביטול לכל אחד.
export default function SharePermissionsPanel({ onClose }: { onClose: () => void }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked'>('all')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/lineage/share')
      const data = await res.json()
      if (res.ok) setInvites(data.invites ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const isActive = (i: Invite) => !i.revoked_at && new Date(i.expires_at) > new Date()
  const statusOf = (i: Invite) => i.revoked_at ? 'revoked' : new Date(i.expires_at) < new Date() ? 'expired' : 'active'

  const revoke = async (token: string) => {
    try {
      const res = await fetch('/api/admin/lineage/share', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) setInvites(inv => inv.map(i => i.token === token ? { ...i, revoked_at: new Date().toISOString() } : i))
    } catch { /* ignore */ }
  }

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/lineage-review/${token}`
    navigator.clipboard?.writeText(link).then(() => { setCopied(token); setTimeout(() => setCopied(''), 2000) }).catch(() => window.prompt('העתק את הקישור:', link))
  }

  const shown = invites.filter(i => statusFilter === 'all' ? true : statusFilter === 'revoked' ? !isActive(i) : isActive(i))
  const activeCount = invites.filter(isActive).length

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" dir="rtl" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck size={17} className="text-indigo-500" /> הרשאות שיתוף עץ הדורות
            <span className="text-xs font-normal text-slate-400">({activeCount} פעילות · {invites.length} סה״כ)</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        {/* סינון סטטוס */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-2">
          {([['all', 'הכל'], ['active', 'פעילות'], ['revoked', 'מבוטלות / פגו']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${statusFilter === k ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="py-16 text-center"><Loader2 size={22} className="animate-spin text-slate-400 inline" /></div>
          ) : shown.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">אין הרשאות להצגה.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="text-right px-4 py-2 font-semibold">ענף (דור)</th>
                  <th className="text-right px-4 py-2 font-semibold">נמען</th>
                  <th className="text-right px-4 py-2 font-semibold">נשלח</th>
                  <th className="text-right px-4 py-2 font-semibold">כניסה אחרונה</th>
                  <th className="text-right px-4 py-2 font-semibold">סטטוס</th>
                  <th className="text-right px-4 py-2 font-semibold">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(i => {
                  const st = statusOf(i)
                  return (
                    <tr key={i.token} className={st === 'active' ? '' : 'opacity-60'}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <GitBranch size={13} className="text-violet-400 flex-shrink-0" />
                          <span className="font-medium text-slate-800">{i.node_name ?? '—'}</span>
                          {i.node_generation != null && <span className="text-[11px] text-slate-400">דור {i.node_generation}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-slate-800">{i.recipient_name || '—'}</div>
                        <div className="text-[11px] text-slate-400 ltr-num" dir="ltr">{i.recipient_email}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 ltr-num" dir="ltr">{fmt(i.created_at)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 ltr-num" dir="ltr">{i.last_used_at ? fmt(i.last_used_at) : '—'}</td>
                      <td className="px-4 py-2.5">
                        {st === 'active' ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">פעיל</span>
                          : st === 'revoked' ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">בוטל</span>
                          : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">פג תוקף</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {isActive(i) ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => copyLink(i.token)} title="העתק קישור"
                              className={`p-1.5 rounded-lg border transition-colors ${copied === i.token ? 'border-green-300 bg-green-50 text-green-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                              {copied === i.token ? <Check size={14} /> : <Link2 size={14} />}
                            </button>
                            <button onClick={() => revoke(i.token)} title="ביטול הרשאה"
                              className="p-1.5 rounded-lg border border-transparent text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-2.5 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">ביטול הרשאה מפסיק את הגישה מיד. שיתוף ענף חדש נעשה מתוך «אילן צאצאים» בעץ.</p>
          <button onClick={() => { setLoading(true); load() }} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <RotateCcw size={12} /> רענון
          </button>
        </div>
      </div>
    </div>
  )
}
