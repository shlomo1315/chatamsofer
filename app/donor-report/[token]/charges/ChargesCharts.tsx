'use client'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ChargeBranch } from '@/lib/donorCharges'

// גרפים של דוח החיובים: סכום לפי יום (עמודות בצבע כל בית), חלוקה בין הבתים (טבעת)
// ומדדים קצרים. הכול נגזר מהנתונים שכבר הגיעו מהשרת, אחרי סינון הבית והתקופה.
interface Props { days: string[]; branches: ChargeBranch[]; colorOf: Map<string, string>; amount: number; count: number }

const MUT = '#8E99B3'
const LINE = 'rgba(255,255,255,.08)'
const M = (n: number) => `₪${Math.round(n).toLocaleString('en-US')}`
const short = (n: number) => (n >= 1000 ? `₪${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}K` : `₪${Math.round(n)}`)
const fd = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

interface TipProps { active?: boolean; label?: string | number; payload?: { name?: string | number; value?: number | string; color?: string; payload?: { fill?: string } }[] }
function Tip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length) return null
  const rows = payload.filter(p => Number(p.value) > 0)
  const total = rows.reduce((a, p) => a + Number(p.value), 0)
  return (
    <div className="ctip" dir="rtl">
      {label !== undefined && <b>{fd(String(label))}</b>}
      {rows.map(p => (
        <div key={String(p.name)}><i style={{ background: p.color ?? p.payload?.fill }} />{p.name}<span className="num">{M(Number(p.value))}</span></div>
      ))}
      {label !== undefined && rows.length > 1 && <div className="t">סה״כ<span className="num">{M(total)}</span></div>}
    </div>
  )
}

export default function ChargesCharts({ days, branches, colorOf, amount, count }: Props) {
  const rows = days.map(date => {
    const row: Record<string, number | string> = { date }
    for (const b of branches) row[b.home] = b.days.find(d => d.date === date)?.amount ?? 0
    return row
  })
  const dayTotals = days.map(d => ({ d, t: branches.reduce((a, b) => a + (b.days.find(x => x.date === d)?.amount ?? 0), 0) }))
  const active = dayTotals.filter(x => x.t > 0)
  const peak = active.reduce<{ d: string; t: number } | null>((m, x) => (!m || x.t > m.t ? x : m), null)
  const pie = branches.map(b => ({ name: b.home, value: b.amount }))

  return (
    <div className="charts noprint">
      <div className="kpis">
        <div className="panel"><span>ממוצע לחיוב</span><b className="num">{M(count ? amount / count : 0)}</b></div>
        <div className="panel"><span>ממוצע ליום עם חיובים</span><b className="num">{M(active.length ? amount / active.length : 0)}</b><small>{active.length} מתוך {days.length} ימים</small></div>
        <div className="panel"><span>היום עם הכי הרבה חיובים</span><b className="num">{peak ? M(peak.t) : '—'}</b>{peak && <small>{fd(peak.d)}</small>}</div>
      </div>

      <div className={`cgrid${branches.length > 1 ? '' : ' one'}`}>
        <figure className="panel chart">
          <figcaption>סכום החיובים לפי יום</figcaption>
          <div className="cbox" dir="ltr">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={LINE} />
                <XAxis dataKey="date" reversed tickFormatter={fd} tick={{ fontSize: 12, fill: MUT }} axisLine={{ stroke: LINE }} tickLine={false} minTickGap={8} />
                <YAxis orientation="right" tickFormatter={short} tick={{ fontSize: 12, fill: MUT }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<Tip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                {branches.map((b, i) => (
                  <Bar key={b.home} dataKey={b.home} stackId="a" fill={colorOf.get(b.home)} isAnimationActive={false}
                    radius={i === branches.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>

        {branches.length > 1 && (
          <figure className="panel chart">
            <figcaption>חלוקה בין בתי ההחלמה</figcaption>
            <div className="donut">
              <div className="cbox" dir="ltr">
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none" isAnimationActive={false}>
                      {pie.map(p => <Cell key={p.name} fill={colorOf.get(p.name)} />)}
                    </Pie>
                    <Tooltip content={<Tip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="leg">
                {branches.map(b => (
                  <li key={b.home}>
                    <i style={{ background: colorOf.get(b.home) }} />{b.home}
                    <span className="num">{amount ? Math.round((b.amount / amount) * 100) : 0}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </figure>
        )}
      </div>
    </div>
  )
}
