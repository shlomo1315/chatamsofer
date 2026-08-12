'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Inbox, Send, Search, Loader2, Paperclip, RefreshCw, Settings,
  ChevronLeft, Mail, MailOpen, X, AlertTriangle, User,
} from 'lucide-react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { DEPARTMENTS } from '@/lib/departments'

// ─────────────────────────────────────────────────────────────────────────────
// תיבת הדואר של Gmail — נבנית על האינדקס.
//
// 🔴 הרשימה מגיעה מהמסד (מיידית, ניתנת לחיפוש ולסינון לפי מחלקה), וגוף
// ההודעה נמשך מ-Gmail רק כשפותחים אותה. כך אין עותק שני שיכול לסתור את
// המקור — וזו כל הסיבה שהמעבר נעשה.
//
// ⚠️ גוף ההודעה מוצג ב-iframe מבודד ולא ב-dangerouslySetInnerHTML: HTML של
// מייל חיצוני מכיל סקריפטים וסגנונות שדולפים לעמוד ומפילים אותו (זה כבר
// קרה כאן — באג removeChild).
// ─────────────────────────────────────────────────────────────────────────────

interface Message {
  gmail_message_id: string
  thread_id: string | null
  from_email: string | null
  from_name: string | null
  to_email: string | null
  original_to: string | null
  subject: string | null
  snippet: string | null
  sent_at: string | null
  has_attachments: boolean
  is_unread: boolean
  labels: string[]
  department: string | null
  beneficiary_id: string | null
}

interface Attachment { filename?: string; mimeType?: string; size?: number; attachmentId?: string }

const fmtDate = (d?: string | null) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return format(dt, 'dd/MM/yy HH:mm', { locale: he })
}

const DEPTS = Object.values(DEPARTMENTS)
const deptLabel = (k?: string | null) => DEPTS.find(d => d.key === k)?.label ?? null
const deptColor = (k?: string | null) => DEPTS.find(d => d.key === k)?.color ?? '#94a3b8'

type Folder = 'inbox' | 'unread' | 'sent'

