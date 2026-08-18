'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Inbox, Send, Search, Loader2, Paperclip, RefreshCw, Settings,
  ChevronLeft, Mail, MailOpen, X, AlertTriangle, User, PenSquare,
  Reply, Trash2, Archive, Flag, Tag, Check, Circle, ChevronDown, Star,
} from 'lucide-react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { DEPARTMENTS } from '@/lib/departments'
import ComposeDialog from './ComposeDialog'

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
/** ⚠️ id ולא רק name: האינדקס שומר את *מזהי* התוויות, ולכן הסינון
 *  חייב לרוץ על המזהה. השם משמש לתצוגה בלבד. */
interface LabelStat { id: string; name: string; count: number }
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

type Folder = 'inbox' | 'unread' | 'starred' | 'sent' | 'followup' | 'all'
const FOLLOWUP = 'לטיפול'

/** ⚠️ פרק זמן הרענון האוטומטי. הסנכרון מול Gmail עצמו מתרחש ב-Push
 *  (webhooks/gmail-push → syncAccount), וזה רק מרענן את *התצוגה* מהאינדקס.
 *
 *  🔴 קוצר מ-15 ל-5 שניות: הסנכרון בצד השרת אכן מיידי — בלוגים רואים
 *  "[gmail-push] תוויות 1" שניות אחרי קריאת הודעה בטלפון — אבל המסך
 *  המשיך להציג את המצב הישן עד 15 שניות, וזה נראה כאילו הסנכרון לא עובד.
 *  שאילתה על אינדקס מקומי היא זולה; 5 שניות אינן מכבידות. */
const REFRESH_MS = 5_000

