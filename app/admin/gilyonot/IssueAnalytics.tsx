'use client'

// פילוח שליחת הגיליונות: משפך וגרף מצטבר לגיליון אחד (מתעדכן כל 30 שניות),
// ודשבורד השוואה של הגיליונות האחרונים בלשונית הגיליונות.
// נתונים: /api/admin/gilyonot/issues/[id]/stats · חישוב: lib/gilyonotStats.ts

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, BarChart3, Download, Info, Loader2, RefreshCw, Search } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { IssueStats, StatKey } from '@/lib/gilyonotStats'
import { Badge, Card, CardHeader, Stat, input } from './ui'
import type { IssueView } from './GilyonotClient'

const num = (n: number) => n.toLocaleString('he-IL')
const rate = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : 0)
const TICK = { fontSize: 11, fill: '#64748b' }
const REFRESH_MS = 30_000

export const SERIES: { key: StatKey; label: string; color: string }[] = [
  { key: 'sent', label: 'נשלחו', color: '#94a3b8' },
  { key: 'delivered', label: 'נמסרו', color: '#2563eb' },
  { key: 'opened', label: 'פתחו', color: '#0891b2' },
  { key: 'clicked', label: 'הקליקו', color: '#7c3aed' },
  { key: 'downloaded', label: 'הורידו', color: '#059669' },
  { key: 'unsubscribed', label: 'הסירו', color: '#d97706' },
  { key: 'bounced', label: 'חזרו', color: '#e11d48' },
]

/** רענון כל 30 שניות, רק כשהלשונית גלויה. */
function useInterval(fn: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') fn() }, REFRESH_MS)
    return () => clearInterval(t)
  }, [fn, enabled])
}

// ─── גיליון אחד ──────────────────────────────────────────────────────────────