export default function GmailInbox() {
  const [folder, setFolder] = useState<Folder>('inbox')
  const [department, setDepartment] = useState('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const [messages, setMessages] = useState<Message[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [unreadByDept, setUnreadByDept] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Message | null>(null)
  const [body, setBody] = useState('')
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [bodyLoading, setBodyLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ folder, page: String(page) })
      if (department) params.set('department', department)
      if (search) params.set('q', search)
      const res = await fetch(`/api/admin/gmail/inbox?${params}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'טעינת ההודעות נכשלה'); return }
      setMessages(json.messages ?? [])
      setTotal(json.total ?? 0)
      setHasMore(!!json.hasMore)
      setUnreadByDept(json.unreadByDept ?? {})
      setError(null)
    } catch { setError('שגיאת רשת') } finally { setLoading(false) }
  }, [folder, department, search, page])

  // ⚠️ נדחה בטיק ומבוטל בניקוי — קריאה ישירה מעדכנת state בזמן רינדור.
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) void load() }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [load])

  async function open(m: Message) {
    setSelected(m); setBody(''); setBodyError(null); setAttachments([]); setBodyLoading(true)
    try {
      const res = await fetch(`/api/admin/gmail/inbox?id=${encodeURIComponent(m.gmail_message_id)}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setBodyError(json.error ?? 'טעינת ההודעה נכשלה'); return }
      setBody(json.body ?? '')
      setBodyError(json.bodyError ?? null)
      setAttachments(json.attachments ?? [])
      // ההודעה נקראה — מעדכנים את הרשימה בלי לטעון אותה מחדש.
      if (m.is_unread) {
        setMessages(list => list.map(x =>
          x.gmail_message_id === m.gmail_message_id ? { ...x, is_unread: false } : x))
      }
    } catch { setBodyError('שגיאת רשת') } finally { setBodyLoading(false) }
  }

  const totalUnread = Object.values(unreadByDept).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* כותרת + פעולות */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Mail size={20} className="text-indigo-600" /> תיבת Gmail
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {total.toLocaleString('he-IL')} הודעות
            {totalUnread > 0 && <> · <strong className="text-indigo-600">{totalUnread}</strong> לא נקראו</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setPage(0); void load() }} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} רענן
          </button>
          <Link href="/admin/mail/index-sync"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700">
            <Settings size={14} /> סנכרון ותיבות
          </Link>
        </div>
      </div>

      {/* סרגל: תיקיות + חיפוש */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 flex items-center gap-2 flex-wrap">
        {([
          { key: 'inbox', label: 'דואר נכנס', icon: Inbox },
          { key: 'unread', label: 'לא נקראו', icon: MailOpen },
          { key: 'sent', label: 'נשלחו', icon: Send },
        ] as const).map(f => (
          <button key={f.key} onClick={() => { setFolder(f.key); setPage(0); setSelected(null) }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
              folder === f.key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}>
            <f.icon size={14} /> {f.label}
            {f.key === 'unread' && totalUnread > 0 && (
              <span className={`rounded-full px-1.5 text-[10px] ${folder === f.key ? 'bg-white/25' : 'bg-indigo-100 text-indigo-700'}`}>
                {totalUnread}
              </span>
            )}
          </button>
        ))}

        <div className="h-5 w-px bg-slate-200 mx-1" />

        <select value={department} onChange={e => { setDepartment(e.target.value); setPage(0) }}
          className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-200">
          <option value="">כל המחלקות</option>
          {DEPTS.map(d => {
            const n = unreadByDept[d.key] ?? 0
            return <option key={d.key} value={d.key}>{d.label}{n > 0 ? ` (${n})` : ''}</option>
          })}
        </select>

        <form onSubmit={e => { e.preventDefault(); setSearch(q); setPage(0) }} className="relative flex-1 min-w-48">
          <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="חיפוש בנושא, שולח או תקציר…"
            className="w-full pr-9 pl-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          {search && (
            <button type="button" onClick={() => { setQ(''); setSearch(''); setPage(0) }}
              className="absolute top-1/2 -translate-y-1/2 left-2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </form>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-900 flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* רשימה + תצוגה */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* רשימה */}
        <div className={`rounded-2xl border border-slate-200 bg-white overflow-hidden ${selected ? 'hidden lg:block' : ''}`}>
          {loading ? (
            <p className="px-4 py-8 text-sm text-slate-400 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> טוען…
            </p>
          ) : messages.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Inbox size={26} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-600">
                {search ? 'לא נמצאו הודעות לחיפוש זה' : 'אין הודעות בתיקייה זו'}
              </p>
              {!search && (
                <p className="text-xs text-slate-400 mt-1">
                  אם התיבה חוברה זה עתה — יש להריץ סנכרון במסך הסנכרון.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-50 max-h-[70vh] overflow-y-auto">
                {messages.map(m => (
                  <button key={m.gmail_message_id} onClick={() => open(m)}
                    className={`w-full text-right px-4 py-3 transition-colors ${
                      selected?.gmail_message_id === m.gmail_message_id ? 'bg-indigo-50' :
                      m.is_unread ? 'bg-indigo-50/30 hover:bg-indigo-50/60' : 'hover:bg-slate-50'
                    }`}>
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <span className="flex items-center gap-1.5 min-w-0">
                        {m.is_unread && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" title="לא נקרא" />}
                        <span className={`truncate text-[13px] ${m.is_unread ? 'font-extrabold text-slate-900' : 'font-medium text-slate-600'}`}>
                          {m.from_name || m.from_email || 'ללא שולח'}
                        </span>
                      </span>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{fmtDate(m.sent_at)}</span>
                    </div>
                    <p className={`text-xs truncate ${m.is_unread ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                      {m.subject || '(ללא נושא)'}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{m.snippet}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {m.department && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                          style={{ backgroundColor: deptColor(m.department) }}>
                          {deptLabel(m.department)}
                        </span>
                      )}
                      {m.has_attachments && <Paperclip size={11} className="text-slate-400" />}
                    </div>
                  </button>
                ))}
              </div>

              {(page > 0 || hasMore) && (
                <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="text-xs font-bold text-slate-500 hover:text-indigo-700 disabled:opacity-30">
                    הקודם
                  </button>
                  <span className="text-[11px] text-slate-400">עמוד {page + 1}</span>
                  <button onClick={() => setPage(p => p + 1)} disabled={!hasMore}
                    className="text-xs font-bold text-slate-500 hover:text-indigo-700 disabled:opacity-30">
                    הבא
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* תצוגת הודעה */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden min-h-[300px]">
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-center px-6">
              <Mail size={30} className="text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-500">בחרו הודעה לצפייה</p>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-extrabold text-slate-900 leading-snug">
                    {selected.subject || '(ללא נושא)'}
                  </h2>
                  <button onClick={() => setSelected(null)} className="lg:hidden text-slate-400 hover:text-slate-600 flex-shrink-0">
                    <ChevronLeft size={20} />
                  </button>
                </div>

                <div className="mt-2.5 flex items-center gap-2 flex-wrap text-xs">
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <User size={12} className="text-slate-400" />
                    <strong>{selected.from_name || selected.from_email}</strong>
                  </span>
                  {selected.from_name && selected.from_email && (
                    <span dir="ltr" className="text-slate-400">{selected.from_email}</span>
                  )}
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500">{fmtDate(selected.sent_at)}</span>
                  {selected.department && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                      style={{ backgroundColor: deptColor(selected.department) }}>
                      {deptLabel(selected.department)}
                    </span>
                  )}
                </div>

                {/* ⚠️ הכתובת שאליה נשלח במקור — זה מה שקובע לאיזו מחלקה
                    ההודעה שייכת אחרי ניתוב לתיבה משותפת. */}
                {(selected.original_to || selected.to_email) && (
                  <p dir="ltr" className="text-[11px] text-slate-400 mt-1 text-right">
                    אל: {selected.original_to || selected.to_email}
                  </p>
                )}
              </div>

              {attachments.length > 0 && (
                <div className="border-b border-slate-100 px-5 py-2.5 flex items-center gap-2 flex-wrap">
                  <Paperclip size={13} className="text-slate-400" />
                  {attachments.map((a, i) => (
                    <span key={i} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                      {a.filename ?? `קובץ ${i + 1}`}
                    </span>
                  ))}
                </div>
              )}

              <div className="p-2">
                {bodyLoading ? (
                  <p className="py-16 text-sm text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> טוען את ההודעה…
                  </p>
                ) : bodyError ? (
                  <p className="m-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-900 flex items-center gap-2">
                    <AlertTriangle size={15} /> {bodyError}
                  </p>
                ) : (
                  /* 🔴 iframe מבודד ולא dangerouslySetInnerHTML.
                     ⚠️ HTML של מייל חיצוני נושא סגנונות וסקריפטים שדולפים
                     לעמוד המארח — כאן זה כבר גרם לקריסת removeChild. sandbox
                     ריק חוסם סקריפטים לגמרי. */
                  <iframe
                    title="תוכן ההודעה"
                    sandbox=""
                    className="w-full min-h-[420px] rounded-xl border border-slate-100 bg-white"
                    srcDoc={`<!doctype html><html dir="rtl"><head><meta charset="utf-8">
                      <style>body{font-family:system-ui,'Segoe UI',Arial,sans-serif;font-size:14px;color:#334155;padding:14px;margin:0;line-height:1.6;word-break:break-word}
                      img{max-width:100%;height:auto}table{max-width:100%}a{color:#4f46e5}</style>
                      </head><body>${body || '<p style="color:#94a3b8">(ההודעה ריקה)</p>'}</body></html>`}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
