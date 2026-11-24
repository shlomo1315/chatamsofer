'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { ArrowRight, Pause, Play, Loader2, Send, RefreshCw, MessageSquare, Check, Download, Search, Info } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useToast } from '@/components/ui/Toast'
import type { CampaignReport, RecipientReport, Breakdown } from '@/lib/newsletter/report'
import type { CampaignHead } from '@/lib/newsletter/reportData'
import type { Campaign } from './CampaignWizard'

interface Reply {
  id: string; from: string; email: string
  subject: string | null; text: string; at: string
}

type Stats = CampaignReport & { campaign: CampaignHead; replies: Reply[] }

interface CompareRow {
  id: string; name: string; at: string | null; sent: number; opened: number; clicked: number
  bounced: number; unsubscribed: number; openRate: number; clickRate: number; clickToOpen: number
}

const num = (n: number) => n.toLocaleString('he-IL')
const rate = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : 0)
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const TICK = { fontSize: 11, fill: '#64748b' }
const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const SERIES = [
  { key: 'sent', label: 'נשלחו', color: '#94a3b8' },
  { key: 'delivered', label: 'נמסרו', color: '#2563eb' },
  { key: 'opened', label: 'פתחו', color: '#0891b2' },
  { key: 'clicked', label: 'הקליקו', color: '#14213D' },
  { key: 'bounced', label: 'חזרו', color: '#e11d48' },
] as const
const PAGE = 100

type Filter = 'all' | 'opened' | 'notOpened' | 'clicked' | 'bounced' | 'unsubscribed' | 'failed'
const FILTERS: { key: Filter; label: string; test: (r: RecipientReport) => boolean }[] = [
  { key: 'all', label: 'הכול', test: () => true },
  { key: 'opened', label: 'פתחו', test: r => !!r.firstOpen },
  { key: 'notOpened', label: 'לא פתחו', test: r => r.status === 'sent' && !r.firstOpen },
  { key: 'clicked', label: 'הקליקו', test: r => !!r.firstClick },
  { key: 'bounced', label: 'חזרו / ספאם', test: r => r.bounced || r.complained },
  { key: 'unsubscribed', label: 'הסירו', test: r => r.unsubscribed },
  { key: 'failed', label: 'נכשלו', test: r => r.status === 'failed' },
]

