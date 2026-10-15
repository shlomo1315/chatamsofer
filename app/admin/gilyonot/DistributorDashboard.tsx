'use client'

import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AlertTriangle, BarChart3, CheckCircle2, ChevronLeft, PieChart as PieIcon, Route, TrendingUp } from 'lucide-react'
import {
  COVERAGE_OK, ISSUE_LABELS, ISSUE_ORDER, NO_CITY, type CityStat, type DistributorDashboard as Dash, type DistributorIssue,
} from '@/lib/gilyonotDistributors'
import { Card, CardHeader } from './ui'

// לוח הגרפים בראש לשונית "מפיצים". החישובים ב-buildDistributorDashboard (lib/gilyonotDistributors.ts).
// לחיצה על עיר או על בעיה מסננת את הטבלה שמתחת.

const NAVY = '#1B3256'
const OK = '#059669'
const WARN = '#d97706'
const BAD = '#e11d48'
const GRID = '#e2e8f0'
const TICK = { fontSize: 12, fill: '#475569' }
const TOP = 10

const num = (n: number) => n.toLocaleString('he-IL')
const coverageTone = (c: CityStat) => (c.city === NO_CITY || !c.routed ? BAD : c.coverage < COVERAGE_OK ? WARN : OK)
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('he-IL', { month: 'short', timeZone: 'UTC' })
  return m === 1 ? `${name} ${String(y).slice(2)}` : name
}

export interface PendingCounts { requests: number; hilula: number; applications: number }