export default function GmailInbox() {
  const [folder, setFolder] = useState<Folder>('inbox')
  // ⚠️ נשאר כפרמטר סינון (נשלח ל-API ומשמש במונה), אך אין לו יותר בורר
  // במסך — הסינון לפי מחלקה נעשה בבחירת התיבה.
  const [department] = useState('')
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
  /** התיבה שממנה תישלח הודעה חדשה (בורר "מאת"). ריק = התיבה הפעילה. */
  const [composeFrom, setComposeFrom] = useState('')
  const [accountMenu, setAccountMenu] = useState(false)
  /** תפריט קליק-ימני על שורת הודעה (כמו בג'ימייל). null = סגור. */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; msg: Message } | null>(null)
  /** בחירה מרובה — מזהי ההודעות המסומנות, לפעולות קבוצתיות. */
  const [picked, setPicked] = useState<Set<string>>(new Set())

  // ⚠️ ref ולא state: משמש בתוך ה-interval, ו-state היה מייצר interval חדש
  // בכל שינוי סינון ומאפס את השעון.
  //
  // ⚠️ מתעדכן ב-effect ולא בגוף הרינדור: כתיבה ל-ref בזמן רינדור הופכת
  // אותו ללא-דטרמיניסטי, ו-React עלול לרנדר פעמיים ולראות ערך חלקי.
  /** ברירת המחדל (תיבת המשרד) נבחרת פעם אחת בלבד — ראו load(). */
  const didPickDefault = useRef(false)
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
      const accs = (json.accounts ?? []) as Account[]
      setAccounts(accs)
      // 🔴 ברירת מחדל: תיבת המשרד ולא "כל התיבות", שערבבה דואר מכל
      // האגפים במסך אחד בלי לדעת באיזו תיבה מדובר.
      //
      // ⚠️ נקבע כאן — ברגע שהנתונים מגיעים — ולא ב-effect נפרד: setState
      // סינכרוני בתוך effect מייצר רינדורים מדורגים (וזה בדיוק הדפוס
      // שהפיל היום את הפורטל). ⚠️ פעם אחת בלבד, אחרת בחירה ידנית
      // ב"כל התיבות" הייתה נדרסת בכל רענון.
      if (!didPickDefault.current && !paramsRef.current.account && accs.length) {
        didPickDefault.current = true
        const office = accs.find(a => /^office@/i.test(a.email)) ?? accs.find(a => a.department === 'main')
        if (office) { setAccount(office.id); setPage(0) }
      }
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
    // ⚠️ לא סוקרים כשהלשונית מוסתרת: זה בזבוז שאילתות על מסך שאיש אינו
    // רואה, והמשתמש ממילא מקבל רענון מיידי כשהוא חוזר (למטה).
    const t = setInterval(() => { if (!document.hidden) void load(true) }, REFRESH_MS)
    // 🔴 רענון מיידי בחזרה ללשונית ובהתעוררות המסך. בלי זה, מנהל שקרא
    // הודעה בטלפון וחזר למסך ראה את המצב הישן עד לטיק הבא — וזה בדיוק
    // מה שנראה כמו "הסנכרון לא עובד".
    const onWake = () => { if (!document.hidden) void load(true) }
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [load])

  // 🔴 חיפוש חי — תוצאות תוך כדי הקלדה, כמו בג'ימייל.
  //
  // ⚠️ קודם נדרש Enter (onSubmit): המשתמש הקליד, לא ראה כלום, והניח
  // שהחיפוש לא עובד. Enter עדיין עובד ומחפש מיד.
  // ⚠️ מושהה ב-350ms: בלי זה כל תו היה יורה שאילתה לשרת.
  // ⚠️ מתעלם ממחרוזת של תו אחד — רועשת מדי ומחזירה כמעט הכול.
  useEffect(() => {
    const t = setTimeout(() => {
      const v = q.trim()
      if (v.length === 1) return
      setSearch(prev => (prev === v ? prev : v))
      setPage(0)
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  // סגירת תפריט ההקשר — לחיצה בכל מקום, גלילה, או Escape.
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null) }
    // ⚠️ click ולא mousedown: mousedown היה סוגר את התפריט לפני
    // ש-onClick של הפריט שנלחץ הספיק לרוץ.
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

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

  /**
   * פעולה על הודעה מסוימת — לא בהכרח זו שנבחרה.
   *
   * ⚠️ act() המקורית עובדת רק על `selected`, ולכן תפריט הקליק-הימני
   * (שפועל על שורה כלשהי ברשימה, גם בלי לפתוח אותה) לא יכול היה
   * להשתמש בה. זו אותה לוגיקה, עם ההודעה כפרמטר.
   */
  async function actOn(m: Message, action: string, extra: Record<string, unknown> = {}) {
    setActing(true)
    try {
      const res = await fetch('/api/admin/gmail/inbox/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, messageId: m.gmail_message_id, threadId: m.thread_id, ...extra }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'הפעולה נכשלה'); return }
      // ההודעה שנמחקה/אורכבה נעלמת — אם היא הייתה פתוחה, סוגרים
      if ((action === 'trash' || action === 'archive') && selected?.gmail_message_id === m.gmail_message_id) {
        setSelected(null)
      }
      await load(true)
    } catch { setError('שגיאת רשת') } finally { setActing(false) }
  }

  /**
   * פעולה על כל ההודעות המסומנות.
   *
   * ⚠️ סדרתית ולא במקביל: כל פעולה פונה ל-Gmail API, ועשרות קריאות
   * במקביל חוטפות חסימת קצב — ואז חלק מההודעות מסומנות וחלק לא, בלי
   * שהמשתמש יודע אילו.
   * ⚠️ רענון אחד בסוף ולא אחרי כל הודעה: רשימה שמתרעננת בכל צעד
   * קופצת מתחת לידיים.
   */
  async function actOnPicked(action: string) {
    const targets = messages.filter(m => picked.has(m.gmail_message_id))
    if (!targets.length) return
    setActing(true)
    try {
      for (const m of targets) {
        await fetch('/api/admin/gmail/inbox/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, messageId: m.gmail_message_id, threadId: m.thread_id }),
        }).catch(() => {})
      }
      if (action === 'trash' || action === 'archive') setSelected(null)
      setPicked(new Set())
      await load(true)
    } finally { setActing(false) }
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

  /** תשובה להודעה מסוימת — לתפריט הקליק-הימני, שפועל גם על שורה שלא נפתחה. */
  function startReplyTo(m: Message) {
    setComposeMode('reply')
    setCTo(m.from_email ?? '')
    setCSubject(m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject ?? ''}`)
    setComposeOpen(true)
  }

  function startReply() {
    if (!selected) return
    setComposeMode('reply')
    setCTo(selected.from_email ?? '')
    setCSubject(selected.subject?.startsWith('Re:') ? selected.subject : `Re: ${selected.subject ?? ''}`)
    setComposeOpen(true)
  }

  function startNew() {
    // ברירת המחדל בבורר "מאת" — התיבה שנצפית כרגע
    setComposeFrom(paramsRef.current.account || '')
    setComposeMode('new')
    setCTo(''); setCSubject('')
    setComposeOpen(true)
  }

  async function sendMail(p: { to: string; cc?: string; bcc?: string; subject: string; html: string; attachments: { name: string; type: string; data: string }[] }) {
    try {
      const res = await fetch('/api/admin/gmail/inbox/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: composeMode === 'reply' ? 'reply' : 'send',
          to: p.to, cc: p.cc, bcc: p.bcc, subject: p.subject, html: p.html,
          attachments: p.attachments,
          threadId: composeMode === 'reply' ? selected?.thread_id : undefined,
          // ⚠️ התיבה הפעילה קובעת מי השולח. בתשובה — התיבה שאליה הגיעה
          // ההודעה, אחרת המשפחה מקבלת תשובה מכתובת שלא כתבה אליה.
          accountId: composeMode === 'reply' ? (selected?.account_id ?? undefined) : (composeFrom || account || undefined),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'השליחה נכשלה'); return false }
      setError(null)
      await load(true)
      return true
    } catch { setError('שגיאת רשת'); return false }
  }

  // 🔴 ברירת מחדל: תיבת המשרד, ולא "כל התיבות".
  //
  // ⚠️ "כל התיבות" ערבב דואר מכל האגפים למסך אחד, ואי אפשר היה לדעת
  // באיזו תיבה מדובר בלי לפתוח כל הודעה. רוב העבודה היא בתיבת המשרד,
  // ולכן היא נפתחת ראשונה. "כל התיבות" נשאר זמין בבורר.
  //
  // ⚠️ נבחר פעם אחת בלבד (didPickDefault) — אחרת בחירה ידנית ב"כל
  // התיבות" הייתה נדרסת בכל טעינה מחדש.
  // 🔴 המונה חייב לכבד את התיבה הנבחרת.
  //
  // ⚠️ קודם נסכמו *כל* המחלקות תמיד: המסך הציג "735 לא נקראו" גם כשהיה
  // מסונן לתיבת המשרד בלבד, כלומר מספר ששייך לתיבה אחרת. כשנבחרה תיבה,
  // המונה נלקח מ-unreadByAccount שלה.
  const totalUnread = account
    ? (unreadByAccount[account] ?? 0)
    : Object.values(unreadByDept).reduce((a, b) => a + b, 0)
  const activeAccount = accounts.find(a => a.id === account) ?? null
  const isFollowup = (m: Message) => (m.labels ?? []).includes(FOLLOWUP)
  /** STARRED היא תווית מערכת של Gmail — נשמרת באינדקס כמו כל תווית. */
  const isStarred = (m: Message) => (m.labels ?? []).includes('STARRED')

  const navBtn = (active: boolean) =>
    `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-bold transition-colors text-right ${
      active ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`

  return (
    <div className="flex flex-col gap-4">
      {/* כותרת */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {/* 🔴 שם התיבה הפעילה — לא "תיבת Gmail" גנרי. כשמחוברות כמה
              תיבות, בלי השם אי אפשר לדעת באיזו צופים ומאיזו תישלח תשובה. */}
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Mail size={20} className="text-indigo-600" />
            <span dir="ltr" className="truncate">{activeAccount?.email ?? 'כל התיבות'}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeAccount ? (deptLabel(activeAccount.department) ?? 'תיבת דואר') : `${accounts.length} תיבות`}
            {' · '}{total.toLocaleString('he-IL')} הודעות
            {totalUnread > 0 && <> · <strong className="text-indigo-600">{totalUnread}</strong> לא נקראו</>}
          </p>
        </div>
        <div className="flex items-center gap-2">

          {/* ⚠️ "אימייל חדש" עבר לראש הסרגל הצדדי (מעל "דואר נכנס"), כמו
              בג'ימייל. הוסר מכאן כדי לא להופיע פעמיים. */}
          <button onClick={() => { setPage(0); void load() }} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} רענן
          </button>
          <Link href="/admin/mail/index-sync"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300">
            <Settings size={14} /> סנכרון
          </Link>
          {/* ── בורר התיבות, בפינה כמו בגמייל ── */}
          {accounts.length > 0 && (
            <div className="relative">
              <button onClick={() => setAccountMenu(o => !o)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-indigo-300">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white"
                  style={{ backgroundColor: deptColor(activeAccount?.department) }}>
                  {(activeAccount?.email ?? 'A').slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:inline max-w-40 truncate" dir="ltr">
                  {activeAccount?.email ?? 'כל התיבות'}
                </span>
                <ChevronDown size={13} className="text-slate-400" />
              </button>

              {accountMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setAccountMenu(false)} />
                  <div className="absolute left-0 mt-1.5 z-40 w-72 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                    <button onClick={() => { setAccount(''); setAccountMenu(false); setPage(0); setSelected(null) }}
                      className={`w-full text-right px-3 py-2.5 hover:bg-slate-50 border-b border-slate-100 ${!account ? 'bg-indigo-50' : ''}`}>
                      <p className="text-xs font-bold text-slate-800">כל התיבות</p>
                      <p className="text-[11px] text-slate-400">{accounts.length} תיבות מחוברות</p>
                    </button>
                    {accounts.map(a => {
                      const n = unreadByAccount[a.id] ?? 0
                      return (
                        <button key={a.id}
                          onClick={() => { setAccount(a.id); setAccountMenu(false); setPage(0); setSelected(null) }}
                          className={`w-full text-right px-3 py-2.5 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex items-center gap-2.5 ${account === a.id ? 'bg-indigo-50' : ''}`}>
                          <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold text-white flex-shrink-0"
                            style={{ backgroundColor: deptColor(a.department) }}>
                            {a.email.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <p dir="ltr" className="text-xs font-bold text-slate-800 truncate text-right">{a.email}</p>
                            <p className="text-[11px] text-slate-400">{deptLabel(a.department) ?? a.label ?? '—'}</p>
                          </span>
                          {n > 0 && <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded-full px-1.5">{n}</span>}
                        </button>
                      )
                    })}
                    <Link href="/admin/settings/connect-mailbox"
                      className="block px-3 py-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 border-t border-slate-100">
                      + חבר תיבה נוספת
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}
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
          {/* 🔴 "אימייל חדש" בראש הסרגל, מעל "דואר נכנס" — כמו בג'ימייל.
              זו הפעולה שמתחילים ממנה, ומקומה לפני רשימת התיקיות ולא
              מוסתר בין כפתורי הכותרת. */}
          <button onClick={startNew}
            className="w-full mb-2 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-[13px] font-extrabold text-white shadow-sm hover:bg-indigo-700 transition-colors">
            <PenSquare size={15} /> אימייל חדש
          </button>
          <nav className="space-y-0.5">
            {([
              // ⚠️ "דואר נכנס" ו"לא נקראו" הציגו את *אותו* מספר בדיוק
              // (735 / 735), כי שניהם נגזרו מ-totalUnread. בג'ימייל המונה
              // ליד "דואר נכנס" הוא הלא-נקראו שבתיקייה, ו"לא נקראו" היא
              // תיקייה נפרדת — אבל שני מספרים זהים זה לצד זה נראים כתקלה
              // ואינם מוסיפים מידע. עכשיו רק "לא נקראו" נושא מונה.
              { key: 'inbox', label: 'דואר נכנס', icon: Inbox, badge: 0 },
              { key: 'unread', label: 'לא נקראו', icon: MailOpen, badge: totalUnread },
              { key: 'starred', label: 'מסומן בכוכב', icon: Star, badge: 0 },
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
                  <button key={l.id}
                    onClick={() => { setActiveLabel(l.id === activeLabel ? '' : l.id); setPage(0); setSelected(null) }}
                    className={navBtn(activeLabel === l.id)}
                    title={l.name}>
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
            {/* ⚠️ בורר "כל המחלקות" הוסר. הוא היה כפילות של בורר התיבות
                שבכותרת — כל תיבה שייכת ממילא למחלקה — והציג רשימה ארוכה
                של 12 מחלקות (כולל "תיבה 8/9/10" ריקות) מעל כל מסך.
                הסינון לפי מחלקה נעשה בבחירת התיבה. */}
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
              {/* ── סרגל פעולות קבוצתי — מופיע רק כשיש בחירה, כמו בג'ימייל ── */}
              {picked.size > 0 && (
                <div className="flex items-center gap-1 border-b border-slate-100 bg-indigo-50/60 px-3 py-2">
                  <span className="text-[11px] font-extrabold text-indigo-800">
                    {picked.size} נבחרו
                  </span>
                  <span className="w-px h-4 bg-indigo-200 mx-1" />
                  {([
                    { icon: MailOpen, label: 'סימון כנקרא', action: 'mark-read' },
                    { icon: Mail, label: 'סימון כלא נקרא', action: 'mark-unread' },
                    { icon: Star, label: 'סימון בכוכב', action: 'star' },
                    { icon: Flag, label: FOLLOWUP, action: 'followup' },
                    { icon: Archive, label: 'לארכיון', action: 'archive' },
                  ] as const).map(b => (
                    <button key={b.action} type="button" disabled={acting} title={b.label}
                      onClick={() => void actOnPicked(b.action)}
                      className="p-1.5 rounded-lg text-slate-600 hover:bg-white hover:text-indigo-700 disabled:opacity-50 transition-colors">
                      <b.icon size={14} />
                    </button>
                  ))}
                  <button type="button" disabled={acting} title="מחיקה"
                    onClick={() => void actOnPicked('trash')}
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-white disabled:opacity-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                  <button type="button" onClick={() => setPicked(new Set())}
                    className="mr-auto text-[11px] font-bold text-slate-500 hover:text-slate-800">
                    ביטול הבחירה
                  </button>
                </div>
              )}
              <div className="divide-y divide-slate-50 max-h-[68vh] overflow-y-auto">
                {messages.map(m => (
                  <button key={m.gmail_message_id} onClick={() => open(m)}
                    // קליק ימני — תפריט פעולות מהיר, כמו בג'ימייל
                    onContextMenu={e => {
                      e.preventDefault()
                      // ⚠️ מיקום מוגבל לגבולות החלון: תפריט שנפתח ליד הקצה
                      // התחתון/השמאלי היה נחתך ופריטיו לא היו נגישים.
                      const MW = 230, MH = 300
                      setCtxMenu({
                        x: Math.min(e.clientX, window.innerWidth - MW),
                        y: Math.min(e.clientY, window.innerHeight - MH),
                        msg: m,
                      })
                    }}
                    className={`w-full text-right px-4 py-3 transition-colors ${
                      selected?.gmail_message_id === m.gmail_message_id ? 'bg-indigo-50' :
                      m.is_unread ? 'bg-indigo-50/30 hover:bg-indigo-50/60' : 'hover:bg-slate-50'
                    }`}>
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <span className="flex items-center gap-1.5 min-w-0">
                        {/* תיבת סימון — ⚠️ span ולא input: השורה כולה היא
                            <button>, ו-input אינטראקטיבי בתוכו נלחץ יחד
                            איתה. stopPropagation מונע פתיחת ההודעה. */}
                        <span role="checkbox" aria-checked={picked.has(m.gmail_message_id)} tabIndex={-1}
                          onClick={e => {
                            e.stopPropagation()
                            setPicked(prev => {
                              const next = new Set(prev)
                              if (next.has(m.gmail_message_id)) next.delete(m.gmail_message_id)
                              else next.add(m.gmail_message_id)
                              return next
                            })
                          }}
                          className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors ${
                            picked.has(m.gmail_message_id)
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-slate-300 hover:border-indigo-400'
                          }`}>
                          {picked.has(m.gmail_message_id) && <Check size={11} strokeWidth={3} />}
                        </span>
                        {/* כוכב — ⚠️ span ולא button: השורה כולה היא <button>,
                            וכפתור מקונן אינו חוקי ב-HTML. stopPropagation
                            מונע פתיחת ההודעה בלחיצה על הכוכב. */}
                        <span role="button" tabIndex={-1} title={isStarred(m) ? 'ביטול סימון' : 'סימון בכוכב'}
                          onClick={e => { e.stopPropagation(); void actOn(m, isStarred(m) ? 'unstar' : 'star') }}
                          className="flex-shrink-0 cursor-pointer">
                          <Star size={12}
                            className={isStarred(m) ? 'text-amber-400 fill-amber-400' : 'text-slate-300 hover:text-amber-400'} />
                        </span>
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
                <h2 className="font-extrabold text-slate-900 leading-snug break-words">{selected.subject || '(ללא נושא)'}</h2>
                <div className="mt-2.5 flex items-center gap-2 flex-wrap text-xs">
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <User size={12} className="text-slate-400" />
                    <strong>{selected.from_name || selected.from_email}</strong>
                  </span>
                  {selected.from_name && selected.from_email && (
                    <span dir="ltr" className="text-slate-400 break-all">{selected.from_email}</span>
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
                  <p dir="ltr" className="text-[11px] text-slate-400 mt-1 text-right break-all">
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
        <ComposeDialog
          mode={composeMode}
          initialTo={cTo}
          initialSubject={cSubject}
          accountEmail={(composeMode === 'reply'
            ? accounts.find(a => a.id === selected?.account_id)?.email
            : accounts.find(a => a.id === composeFrom)?.email ?? activeAccount?.email) ?? null}
          accounts={accounts.map(a => ({ id: a.id, email: a.email }))}
          fromId={composeFrom}
          onFromChange={setComposeFrom}
          onClose={() => setComposeOpen(false)}
          onSent={sendMail}
        />
      )}

      {/* ── תפריט קליק-ימני על הודעה (כמו בג'ימייל) ── */}
      {ctxMenu && (
        <MessageContextMenu
          x={ctxMenu.x} y={ctxMenu.y} msg={ctxMenu.msg} busy={acting}
          onClose={() => setCtxMenu(null)}
          onOpen={m => { void open(m); startReplyTo(m) }}
          onAct={(m, a) => void actOn(m, a)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// תפריט קליק-ימני על שורת הודעה — כמו בג'ימייל.
//
// ⚠️ רכיב נפרד ולא IIFE בתוך הרינדור: React אוסר גישה ל-ref בזמן רינדור,
// ופונקציה אנונימית שנקראת שם נחשבת חלק ממנו.
// ─────────────────────────────────────────────────────────────────────────────
function MessageContextMenu({ x, y, msg, busy, onClose, onOpen, onAct }: {
  x: number; y: number; msg: Message; busy: boolean
  onClose: () => void
  onOpen: (m: Message) => void
  onAct: (m: Message, action: string) => void
}) {
  const isFu = (msg.labels ?? []).includes(FOLLOWUP)
  const isStar = (msg.labels ?? []).includes('STARRED')
  const items = [
    { icon: Reply, label: 'תשובה', run: () => onOpen(msg) },
    {
      icon: msg.is_unread ? MailOpen : Mail,
      label: msg.is_unread ? 'סימון כנקרא' : 'סימון כלא נקרא',
      run: () => onAct(msg, msg.is_unread ? 'mark-read' : 'mark-unread'),
    },
    { icon: Star, label: isStar ? 'ביטול סימון בכוכב' : 'סימון בכוכב', run: () => onAct(msg, isStar ? 'unstar' : 'star') },
    { icon: Flag, label: isFu ? 'הסרה מטיפול' : FOLLOWUP, run: () => onAct(msg, isFu ? 'unfollowup' : 'followup') },
    { icon: Archive, label: 'לארכיון', run: () => onAct(msg, 'archive'), sep: true },
    { icon: Trash2, label: 'מחיקה', run: () => onAct(msg, 'trash'), danger: true },
  ]

  return (
    <div
      className="fixed z-[90] w-[230px] rounded-xl border border-slate-200 bg-white py-1.5 shadow-2xl"
      style={{ top: y, left: x }}
      // ⚠️ עוצר את ההתפשטות: בלי זה מאזין ה-click שסוגר את התפריט היה
      // סוגר אותו לפני שהפריט שנלחץ הספיק לפעול.
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      {items.map((it, i) => (
        <div key={i}>
          {it.sep && <div className="my-1 border-t border-slate-100" />}
          <button type="button" disabled={busy}
            onClick={() => { it.run(); onClose() }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-right text-[13px] font-semibold transition-colors disabled:opacity-50 ${
              it.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100'
            }`}>
            <it.icon size={14} className="flex-shrink-0" />
            <span className="flex-1">{it.label}</span>
          </button>
        </div>
      ))}
    </div>
  )
}
