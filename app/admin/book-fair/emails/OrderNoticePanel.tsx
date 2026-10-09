'use client'
import { useState, useEffect, useCallback } from 'react'
import { Send, Loader2, Eye, MousePointerClick, Check, X, Users, RefreshCw } from 'lucide-react'
import { useCan } from '@/components/StaffPermissions'

// הודעה אישית לכל מזמיני האתר + מעקב מי פתח ומי נכנס להזמנה (09.10).
//
// ⚠️ "פתח" נמדד בפיקסל, וחסימת תמונות (NetFree, Gmail) מסתירה חלק
// מהפתיחות. "נכנס להזמנה" (לחיצה על הקישור) הוא הסימן הוודאי.

type Notice = {
  id: string; subject: string; status: string; total: number
  sent_count: number | null; failed_count: number | null; created_at: string; sent_at: string | null
}
type Recipient = {
  id: string; email: string; customer_name: string | null; order_numbers: string | null
  status: string; error: string | null; sent_at: string | null
  opened_at: string | null; clicked_at: string | null; open_count: number
}
type Filter = 'all' | 'opened' | 'not_opened' | 'clicked' | 'failed'

const DEFAULT_SUBJECT = 'עדכון חשוב על הזמנתכם — יריד ספרי החתם סופר'
const DEFAULT_MESSAGE = `להלן כמה הודעות חשובות:

1. הזמנתכם התקבלה ונאספה על ידי חברת השליחויות. בעקבות כמות ההזמנות העצומה ייתכנו כמה ימי המתנה, ואנו מקווים שלא יאוחר מ-14 ימי עסקים.

2. באם יהיו ספרים שאזלו מהמלאי - אמצעי התשלום שלכם יזוכה חזרה בסכום הספר החסר. גם כאן ייתכן זמן המתנה בעקבות העומס העצום, ואנו מבקשים מראש את סליחתכם וסבלנותכם.

3. לכל פנייה על אי הספקה או טעות בתשלום וכדומה, ניתן כבר לפנות לאימייל yerid@chasamsofer.info. אך נא להתחשב ועד 14 ימי עסקים לא לברר על מועד האספקה.

בברכה מרובה
היכל החתם סופר`

