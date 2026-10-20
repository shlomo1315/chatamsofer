'use client'

// פילוח שליחת הגיליונות: משפך וגרף מצטבר לגיליון אחד (מתעדכן כל 30 שניות),
// ודשבורד השוואה של הגיליונות האחרונים בלשונית הגיליונות.
// נתונים: /api/admin/gilyonot/issues/[id]/stats · חישוב: lib/gilyonotStats.ts

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, BarChart3, Info, Loader2, RefreshCw } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { IssueStats, StatKey } from '@/lib/gilyonotStats'
import { Card, CardHeader, Stat } from './ui'
import type { IssueView } from './GilyonotClient'

const num = (n: number) => n.toLocaleString('he-IL')
const rate = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : 0)
const TICK = { fontSize: 11, fill: '#64748b' }
const REFRESH_MS = 30_000

export const SERIES: { key: StatKey; label: string; color: string }[] = [
  { key: 'sent', label: 'נשלחו', color: '#94a3b8' },
  { key: 'delivered', label: 'נמסרו', color: '#2563eb' },
  { key: 'opened', label: 'פתחו', color: '#0891b2' },
  { key: 'downloaded', label: 'הורידו', color: '#059669' },
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
    { label: 'הורידו את הגיליון', value: c.downloaded, of: sent, hint: 'לחצו על כפתור ההורדה', color: '#059669' },
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
            <Stat label="פתחו / הורידו" value={`${num(c.opened)} / ${num(c.downloaded)}`} sub={`${rate(c.opened, c.sent)}% · ${rate(c.downloaded, c.sent)}%`} />
            <Stat label="חזרו / ספאם / נכשלו" value={`${num(c.bounced)} / ${num(c.complained)} / ${num(data.failed)}`} tone={c.bounced + c.complained + data.failed ? 'rose' : undefined} sub={`${rate(c.bounced, c.sent)}% חזרו`} />
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

          {c.sent > 0 && c.delivered === 0 && c.bounced === 0 && (
            <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              &quot;נמסרו&quot; ו&quot;חזרו&quot; מגיעים מ-Resend, ונספרים רק בגיליונות שנשלחו אחרי העדכון הזה. גיליונות ישנים יראו כאן 0.
            </p>
          )}
        </>
      )}
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
    downloaded: r.downloaded_count, bounced: r.bounced_count,
  }))

  return (
    <Card className="p-5">
      <CardHeader icon={<BarChart3 className="h-5 w-5" aria-hidden />} title="ביצועי הגיליונות"
        hint={`${done.length} הגיליונות האחרונים${sending ? ' · מתעדכן כל 30 שניות בזמן שליחה' : ''}`} />
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="נשלחו" value={num(sent)} />
        <Stat label="שיעור פתיחה" value={`${rate(sum('opened_count'), sent)}%`} />
        <Stat label="שיעור הורדה" value={`${rate(sum('downloaded_count'), sent)}%`} />
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
