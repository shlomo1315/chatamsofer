'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, ChevronDown, ChevronUp, Mail, FileText, ExternalLink } from 'lucide-react'
import Card from '@/components/ui/Card'

// קישור ישיר לכרטסת הבקשה לפי הקטגוריה והמזהה
function cardHref(category: string, entityId: string | null): string | null {
  if (!entityId) return null
  switch (category) {
    case 'maternity': return `/admin/maternity/${entityId}`
    case 'loan': return `/admin/loans/${entityId}`
    case 'financial_aid': return `/admin/financial-aid/${entityId}`
    case 'widow': return '/admin/widows'
    default: return null
  }
}

type Item = { kind: 'request' | 'email'; action: string; category: string; entityId: string | null; detail: string; at: string }
type StaffRow = {
  userId: string; name: string; department: string | null; role: string
  requests: number; emails: number
  byCategory: Record<string, number>
  emailsHandled: number; emailsReplied: number
  items: Item[]
}

const CAT_LABEL: Record<string, string> = {
  maternity: 'לידות', loan: 'הלוואות', widow: 'אלמנות', financial_aid: 'סיוע כספי', other: 'אחר', email: 'מיילים',
}
const ACTION_LABEL: Record<string, string> = {
  maternity_status_changed: 'שינוי סטטוס לידה',
  loan_status_changed: 'שינוי סטטוס הלוואה',
  widow_request_status_changed: 'טיפול בבקשת אלמנה',
  financial_aid_decided: 'החלטת סיוע כספי',
  maternity_card_loaded: 'טעינת כרטיס יולדת',
  maternity_eligibility_extended: 'הארכת זכאות',
  maternity_eligibility_reset: 'איפוס זכאות',
  handled: 'טופל מייל', replied: 'השיב למייל', auto_replied: 'מענה אוטומטי',
}
const DEPT_LABEL: Record<string, string> = {
  main: 'משרד ראשי', igud: 'איגוד', gemach: 'גמ״ח', maternity: 'יולדות',
  widows: 'אלמנות', medical: 'רפואי', holidays: 'חגים',
}

const fmtDateTime = (iso: string) => {
  try { return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) }
  catch { return iso }
}
const toISODate = (d: Date) => d.toISOString()

type Preset = 'today' | 'week' | 'month' | 'custom'

export default function StaffActivityReport() {
  const [preset, setPreset] = useState<Preset>('week')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const computeRange = useCallback((): { from: string; to: string } => {
    const now = new Date()
    if (preset === 'custom') {
      const from = fromDate ? new Date(fromDate + 'T00:00:00') : new Date(0)
      const to = toDate ? new Date(toDate + 'T23:59:59') : now
      return { from: toISODate(from), to: toISODate(to) }
    }
    const start = new Date(now)
    if (preset === 'today') start.setHours(0, 0, 0, 0)
    else if (preset === 'week') start.setDate(now.getDate() - 7)
    else if (preset === 'month') start.setDate(now.getDate() - 30)
    return { from: toISODate(start), to: toISODate(now) }
  }, [preset, fromDate, toDate])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { from, to } = computeRange()
      const res = await fetch(`/api/admin/reports/staff-activity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה בטעינת הדוח')
      setRows(data.secretaries ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
      setRows([])
    } finally { setLoading(false) }
  }, [computeRange])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינת דוח בשינוי טווח (fetch לגיטימי)
  useEffect(() => { if (preset !== 'custom') load() }, [preset, load])

  const presetBtn = (p: Preset, label: string) => (
    <button
      onClick={() => setPreset(p)}
      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${preset === p ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
    >{label}</button>
  )

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-700">דוח מזכירים — מי טיפל במה ומתי</h2>
        <div className="flex items-center gap-1.5 flex-wrap">
          {presetBtn('today', 'היום')}
          {presetBtn('week', '7 ימים')}
          {presetBtn('month', '30 ימים')}
          {presetBtn('custom', 'מותאם')}
        </div>
      </div>

      {preset === 'custom' && (
        <div className="flex items-end gap-2 mb-4 flex-wrap">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">מתאריך</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">עד תאריך</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5" />
          </div>
          <button onClick={load} className="text-xs px-3 py-2 rounded-lg bg-indigo-600 text-white">הצג</button>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> טוען…
        </div>
      ) : error ? (
        <p className="text-sm text-red-500 py-4 text-center">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">אין פעילות מתועדת בטווח הזה</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const isOpen = expanded === r.userId
            return (
              <div key={r.userId} className="rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : r.userId)}
                  className="w-full flex items-center justify-between gap-3 p-3 hover:bg-slate-50 transition-colors text-right"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isOpen ? <ChevronUp size={15} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-slate-400 flex-shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">
                        {r.name}
                        {r.department && <span className="text-xs text-slate-400 font-normal mr-1.5">({DEPT_LABEL[r.department] ?? r.department})</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {Object.entries(r.byCategory).map(([c, n]) => (
                          <span key={c} className="text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{CAT_LABEL[c] ?? c}: {n}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="inline-flex items-center gap-1 text-xs text-indigo-700"><FileText size={13} /> {r.requests}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Mail size={13} /> {r.emails}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 divide-y divide-slate-50 max-h-80 overflow-y-auto">
                    {r.items.length === 0 ? (
                      <p className="text-xs text-slate-400 p-3">אין פירוט</p>
                    ) : r.items.map((it, i) => {
                      const href = it.kind === 'request' ? cardHref(it.category, it.entityId) : null
                      const content = (
                        <>
                          <div className="flex items-center gap-2 min-w-0">
                            {it.kind === 'email' ? <Mail size={12} className="text-emerald-500 flex-shrink-0" /> : <FileText size={12} className="text-indigo-500 flex-shrink-0" />}
                            <span className="text-slate-700 flex-shrink-0">{ACTION_LABEL[it.action] ?? it.action}</span>
                            {it.detail && <span className="text-slate-400 truncate">— {it.detail}</span>}
                            {href && <ExternalLink size={11} className="text-indigo-400 flex-shrink-0" />}
                          </div>
                          <span className="text-slate-400 flex-shrink-0 ltr-num">{fmtDateTime(it.at)}</span>
                        </>
                      )
                      return href ? (
                        <Link key={i} href={href} className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-indigo-50/60 transition-colors">
                          {content}
                        </Link>
                      ) : (
                        <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                          {content}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
