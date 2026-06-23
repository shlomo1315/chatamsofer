'use client'
import { useState, useEffect, useCallback } from 'react'
import { Phone, CheckCircle2, AlertCircle, XCircle, RefreshCw, Loader2, Info } from 'lucide-react'

interface LogRow {
  id: string
  action: string
  actionLabel: string
  ok: boolean
  caller: string
  callId: string
  cardLast4: string | null
  errorMsg: string | null
  familyName: string | null
  note: string | null
  center: string | null
  centerStockAfter: number | null
  nedarimId: string | null
  entityId: string | null
  createdAt: string
}

const ACTION_ICON: Record<string, React.ReactNode> = {
  yemot_card_registered:  <CheckCircle2 size={14} className="text-emerald-500" />,
  yemot_card_already_set: <Info size={14} className="text-amber-500" />,
  yemot_no_active_birth:  <AlertCircle size={14} className="text-amber-500" />,
  yemot_phone_not_found:  <XCircle size={14} className="text-slate-400" />,
  yemot_error:            <XCircle size={14} className="text-red-500" />,
}

const ACTION_BADGE: Record<string, string> = {
  yemot_card_registered:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  yemot_card_already_set: 'bg-amber-50 text-amber-700 border-amber-200',
  yemot_no_active_birth:  'bg-amber-50 text-amber-700 border-amber-200',
  yemot_phone_not_found:  'bg-slate-50 text-slate-500 border-slate-200',
  yemot_error:            'bg-red-50 text-red-700 border-red-200',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtPhone(p: string) {
  const n = p.replace(/\D/g, '')
  if (n.length === 10) return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`
  return p
}

export default function YemotCallLog() {
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/activity-log/yemot?limit=100')
      if (!res.ok) { setError('שגיאה בטעינת היומן'); return }
      const d = await res.json()
      setRows(d.rows ?? [])
    } catch { setError('שגיאת תקשורת') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/yemot-maternity`
    : '/api/webhooks/yemot-maternity'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center">
            <Phone size={16} className="text-teal-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-700">מערכת טלפונית — ימות המשיח</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">רישום כרטיס נדרים לתיק לידה פעיל לפי טלפון</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-teal-600 border border-slate-200 hover:border-teal-300 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          רענן
        </button>
      </div>

      {/* Webhook URL */}
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-slate-600">כתובת ה-Webhook להגדרה בימות המשיח:</p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2">
          <span dir="ltr" className="text-xs text-slate-700 font-mono flex-1 truncate select-all">{webhookUrl}</span>
          <button
            onClick={() => navigator.clipboard.writeText(webhookUrl)}
            className="text-[11px] text-slate-400 hover:text-teal-600 border border-slate-200 rounded-md px-2 py-0.5 whitespace-nowrap transition-colors"
          >
            העתק
          </button>
        </div>
        <p className="text-[11px] text-slate-400">ימות מסוגלת לשלוח GET ו-POST — שניהם נתמכים. ניתן להגדיר סוד ב-Railway: YEMOT_WEBHOOK_SECRET</p>
      </div>

      {/* Log table */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-600">יומן שיחות ({rows.length})</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 flex items-center gap-2">
            <XCircle size={14} /> {error}
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">טוען...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
            <Phone size={28} strokeWidth={1.5} />
            <p className="text-sm">אין שיחות מתועדות עדיין</p>
            <p className="text-xs text-slate-400">השיחות יופיעו כאן לאחר שיולדות יתחילו לחייג</p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_2fr_1fr_1fr] gap-0 bg-slate-50 border-b border-slate-200 px-3 py-2">
              <p className="text-[11px] font-semibold text-slate-500">תאריך ושעה</p>
              <p className="text-[11px] font-semibold text-slate-500">פעולה</p>
              <p className="text-[11px] font-semibold text-slate-500">טלפון</p>
              <p className="text-[11px] font-semibold text-slate-500">פרטים</p>
            </div>

            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {rows.map((r) => (
                <div key={r.id} className="grid grid-cols-[1fr_2fr_1fr_1fr] gap-0 px-3 py-2.5 hover:bg-slate-50 transition-colors">
                  {/* Date */}
                  <div className="text-[11px] text-slate-500 tabular-nums">{fmtDate(r.createdAt)}</div>

                  {/* Action */}
                  <div className="flex items-center gap-1.5">
                    {ACTION_ICON[r.action] ?? <Info size={14} className="text-slate-400" />}
                    <span className={`text-[11px] font-medium border rounded-full px-2 py-0.5 ${ACTION_BADGE[r.action] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {r.actionLabel}
                    </span>
                  </div>

                  {/* Phone */}
                  <div className="text-[11px] text-slate-700 tabular-nums dir-ltr text-right">
                    {r.caller !== '—' ? fmtPhone(r.caller) : '—'}
                  </div>

                  {/* Details */}
                  <div className="text-[11px] text-slate-600 flex flex-col gap-0.5">
                    {r.cardLast4 && (
                      <span className="font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded w-fit">
                        ****{r.cardLast4}
                      </span>
                    )}
                    {r.familyName && (
                      <span className="text-slate-700 font-medium truncate max-w-[140px]" title={r.familyName}>
                        {r.familyName}
                      </span>
                    )}
                    {r.center && (
                      <span className="text-slate-500 truncate max-w-[140px]" title={r.center}>
                        מוקד: {r.center}{r.centerStockAfter != null ? ` (נותר ${r.centerStockAfter})` : ''}
                      </span>
                    )}
                    {r.errorMsg && (
                      <span className="text-red-600 truncate max-w-[140px]" title={r.errorMsg}>
                        {r.errorMsg.length > 25 ? r.errorMsg.slice(0, 25) + '…' : r.errorMsg}
                      </span>
                    )}
                    {r.note && !r.errorMsg && !r.familyName && (
                      <span className="text-slate-500 italic">{r.note}</span>
                    )}
                    {!r.cardLast4 && !r.familyName && !r.errorMsg && !r.note && '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
