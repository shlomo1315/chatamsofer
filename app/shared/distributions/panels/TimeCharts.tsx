'use client'
import { useMemo, useState, type CSSProperties } from 'react'
import s from '../board.module.css'
import m from './money.module.css'
import {
  areaPaths, dayKey, hourCounts, hourlySeries, pctOf, registrationSeries, toggleIn, weekdayHourMatrix, WEEKDAYS,
  type MoneyFilter,
} from '@/lib/sharedBoard'
import { hh } from './FilterBar'

// ─────────────────────────────────────────────────────────────────────────────
// גרפי זמן לחלוקת החגים: קצב הרישום (לפי יום או לפי שעה, מצטבר או לכל
// פרק זמן), עמודות לפי שעה ביממה ומפת חום של יום בשבוע מול שעה.
// כל עמודה ותא לחיצים, והלחיצה מוסיפה סינון לכל הדף.
// ─────────────────────────────────────────────────────────────────────────────

type Row = { registered_at?: string | null }
const num = (n: number) => Math.round(n || 0).toLocaleString('he-IL')
const vars = (o: Record<string, string>) => o as CSSProperties
const DAY = 86_400_000
const dShort = (t: number) => new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })

function Seg<T extends string>({ value, opts, set, label }: { value: T; opts: [T, string][]; set: (v: T) => void; label: string }) {
  return (
    <div className={s.seg} role="group" aria-label={label}>
      {opts.map(([k, l]) => <button key={k} type="button" className={value === k ? s.on : undefined} onClick={() => set(k)}>{l}</button>)}
    </div>
  )
}

