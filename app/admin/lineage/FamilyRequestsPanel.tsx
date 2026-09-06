'use client'

// ─────────────────────────────────────────────────────────────────────────────
// מרכז בקשות המשפחות — כל בקשות תיקון סדר הדורות במקום אחד.
//
// 🔴 הבעיה שזה פותר: 147 בקשות ממשפחות המתינו ללא טיפול, הוותיקה שלושה
// שבועות. הן הוצגו בבאנר ללא סטטוס, ללא היסטוריה וללא דרך לדעת מה כבר
// נבדק — ומעל הכול, אישור לא עשה *שום דבר* בעץ: הבקשה נשמרה כטקסט חופשי,
// והמנהל נדרש לפענח מהמלל ולבנות ידנית שרשרת של 8-9 דורות.
//
// שני מצבי עבודה, כמו במרכז בקרת העץ:
//   · טבלה — "איפה אני עומד": כל הבקשות, פס מצב בקצה כל שורה, סינון.
//   · מיקוד — "מה עושים עם זה": בקשה אחת עם ההשוואה המלאה והכרעה, הבא/הקודם.
//
// ⚠️ ההשוואה מגיעה מחושבת מהשרת ואינה מחושבת כאן: היא חייבת להיות זהה למה
// שהאישור יחיל בפועל, וחישוב כפול הוא בדיוק הדרך שבה שניהם מסתעפים.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import {
  Loader2, RefreshCw, Check, X, Clock, ChevronRight, ChevronLeft,
  LayoutGrid, Focus, Inbox, AlertTriangle, ExternalLink, Phone, Mail, MapPin,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface DiffRow {
  generation: number
  op: 'same' | 'changed' | 'added' | 'removed'
  current: string | null
  proposed: string | null
  relationChanged: boolean
}
interface Diff {
  rows: DiffRow[]
  firstDivergence: number | null
  identical: boolean
  counts: { same: number; changed: number; added: number; removed: number }
}
interface RequestItem {
  id: string
  kind: string
  status: string
  workState: string
  staffNote: string | null
  createdAt: string
  resolvedAt: string | null
  beneficiaryId: string | null
  requesterName: string | null
  contact: { phone: string | null; email: string | null; city: string | null } | null
  note: string | null
  nodeName: string | null
  parentName: string | null
  proposedName: string | null
  current: { generation: number; name: string }[]
  proposed: { generation: number; name: string }[]
  diff: Diff | null
}
interface Summary {
  total: number; open: number; inProgress: number
  waitingFamily: number; later: number; done: number
}

// פס המצב בקצה השורה. הצבע הוא הסימן — תגית טקסט בכל שורה הופכת סריקה
// של 100 שורות לקריאה של 100 מילים.
const STATE_BAR: Record<string, string> = {
  open: '#cbd5e1',
  in_progress: '#3b82f6',
  waiting_family: '#f59e0b',
  later: '#a855f7',
  approved: '#059669',
  rejected: '#64748b',
}
const STATE_LABEL: Record<string, string> = {
  open: 'ממתין',
  in_progress: 'בטיפול',
  waiting_family: 'ממתין למשפחה',
  later: 'לטיפול בהמשך',
  approved: 'אושר',
  rejected: 'נדחה',
}

/** המצב האפקטיבי — הכרעה סופית גוברת על מצב הטיפול. */
const stateOf = (r: RequestItem) => (r.status !== 'pending' ? r.status : r.workState || 'open')

const OP_STYLE: Record<DiffRow['op'], { row: string; label: string; tint: string }> = {
  same: { row: 'bg-white', label: 'זהה', tint: 'text-slate-400' },
  changed: { row: 'bg-amber-50', label: 'שונה', tint: 'text-amber-700' },
  added: { row: 'bg-green-50', label: 'נוסף', tint: 'text-green-700' },
  removed: { row: 'bg-rose-50', label: 'הוסר', tint: 'text-rose-700' },
}

const daysAgo = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000)
  if (d <= 0) return 'היום'
  if (d === 1) return 'אתמול'
  return `לפני ${d} ימים`
}

type Filter = 'open' | 'all' | 'done'