export function IssueAnalytics({ issue, base }: { issue: IssueView; base: string }) {
  const router = useRouter()
  const [data, setData] = useState<(IssueStats & { status: IssueView['status'] }) | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [at, setAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${base}/stats`, { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'טעינת הנתונים נכשלה')
      setData(d); setErr(''); setAt(new Date())
      if (d.status !== issue.status) router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'טעינת הנתונים נכשלה') }
    finally { setLoading(false) }
  }, [base, issue.status, router])

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])
  useInterval(load)

  const c = data?.counts
  const sent = c?.sent ?? issue.sent_count
  const funnel = c ? [
    { label: 'נשלחו', value: c.sent, of: data.total, hint: `מתוך ${num(data.total)} נמענים`, color: '#94a3b8' },
    { label: 'נמסרו לתיבה', value: c.delivered, of: sent, hint: 'אישור מסירה מ-Resend', color: '#2563eb' },
    { label: 'פתחו', value: c.opened, of: sent, hint: 'הערכה, לפי טעינת תמונה', color: '#0891b2' },
    { label: 'הקליקו', value: c.clicked, of: sent, hint: 'לחצו על קישור במייל', color: '#7c3aed' },
    { label: 'הסירו את עצמם', value: c.unsubscribed, of: sent, hint: 'לחצו על הסרה מהרשימה', color: '#d97706' },
    ...(c.downloaded > 0 ? [{ label: 'הורידו (גיליונות ישנים)', value: c.downloaded, of: sent, hint: 'לחצו על קישור ההורדה', color: '#059669' }] : []),
    { label: 'חזרו', value: c.bounced, of: sent, hint: 'כתובת לא קיימת או תיבה מלאה', color: '#e11d48' },
  ] : []
  const fmtT = (t: string) => new Date(t).toLocaleString('he-IL', data?.bucket === 'day'
    ? { day: 'numeric', month: 'numeric' } : { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-4 border-b border-slate-100 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Activity className="h-4 w-4 text-[#2563eb]" aria-hidden />פילוח השליחה בזמן אמת</h3>
        <button type="button" onClick={load} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          {at ? `עודכן ${at.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'רענון'}
        </button>
      </div>

      {err && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}

      {c && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="נשלחו" value={num(c.sent)} sub={data.pending ? `${num(data.pending)} ממתינים` : `מתוך ${num(data.total)}`} />
            <Stat label="נמסרו" value={num(c.delivered)} sub={`${rate(c.delivered, c.sent)}%`} />
            <Stat label="פתחו" value={num(c.opened)} sub={`${rate(c.opened, c.sent)}%${c.downloaded > 0 ? ` · ${num(c.downloaded)} הורידו` : ''}`} />
            <Stat label="חזרו / ספאם / נכשלו" value={`${num(c.bounced)} / ${num(c.complained)} / ${num(data.failed)}`} tone={c.bounced + c.complained + data.failed ? 'rose' : undefined} sub={`${rate(c.bounced, c.sent)}% חזרו`} />
          </dl>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="שיעור פתיחה" value={`${rate(c.opened, c.sent)}%`} sub={`${num(c.opened)} נמענים`} />
            <Stat label="הקליקו" value={num(c.clicked)} sub={`${rate(c.clicked, c.sent)}%`} />
            <Stat label="הסירו את עצמם" value={num(c.unsubscribed)} sub={`${rate(c.unsubscribed, c.sent)}%`} tone={c.unsubscribed ? 'rose' : undefined} />
            <Stat label="עוד לא פתחו" value={num(Math.max(0, c.sent - c.opened))} sub={`${rate(Math.max(0, c.sent - c.opened), c.sent)}%`} />
          </dl>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <ul className="space-y-3" aria-label="משפך השליחה">
              {funnel.map(f => {
                const p = f.of ? Math.min(100, (f.value / f.of) * 100) : 0
                return (
                  <li key={f.label}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium text-slate-800">{f.label}</span>
                      <span className="tabular-nums text-slate-900"><b>{num(f.value)}</b> <span className="text-xs text-slate-500">({Math.round(p)}%)</span></span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${p}%`, background: f.color }} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{f.hint}</p>
                  </li>
                )
              })}
            </ul>

            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium text-slate-500">מצטבר לאורך זמן ({data.bucket === 'day' ? 'לפי יום' : 'לפי שעה'})</p>
              {data.timeline.length ? (
                <div dir="ltr" className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.timeline} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                      <CartesianGrid stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="t" tickFormatter={fmtT} tick={TICK} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis tick={TICK} tickFormatter={num} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip labelFormatter={l => fmtT(String(l))} formatter={(v: unknown, n: unknown) => [num(Number(v)), String(n)]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {SERIES.map(s => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">עוד אין נתונים. הגרף יתמלא כשהמיילים יתחילו לצאת.</p>}
            </div>
          </div>

          {(c.opened > 0 || c.clicked > 0) && (
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium text-slate-500">כניסות לפי שעה ביממה (שעון ישראל)</p>
              <div dir="ltr" className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byHour} margin={{ top: 6, right: 8, bottom: 0, left: -12 }} barCategoryGap="15%">
                    <CartesianGrid stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="hour" tickFormatter={h => `${String(h).padStart(2, '0')}:00`} tick={TICK} axisLine={false} tickLine={false} interval={2} />
                    <YAxis tick={TICK} tickFormatter={num} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} labelFormatter={h => `${String(h).padStart(2, '0')}:00`} formatter={(v: unknown, n: unknown) => [num(Number(v)), String(n)]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="opened" name="פתחו" fill="#0891b2" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="clicked" name="הקליקו" fill="#7c3aed" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {c.sent > 0 && c.delivered === 0 && c.bounced === 0 && (
            <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              &quot;נמסרו&quot; ו&quot;חזרו&quot; מגיעים מ-Resend, ונספרים רק בגיליונות שנשלחו אחרי העדכון הזה. גיליונות ישנים יראו כאן 0.
            </p>
          )}
        </>
      )}
      {c && c.sent > 0 && <Recipients base={base} />}
      {!c && !err && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />טוען נתונים...</p>}
    </div>
  )
}

// ─── השוואה בין הגיליונות האחרונים ────────────────────────────────────────────

export function IssuesDashboard({ rows }: { rows: IssueView[] }) {
  const router = useRouter()
  const sending = rows.some(r => r.status === 'sending')
  const refresh = useCallback(() => router.refresh(), [router])
  useInterval(refresh, sending)

  const done = rows.filter(r => r.status !== 'draft').slice(0, 12).reverse()
  if (!done.length) return null
  const sum = (k: keyof IssueView) => done.reduce((a, r) => a + (Number(r[k]) || 0), 0)
  const sent = sum('sent_count')
  const chart = done.map(r => ({
    name: r.parasha, sent: r.sent_count, delivered: r.delivered_count, opened: r.opened_count,
    clicked: r.clicked_count, downloaded: r.downloaded_count, unsubscribed: r.unsubscribed_count, bounced: r.bounced_count,
  }))

  return (
    <Card className="p-5">
      <CardHeader icon={<BarChart3 className="h-5 w-5" aria-hidden />} title="ביצועי הגיליונות"
        hint={`${done.length} הגיליונות האחרונים${sending ? ' · מתעדכן כל 30 שניות בזמן שליחה' : ''}`} />
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="נשלחו" value={num(sent)} />
        <Stat label="שיעור פתיחה" value={`${rate(sum('opened_count'), sent)}%`} />
        <Stat label="שיעור מסירה" value={`${rate(sum('delivered_count'), sent)}%`} />
        <Stat label="הקליקו / הסירו" value={`${num(sum('clicked_count'))} / ${num(sum('unsubscribed_count'))}`} sub={`${rate(sum('clicked_count'), sent)}% / ${rate(sum('unsubscribed_count'), sent)}%`} />
        <Stat label="חזרו" value={num(sum('bounced_count'))} sub={`${rate(sum('bounced_count'), sent)}%`} tone={sum('bounced_count') ? 'rose' : undefined} />
      </dl>
      <div dir="ltr" className="mt-5 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart} margin={{ top: 6, right: 8, bottom: 0, left: -12 }} barGap={1} barCategoryGap="18%">
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" reversed tick={TICK} axisLine={false} tickLine={false} interval={0} />
            <YAxis orientation="right" tick={TICK} tickFormatter={num} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v: unknown, n: unknown) => [num(Number(v)), String(n)]} labelFormatter={l => `פרשת ${l}`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {SERIES.map(s => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

// ─── פירוט לפי נמען ──────────────────────────────────────────────────────────

interface RecipientRow {
  email: string; status: 'pending' | 'sent' | 'failed'
  sent_at: string | null; delivered_at: string | null; opened_at: string | null; open_count: number
  clicked_at: string | null; click_count: number; bounced_at: string | null; unsubscribed_at: string | null
}

const RFILTERS = [
  { key: '', label: 'כולם' }, { key: 'opened', label: 'פתחו' }, { key: 'unopened', label: 'לא פתחו' },
  { key: 'clicked', label: 'הקליקו' }, { key: 'bounced', label: 'חזרו' }, { key: 'unsubscribed', label: 'הסירו' }, { key: 'failed', label: 'נכשלו' },
]
const fmtShort = (s: string | null) => (s ? new Date(s).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

function Recipients({ base }: { base: string }) {
  const [f, setF] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [d, setD] = useState<{ rows: RecipientRow[]; total: number; size: number } | null>(null)
  const [err, setErr] = useState('')
  const qs = (extra = '') => `f=${f}&q=${encodeURIComponent(q)}${extra}`

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${base}/recipients?${qs(`&page=${page}`)}`, { cache: 'no-store' })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || 'טעינה נכשלה')
        setD(j); setErr('')
      } catch (e) { setErr(e instanceof Error ? e.message : 'טעינה נכשלה') }
    }, q ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, f, q, page])

  const pages = d ? Math.max(1, Math.ceil(d.total / d.size)) : 1
  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">פירוט לפי נמען{d ? ` (${num(d.total)})` : ''}</h3>
        <a href={`${base}/recipients?${qs('&csv=1')}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-slate-600 hover:bg-slate-100"><Download className="h-3.5 w-3.5" aria-hidden />ייצוא לאקסל</a>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="סינון נמענים">
        {RFILTERS.map(x => (
          <button key={x.key} type="button" onClick={() => { setF(x.key); setPage(0) }} aria-pressed={f === x.key}
            className={`min-h-9 rounded-lg px-3 text-xs font-medium ${f === x.key ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{x.label}</button>
        ))}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input className={`${input} ps-9`} dir="ltr" placeholder="חיפוש לפי מייל" aria-label="חיפוש לפי מייל" value={q} onChange={e => { setQ(e.target.value); setPage(0) }} />
      </div>
      {err && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
      {d && (d.rows.length ? (
        <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-slate-900/[0.06]">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr>
              <th className="px-3 py-2 text-start font-medium">מייל</th><th className="px-3 py-2 text-start font-medium">מצב</th>
              <th className="px-3 py-2 text-start font-medium">נפתח</th><th className="px-3 py-2 text-start font-medium">הקליק</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {d.rows.map(r => (
                <tr key={r.email}>
                  <td className="px-3 py-2" dir="ltr">{r.email}</td>
                  <td className="px-3 py-2"><div className="flex flex-wrap gap-1">
                    {r.status === 'failed' ? <Badge tone="rose">נכשל</Badge> : r.status === 'pending' ? <Badge>ממתין</Badge>
                      : r.bounced_at ? <Badge tone="rose">חזר</Badge> : r.delivered_at ? <Badge tone="green">נמסר</Badge> : <Badge>נשלח</Badge>}
                    {r.unsubscribed_at && <Badge tone="amber">הסיר</Badge>}
                  </div></td>
                  <td className="px-3 py-2 tabular-nums text-slate-700">{r.opened_at ? `${fmtShort(r.opened_at)}${r.open_count > 1 ? ` · ${r.open_count}×` : ''}` : '—'}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-700">{r.clicked_at ? `${fmtShort(r.clicked_at)}${r.click_count > 1 ? ` · ${r.click_count}×` : ''}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">אין נמענים תואמים.</p>)}
      {d && pages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-600">
          <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="min-h-9 rounded-lg px-3 hover:bg-slate-100 disabled:opacity-40">הקודם</button>
          <span>עמוד {page + 1} מתוך {pages}</span>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)} className="min-h-9 rounded-lg px-3 hover:bg-slate-100 disabled:opacity-40">הבא</button>
        </div>
      )}
    </div>
  )
}
