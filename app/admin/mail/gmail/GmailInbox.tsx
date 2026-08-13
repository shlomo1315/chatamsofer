'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Inbox, Send, Search, Loader2, Paperclip, RefreshCw, Settings,
  ChevronLeft, Mail, MailOpen, X, AlertTriangle, User, PenSquare,
  Reply, Trash2, Archive, Flag, Tag, Check, Circle,
} from 'lucide-react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { DEPARTMENTS } from '@/lib/departments'

// ─────────────────────────────────────────────────────────────────────────────
// תיבת הדואר של Gmail — נבנית על האינדקס.
//
// 🔴 הרשימה מגיעה מהמסד (מיידית, ניתנת לחיפוש וסינון), וגוף ההודעה נמשך
// מ-Gmail רק בפתיחה. כך אין עותק שני שיכול לסתור את המקור.
//
// ⚠️ כל פעולה (נקרא, לטיפול, מחיקה) נכתבת ל-Gmail *וגם* לאינדקס. כתיבה
// לאינדקס בלבד הייתה נמחקת בסנכרון הבא שמושך את מצב האמת מ-Gmail.
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
  account_id?: string | null
}

interface Account { id: string; email: string; label?: string | null; department?: string | null }
interface LabelStat { name: string; count: number }
interface Attachment { filename?: string; mimeType?: string; size?: number }

const fmtDate = (d?: string | null) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return format(dt, 'dd/MM/yy HH:mm', { locale: he })
}

const DEPTS = Object.values(DEPARTMENTS)
const deptLabel = (k?: string | null) => DEPTS.find(d => d.key === k)?.label ?? null
const deptColor = (k?: string | null) => DEPTS.find(d => d.key === k)?.color ?? '#94a3b8'

type Folder = 'inbox' | 'unread' | 'sent' | 'followup' | 'all'
const FOLLOWUP = 'לטיפול'

/** ⚠️ פרק זמן הרענון האוטומטי. קצר מדי מכביד על המסד ללא תועלת — הסנכרון
 *  עצמו מתרחש ב-Push, וזה רק מרענן את התצוגה. */
const REFRESH_MS = 15_000