export default function FamilyRequestsPanel() {
  const toast = useToast()
  const [items, setItems] = useState<RequestItem[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('open')
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const [note, setNote] = useState('')
  /** סף "בקשה ותיקה" (שבוע אחורה), נקבע בזמן הטעינה. ראו hasStale. */
  const [staleCutoff, setStaleCutoff] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lineage/requests?scope=all', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'טעינת הבקשות נכשלה')
      setItems(d.items ?? [])
      setSummary(d.summary ?? null)
      setStaleCutoff(Date.now() - 7 * 86400_000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת הבקשות נכשלה')
    } finally { setLoading(false) }
  }, [toast])

  // ⚠️ טעינה אסינכרונית בעלייה — הכלל מסמן גם את הדפוס התקין הזה.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => items.filter(r => {
    const done = r.status !== 'pending'
    if (filter === 'open') return !done
    if (filter === 'done') return done
    return true
  }), [items, filter])

  // ⚠️ המיקוד עוקב אחרי הרשימה המסוננת: אחרי הכרעה הבקשה יוצאת מהסינון,
  // והבאה נכנסת למקומה — כלומר "הבא בתור" בלי לחיצה נוספת.
  const focused = focusIdx !== null ? visible[Math.min(focusIdx, visible.length - 1)] ?? null : null

  // ⚠️ הסף נקבע ב-load (שם קריאת שעון היא לגיטימית) ולא בזמן רינדור:
  // Date.now() אינו טהור, ורינדור שתלוי בו אינו יציב. דיוק של דקות אינו
  // משנה כאן — הסף הוא שבוע.
  const hasStale = staleCutoff !== null
    && visible.some(r => r.status === 'pending' && new Date(r.createdAt).getTime() < staleCutoff)

  // ⚠️ סנכרון הערת המנהל לפי *מזהה* הבקשה בלבד: תלות ב-staffNote עצמו
  // הייתה דורסת את מה שהמנהל מקליד ברגע זה בכל רינדור חוזר.
  const lastFocusId = useRef<string | null>(null)
  useEffect(() => {
    const id = focused?.id ?? null
    if (lastFocusId.current === id) return
    lastFocusId.current = id
    setNote(focused?.staffNote ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused?.id])

  const patch = (id: string, p: Partial<RequestItem>) =>
    setItems(prev => prev.map(x => (x.id === id ? { ...x, ...p } : x)))

  const act = async (r: RequestItem, action: 'approve' | 'reject' | 'state', extra?: { workState?: string; staffNote?: string }) => {
    setSaving(r.id)
    try {
      const res = await fetch('/api/admin/lineage/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, action, ...extra }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'הפעולה נכשלה')

      if (action === 'state') {
        patch(r.id, { workState: extra?.workState ?? r.workState, staffNote: extra?.staffNote ?? r.staffNote })
      } else {
        patch(r.id, { status: action === 'approve' ? 'approved' : 'rejected', resolvedAt: new Date().toISOString() })
        if (action === 'approve' && d.applied?.createdNodes)
          toast.success(`הבקשה אושרה — נוספו ${d.applied.createdNodes} דורות לעץ`)
        else toast.success(action === 'approve' ? 'הבקשה אושרה והוחלה' : 'הבקשה נדחתה')
        // המונים מתעדכנים מקומית; רענון מלא רק בטעינה הבאה.
        setSummary(s => s ? { ...s, open: Math.max(0, s.open - 1), done: s.done + 1 } : s)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הפעולה נכשלה')
    } finally { setSaving(null) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── כותרת + מונים ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <Inbox size={18} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">בקשות תיקון ממשפחות</h3>
            <p className="text-[11px] text-slate-500">
              בקשות שהגיעו מהאזור האישי ומקישורי התיקון
            </p>
          </div>
        </div>
        <button onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          <RefreshCw size={13} /> רענון
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {([
            { k: 'open', label: 'ממתינות', v: summary.open, c: '#64748b' },
            { k: 'in_progress', label: 'בטיפול', v: summary.inProgress, c: '#3b82f6' },
            { k: 'waiting_family', label: 'ממתין למשפחה', v: summary.waitingFamily, c: '#f59e0b' },
            { k: 'later', label: 'להמשך', v: summary.later, c: '#a855f7' },
            { k: 'done', label: 'טופלו', v: summary.done, c: '#059669' },
          ]).map(s => (
            <div key={s.k} className="rounded-xl border border-slate-200 bg-white p-2.5">
              <div className="text-xl font-bold tabular-nums" style={{ color: s.c }}>
                {s.v.toLocaleString('he-IL')}
              </div>
              <div className="text-[11px] text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ⚠️ אזהרה על בקשות ותיקות — הן הסיבה שהמסך הזה נבנה. */}
      {summary && summary.open > 0 && hasStale && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-xs leading-relaxed text-amber-800">
            יש בקשות שממתינות מעל שבוע. המשפחות שלחו את סדר הדורות שלהן ומחכות לתשובה.
          </p>
        </div>
      )}

      {/* ── סינון + מצב תצוגה ── */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { v: 'open', l: 'ממתינות' },
          { v: 'done', l: 'טופלו' },
          { v: 'all', l: 'הכל' },
        ] as const).map(o => (
          <button key={o.v} onClick={() => { setFilter(o.v); setFocusIdx(null) }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
              filter === o.v
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300'
            }`}>{o.l}</button>
        ))}
        <span className="flex-1" />
        <button onClick={() => setFocusIdx(focusIdx === null ? 0 : null)}
          disabled={!visible.length}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40">
          {focusIdx === null ? <><Focus size={13} /> מצב מיקוד</> : <><LayoutGrid size={13} /> חזרה לטבלה</>}
        </button>
      </div>

      {!visible.length && (
        <p className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-400">
          {filter === 'open' ? 'אין בקשות ממתינות — הכול טופל.' : 'אין בקשות להצגה.'}
        </p>
      )}

      {/* ── מצב מיקוד ── */}
      {focused && focusIdx !== null && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button onClick={() => setFocusIdx(Math.max(0, focusIdx - 1))} disabled={focusIdx === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs disabled:opacity-40">
              <ChevronRight size={13} /> הקודם
            </button>
            <span className="text-xs text-slate-500 tabular-nums">
              {Math.min(focusIdx + 1, visible.length)} מתוך {visible.length}
            </span>
            <button onClick={() => setFocusIdx(Math.min(visible.length - 1, focusIdx + 1))}
              disabled={focusIdx >= visible.length - 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs disabled:opacity-40">
              הבא <ChevronLeft size={13} />
            </button>
          </div>
          <RequestCard r={focused} note={note} setNote={setNote} saving={saving === focused.id} onAct={act} />
        </div>
      )}

      {/* ── מצב טבלה ── */}
      {focusIdx === null && visible.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {visible.map((r, i) => {
            const st = stateOf(r)
            const d = r.diff
            return (
              <button key={r.id} onClick={() => setFocusIdx(i)}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right transition-all hover:border-indigo-300 hover:shadow-sm">
                <span className="h-8 w-1 flex-shrink-0 rounded-full" style={{ background: STATE_BAR[st] ?? '#cbd5e1' }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-800">
                    {r.requesterName || 'ללא שם'}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                    <span>{daysAgo(r.createdAt)}</span>
                    {d && !d.identical && (
                      <>
                        {d.counts.changed > 0 && <span className="text-amber-700">{d.counts.changed} שונו</span>}
                        {d.counts.added > 0 && <span className="text-green-700">{d.counts.added} נוספו</span>}
                        {d.counts.removed > 0 && <span className="text-rose-700">{d.counts.removed} הוסרו</span>}
                        {d.firstDivergence && <span className="text-slate-400">· מדור {d.firstDivergence}</span>}
                      </>
                    )}
                    {d?.identical && <span className="text-slate-400">זהה לרשום</span>}
                  </span>
                </span>
                <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: `${STATE_BAR[st]}22`, color: STATE_BAR[st] }}>
                  {STATE_LABEL[st] ?? st}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// כרטיס בקשה — ההשוואה המלאה + ההכרעה.
// ─────────────────────────────────────────────────────────────────────────────
function RequestCard({
  r, note, setNote, saving, onAct,
}: {
  r: RequestItem
  note: string
  setNote: (s: string) => void
  saving: boolean
  onAct: (r: RequestItem, a: 'approve' | 'reject' | 'state', extra?: { workState?: string; staffNote?: string }) => void
}) {
  const done = r.status !== 'pending'
  const d = r.diff

  return (
    <div className="flex flex-col gap-3">
      {/* פרטי המבקש */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-base font-bold text-slate-800">{r.requesterName || 'ללא שם'}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><Clock size={11} />{daysAgo(r.createdAt)}</span>
            {r.contact?.phone && <span className="inline-flex items-center gap-1" dir="ltr"><Phone size={11} />{r.contact.phone}</span>}
            {r.contact?.email && <span className="inline-flex items-center gap-1 truncate" dir="ltr"><Mail size={11} />{r.contact.email}</span>}
            {r.contact?.city && <span className="inline-flex items-center gap-1"><MapPin size={11} />{r.contact.city}</span>}
          </div>
        </div>
        {r.beneficiaryId && (
          <Link href={`/admin/beneficiaries/${r.beneficiaryId}`} target="_blank"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
            <ExternalLink size={12} /> לכרטסת
          </Link>
        )}
      </div>

      {/* הערת המבקש — לעתים היא כל ההסבר לתיקון */}
      {r.note && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
          <p className="mb-0.5 text-[10px] font-bold text-sky-700">הערת המבקש</p>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-sky-900">{r.note}</p>
        </div>
      )}

      {/* ── ההשוואה ── */}
      {d ? (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-px bg-slate-200 text-[11px] font-bold text-slate-600">
            <div className="bg-slate-50 px-2 py-1.5 text-center">דור</div>
            <div className="bg-slate-50 px-2 py-1.5">רשום אצלנו</div>
            <div className="bg-slate-50 px-2 py-1.5">המשפחה מבקשת</div>
          </div>
          <div className="flex flex-col gap-px bg-slate-200">
            {d.rows.map(row => {
              const st = OP_STYLE[row.op]
              return (
                <div key={row.generation} className="grid grid-cols-[2.5rem_1fr_1fr] gap-px">
                  <div className={`${st.row} px-2 py-1.5 text-center text-[11px] font-bold tabular-nums text-slate-500`}>
                    {row.generation}
                  </div>
                  <div className={`${st.row} px-2 py-1.5 text-xs text-slate-600`}>
                    {row.current ?? <span className="text-slate-300">—</span>}
                  </div>
                  <div className={`${st.row} px-2 py-1.5 text-xs`}>
                    <span className={row.op === 'same' ? 'text-slate-600' : `font-medium ${st.tint}`}>
                      {row.proposed ?? <span className="text-slate-300">—</span>}
                    </span>
                    {row.op !== 'same' && (
                      <span className={`mr-1.5 text-[10px] ${st.tint}`}>({st.label})</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        // בקשות ישנות מסוג rename/reparent/add_child — אין שרשרת להשוות.
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {r.kind === 'rename' && <>תיקון שם: <b>{r.nodeName}</b> ← <b>{r.proposedName}</b></>}
          {r.kind === 'add_child' && <>הוספת דור <b>{r.proposedName}</b> תחת <b>{r.parentName}</b></>}
          {r.kind === 'reparent' && <>שינוי שיוך של <b>{r.nodeName}</b> אל <b>{r.parentName}</b></>}
          {r.kind === 'note' && <>בקשה ללא שרשרת מובנית — יש לקרוא את הערת המבקש.</>}
        </div>
      )}

      {/* ⚠️ מסביר בדיוק מה יקרה באישור — אחרת "אישור" הוא כפתור עיוור. */}
      {!done && d && !d.identical && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          באישור: המשפחה תחובר לדור האחרון בשרשרת המבוקשת. דורות שאינם קיימים
          בעץ ייווצרו כ<b>ממתינים לאימות</b> ולא כמאושרים — אישור הייחוס עצמו
          נשאר בידיכם.
        </p>
      )}
      {!done && d?.identical && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-[11px] text-green-800">
          השרשרת שהמשפחה שלחה זהה לרשום אצלנו — אפשר לסמן כטופל בלי לשנות דבר.
        </p>
      )}

      {/* הערת מנהל */}
      <textarea
        value={note} onChange={e => setNote(e.target.value)}
        placeholder="הערה פנימית — מה בדקתי, מה חסר…"
        rows={2}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />

      {/* ── הכרעה ── */}
      {done ? (
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Check size={14} className="text-green-600" />
          הבקשה {r.status === 'approved' ? 'אושרה' : 'נדחתה'}
          {r.resolvedAt && <span className="text-slate-400">· {new Date(r.resolvedAt).toLocaleDateString('he-IL')}</span>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => onAct(r, 'approve', { staffNote: note })} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {d && !d.identical ? 'אישור והחלה בעץ' : 'סימון כטופל'}
          </button>
          <button onClick={() => onAct(r, 'reject', { staffNote: note })} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
            <X size={13} /> דחייה
          </button>
          <span className="flex-1" />
          {/* מצבי ביניים — "בדקתי ולא סיימתי" הוא מצב אמיתי שחייב סימון. */}
          {([
            { v: 'in_progress', l: 'בטיפול' },
            { v: 'waiting_family', l: 'ממתין למשפחה' },
            { v: 'later', l: 'להמשך' },
          ] as const).map(o => (
            <button key={o.v} onClick={() => onAct(r, 'state', { workState: o.v, staffNote: note })} disabled={saving}
              className={`rounded-full border px-2.5 py-1.5 text-[11px] transition-all ${
                r.workState === o.v
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300'
              }`}>{o.l}</button>
          ))}
        </div>
      )}
    </div>
  )
}
