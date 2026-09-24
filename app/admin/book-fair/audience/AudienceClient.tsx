'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, Loader2, Trash2, Send, Mail, Users, History } from 'lucide-react'
import type { AudienceMember, AudienceSource } from '@/lib/bookFairAudience'
import { AUDIENCE_SOURCE_LABELS } from '@/lib/bookFairAudience'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { useTablePagination } from '@/lib/useTablePagination'
import Pagination from '@/components/ui/Pagination'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCan } from '@/components/StaffPermissions'

type ColKey = 'email' | 'name' | 'source' | 'orders' | 'spent' | 'since'

const HEAD = 'px-3 py-3 text-xs font-semibold text-slate-500'

// 🔴 value() חובה בכל עמודה שמרנדרת JSX — בלעדיה המיון עובד על אובייקט
// React ומחזיר סדר אקראי שנראה בדיוק כמו מיון תקין.
const COLUMNS: ColDef<ColKey, AudienceMember>[] = [
  { key: 'email',  label: 'כתובת מייל', def: true, headClassName: HEAD, weight: 3, value: m => m.email },
  { key: 'name',   label: 'שם',        def: true, headClassName: HEAD, weight: 2, value: m => m.name ?? null },
  { key: 'source', label: 'מקור',      def: true, kind: 'enum', filterable: true, headClassName: HEAD,
    value: m => AUDIENCE_SOURCE_LABELS[m.source] },
  { key: 'orders', label: 'הזמנות',    def: true, kind: 'number', headClassName: HEAD, value: m => m.orders },
  { key: 'spent',  label: 'סה"כ רכישות', def: true, kind: 'number', headClassName: HEAD, value: m => m.spentAgorot },
  { key: 'since',  label: 'מאז',       def: true, kind: 'date', headClassName: HEAD, value: m => m.since },
]

type NewsletterHistoryItem = {
  id: string
  subject: string
  status: string
  audience: string
  total: number
  sent_count: number
  failed_count: number
  created_at: string
  sent_at: string | null
}

const AUDIENCE_OPTIONS: { key: 'all' | AudienceSource; label: string }[] = [
  { key: 'all', label: 'כולם' },
  { key: 'reminder', label: 'נרשמי תזכורת בלבד' },
  { key: 'customer', label: 'רוכשים בלבד' },
]