export default function OrderNoticePanel() {
  const canSend = useCan('book_fair', 'edit')
  const [notices, setNotices] = useState<Notice[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [audienceSize, setAudienceSize] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [message, setMessage] = useState(DEFAULT_MESSAGE)
  const [testTo, setTestTo] = useState('')
  const [busy, setBusy] = useState<'' | 'test' | 'send'>('')
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async (id?: string | null) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/book-fair/order-notice${id ? `?id=${id}` : ''}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'טעינה נכשלה')
      setNotices(j.notices ?? [])
      setSelectedId(j.selectedId ?? null)
      setRecipients(j.recipients ?? [])
      setAudienceSize(j.audienceSize ?? null)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'טעינה נכשלה')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/admin/book-fair/order-notice', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        setNotices(j.notices ?? [])
        setSelectedId(j.selectedId ?? null)
        setRecipients(j.recipients ?? [])
        setAudienceSize(j.audienceSize ?? null)
        if (j.error) setError(j.error)
      })
      .catch(() => alive && setError('טעינה נכשלה'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  async function post(test: boolean) {
    if (!test && !window.confirm(`לשלוח את ההודעה ל-${audienceSize ?? ''} כתובות? אי אפשר לבטל מייל שיצא.`)) return
    setBusy(test ? 'test' : 'send'); setError(''); setInfo('')
    try {
      const res = await fetch('/api/admin/book-fair/order-notice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, ...(test ? { test: testTo.trim() } : {}) }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'השליחה נכשלה')
      if (test) setInfo(`מייל מבחן נשלח ל-${testTo.trim()}`)
      else {
        setInfo(`נשלחו ${j.sent} מתוך ${j.total}${j.failed ? ` · ${j.failed} נכשלו` : ''}`)
        setOpen(false)
        await load(j.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'השליחה נכשלה')
    } finally {
      setBusy('')
    }
  }

  const opened = recipients.filter(r => r.opened_at).length
  const clicked = recipients.filter(r => r.clicked_at).length
  const failedN = recipients.filter(r => r.status === 'failed').length
  const sentN = recipients.filter(r => r.status === 'sent').length
  const shown = recipients.filter(r =>
    filter === 'all' ? true
      : filter === 'opened' ? !!r.opened_at
      : filter === 'not_opened' ? r.status === 'sent' && !r.opened_at
      : filter === 'clicked' ? !!r.clicked_at
      : r.status === 'failed')

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-sky-200 bg-sky-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900">הודעה לכל המזמינים באתר</h2>
          <p className="text-sm text-slate-500">
            כל לקוח מקבל פנייה בשמו וקישור ישיר להזמנה שלו
            {audienceSize !== null && <> · <b>{audienceSize}</b> כתובות</>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load(selectedId)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw size={15} /> רענון
          </button>
          {canSend && (
            <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">
              <Send size={15} /> כתיבת הודעה
            </button>
          )}
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{info}</p>}

      {notices.length > 1 && (
        <select value={selectedId ?? ''} onChange={e => load(e.target.value)} className={INPUT}>
          {notices.map(n => (
            <option key={n.id} value={n.id}>{fmt(n.created_at)} — {n.subject} ({n.sent_count ?? 0}/{n.total})</option>
          ))}
        </select>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-slate-400" /></div>
      ) : !selectedId ? (
        <p className="py-4 text-center text-sm text-slate-500">טרם נשלחה הודעה כזו</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat icon={<Users size={16} />} label="נשלחו" value={sentN} active={filter === 'all'} onClick={() => setFilter('all')} />
            <Stat icon={<Eye size={16} />} label="פתחו" value={opened} active={filter === 'opened'} onClick={() => setFilter('opened')} />
            <Stat icon={<X size={16} />} label="לא פתחו" value={sentN - opened} active={filter === 'not_opened'} onClick={() => setFilter('not_opened')} />
            <Stat icon={<MousePointerClick size={16} />} label="נכנסו להזמנה" value={clicked} active={filter === 'clicked'} onClick={() => setFilter('clicked')} />
          </div>
          {failedN > 0 && (
            <button onClick={() => setFilter('failed')} className="self-start text-sm font-medium text-red-700 underline">
              {failedN} נכשלו בשליחה
            </button>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full table-fixed">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-3 text-right">שם</th>
                  <th className="px-3 py-3 text-right">מייל</th>
                  <th className="w-28 px-3 py-3 text-right">הזמנות</th>
                  <th className="w-24 px-3 py-3 text-right">נשלח</th>
                  <th className="w-24 px-3 py-3 text-right">פתח</th>
                  <th className="w-24 px-3 py-3 text-right">נכנס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(r => (
                  <tr key={r.id} className="text-sm hover:bg-slate-50">
                    <td className="truncate px-3 py-2" title={r.customer_name ?? ''}>{r.customer_name || '—'}</td>
                    <td className="truncate px-3 py-2 text-slate-600" dir="ltr" title={r.email}>{r.email}</td>
                    <td className="truncate px-3 py-2 text-slate-600" title={r.order_numbers ?? ''}>{r.order_numbers || '—'}</td>
                    <td className="px-3 py-2">
                      {r.status === 'sent'
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check size={13} /> {fmtTime(r.sent_at)}</span>
                        : r.status === 'failed'
                          ? <span className="text-xs text-red-700" title={r.error ?? ''}>נכשל</span>
                          : <span className="text-xs text-slate-400">ממתין</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.opened_at ? <span className="text-sky-700" title={`${r.open_count} פתיחות`}>{fmtTime(r.opened_at)}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.clicked_at ? <span className="font-medium text-emerald-700">{fmtTime(r.clicked_at)}</span> : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-bold text-slate-900">הודעה לכל המזמינים באתר</h2>
              <button onClick={() => setOpen(false)} disabled={!!busy} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto p-5">
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                בראש כל מייל יופיע אוטומטית: <b>&quot;שלום וברכה להרב [שם המזמין]&quot;</b>, אחריו <b>&quot;להלן פרטי ההזמנה שלכם במערכת&quot;</b> עם קישור ישיר לכל הזמנה שלו, ואחר כך המלל שלמטה.
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">נושא</span>
                <input value={subject} onChange={e => setSubject(e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">המלל</span>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={14} className={INPUT} />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-700">שליחת מבחן אל</span>
                  <input value={testTo} onChange={e => setTestTo(e.target.value)} dir="ltr" placeholder="name@example.com" className={INPUT} />
                </label>
                <button onClick={() => post(true)} disabled={!!busy || !testTo.includes('@')} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                  {busy === 'test' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} מבחן
                </button>
              </div>
              <p className="text-xs text-slate-400">נשלח מ-<span className="font-mono">yerid@chasamsofer.info</span> · המבחן נבנה עם פרטי ההזמנה של לקוח אמיתי ראשון ברשימה</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button onClick={() => setOpen(false)} disabled={!!busy} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">ביטול</button>
              <button onClick={() => post(false)} disabled={!!busy || !subject.trim() || !message.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-40">
                {busy === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {busy === 'send' ? 'שולח… (עד כמה דקות)' : `שליחה ל-${audienceSize ?? ''} כתובות`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Stat({ icon, label, value, active, onClick }: { icon: React.ReactNode; label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-right ${active ? 'border-sky-400 bg-white ring-2 ring-sky-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
      <span className="text-slate-400">{icon}</span>
      <span className="flex flex-col">
        <span className="text-lg font-bold text-slate-900">{value}</span>
        <span className="text-xs text-slate-500">{label}</span>
      </span>
    </button>
  )
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const INPUT = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100'
