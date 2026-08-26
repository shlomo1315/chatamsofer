'use client'
import { useEffect, useState, useCallback, Fragment } from 'react'
import { X, Loader2, Link2, Check, Trash2, ShieldCheck, RotateCcw, GitBranch, ChevronDown, ChevronLeft, Undo2 } from 'lucide-react'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'

type ColKey = 'branch' | 'recipient' | 'sent' | 'lastUsed' | 'status' | 'actions'

// ⚠️ headClassName נושא את הריפוד: <th> נבנה בתוך TableHeadMenu, וריפוד
// שנכתב בצרכן לא היה מגיע אליו.
const HEAD = 'text-right px-4 py-2 font-semibold'

// 🔴 value() חובה בכל עמודה שמרנדרת JSX — בלעדיה המיון עובד על אובייקט
// React ומחזיר סדר אקראי שנראה בדיוק כמו מיון תקין.
// ⚠️ "פעולות" אינה נתון — רק כפתורים. לא ניתנת למיון ולא לסינון.
const COLUMNS: ColDef<ColKey, Invite>[] = [
  { key: 'branch', label: 'ענף (דור)', def: true, headClassName: HEAD, value: i => i.node_name || null },
  { key: 'recipient', label: 'נמען', def: true, headClassName: HEAD, value: i => i.recipient_name || i.recipient_email || null },
  { key: 'sent', label: 'נשלח', def: true, kind: 'date', headClassName: HEAD, value: i => i.created_at },
  // ⚠️ null = טרם נכנס. ריקים יורדים לסוף המיון בשני הכיוונים.
  { key: 'lastUsed', label: 'כניסה אחרונה', def: false, kind: 'date', headClassName: HEAD, value: i => i.last_used_at },
  { key: 'status', label: 'סטטוס', def: true, kind: 'enum', filterable: true, headClassName: HEAD,
    // ⚠️ הערך הוא התווית המוצגת ולא הקוד: המשתמש מסנן לפי מה שהוא רואה.
    value: i => i.revoked_at ? 'בוטלה' : new Date(i.expires_at) < new Date() ? 'פגה' : 'פעילה' },
  { key: 'actions', label: 'פעולות', def: true, sortable: false, headClassName: HEAD },
]

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

interface ActivityItem {
  id: string
  action: string
  nodeId: string
  createdAt: string
  previousName: string | null
  newName: string | null
  previousStatus: string | null
  newStatus: string | null
  undoneAt: string | null
}

const fmt = (s?: string | null) => s ? new Date(s).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const actionLabel = (a: ActivityItem) => {
  if (a.action === 'lineage_node_family_verified') return { text: 'אישר', cls: 'text-green-700 bg-green-50 border-green-200' }
  if (a.action === 'lineage_node_family_rejected') return { text: 'דחה', cls: 'text-red-700 bg-red-50 border-red-200' }
  return { text: 'תיקן שם', cls: 'text-indigo-700 bg-indigo-50 border-indigo-200' }
}