export default function TimeCharts({ rows, filter: f, setFilter }: {
  rows: Row[]; filter: MoneyFilter; setFilter: (f: MoneyFilter) => void
}) {
  const days = useMemo(() => registrationSeries(rows), [rows])
  const hours = useMemo(() => hourlySeries(rows), [rows])
  const firstDay = useMemo(() => {
    const ts = rows.map(r => (r.registered_at ? Date.parse(r.registered_at) : NaN)).filter(t => !Number.isNaN(t))
    return ts.length ? new Date(dayKey(new Date(Math.min(...ts)).toISOString()) + 'T00:00:00').getTime() : null
  }, [rows])
  // יום אחד או שניים: ברירת המחדל היא לפי שעה, אחרת הגרף שטוח
  const [gran, setGran] = useState<'auto' | 'day' | 'hour'>('auto')
  const [mode, setMode] = useState<'cum' | 'per'>('cum')
  const g = gran === 'auto' ? (days.daily.length <= 2 ? 'hour' : 'day') : gran
  const series = g === 'hour' ? hours : days
  const values = mode === 'cum' ? series.cumulative : series.daily
  const maxV = Math.max(0, ...values)

  const byHour = useMemo(() => hourCounts(rows), [rows])
  const maxH = Math.max(0, ...byHour)
  const peak = byHour.indexOf(maxH)
  const mat = useMemo(() => weekdayHourMatrix(rows), [rows])
  const maxCell = Math.max(0, ...mat.flat())
  const dayTotals = mat.map(r => r.reduce((a, b) => a + b, 0))

  const at = (i: number) => (g === 'hour' ? (hours.start ?? 0) + i * 3_600_000 : (firstDay ?? 0) + i * DAY + DAY / 2)
  const pointLabel = (i: number) => {
    const t = at(i)
    return g === 'hour' ? `${dShort(t)} ${hh(new Date(t).getHours())}` : new Date(t).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' })
  }
  const pickPoint = (i: number) => {
    const t = new Date(at(i))
    const d = dayKey(t.toISOString())
    if (g === 'hour') setFilter({ ...f, from: d, to: d, hours: [t.getHours()] })
    else setFilter({ ...f, from: d, to: d })
  }
  const pickCell = (d: number, h: number) => {
    const same = f.weekdays.length === 1 && f.weekdays[0] === d && f.hours.length === 1 && f.hours[0] === h
    setFilter({ ...f, weekdays: same ? [] : [d], hours: same ? [] : [h] })
  }

  if (!values.length) return null
  const { line, area } = areaPaths(values)

  return (
    <div className={`${s.g} ${s.mb}`}>
      <section className={`${s.pn} ${s.s12}`}>
        <div className={s.ph}>
          <h3>קצב הרישום</h3>
          <div className={m.tools}>
            <Seg label="יחידת זמן" value={g} set={setGran} opts={[['day', 'לפי יום'], ['hour', 'לפי שעה']]} />
            <Seg label="תצוגה" value={mode} set={setMode} opts={[['cum', 'מצטבר'], ['per', g === 'hour' ? 'בכל שעה' : 'בכל יום']]} />
          </div>
        </div>
        <div className={s.bd}>
          {mode === 'cum' ? (
            <svg className={s.area} viewBox="0 0 600 170" preserveAspectRatio="none" role="img" aria-label="רישום מצטבר">
              <path d={area} fill="var(--area)" />
              <path d={line} fill="none" stroke="currentColor" strokeWidth={2.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
          ) : (
            <div className={m.bars} role="list">
              {values.map((v, i) => (
                <button key={i} type="button" role="listitem" className={m.bar} title={`${pointLabel(i)} · ${num(v)} נרשמים`}
                  aria-label={`${pointLabel(i)}: ${num(v)} נרשמים`} onClick={() => pickPoint(i)}>
                  <i style={vars({ '--h': `${Math.max(v ? 3 : 0, pctOf(v, maxV))}%` })} />
                </button>
              ))}
            </div>
          )}
          <div className={s.axis}>
            <span>{pointLabel(0)}</span>
            <span>{mode === 'cum' ? `סך הכול ${num(values[values.length - 1])}` : `שיא ${num(maxV)} ב${g === 'hour' ? 'שעה' : 'יום'}`}</span>
            <span>{pointLabel(values.length - 1)}</span>
          </div>
          {mode === 'per' && <p className={m.note}>לחיצה על עמודה מסננת את כל הדף ל{g === 'hour' ? 'שעה' : 'יום'} הזה</p>}
        </div>
      </section>

      <section className={`${s.pn} ${s.s6}`}>
        <div className={s.ph}><h3>לפי שעה ביממה</h3><span className={s.hint}>שיא: {hh(peak)} · {num(maxH)} נרשמים</span></div>
        <div className={s.bd}>
          <div className={m.hours}>
            {byHour.map((v, h) => {
              const on = f.hours.includes(h)
              return (
                <button key={h} type="button" aria-pressed={on} className={`${m.hc} ${on ? m.hOn : ''} ${h === peak && maxH ? m.hPeak : ''}`}
                  title={`${hh(h)} · ${num(v)} נרשמים`} aria-label={`${hh(h)}: ${num(v)} נרשמים`}
                  onClick={() => setFilter({ ...f, hours: toggleIn(f.hours, h).sort((a, b) => a - b) })}>
                  <i style={vars({ '--h': `${Math.max(v ? 3 : 0, pctOf(v, maxH))}%` })} />
                  <span>{h % 3 === 0 ? h : ''}</span>
                </button>
              )
            })}
          </div>
          <p className={m.note}>לחיצה על שעה מוסיפה אותה לסינון</p>
        </div>
      </section>

      <section className={`${s.pn} ${s.s6}`}>
        <div className={s.ph}><h3>מפת חום · יום ושעה</h3><span className={s.hint}>כהה יותר = יותר נרשמים</span></div>
        <div className={s.bd}>
          <div className={m.heat} role="grid" aria-label="נרשמים לפי יום בשבוע ושעה">
            {mat.map((row, d) => (
              <div key={d} className={m.hr} role="row">
                <button type="button" className={`${m.hd} ${f.weekdays.includes(d) ? m.hdOn : ''}`}
                  onClick={() => setFilter({ ...f, weekdays: toggleIn(f.weekdays, d) })} title={`יום ${WEEKDAYS[d]} · ${num(dayTotals[d])}`}>
                  {WEEKDAYS[d]}<em>{num(dayTotals[d])}</em>
                </button>
                <div className={m.cells}>
                  {row.map((v, h) => {
                    const on = f.weekdays.includes(d) && f.hours.includes(h)
                    return (
                      <button key={h} type="button" role="gridcell" className={`${m.cell} ${on ? m.cellOn : ''}`}
                        style={vars({ '--o': String(v ? 0.12 + 0.88 * (v / (maxCell || 1)) : 0) })}
                        title={`${WEEKDAYS[d]} ${hh(h)} · ${num(v)}`} aria-label={`${WEEKDAYS[d]} ${hh(h)}: ${num(v)} נרשמים`}
                        onClick={() => pickCell(d, h)} />
                    )
                  })}
                </div>
              </div>
            ))}
            <div className={m.hr} aria-hidden="true">
              <span className={m.hd} />
              <div className={`${m.cells} ${m.hx}`}>{Array.from({ length: 24 }, (_, h) => <span key={h}>{h % 6 === 0 ? h : ''}</span>)}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