export function DistributorDashboard({ dash, city, onCity, issue, onIssue, pending, onSection }: {
  dash: Dash
  city: string
  onCity: (city: string) => void
  issue: DistributorIssue | ''
  onIssue: (issue: DistributorIssue | '') => void
  pending: PendingCounts
  onSection: (s: 'requests' | 'hilula' | 'nedarim') => void
}) {
  const [metric, setMetric] = useState<'quantity' | 'distributors'>('quantity')
  const [showAll, setShowAll] = useState(false)

  if (!dash.totals.active && !dash.totals.removed) {
    return (
      <Card className="p-8 text-center">
        <BarChart3 className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
        <p className="mt-3 font-semibold text-slate-800">הגרפים יופיעו כשיהיו מפיצים</p>
        <p className="mt-1 text-sm text-slate-500">הוסיפו מפיץ או ייבאו את החוברת, ותראו כאן את הפריסה לפי ערים, המסלולים והבעיות.</p>
      </Card>
    )
  }

  const byMetric = [...dash.cities].sort((a, b) => b[metric] - a[metric] || a.city.localeCompare(b.city, 'he'))
  const cities = showAll ? byMetric : byMetric.slice(0, TOP)
  const byCoverage = [...dash.cities].sort((a, b) => a.coverage - b.coverage || b.distributors - a.distributors)
  const coverageRows = showAll ? byCoverage : byCoverage.slice(0, TOP)
  const height = (n: number) => Math.max(160, n * 34 + 30)
  const pick = (c: string) => onCity(city === c ? '' : c)
  const more = dash.cities.length > TOP && (
    <button type="button" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#1B3256] hover:underline" onClick={() => setShowAll(!showAll)}>
      {showAll ? `רק ${TOP} הראשונות` : `כל ${num(dash.cities.length)} הערים`}<ChevronLeft className={`h-4 w-4 ${showAll ? 'rotate-90' : ''}`} aria-hidden />
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Issues dash={dash} issue={issue} onIssue={onIssue} pending={pending} onSection={onSection} />

        <Card className="min-w-0 lg:col-span-2">
          <div className="p-5 pb-2">
            <CardHeader icon={<BarChart3 className="h-5 w-5" aria-hidden />} title="פריסה לפי עיר"
              hint="הצבע מראה את כיסוי המסלולים. לחיצה על עיר מסננת את הרשימה.">
                <div role="group" aria-label="מה להציג" className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
                  {([['quantity', 'גיליונות'], ['distributors', 'מפיצים']] as const).map(([k, l]) => (
                    <button key={k} type="button" aria-pressed={metric === k} onClick={() => setMetric(k)}
                      className={`rounded-md px-2.5 py-1 font-medium ${metric === k ? 'bg-[#1B3256] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>
                  ))}
                </div>
            </CardHeader>
          </div>
          <div className="px-3" dir="ltr">
            <ResponsiveContainer width="100%" height={height(cities.length)}>
              <BarChart data={cities} layout="vertical" margin={{ top: 4, right: 4, bottom: 4, left: 8 }} barCategoryGap={6}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" reversed tick={TICK} tickFormatter={num} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="city" orientation="right" width={104} tick={<CityTick selected={city} />} axisLine={false} tickLine={false} interval={0} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} content={<CityTooltip />} />
                <Bar dataKey={metric} radius={[6, 0, 0, 6]} cursor="pointer" onClick={(_, i) => pick(cities[i].city)}
                  label={{ position: 'insideLeft', fill: '#fff', fontSize: 11, formatter: (v: unknown) => num(Number(v)) }}>
                  {cities.map(c => <Cell key={c.city} fill={coverageTone(c)} fillOpacity={!city || city === c.city ? 1 : 0.3} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-4">
            <ToneLegend />
            {more}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0">
          <div className="p-5 pb-2">
            <CardHeader icon={<Route className="h-5 w-5" aria-hidden />} title="כיסוי מסלולים" hint="כמה מהמפיצים בכל עיר שובצו במסלול השליח. החלשות למעלה." />
          </div>
          <div className="px-3" dir="ltr">
            <ResponsiveContainer width="100%" height={height(coverageRows.length)}>
              <BarChart data={coverageRows} layout="vertical" stackOffset="expand" margin={{ top: 4, right: 4, bottom: 4, left: 8 }} barCategoryGap={6}>
                <XAxis type="number" reversed hide />
                <YAxis type="category" dataKey="city" orientation="right" width={104} tick={<CityTick selected={city} />} axisLine={false} tickLine={false} interval={0} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} content={<CityTooltip />} />
                <Bar dataKey="routed" name="במסלול" stackId="c" fill={OK} cursor="pointer" onClick={(_, i) => pick(coverageRows[i].city)} />
                <Bar dataKey="unrouted" name="בלי מסלול" stackId="c" fill={WARN} radius={[6, 0, 0, 6]} cursor="pointer" onClick={(_, i) => pick(coverageRows[i].city)} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-4">
            <span className="flex gap-3 text-xs text-slate-600"><Dot color={OK} />במסלול<Dot color={WARN} />בלי מסלול</span>
            {more}
          </div>
        </Card>

        <Card className="min-w-0">
          <div className="p-5 pb-0">
            <CardHeader icon={<PieIcon className="h-5 w-5" aria-hidden />} title="מצב המערך" hint="כל המפיצים שנרשמו אי פעם" />
          </div>
          <div className="relative" dir="ltr">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={dash.status} dataKey="value" nameKey="label" innerRadius={62} outerRadius={88} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
                  {dash.status.map(s => <Cell key={s.key} fill={s.key === 'routed' ? OK : s.key === 'unrouted' ? WARN : '#94a3b8'} />)}
                </Pie>
                <Tooltip formatter={(v: unknown, n: unknown) => [num(Number(v)), String(n)]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tabular-nums text-slate-900">{dash.totals.coverage}%</span>
              <span className="text-xs text-slate-500">פעילים במסלול</span>
            </div>
          </div>
          <ul className="space-y-1.5 px-5 pb-5 text-sm">
            {dash.status.map(s => (
              <li key={s.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-slate-600"><Dot color={s.key === 'routed' ? OK : s.key === 'unrouted' ? WARN : '#94a3b8'} />{s.label}</span>
                <b className="tabular-nums text-slate-900">{num(s.value)}</b>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="min-w-0">
          <div className="p-5 pb-2">
            <CardHeader icon={<TrendingUp className="h-5 w-5" aria-hidden />} title="מגמה לפי חודש" hint="הצטרפו, הוסרו, וכמה פעילים בסוף כל חודש" />
          </div>
          <div className="px-2 pb-4" dir="ltr">
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={dash.trend.map(t => ({ ...t, label: monthLabel(t.month) }))} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" reversed tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis yAxisId="n" orientation="right" tick={TICK} tickFormatter={num} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                <YAxis yAxisId="a" orientation="left" hide />
                <Tooltip formatter={(v: unknown, n: unknown) => [num(Number(v)), String(n)]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />
                <Bar yAxisId="n" dataKey="joined" name="הצטרפו" fill={NAVY} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar yAxisId="n" dataKey="removed" name="הוסרו" fill={BAD} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Line yAxisId="a" dataKey="active" name="פעילים" stroke={OK} strokeWidth={2.5} dot={{ r: 3 }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Issues({ dash, issue, onIssue, pending, onSection }: {
  dash: Dash; issue: DistributorIssue | ''; onIssue: (i: DistributorIssue | '') => void; pending: PendingCounts; onSection: (s: 'requests' | 'hilula' | 'nedarim') => void
}) {
  const waiting = [
    { key: 'requests' as const, label: 'פניות פתוחות', hint: 'תקלות ובקשות מהמפיצים', n: pending.requests },
    { key: 'hilula' as const, label: 'סעודת ההילולא', hint: 'בקשות שממתינות לאישור', n: pending.hilula },
    { key: 'nedarim' as const, label: 'נרשמים מנדרים', hint: 'ממתינים לבדיקה', n: pending.applications },
  ]
  const total = ISSUE_ORDER.reduce((s, k) => s + (dash.issues[k] ? 1 : 0), 0) + waiting.filter(w => w.n).length
  const row = (key: string, label: string, hint: string, n: number, severe: boolean, on: boolean, onClick: () => void) => (
    <li key={key}>
      <button type="button" onClick={onClick} disabled={!n} aria-pressed={on}
        className={`flex w-full items-center gap-3 px-5 py-2.5 text-start transition-colors enabled:hover:bg-slate-50 ${on ? 'bg-[#1B3256]/[0.06]' : ''}`}>
        {n
          ? <span className={`grid h-8 min-w-8 shrink-0 place-items-center rounded-lg px-1.5 text-sm font-bold tabular-nums ${severe ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>{num(n)}</span>
          : <CheckCircle2 className="mx-1.5 h-5 w-5 shrink-0 text-emerald-600" aria-label="תקין" />}
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-medium ${n ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
          <span className="block truncate text-xs text-slate-500">{hint}</span>
        </span>
        {!!n && <ChevronLeft className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
      </button>
    </li>
  )
  return (
    <Card className="min-w-0">
      <div className="p-5 pb-3">
        <CardHeader icon={<AlertTriangle className="h-5 w-5" aria-hidden />} title="בעיות ותקלות"
          hint={total ? 'לחיצה על שורה מציגה את המפיצים האלה ברשימה' : 'הכול תקין'} />
      </div>
      <ul className="divide-y divide-slate-100 pb-2">
        {ISSUE_ORDER.map(k => row(k, ISSUE_LABELS[k].label, ISSUE_LABELS[k].hint, dash.issues[k], k === 'cityNoRoutes' || k === 'noPhone',
          issue === k, () => onIssue(issue === k ? '' : k)))}
        {waiting.map(w => row(w.key, w.label, w.hint, w.n, w.key === 'requests', false, () => onSection(w.key)))}
      </ul>
    </Card>
  )
}

function ToneLegend() {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
      <span className="flex items-center gap-1.5"><Dot color={OK} />{`מסלול ל-${COVERAGE_OK}% ומעלה`}</span>
      <span className="flex items-center gap-1.5"><Dot color={WARN} />מסלול חלקי</span>
      <span className="flex items-center gap-1.5"><Dot color={BAD} />בלי מסלול</span>
    </span>
  )
}

const Dot = ({ color }: { color: string }) => <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />

// תווית עיר בציר: מיושרת לימין, מודגשת כשהעיר נבחרה, ומקוצרת אם ארוכה מדי
function CityTick(props: { x?: number; y?: number; payload?: { value: string }; selected: string }) {
  const { x = 0, y = 0, payload, selected } = props
  const v = payload?.value ?? ''
  const text = v.length > 13 ? `${v.slice(0, 12)}…` : v
  return (
    <text x={x + 98} y={y} dy={4} textAnchor="end" fontSize={12} fill={v === selected ? NAVY : '#334155'} fontWeight={v === selected ? 700 : 500}>
      <title>{v}</title>{text}
    </text>
  )
}

function CityTooltip({ active, payload }: { active?: boolean; payload?: { payload: CityStat }[] }) {
  const c = active ? payload?.[0]?.payload : undefined
  if (!c) return null
  return (
    <div dir="rtl" className="rounded-xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-900/10">
      <p className="mb-1 text-sm font-semibold text-slate-900">{c.city}</p>
      <p className="text-slate-600">{num(c.quantity)} גיליונות בשבוע</p>
      <p className="text-slate-600">{num(c.distributors)} מפיצים · {num(c.routed)} במסלול ({c.coverage}%)</p>
    </div>
  )
}