export default function GmailInbox() {
  const [folder, setFolder] = useState<Folder>('inbox')
  const [department, setDepartment] = useState('')
  const [account, setAccount] = useState('')
  const [activeLabel, setActiveLabel] = useState('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const [messages, setMessages] = useState<Message[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [unreadByDept, setUnreadByDept] = useState<Record<string, number>>({})
  const [unreadByAccount, setUnreadByAccount] = useState<Record<string, number>>({})
  const [accounts, setAccounts] = useState<Account[]>([])
  const [labels, setLabels] = useState<LabelStat[]>([])
  const [followupCount, setFollowupCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Message | null>(null)
  const [body, setBody] = useState('')
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [bodyLoading, setBodyLoading] = useState(false)
  const [acting, setActing] = useState(false)

  const [composeOpen, setComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<'new' | 'reply'>('new')
  const [cTo, setCTo] = useState('')
  const [cSubject, setCSubject] = useState('')
  const [cBody, setCBody] = useState('')
  const [sending, setSending] = useState(false)

  // ⚠️ ref ולא state: משמש בתוך ה-interval, ו-state היה מייצר interval חדש
  // בכל שינוי סינון ומאפס את השעון.
  //
  // ⚠️ מתעדכן ב-effect ולא בגוף הרינדור: כתיבה ל-ref בזמן רינדור הופכת
  // אותו ללא-דטרמיניסטי, ו-React עלול לרנדר פעמיים ולראות ערך חלקי.
  const paramsRef = useRef({ folder, department, account, activeLabel, search, page })
  useEffect(() => {
    paramsRef.current = { folder, department, account, activeLabel, search, page }
  }, [folder, department, account, activeLabel, search, page])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const p = paramsRef.current
    try {
      const qs = new URLSearchParams({ folder: p.folder, page: String(p.page) })
      if (p.department) qs.set('department', p.department)
      if (p.account) qs.set('account', p.account)
      if (p.activeLabel) qs.set('label', p.activeLabel)
      if (p.search) qs.set('q', p.search)
      const res = await fetch(`/api/admin/gmail/inbox?${qs}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'טעינת ההודעות נכשלה'); return }
      setMessages(json.messages ?? [])
      setTotal(json.total ?? 0)
      setHasMore(!!json.hasMore)
      setUnreadByDept(json.unreadByDept ?? {})
      setUnreadByAccount(json.unreadByAccount ?? {})
      setAccounts(json.accounts ?? [])
      setLabels(json.labels ?? [])
      setFollowupCount(json.followupCount ?? 0)
      setError(null)
    } catch { if (!silent) setError('שגיאת רשת') } finally { if (!silent) setLoading(false) }
  }, [])

  // ⚠️ הטעינה קוראת את הפרמטרים מה-ref, ולכן חייבת לרוץ *אחרי* שהוא
  // עודכן. ה-effect שמעדכן אותו מוצהר קודם, ו-React מריץ אפקטים בסדר
  // ההצהרה — כך שהסדר מובטח ואינו תלוי במזל.
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) void load() }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [load, folder, department, account, activeLabel, search, page])

  // 🔴 רענון אוטומטי — זה מה שהופך את המסך ל"חי".
  // ⚠️ silent: אינו מדליק ספינר ואינו מנקה את הרשימה, אחרת המסך היה
  // מהבהב כל 15 שניות בזמן שהמשתמש קורא.
  useEffect(() => {
    const t = setInterval(() => { void load(true) }, REFRESH_MS)
    return () => clearInterval(t)
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
      if (m.is_unread) {
        setMessages(list => list.map(x =>
          x.gmail_message_id === m.gmail_message_id ? { ...x, is_unread: false } : x))
        setSelected(s => s ? { ...s, is_unread: false } : s)
      }
    } catch { setBodyError('שגיאת רשת') } finally { setBodyLoading(false) }
  }

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!selected) return
    setActing(true)
    try {
      const res = await fetch('/api/admin/gmail/inbox/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, messageId: selected.gmail_message_id, threadId: selected.thread_id, ...extra }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'הפעולה נכשלה'); return }
      if (action === 'trash' || action === 'archive') setSelected(null)
      await load(true)
    } catch { setError('שגיאת רשת') } finally { setActing(false) }
  }

  function startReply() {
    if (!selected) return
    setComposeMode('reply')
    setCTo(selected.from_email ?? '')
    setCSubject(selected.subject?.startsWith('Re:') ? selected.subject : `Re: ${selected.subject ?? ''}`)
    setCBody('')
    setComposeOpen(true)
  }

  function startNew() {
    setComposeMode('new')
    setCTo(''); setCSubject(''); setCBody('')
    setComposeOpen(true)
  }

  async function send() {
    setSending(true)
    try {
      const res = await fetch('/api/admin/gmail/inbox/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: composeMode === 'reply' ? 'reply' : 'send',
          to: cTo, subject: cSubject,
          // ⚠️ שורות חדשות מומרות ל-<br>: הגוף נשלח כ-HTML, ובלי ההמרה
          // כל ההודעה מגיעה כפסקה אחת רצופה.
          html: cBody.replace(/\n/g, '<br>'),
          threadId: composeMode === 'reply' ? selected?.thread_id : undefined,
          accountId: selected?.account_id ?? account ?? undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'השליחה נכשלה'); return }
      setComposeOpen(false)
      setError(null)
      await load(true)
    } catch { setError('שגיאת רשת') } finally { setSending(false) }
  }

  const totalUnread = Object.values(unreadByDept).reduce((a, b) => a + b, 0)
  const isFollowup = (m: Message) => (m.labels ?? []).includes(FOLLOWUP)

  const navBtn = (active: boolean) =>
    `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-bold transition-colors text-right ${
      active ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`

  return (
    <div className="flex flex-col gap-4">
      {/* כותרת */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Mail size={20} className="text-indigo-600" /> תיבת Gmail
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {total.toLocaleString('he-IL')} הודעות
            {totalUnread > 0 && <> · <strong className="text-indigo-600">{totalUnread}</strong> לא נקראו</>}
            <span className="text-slate-300"> · מתעדכן אוטומטית</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={startNew}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-indigo-700">
            <PenSquare size={14} /> הודעה חדשה
          </button>
          <button onClick={() => { setPage(0); void load() }} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} רענן
          </button>
          <Link href="/admin/mail/index-sync"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300">
            <Settings size={14} /> סנכרון
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-900 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2"><AlertTriangle size={16} /> {error}</span>
          <button onClick={() => setError(null)} className="text-amber-700 hover:text-amber-900"><X size={15} /></button>
        </div>
      )}

      {/* ── שלוש עמודות: פאנל צדדי · רשימה · הודעה ── */}
      <div className="grid gap-4 lg:grid-cols-[190px_minmax(0,340px)_1fr]">

        {/* ── פאנל צדדי ── */}
        <aside className="hidden lg:block rounded-2xl border border-slate-200 bg-white p-2.5 h-fit sticky top-4">
          <nav className="space-y-0.5">
            {([
              { key: 'inbox', label: 'דואר נכנס', icon: Inbox, badge: totalUnread },
              { key: 'unread', label: 'לא נקראו', icon: MailOpen, badge: totalUnread },
              { key: 'followup', label: FOLLOWUP, icon: Flag, badge: followupCount },
              { key: 'sent', label: 'נשלחו', icon: Send, badge: 0 },
              { key: 'all', label: 'כל ההודעות', icon: Archive, badge: 0 },
            ] as const).map(f => (
              <button key={f.key}
                onClick={() => { setFolder(f.key); setActiveLabel(''); setPage(0); setSelected(null) }}
                className={navBtn(folder === f.key && !activeLabel)}>
                <f.icon size={15} className="flex-shrink-0" />
                <span className="flex-1">{f.label}</span>
                {f.badge > 0 && (
                  <span className={`text-[10px] font-bold rounded-full px-1.5 ${
                    folder === f.key ? 'bg-white/25' : 'bg-indigo-100 text-indigo-700'}`}>
                    {f.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* התיבות */}
          {accounts.length > 1 && (
            <>
              <p className="px-3 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">התיבות</p>
              <div className="space-y-0.5">
                <button onClick={() => { setAccount(''); setPage(0) }} className={navBtn(!account)}>
                  <Mail size={14} /> <span className="flex-1">כל התיבות</span>
                </button>
                {accounts.map(a => {
                  const n = unreadByAccount[a.id] ?? 0
                  return (
                    <button key={a.id} onClick={() => { setAccount(a.id); setPage(0); setSelected(null) }}
                      className={navBtn(account === a.id)} title={a.email}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: deptColor(a.department) }} />
                      <span className="flex-1 truncate text-[12px]">{deptLabel(a.department) ?? a.label ?? a.email}</span>
                      {n > 0 && <span className={`text-[10px] font-bold rounded-full px-1.5 ${account === a.id ? 'bg-white/25' : 'bg-indigo-100 text-indigo-700'}`}>{n}</span>}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* תוויות Gmail */}
          {labels.length > 0 && (
            <>
              <p className="px-3 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">תוויות</p>
              <div className="space-y-0.5 max-h-64 overflow-y-auto">
                {labels.map(l => (
                  <button key={l.name}
                    onClick={() => { setActiveLabel(l.name === activeLabel ? '' : l.name); setPage(0); setSelected(null) }}
                    className={navBtn(activeLabel === l.name)}>
                    <Tag size={13} className="flex-shrink-0" />
                    <span className="flex-1 truncate text-[12px]">{l.name}</span>
                    <span className="text-[10px] text-slate-400">{l.count}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        {/* ── רשימה ── */}
        <div className={`rounded-2xl border border-slate-200 bg-white overflow-hidden ${selected ? 'hidden lg:block' : ''}`}>
          {/* חיפוש + מחלקה */}
          <div className="border-b border-slate-100 p-2.5 space-y-2">
            <form onSubmit={e => { e.preventDefault(); setSearch(q); setPage(0) }} className="relative">
              <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש…"
                className="w-full pr-9 pl-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              {search && (
                <button type="button" onClick={() => { setQ(''); setSearch(''); setPage(0) }}
                  className="absolute top-1/2 -translate-y-1/2 left-2 text-slate-400 hover:text-slate-600"><X size={14} /></button>
              )}
            </form>
            <select value={department} onChange={e => { setDepartment(e.target.value); setPage(0) }}
              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-200">
              <option value="">כל המחלקות</option>
              {DEPTS.map(d => {
                const n = unreadByDept[d.key] ?? 0
                return <option key={d.key} value={d.key}>{d.label}{n > 0 ? ` (${n})` : ''}</option>
              })}
            </select>
          </div>

          {loading ? (
            <p className="px-4 py-8 text-sm text-slate-400 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> טוען…
            </p>
          ) : messages.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Inbox size={26} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-600">
                {search ? 'לא נמצאו הודעות' : 'אין הודעות בתיקייה זו'}
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-50 max-h-[68vh] overflow-y-auto">
                {messages.map(m => (
                  <button key={m.gmail_message_id} onClick={() => open(m)}
                    className={`w-full text-right px-4 py-3 transition-colors ${
                      selected?.gmail_message_id === m.gmail_message_id ? 'bg-indigo-50' :
                      m.is_unread ? 'bg-indigo-50/30 hover:bg-indigo-50/60' : 'hover:bg-slate-50'
                    }`}>
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <span className="flex items-center gap-1.5 min-w-0">
                        {m.is_unread && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />}
                        {isFollowup(m) && <Flag size={11} className="text-amber-500 flex-shrink-0" />}
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
                    className="text-xs font-bold text-slate-500 hover:text-indigo-700 disabled:opacity-30">הקודם</button>
                  <span className="text-[11px] text-slate-400">עמוד {page + 1}</span>
                  <button onClick={() => setPage(p => p + 1)} disabled={!hasMore}
                    className="text-xs font-bold text-slate-500 hover:text-indigo-700 disabled:opacity-30">הבא</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── תצוגת הודעה ── */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden min-h-[300px]">
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-center px-6">
              <Mail size={30} className="text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-500">בחרו הודעה לצפייה</p>
            </div>
          ) : (
            <>
              {/* סרגל פעולות */}
              <div className="border-b border-slate-100 px-4 py-2.5 flex items-center gap-1.5 flex-wrap">
                <button onClick={startReply} disabled={acting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
                  <Reply size={13} /> השב
                </button>
                <button onClick={() => act(selected.is_unread ? 'mark-read' : 'mark-unread')} disabled={acting}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-indigo-300 disabled:opacity-50">
                  {selected.is_unread ? <><Check size={13} /> סמן כנקרא</> : <><Circle size={13} /> סמן כלא נקרא</>}
                </button>
                <button onClick={() => act(isFollowup(selected) ? 'unfollowup' : 'followup')} disabled={acting}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-50 ${
                    isFollowup(selected) ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-amber-300'
                  }`}>
                  <Flag size={13} /> {isFollowup(selected) ? 'הוסר מטיפול' : 'לטיפול'}
                </button>
                <button onClick={() => act('archive')} disabled={acting}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-indigo-300 disabled:opacity-50">
                  <Archive size={13} /> ארכב
                </button>
                <button onClick={() => { if (confirm('להעביר את ההודעה לאשפה בגמייל?')) act('trash') }} disabled={acting}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                  <Trash2 size={13} />
                </button>
                <button onClick={() => setSelected(null)} className="lg:hidden mr-auto text-slate-400"><ChevronLeft size={20} /></button>
              </div>

              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="font-extrabold text-slate-900 leading-snug">{selected.subject || '(ללא נושא)'}</h2>
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
                    <Loader2 size={14} className="animate-spin" /> טוען…
                  </p>
                ) : bodyError ? (
                  <p className="m-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-900 flex items-center gap-2">
                    <AlertTriangle size={15} /> {bodyError}
                  </p>
                ) : (
                  /* 🔴 iframe מבודד — HTML של מייל חיצוני נושא סגנונות
                     וסקריפטים שדולפים לעמוד המארח (כאן זה כבר גרם לקריסה). */
                  <iframe title="תוכן ההודעה" sandbox=""
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

      {/* ── חלון כתיבה ── */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) setComposeOpen(false) }}>
          <div className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900">
                {composeMode === 'reply' ? 'תשובה' : 'הודעה חדשה'}
              </h3>
              <button onClick={() => setComposeOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <input value={cTo} onChange={e => setCTo(e.target.value)} dir="ltr" placeholder="אל…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              <input value={cSubject} onChange={e => setCSubject(e.target.value)} placeholder="נושא"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              <textarea value={cBody} onChange={e => setCBody(e.target.value)} rows={10} placeholder="תוכן ההודעה…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50">
              <span className="text-[11px] text-slate-400">
                {composeMode === 'reply' ? 'התשובה תישלח בשרשור הקיים' : 'ההודעה תישלח מהתיבה הפעילה'}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setComposeOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">ביטול</button>
                <button onClick={send} disabled={sending || !cTo.trim() || !cBody.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50">
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} שלח
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