export default function AudienceClient({ members, optedOut }: {
  members: AudienceMember[]
  optedOut: number
}) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'list' | 'send' | 'history'>('list')
  const { confirm, confirmDialog } = useConfirm()
  const canEdit = useCan('book_fair', 'edit')

  // ⚠️ מזוהה בנפרד מ-members: אחרי הסרה מוצלחת הכתובת מוסתרת מיד מהמסך
  // בלי לחכות לרענון מהשרת, אבל בלי לשכפל state של הרשימה כולה.
  const [removed, setRemoved] = useState<Set<string>>(() => new Set())
  const liveMembers = useMemo(
    () => removed.size ? members.filter(m => !removed.has(m.email)) : members,
    [members, removed]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return liveMembers
    return liveMembers.filter(m =>
      m.email.toLowerCase().includes(q) || (m.name ?? '').toLowerCase().includes(q)
    )
  }, [liveMembers, query])

  const tc = useTableColumns<ColKey, AudienceMember>('book_fair_audience', COLUMNS, {
    sortFilter: { mode: 'client', rows: filtered },
  })
  const pg = useTablePagination(tc.rows)

  const [busyEmail, setBusyEmail] = useState<string | null>(null)

  const removeMember = useCallback(async (email: string) => {
    const ok = await confirm({
      title: 'הסרה מרשימת התפוצה',
      message: `להסיר את ${email} מרשימת התפוצה? הכתובת לא תקבל דיוורים נוספים.`,
      confirmLabel: 'הסרה', danger: true,
    })
    if (!ok) return
    setBusyEmail(email)
    try {
      const res = await fetch('/api/admin/book-fair/audience', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) setRemoved(rs => new Set(rs).add(email))
    } finally {
      setBusyEmail(null)
    }
  }, [confirm])

  return (
    <div className="flex flex-col gap-4">
      {confirmDialog}

      {/* ── כרטיסי סיכום ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-xl border-2 border-slate-200 bg-white p-3">
          <Users size={16} className="text-slate-500" />
          <span className="text-xl font-bold tabular-nums text-slate-900">{liveMembers.length}</span>
          <span className="text-xs leading-tight text-slate-500">ברשימת התפוצה</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border-2 border-slate-200 bg-white p-3">
          <Mail size={16} className="text-slate-500" />
          <span className="text-xl font-bold tabular-nums text-slate-900">
            {liveMembers.filter(m => m.source === 'customer' || m.source === 'both').length}
          </span>
          <span className="text-xs leading-tight text-slate-500">רוכשים</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border-2 border-slate-200 bg-white p-3">
          <Trash2 size={16} className="text-slate-500" />
          <span className="text-xl font-bold tabular-nums text-slate-900">{optedOut}</span>
          <span className="text-xs leading-tight text-slate-500">הסירו את עצמם</span>
        </div>
      </div>

      {/* ── לשוניות ── */}
      <div className="flex gap-2 border-b border-slate-200">
        {[
          { key: 'list' as const, label: 'רשימת תפוצה', icon: Users },
          { key: 'send' as const, label: 'שליחת ניוזלטר', icon: Send },
          { key: 'history' as const, label: 'היסטוריית דיוורים', icon: History },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <>
          <div className="relative max-w-md">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="חיפוש לפי מייל או שם…"
              className="w-full rounded-xl border border-slate-200 py-2 pr-9 pl-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
            {tc.picker}
            {tc.activeFilters}
          </div>

          {/* ⚠️ בלי overflow-x: הגלילה לרוחב אסורה ונאכפת בלינט */}
          <div className="rounded-2xl border border-slate-200 bg-white">
            <table className="w-full table-fixed">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {tc.shown.map((c, i) => tc.th(c, i))}
                  <th className={HEAD}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pg.rows.map(m => (
                  <tr key={m.email} className="text-sm transition hover:bg-slate-50">
                    {tc.shown.map(col => (
                      <td key={col.key} className={`px-3 py-2.5 ${tc.cellClass(col)}`}>
                        {renderCell(col.key, m)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-left">
                      {canEdit && (
                        <button
                          onClick={() => removeMember(m.email)}
                          disabled={busyEmail === m.email}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                          title="הסרה מהרשימה"
                        >
                          {busyEmail === m.email ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!pg.rows.length && (
                  <tr>
                    <td colSpan={tc.shown.length + 1} className="px-4 py-12 text-center text-sm text-slate-400">
                      {members.length ? 'אין תוצאות בסינון זה' : 'רשימת התפוצה ריקה'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <Pagination page={pg.page} size={pg.size} total={pg.total} onPage={pg.setPage} onSize={pg.setSize} />
          </div>
        </>
      )}

      {tab === 'send' && <SendNewsletter canEdit={canEdit} members={liveMembers} />}
      {tab === 'history' && <NewsletterHistory />}
    </div>
  )
}

function renderCell(key: ColKey, m: AudienceMember) {
  switch (key) {
    case 'email':
      return <span className="truncate font-mono text-xs" dir="ltr">{m.email}</span>
    case 'name':
      return <span className="truncate">{m.name || '—'}</span>
    case 'source':
      return (
        <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${
          m.source === 'both' ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
            : m.source === 'customer' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}>
          {AUDIENCE_SOURCE_LABELS[m.source]}
        </span>
      )
    case 'orders':
      return <span className="tabular-nums">{m.orders}</span>
    case 'spent':
      return <span className="tabular-nums">{m.spentAgorot > 0 ? fmtAgorot(m.spentAgorot) : '—'}</span>
    case 'since':
      return <span className="whitespace-nowrap text-xs text-slate-500">{new Date(m.since).toLocaleDateString('he-IL')}</span>
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * שליחת ניוזלטר — הפעולה הכי מסוכנת במחלקה: לחיצה אחת שולחת לאלפי נמענים.
 *
 * ⚠️ שליחת מבחן חובה לפני שליחה אמיתית: המשתמש חייב לראות איך המייל
 * נראה בפועל לפני שהוא יוצא לכולם.
 */
function SendNewsletter({ canEdit, members }: { canEdit: boolean; members: AudienceMember[] }) {
  const { confirm, confirmDialog } = useConfirm()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<'all' | AudienceSource>('all')
  const [testTo, setTestTo] = useState('')
  const [busy, setBusy] = useState<'test' | 'send' | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ total: number; sent: number; failed: number } | null>(null)

  const recipientCount = useMemo(() => {
    if (audience === 'all') return members.length
    if (audience === 'reminder') return members.filter(m => m.source === 'reminder' || m.source === 'both').length
    return members.filter(m => m.source === 'customer' || m.source === 'both').length
  }, [members, audience])

  const sendTest = async () => {
    if (!testTo.trim()) return
    setBusy('test'); setError('')
    try {
      const res = await fetch('/api/admin/book-fair/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, audience, test: testTo.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setError(json.error ?? 'שליחת המבחן נכשלה')
    } catch {
      setError('שליחת המבחן נכשלה — בדקו את החיבור')
    } finally {
      setBusy(null)
    }
  }

  const send = async () => {
    const ok = await confirm({
      title: 'שליחת ניוזלטר',
      message: `הפעולה תשלח מייל ל-${recipientCount} נמענים ולא ניתן לבטל אותה אחרי השליחה. להמשיך?`,
      confirmLabel: 'שליחה', danger: true,
    })
    if (!ok) return
    setBusy('send'); setError(''); setResult(null)
    try {
      const res = await fetch('/api/admin/book-fair/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, audience }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'שליחת הדיוור נכשלה'); return }
      setResult({ total: json.total, sent: json.sent, failed: json.failed })
      setSubject(''); setMessage('')
    } catch {
      setError('שליחת הדיוור נכשלה — בדקו את החיבור')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      {confirmDialog}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-600">נושא ההודעה</span>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          disabled={!canEdit}
          maxLength={200}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-600">תוכן ההודעה</span>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          disabled={!canEdit}
          rows={8}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 resize-none"
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-600">קהל יעד</span>
        <div className="flex gap-2">
          {AUDIENCE_OPTIONS.map(o => (
            <button
              key={o.key}
              onClick={() => setAudience(o.key)}
              disabled={!canEdit}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                audience === o.key ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">{recipientCount} נמענים בקהל שנבחר</span>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <label className="flex flex-1 min-w-[220px] flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">שליחת מבחן לכתובת</span>
          <input
            value={testTo}
            onChange={e => setTestTo(e.target.value)}
            dir="ltr"
            placeholder="you@example.com"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
          />
        </label>
        <button
          onClick={sendTest}
          disabled={!canEdit || !!busy || !subject.trim() || !message.trim() || !testTo.trim()}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
        >
          {busy === 'test' ? <Loader2 size={15} className="animate-spin" /> : 'שליחת מבחן'}
        </button>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {result && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          נשלח ל-{result.sent} מתוך {result.total} נמענים{result.failed ? `, ${result.failed} נכשלו` : ''}.
        </p>
      )}

      {canEdit && (
        <button
          onClick={send}
          disabled={!!busy || !subject.trim() || !message.trim() || !recipientCount}
          className="self-start rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy === 'send' ? <Loader2 size={15} className="animate-spin" /> : `שליחה ל-${recipientCount} נמענים`}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = { sending: 'בשליחה', sent: 'נשלח', failed: 'נכשל' }

function NewsletterHistory() {
  const [items, setItems] = useState<NewsletterHistoryItem[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/admin/book-fair/newsletter')
      .then(res => res.json())
      .then(json => { if (alive) setItems(json.newsletters ?? []) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [])

  if (items === null) {
    return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
  }

  if (!items.length) {
    return <p className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">טרם נשלחו דיוורים</p>
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <table className="w-full table-fixed">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className={HEAD}>נושא</th>
            <th className={HEAD}>קהל</th>
            <th className={HEAD}>סטטוס</th>
            <th className={HEAD}>נמענים</th>
            <th className={HEAD}>נשלחו בהצלחה</th>
            <th className={HEAD}>תאריך</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map(n => (
            <tr key={n.id} className="text-sm">
              <td className="truncate px-3 py-2.5">{n.subject}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500">
                {n.audience === 'all' ? 'כולם' : n.audience === 'reminder' ? 'נרשמי תזכורת' : 'רוכשים'}
              </td>
              <td className="px-3 py-2.5">
                <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${
                  n.status === 'sent' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : n.status === 'failed' ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}>
                  {STATUS_LABELS[n.status] ?? n.status}
                </span>
              </td>
              <td className="px-3 py-2.5 tabular-nums">{n.total}</td>
              <td className="px-3 py-2.5 tabular-nums">
                {n.sent_count}{n.failed_count ? <span className="text-red-600"> ({n.failed_count} נכשלו)</span> : ''}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                {new Date(n.sent_at ?? n.created_at).toLocaleDateString('he-IL')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
