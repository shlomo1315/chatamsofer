'use client'
import { useEffect, useState, useCallback } from 'react'
import { X, Loader2, Send, Link2, Check, Trash2, Clock, Mail } from 'lucide-react'

interface Invite {
  token: string
  recipient_name: string | null
  recipient_email: string | null
  created_at: string
  expires_at: string
  revoked_at: string | null
  last_used_at: string | null
}

const fmt = (s?: string | null) => s ? new Date(s).toLocaleDateString('he-IL') : '—'

// חלונית ניהול שיתוף ענף עץ הדורות — יצירת הזמנה (שם+מייל→לינק במייל) + רשימת
// כל ההזמנות עם שליטה מלאה: מי, מתי, כניסה אחרונה, וביטול מיידי לכל אחת.
export default function ShareBranchModal({ nodeId, nodeName, onClose }: { nodeId: string; nodeName: string; onClose: () => void }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [copiedLink, setCopiedLink] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/lineage/share?rootNodeId=${encodeURIComponent(nodeId)}`)
      const data = await res.json()
      if (res.ok) setInvites(data.invites ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [nodeId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!email.trim()) { setErr('יש להזין כתובת מייל'); return }
    setErr(''); setNote(''); setSending(true)
    try {
      const res = await fetch('/api/admin/lineage/share', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootNodeId: nodeId, recipientName: name.trim(), recipientEmail: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { setErr(data.error || 'השליחה נכשלה'); return }
      setNote(data.mailError ? `הקישור נוצר אך המייל לא נשלח (${data.mailError}). ניתן להעתיק ידנית מהרשימה.` : `נשלח קישור ל-${email.trim()}`)
      setName(''); setEmail('')
      await load()
    } catch { setErr('שגיאת רשת') }
    finally { setSending(false) }
  }

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
    navigator.clipboard?.writeText(link).then(() => { setCopiedLink(token); setTimeout(() => setCopiedLink(''), 2000) }).catch(() => {
      window.prompt('העתק את הקישור:', link)
    })
  }

  const isActive = (i: Invite) => !i.revoked_at && new Date(i.expires_at) > new Date()

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" dir="rtl" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between z-10">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Link2 size={16} className="text-indigo-500" /> שיתוף ענף — {nodeName}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            שליחת קישור אישי לבן משפחה לאישור/תיקון סדר היוחסין של ענף זה ומטה בלבד. הגישה מוגבלת
            לענף הזה — אין גישה לשום מסך ניהול אחר. ניתן לבטל כל הרשאה בכל רגע.
          </p>

          {/* יצירת הזמנה */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-2.5">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="שם המקבל (לא חובה)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <input value={email} onChange={e => { setEmail(e.target.value); if (err) setErr('') }} type="email" dir="ltr"
              placeholder="כתובת מייל" onKeyDown={e => e.key === 'Enter' && create()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={create} disabled={sending || !email.trim()}
              className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} שליחת קישור במייל
            </button>
            {err && <p className="text-xs text-red-600">{err}</p>}
            {note && <p className="flex items-center gap-1 text-xs text-emerald-600"><Check size={12} /> {note}</p>}
          </div>

          {/* רשימת הזמנות — שליטה מלאה */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 mb-2">הרשאות קיימות</h3>
            {loading ? (
              <div className="py-6 text-center"><Loader2 size={18} className="animate-spin text-slate-400 inline" /></div>
            ) : invites.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">טרם ניתנו הרשאות לענף זה.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {invites.map(i => (
                  <div key={i.token} className={`rounded-xl border px-3 py-2.5 ${isActive(i) ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-70'}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-1.5">
                          <Mail size={12} className="text-slate-400" />{i.recipient_email}
                          {i.recipient_name && <span className="text-xs text-slate-400">({i.recipient_name})</span>}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>נוצר {fmt(i.created_at)}</span>
                          {i.last_used_at && <span className="inline-flex items-center gap-0.5"><Clock size={10} /> כניסה אחרונה {fmt(i.last_used_at)}</span>}
                          {i.revoked_at ? <span className="text-red-500 font-semibold">בוטל</span>
                            : new Date(i.expires_at) < new Date() ? <span className="text-amber-600 font-semibold">פג תוקף</span>
                            : <span className="text-green-600 font-semibold">פעיל</span>}
                        </p>
                      </div>
                      {isActive(i) && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => copyLink(i.token)} title="העתק קישור"
                            className={`p-1.5 rounded-lg border transition-colors ${copiedLink === i.token ? 'border-green-300 bg-green-50 text-green-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                            {copiedLink === i.token ? <Check size={14} /> : <Link2 size={14} />}
                          </button>
                          <button onClick={() => revoke(i.token)} title="ביטול הרשאה"
                            className="p-1.5 rounded-lg border border-transparent text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