// מרכז שליטה בכל הרשאות שיתוף עץ הדורות. כל שורה ניתנת להרחבה כדי לראות בדיוק
// אילו צמתים בן המשפחה אישר/דחה/תיקן ומתי — עם ביטול לכל פעולה בנפרד.
export default function SharePermissionsPanel({ onClose }: { onClose: () => void }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [activity, setActivity] = useState<Record<string, ActivityItem[]>>({})
  const [actLoading, setActLoading] = useState<string | null>(null)

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

  const toggleExpand = async (token: string) => {
    if (expanded === token) { setExpanded(null); return }
    setExpanded(token)
    if (!activity[token]) {
      setActLoading(token)
      try {
        const res = await fetch(`/api/admin/lineage/share/activity?token=${encodeURIComponent(token)}`)
        const data = await res.json()
        if (res.ok) setActivity(a => ({ ...a, [token]: data.activity ?? [] }))
      } catch { /* ignore */ }
      finally { setActLoading(null) }
    }
  }

  const undo = async (token: string, activityId: string) => {
    try {
      const res = await fetch('/api/admin/lineage/share/activity', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId }),
      })
      if (res.ok) setActivity(a => ({ ...a, [token]: (a[token] ?? []).map(x => x.id === activityId ? { ...x, undoneAt: new Date().toISOString() } : x) }))
    } catch { /* ignore */ }
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
    navigator.clipboard?.writeText(link).then(() => { setCopied(token); setTimeout(() => setCopied(''), 2000) }).catch(() => window.prompt('העתק את הקישור:', link))
  }

  const shown = invites.filter(i => statusFilter === 'all' ? true : statusFilter === 'revoked' ? !isActive(i) : isActive(i))
  const activeCount = invites.filter(isActive).length

  // ⚠️ extraCols=1 — עמודת חץ ההרחבה היא הראשונה ואינה בבורר, ולכן ידית
  // הגרירה של כל עמודה מקבלת i+1.
  //
  // 🔴 ה-hook מקבל את shown (אחרי בורר הסטטוס שמעל הטבלה) ולא את invites:
  // הסינון בכותרת חייב לחול *על* מה שהבורר כבר סינן, ולא במקומו.
  // ⚠️ mode:'client' — כל ההזמנות נטענות בבת אחת, אין דפדוף בשרת.
  const tc = useTableColumns('lineage-share-permissions', COLUMNS, {
    extraCols: 1,
    sortFilter: { mode: 'client', rows: shown },
  })

  const cell = (c: ColDef<ColKey>, i: Invite) => {
    switch (c.key) {
      case 'branch':
        return (
          <div className="flex items-start gap-1.5">
            <GitBranch size={13} className="mt-0.5 shrink-0 text-violet-400" />
            <span className="font-medium text-slate-800">{i.node_name ?? '—'}</span>
            {i.node_generation != null && <span className="text-[11px] text-slate-400">דור {i.node_generation}</span>}
          </div>
        )
      case 'recipient':
        return (
          <>
            <div className="text-slate-800">{i.recipient_name || '—'}</div>
            <div className="text-[11px] text-slate-400" dir="ltr" style={{ textAlign: 'right' }}>{i.recipient_email}</div>
          </>
        )
      case 'sent': return <span className="text-xs text-slate-500">{fmt(i.created_at)}</span>
      case 'lastUsed': return <span className="text-xs text-slate-500">{i.last_used_at ? fmt(i.last_used_at) : '—'}</span>
      case 'status': {
        const st = statusOf(i)
        return st === 'active' ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">פעיל</span>
          : st === 'revoked' ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">בוטל</span>
          : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">פג תוקף</span>
      }
      case 'actions':
        // ⚠️ עצירת ההתפשטות נשארת כאן ולא על ה-<td>: לחיצה על שורה מרחיבה אותה,
        // ולחיצה על כפתור פעולה אינה אמורה להרחיב.
        return (
          <div onClick={e => e.stopPropagation()}>
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
          </div>
        )
    }
  }

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

        <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-2">
          {([['all', 'הכל'], ['active', 'פעילות'], ['revoked', 'מבוטלות / פגו']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${statusFilter === k ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ⚠️ התנאי נשאר shown (לפני הסינון בכותרת) ולא tc.rows: סינון
            שמרוקן את הטבלה חייב להשאיר את הבורר והצ'יפים על המסך, אחרת
            אין דרך לנקות אותו וכל המסך נראה ריק. */}
        {!loading && shown.length > 0 && (
          <div className="flex flex-col gap-2 px-5 py-2.5 border-b border-slate-100">{tc.picker}{tc.activeFilters}</div>
        )}

        {/* ⚠️ גלילה אנכית בלבד — הכלל: אין גלילה לרוחב בשום טבלה. */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 text-center"><Loader2 size={22} className="animate-spin text-slate-400 inline" /></div>
          ) : tc.rows.length === 0 ? (
            /* ⚠️ נמדד מול tc.rows: סינון בכותרת שמרוקן את הטבלה חייב
                להציג "אין להצגה" ולא טבלה ריקה בלי הסבר. */
            <div className="py-16 text-center text-sm text-slate-400">אין הרשאות להצגה.</div>
          ) : (
            <table className="w-full text-sm text-right" style={tc.rt.tableStyle}>
              <colgroup>{tc.rt.cols}</colgroup>
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="text-right px-4 py-2 font-semibold w-8"></th>
                  {/* כותרת אחידה לכל המערכת — מיון, סינון וגרירת רוחב.
                      ⚠️ i+1: חץ ההרחבה קודם לעמודות שבבורר. */}
                  {tc.shown.map((c, i) => tc.th(c, i + 1))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* 🔴 tc.rows ולא shown — אחרת המיון והסינון בכותרת לא היו
                    משפיעים על מה שמוצג בפועל. */}
                {tc.rows.map(i => {
                  const st = statusOf(i)
                  const isOpen = expanded === i.token
                  const acts = activity[i.token] ?? []
                  return (
                    <Fragment key={i.token}>
                      <tr className={`${st === 'active' ? '' : 'opacity-60'} ${isOpen ? 'bg-indigo-50/40' : 'hover:bg-slate-50'} cursor-pointer align-top`} onClick={() => toggleExpand(i.token)}>
                        <td className="px-4 py-2.5 text-slate-400">{isOpen ? <ChevronDown size={15} /> : <ChevronLeft size={15} />}</td>
                        {tc.shown.map(c => (
                          <td key={c.key} className={`px-4 py-2.5 ${tc.cellClass(c)}`}>{cell(c, i)}</td>
                        ))}
                      </tr>

                      {/* שורת פירוט — מה בן המשפחה עשה (אישר/דחה/תיקן) + ביטול לכל פעולה */}
                      {isOpen && (
                        <tr key={`${i.token}-details`} className="bg-slate-50/60">
                          <td colSpan={tc.shown.length + 1} className="px-6 py-3">
                            {actLoading === i.token ? (
                              <div className="py-3 text-center text-slate-400"><Loader2 size={16} className="animate-spin inline" /></div>
                            ) : acts.length === 0 ? (
                              <p className="text-xs text-slate-400 py-2 text-right">הנמען עדיין לא ביצע פעולות בענף זה.</p>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                <p className="text-xs font-semibold text-slate-500 mb-1">פעולות שבוצעו ({acts.length}):</p>
                                {acts.map(a => {
                                  const lbl = actionLabel(a)
                                  return (
                                    <div key={a.id} className={`flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 ${a.undoneAt ? 'opacity-50' : ''}`}>
                                      <div className="flex items-center gap-2 flex-wrap text-xs">
                                        <span className={`font-bold px-2 py-0.5 rounded-full border ${lbl.cls}`}>{lbl.text}</span>
                                        {a.action === 'lineage_node_family_renamed' ? (
                                          <span className="text-slate-600">«{a.previousName || '—'}» → <span className="font-semibold text-slate-800">«{a.newName || '—'}»</span></span>
                                        ) : (
                                          <span className="text-slate-600">צומת (סטטוס: {a.previousStatus || '—'} → <span className="font-semibold text-slate-800">{a.newStatus || '—'}</span>)</span>
                                        )}
                                        <span className="text-slate-400">· {fmt(a.createdAt)}</span>
                                        {a.undoneAt && <span className="text-red-500 font-semibold">· בוטל</span>}
                                      </div>
                                      {!a.undoneAt && (
                                        <button onClick={() => undo(i.token, a.id)}
                                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-lg px-2 py-1 transition-colors flex-shrink-0">
                                          <Undo2 size={12} /> בטל שינוי
                                        </button>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-2.5 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">לחצו על שורה לפירוט הפעולות. ביטול שינוי מחזיר את הצומת למצבו הקודם.</p>
          <button onClick={() => { setLoading(true); load() }} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <RotateCcw size={12} /> רענון
          </button>
        </div>
      </div>
    </div>
  )
}
