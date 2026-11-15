'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DonorRow } from '@/lib/donorReport'
import {
  PRESETS, autoGran, buckets, effectiveRange, presetRange,
  type Bucket, type Gran, type Group, type Totals, type ViewFilter,
} from '@/lib/donorReportCalc'

// סרגל תקופה ובית החלמה (כיוון א׳ במוקאפ המאושר): הסינון כותב ל-from, to ו-home של אותו ViewFilter,
// ולכן הסכום, הפילוח, הגרף והרשימה מתחתיו נגזרים מאותה רשימה מסוננת.
const nis = (n: number) => `₪${Math.round(n).toLocaleString('en-US')}`
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const kfmt = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}K` : String(Math.round(v)))
const heFull = (d: string) => d.split('-').reverse().join('.')
const heShort = (d: string) => `${Number(d.slice(8))}.${Number(d.slice(5, 7))}`
const bLabel = (b: Bucket, g: Gran) => (g === 'month' ? `${b.start.slice(5, 7)}/${b.start.slice(2, 4)}` : heShort(b.start))
const bRange = (b: Bucket, g: Gran) => (g === 'day' ? heFull(b.start) : `${heFull(b.start)} – ${heFull(b.end)}`)
const GRAN_WORD: Record<Gran, string> = { day: 'יום', week: 'שבוע', month: 'חודש' }
const GRAN_OPTS: [GranChoice, string][] = [['auto', 'אוטומטי'], ['day', 'יום'], ['week', 'שבוע'], ['month', 'חודש']]
type GranChoice = 'auto' | Gran

function nice(v: number): number {
  if (v <= 0) return 1000
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  all: DonorRow[]
  rows: DonorRow[]
  F: ViewFilter
  homes: string[]
  homeGroups: Group[]
  T: Totals
  setRange: (from: string, to: string) => void
  setHome: (home: string) => void
}

export default function PeriodPanel({ all, rows, F, homes, homeGroups, T, setRange, setHome }: Props) {
  const [granChoice, setGranChoice] = useState<GranChoice>('auto')
  const [tip, setTip] = useState<{ x: number; y: number; i: number } | null>(null)
  const [width, setWidth] = useState(600)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = chartRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const bounds = useMemo(() => effectiveRange(EMPTY, all), [all])
  const range = useMemo(() => effectiveRange(F, all), [F, all])
  const gran: Gran = granChoice === 'auto' ? (range ? autoGran(range.from, range.to) : 'month') : granChoice
  const bs = useMemo(() => (range ? buckets(rows, gran, range.from, range.to, homes) : []), [rows, gran, range, homes])
  const tot = T.amount || 1
  const today = todayIso()
  const color = (h: string) => `var(--h${(homes.indexOf(h) % 6) + 1})`

  const onDate = (k: 'from' | 'to', v: string) => {
    const from = k === 'from' ? v : F.from, to = k === 'to' ? v : F.to
    if (from && to && from > to) return
    setRange(from, to)
  }

  // גרף עמודות מוערמות; הזמן זורם מימין לשמאל, כמו בציר של הדוח.
  const W = Math.max(300, width), H = W < 600 ? 220 : 280
  const pr = 44, pt = 22, pb = 26, iw = W - pr, ih = H - pt - pb
  const n = bs.length || 1, bw = iw / n, gap = Math.min(6, bw * .22)
  const mx = nice(Math.max(1, ...bs.map(b => b.amount)))
  const every = Math.ceil(n / (W < 500 ? 6 : 12))
  const pk = Math.max(0, ...bs.map(b => b.amount))
  const tb = tip ? bs[tip.i] : null

  const moveTip = (e: React.MouseEvent) => {
    const t = (e.target as Element).closest<SVGElement>('[data-b]')
    setTip(t ? { x: e.clientX, y: e.clientY, i: Number(t.dataset.b) } : null)
  }

  return (
    <section className="tile per" aria-label="סינון לפי תקופה ובית החלמה">
      <h3>סינון לפי תקופה ובית החלמה</h3>
      <div className="ctl">
        <div className="grp"><span className="cl">תקופה</span>
          <div className="seg" role="group" aria-label="תקופה">
            {PRESETS.map(p => {
              const r = presetRange(p.key, today)
              return <button key={p.key} aria-pressed={F.from === r.from && F.to === r.to} onClick={() => setRange(r.from, r.to)}>{p.label}</button>
            })}
          </div>
        </div>
        <div className="grp dates">
          <label>מתאריך<input type="date" value={F.from} min={bounds?.from} max={F.to || bounds?.to} onChange={e => onDate('from', e.target.value)} /></label>
          <label>עד תאריך<input type="date" value={F.to} min={F.from || bounds?.from} max={bounds?.to} onChange={e => onDate('to', e.target.value)} /></label>
        </div>
        <div className="grp"><span className="cl">בית החלמה</span>
          <div className="hch" role="group" aria-label="בית החלמה">
            <button className="hc" aria-pressed={!F.home} onClick={() => setHome('')}>כל הבתים</button>
            {homes.map(h => (
              <button key={h} className="hc" aria-pressed={F.home === h} onClick={() => setHome(h)}><i style={{ background: color(h) }} />{h}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="res">
        <div>
          <p className="lbl">הועבר לבתי ההחלמה בתקופה</p>
          <p className="big num ltr"><span className="cur">₪</span>{fmt(T.amount)}</p>
          <p className="sub">עבור <b className="num">{fmt(T.count)}</b> יולדות{range && <> · <span className="num ltr">{heFull(range.from)} – {heFull(range.to)}</span></>}</p>
          {T.pending > 0 && <p className="pend num">{fmt(T.pending)} מהן ממתינות לקבלה ולא נכללות בסכום</p>}
        </div>
        <div>
          <div className="stack">{homeGroups.map(g => <span key={g.value} style={{ width: `${g.amount / tot * 100}%`, background: color(g.value) }} />)}</div>
          {homeGroups.map(g => (
            <div key={g.value} className={`hrow${!F.home || F.home === g.value ? '' : ' off'}`}>
              <span className="n"><i style={{ background: color(g.value) }} />{g.value}</span>
              <span className="c num">{fmt(g.count)} יולדות · {T.amount ? Math.round(g.amount / tot * 100) : 0}%</span>
              <span className="a num">{nis(g.amount)}</span>
            </div>
          ))}
        </div>
      </div>

      <h3>סכום לפי {GRAN_WORD[gran]}
        <span className="seg" role="group" aria-label="חלוקה">
          {GRAN_OPTS.map(([k, t]) => <button key={k} aria-pressed={granChoice === k} onClick={() => setGranChoice(k)}>{t}</button>)}
        </span>
      </h3>
      <div className="chart" ref={chartRef} onMouseMove={moveTip} onClick={moveTip} onMouseLeave={() => setTip(null)}>
        <svg style={{ direction: 'ltr' }} viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label={`סכום לפי ${GRAN_WORD[gran]}`}>
          {[0, 1, 2, 3, 4].map(i => {
            const y = pt + ih - ih * i / 4
            return (
              <g key={i}>
                <line x1={0} x2={iw} y1={y} y2={y} stroke="var(--grid)" />
                <text x={W} y={y + 4} textAnchor="end" fontSize={11} fill="var(--mut)">{i ? `₪${kfmt(mx * i / 4)}` : '0'}</text>
              </g>
            )
          })}
          {bs.map((b, i) => {
            const x = iw - (i + 1) * bw + gap / 2, w = bw - gap
            let y = pt + ih
            return (
              <g key={b.start}>
                <g>
                  {homes.map(h => {
                    const v = b.by[h]?.amount ?? 0
                    if (!v) return null
                    const hh = v / mx * ih
                    y -= hh
                    return <rect key={h} x={x} y={y} width={w} height={Math.max(0, hh - (hh > 3 ? 1 : 0))} style={{ fill: color(h) }} />
                  })}
                </g>
                {b.amount > 0 && (bw >= 44 || b.amount === pk) && (
                  <text x={x + w / 2} y={y - 6} textAnchor="middle" fontSize={bw >= 44 ? 12 : 11} fontWeight={700} fill="var(--tx)">{kfmt(b.amount)}</text>
                )}
                {i % every === 0 && <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--mut)">{bLabel(b, gran)}</text>}
                <rect data-b={i} x={iw - (i + 1) * bw} y={0} width={bw} height={H} fill="transparent" />
              </g>
            )
          })}
        </svg>
      </div>

      {tip && tb && (
        <div className="ptip" style={{ left: Math.min(window.innerWidth - 88, Math.max(88, tip.x)), top: Math.max(8, tip.y - 14) }}>
          <div className="t">{bRange(tb, gran)}</div>
          {homes.filter(h => !F.home || F.home === h).map(h => (
            <div className="r" key={h}><span><i style={{ background: color(h) }} />{h} · {tb.by[h]?.count ?? 0}</span><b>{nis(tb.by[h]?.amount ?? 0)}</b></div>
          ))}
          <div className="r s"><span>{tb.count} יולדות</span><span>{nis(tb.amount)}</span></div>
        </div>
      )}
    </section>
  )
}

const EMPTY = { from: '', to: '' }