export default function CampaignStats({ campaign }: { campaign: Campaign }) {
  const toast = useToast()
  const [stats, setStats] = useState<Stats | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<'recipients' | 'links' | 'replies' | 'compare'>('recipients')
  const [compare, setCompare] = useState<CompareRow[] | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/stats`, { cache: 'no-store' })
      if (res.ok) setStats(await res.json())
    } catch { /* ignore */ }
  }, [campaign.id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // רענון אוטומטי: בשליחה כל 10 שניות, אחרי השליחה כל 30 שניות (רק כשהלשונית גלויה)
  useEffect(() => {
    const st = stats?.campaign.status
    if (st !== 'sending' && st !== 'sent') return
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, st === 'sending' ? 10_000 : 30_000)
    return () => clearInterval(t)
  }, [stats?.campaign.status, load])

  useEffect(() => {
    if (tab !== 'compare' || compare) return
    fetch('/api/admin/campaigns/compare', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { campaigns: [] }))
      .then(d => setCompare(d.campaigns ?? []))
      .catch(() => setCompare([]))
  }, [tab, compare])

  async function toggle(action: 'pause' | 'resume') {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success(action === 'pause' ? 'הקמפיין הושהה' : 'השליחה מתחדשת')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally { setBusy(false) }
  }

  if (!stats) {
    return <div className="p-10 text-center text-slate-400"><Loader2 className="inline animate-spin" /></div>
  }

  const m = stats.metrics
  const status = stats.campaign.status
  const sending = status === 'sending'
  const paused = status === 'paused'
  const fmtT = (t: string) => new Date(t).toLocaleString('he-IL', stats.bucket === 'day'
    ? { day: 'numeric', month: 'numeric' } : { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
  const engaged = m.opened + m.clicked > 0
  const openers = Math.max(m.opened, m.clicked)

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <Link href="/admin/newsletter"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowRight size={15} /> חזרה לקמפיינים
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-800">{campaign.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{campaign.subject}</p>
          {stats.campaign.started_at && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Send size={11} />
                נשלח: {new Date(stats.campaign.started_at).toLocaleString('he-IL', {
                  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </span>
              {stats.campaign.completed_at && (
                <span className="inline-flex items-center gap-1">
                  <Check size={11} />
                  הסתיים: {new Date(stats.campaign.completed_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <a href={`/api/admin/campaigns/${campaign.id}/export`}
             className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
            <Download size={15} /> ייצוא לאקסל
          </a>
          <button
            onClick={() => { setRefreshing(true); load().finally(() => setRefreshing(false)) }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5
                       text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            רענון נתונים
          </button>
          {(sending || paused) && (
            <button
              onClick={() => toggle(paused ? 'resume' : 'pause')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5
                         text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : paused ? <Play size={15} /> : <Pause size={15} />}
              {paused ? 'חידוש שליחה' : 'השהיה'}
            </button>
          )}
        </div>
      </div>

      {sending && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-amber-800">שליחה בתהליך…</span>
            <span className="text-amber-700">{num(m.sent)} / {num(m.total)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-amber-100">
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${rate(m.sent, m.total)}%` }} />
          </div>
        </div>
      )}

      {/* מדדים: ייחודיים, סך הכול ואחוז */}
      <dl className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="נשלחו" value={m.sent} sub={m.pending ? `${num(m.pending)} ממתינים` : `מתוך ${num(m.total)} נמענים`} />
        <Metric label="נמסרו לתיבה" value={m.delivered} sub={`${m.deliveryRate}% מהנשלחו`} />
        <Metric label="פתחו" value={m.opened} sub={`${m.openRate}% · ${num(m.openTotal)} פתיחות בסך הכול`} tone="cyan" />
        <Metric label="הקליקו" value={m.clicked} sub={`${m.clickRate}% · ${num(m.clickTotal)} קליקים בסך הכול`} tone="navy" />
      </dl>
      <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="הקליקו מתוך הפותחים" value={`${m.clickToOpen}%`} sub={`${num(m.clicked)} מתוך ${num(openers)}`} />
        <Metric label="הסירו את עצמם" value={m.unsubscribed} sub={`${rate(m.unsubscribed, m.sent)}%`} tone={m.unsubscribed ? 'rose' : undefined} />
        <Metric label="חזרו / ספאם" value={`${num(m.bounced)} / ${num(m.complained)}`} sub={`${rate(m.bounced, m.sent)}% חזרו`} tone={m.bounced + m.complained ? 'rose' : undefined} />
        <Metric label="נכשלו בשליחה" value={m.failed} sub={`${rate(m.failed, m.total)}%`} tone={m.failed ? 'rose' : undefined} />
      </dl>

      {(m.machineOpens > 0 || m.machineClicks > 0) && (
        <Note>
          סוננו {num(m.machineOpens)} פתיחות אוטומטיות (Apple Mail Privacy וסורקי אבטחה) ו-{num(m.machineClicks)} קליקים של סורקים.
          הם לא נספרים במספרים שלמעלה, כי לא אדם פתח אותם.
        </Note>
      )}
      {engaged && (
        <Note>
          פתיחה נספרת כשהמייל טוען את תמונת המעקב. מי שחוסם תמונות לא ייספר כפותח עד שילחץ על קישור, ולכן אחוז הפתיחה בפועל גבוה מעט מהמוצג. הקליקים מדויקים.
        </Note>
      )}

      {/* גרפים */}
      <section className="mb-5 grid gap-4 lg:grid-cols-2">
        <Panel title={`מצטבר לאורך זמן (${stats.bucket === 'day' ? 'לפי יום' : 'לפי שעה'})`}>
          {stats.timeline.length ? (
            <div dir="ltr" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.timeline} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="t" tickFormatter={fmtT} tick={TICK} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tick={TICK} tickFormatter={num} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip labelFormatter={l => fmtT(String(l))} formatter={(v: unknown, n: unknown) => [num(Number(v)), String(n)]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {SERIES.map(s => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty>הגרף יתמלא כשהמיילים יתחילו לצאת.</Empty>}
        </Panel>
        <Panel title="מתי פתחו והקליקו: לפי שעה ביממה (שעון ישראל)">
          {engaged ? (
            <div dir="ltr" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byHour} margin={{ top: 6, right: 8, bottom: 0, left: -12 }} barCategoryGap="15%">
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="hour" tickFormatter={h => `${String(h).padStart(2, '0')}:00`} tick={TICK} axisLine={false} tickLine={false} interval={2} />
                  <YAxis tick={TICK} tickFormatter={num} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} labelFormatter={h => `${String(h).padStart(2, '0')}:00`} formatter={(v: unknown, n: unknown) => [num(Number(v)), String(n)]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="opened" name="פתחו" fill="#0891b2" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="clicked" name="הקליקו" fill="#14213D" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty>עוד אין פתיחות.</Empty>}
        </Panel>
      </section>

      {engaged && (
        <section className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Panel title="לפי יום בשבוע">
            <ul className="space-y-2">
              {stats.byWeekday.map(d => {
                const max = Math.max(1, ...stats.byWeekday.map(x => x.opened))
                return (
                  <li key={d.day} className="grid grid-cols-[3.5rem_1fr_5.5rem] items-center gap-2 text-sm">
                    <span className="text-slate-600">{WEEKDAYS[d.day]}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#0891b2]" style={{ width: `${(d.opened / max) * 100}%` }} /></span>
                    <span className="text-left tabular-nums text-slate-700">{num(d.opened)} / {num(d.clicked)}</span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-xs text-slate-500">פתחו / הקליקו, לפי הפתיחה הראשונה של כל נמען</p>
          </Panel>
          <Panel title="איך פתחו: מכשיר, תוכנת מייל ומערכת הפעלה">
            {stats.withDeviceInfo ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Bars title="מכשיר" list={stats.devices} />
                <Bars title="תוכנת מייל" list={stats.clients} />
                <Bars title="מערכת הפעלה" list={stats.os} />
              </div>
            ) : <Empty>אין נתוני מכשיר לקמפיין הזה. הם נאספים רק בקמפיינים שנשלחו אחרי עדכון המעקב.</Empty>}
            {stats.withDeviceInfo > 0 && stats.withDeviceInfo < openers && (
              <p className="mt-2 text-xs text-slate-500">יש נתוני מכשיר ל-{num(stats.withDeviceInfo)} מתוך {num(openers)} הפותחים. השאר מופיעים כ&quot;לא ידוע&quot; (למשל Gmail, שטוען תמונות דרך שרת משלו).</p>
            )}
          </Panel>
        </section>
      )}

      {/* טאבים */}
      <div className="mb-3 flex flex-wrap gap-2" role="tablist">
        {([
          ['recipients', `נמענים (${num(stats.recipients.length)})`],
          ['links', `קישורים (${stats.links.length})`],
          ['replies', `תגובות (${stats.replies?.length ?? 0})`],
          ['compare', 'השוואה לקמפיינים קודמים'],
        ] as const).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              tab === t ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'recipients' ? <Recipients rows={stats.recipients} />
        : tab === 'links' ? <Links stats={stats} />
        : tab === 'replies' ? <Replies replies={stats.replies ?? []} />
        : <Compare rows={compare} current={campaign.id} />}
    </div>
  )
}

function Recipients({ rows }: { rows: RecipientReport[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const list = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter)!.test
    const s = q.trim().toLowerCase()
    return rows.filter(r => f(r) && (!s || r.email.toLowerCase().includes(s) || r.name.toLowerCase().includes(s)))
      .sort((a, b) => (b.firstOpen ?? '').localeCompare(a.firstOpen ?? ''))
  }, [rows, filter, q])
  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const cur = Math.min(page, pages - 1)

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <label className="relative min-w-48 flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={q} onChange={e => { setQ(e.target.value); setPage(0) }} placeholder="חיפוש לפי שם או מייל"
                 aria-label="חיפוש נמען" className="w-full rounded-lg border border-slate-200 py-2 pl-3 pr-8 text-sm" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => {
            const n = rows.filter(f.test).length
            return (
              <button key={f.key} onClick={() => { setFilter(f.key); setPage(0) }}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f.key ? 'bg-[#0891b2] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {f.label} ({num(n)})
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr className="text-right text-xs text-slate-500">
              <th className="px-4 py-3 font-semibold">נמען</th>
              <th className="px-4 py-3 font-semibold">סטטוס</th>
              <th className="hidden px-4 py-3 font-semibold sm:table-cell">פתיחה ראשונה</th>
              <th className="px-4 py-3 font-semibold">פתיחות</th>
              <th className="px-4 py-3 font-semibold">קליקים</th>
              <th className="hidden px-4 py-3 font-semibold lg:table-cell">קישורים שנלחצו</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">מכשיר</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.slice(cur * PAGE, (cur + 1) * PAGE).map(r => (
              <tr key={r.id} className="align-top hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-800">{r.name || '—'}</div>
                  <div className="break-all font-mono text-xs text-slate-500">{r.email}</div>
                  <div className="text-xs text-slate-500 sm:hidden">{r.firstOpen ? `נפתח ${when(r.firstOpen)}` : ''}</div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {r.bounced ? <Tag color="rose">חזר</Tag>
                      : r.status === 'sent' ? <Tag color="emerald">נשלח</Tag>
                      : r.status === 'failed' ? <Tag color="rose">שגיאה</Tag>
                      : <Tag color="slate">ממתין</Tag>}
                    {r.complained && <Tag color="rose">ספאם</Tag>}
                    {r.unsubscribed && <Tag color="amber">הסיר</Tag>}
                  </div>
                  {r.error && <div className="mt-1 text-xs text-rose-600">{r.error}</div>}
                </td>
                <td className="hidden whitespace-nowrap px-4 py-2.5 text-slate-600 sm:table-cell">{when(r.firstOpen)}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.openCount ? <b className="text-[#0891b2]">{r.openCount}</b> : '—'}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.clickCount ? <b className="text-navy">{r.clickCount}</b> : '—'}</td>
                <td className="hidden max-w-xs px-4 py-2.5 lg:table-cell">
                  {r.links.length ? r.links.map(u => <div key={u} className="truncate font-mono text-xs text-slate-600" title={u}>{u}</div>) : <span className="text-slate-400">—</span>}
                </td>
                <td className="hidden px-4 py-2.5 text-xs text-slate-600 md:table-cell">{r.device ? [r.device, r.client, r.os].filter(x => x && x !== 'לא ידוע').join(' · ') || 'לא ידוע' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="p-8 text-center text-sm text-slate-500">אין נמענים שמתאימים לסינון</p>}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-600">
          <span>{num(cur * PAGE + 1)}–{num(Math.min(list.length, (cur + 1) * PAGE))} מתוך {num(list.length)}</span>
          <div className="flex gap-1">
            <button disabled={cur === 0} onClick={() => setPage(cur - 1)} className="rounded-lg px-3 py-1.5 hover:bg-slate-100 disabled:opacity-40">הקודם</button>
            <button disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="rounded-lg px-3 py-1.5 hover:bg-slate-100 disabled:opacity-40">הבא</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Links({ stats }: { stats: Stats }) {
  if (!stats.links.length) return <div className="rounded-2xl border border-slate-200 bg-white"><Empty>עדיין לא נלחצו קישורים</Empty></div>
  const max = Math.max(...stats.links.map(l => l.unique), 1)
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full table-fixed text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-right text-xs text-slate-500">
            <th className="w-1/2 px-4 py-3 font-semibold">קישור</th>
            <th className="px-4 py-3 font-semibold">הקליקו</th>
            <th className="hidden px-4 py-3 font-semibold sm:table-cell">קליקים בסך הכול</th>
            <th className="px-4 py-3 font-semibold">מהנשלחו</th>
            <th className="hidden px-4 py-3 font-semibold md:table-cell">קליקים של סורקים</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {stats.links.map(l => (
            <tr key={l.url} className="hover:bg-slate-50">
              <td className="min-w-0 px-4 py-2.5">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="block truncate font-mono text-xs text-slate-700 hover:underline" title={l.url}>{l.url}</a>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-navy" style={{ width: `${(l.unique / max) * 100}%` }} /></div>
              </td>
              <td className="px-4 py-2.5 font-bold tabular-nums text-navy">{num(l.unique)}</td>
              <td className="hidden px-4 py-2.5 tabular-nums text-slate-700 sm:table-cell">{num(l.total)}</td>
              <td className="px-4 py-2.5 tabular-nums text-slate-700">{l.pctOfSent}%</td>
              <td className="hidden px-4 py-2.5 tabular-nums text-slate-500 md:table-cell">{l.machine ? num(l.machine) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Replies({ replies }: { replies: Reply[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {!replies.length ? (
        <div className="p-10 text-center">
          <MessageSquare size={22} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-500">עדיין לא התקבלו תגובות</p>
          <p className="mt-1 text-xs text-slate-500">תגובות של נמענים שישיבו למייל יופיעו כאן</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {replies.map(r => (
            <div key={r.id} className="p-4 transition hover:bg-slate-50">
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-sm font-bold text-slate-800">{r.from}</span>
                  <span className="mr-2 font-mono text-xs text-slate-500">{r.email}</span>
                </div>
                <span className="text-xs text-slate-500">{when(r.at)}</span>
              </div>
              {r.text && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{r.text}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Compare({ rows, current }: { rows: CompareRow[] | null; current: string }) {
  if (!rows) return <div className="p-10 text-center text-slate-400"><Loader2 className="inline animate-spin" /></div>
  if (!rows.length) return <div className="rounded-2xl border border-slate-200 bg-white"><Empty>אין עדיין קמפיינים להשוואה</Empty></div>
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-right text-xs text-slate-500">
            <th className="px-4 py-3 font-semibold">קמפיין</th>
            <th className="hidden px-4 py-3 font-semibold sm:table-cell">נשלח</th>
            <th className="hidden px-4 py-3 font-semibold md:table-cell">נשלחו</th>
            <th className="px-4 py-3 font-semibold">פתחו</th>
            <th className="px-4 py-3 font-semibold">הקליקו</th>
            <th className="hidden px-4 py-3 font-semibold lg:table-cell">הקליקו מהפותחים</th>
            <th className="hidden px-4 py-3 font-semibold lg:table-cell">חזרו</th>
            <th className="hidden px-4 py-3 font-semibold lg:table-cell">הסירו</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(c => (
            <tr key={c.id} className={c.id === current ? 'bg-cyan-50' : 'hover:bg-slate-50'}>
              <td className="px-4 py-2.5 font-medium text-slate-800">
                {c.id === current ? c.name : <Link href={`/admin/newsletter/${c.id}`} className="hover:underline">{c.name}</Link>}
              </td>
              <td className="hidden whitespace-nowrap px-4 py-2.5 text-slate-600 sm:table-cell">{c.at ? new Date(c.at).toLocaleDateString('he-IL') : '—'}</td>
              <td className="hidden px-4 py-2.5 tabular-nums md:table-cell">{num(c.sent)}</td>
              <td className="px-4 py-2.5 tabular-nums"><b>{c.openRate}%</b> <span className="text-xs text-slate-500">({num(c.opened)})</span></td>
              <td className="px-4 py-2.5 tabular-nums"><b>{c.clickRate}%</b> <span className="text-xs text-slate-500">({num(c.clicked)})</span></td>
              <td className="hidden px-4 py-2.5 tabular-nums lg:table-cell">{c.clickToOpen}%</td>
              <td className="hidden px-4 py-2.5 tabular-nums lg:table-cell">{num(c.bounced)}</td>
              <td className="hidden px-4 py-2.5 tabular-nums lg:table-cell">{num(c.unsubscribed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Metric({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: 'cyan' | 'navy' | 'rose' }) {
  const color = tone === 'cyan' ? 'text-[#0891b2]' : tone === 'navy' ? 'text-navy' : tone === 'rose' ? 'text-rose-600' : 'text-slate-800'
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <dt className="mb-1 text-xs text-slate-500">{label}</dt>
      <dd className={`text-2xl font-bold tabular-nums ${color}`}>{typeof value === 'number' ? num(value) : value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-slate-500">{sub}</dd>}
    </div>
  )
}

function Bars({ title, list }: { title: string; list: Breakdown[] }) {
  const total = list.reduce((s, b) => s + b.count, 0)
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-600">{title}</p>
      <ul className="space-y-1.5">
        {list.slice(0, 6).map(b => (
          <li key={b.label} className="text-sm">
            <div className="flex justify-between gap-2"><span className="truncate text-slate-700">{b.label}</span><span className="tabular-nums text-slate-600">{rate(b.count, total)}%</span></div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0891b2]" style={{ width: `${rate(b.count, total)}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-start gap-1.5 rounded-xl bg-slate-50 px-4 py-2.5 text-xs leading-relaxed text-slate-600">
      <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">{children}</p>
}

function Tag({ children, color }: { children: React.ReactNode; color: 'emerald' | 'rose' | 'slate' | 'amber' }) {
  const map = {
    emerald: 'bg-emerald-100 text-emerald-700',
    rose: 'bg-rose-100 text-rose-700',
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-100 text-amber-800',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[color]}`}>{children}</span>
}
