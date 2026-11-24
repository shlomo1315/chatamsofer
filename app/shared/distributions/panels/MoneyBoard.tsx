'use client'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import s from '../board.module.css'
import m from './money.module.css'
import { conicOf, countdownParts, moneyByCommunity, moneySummary, pctOf, type MoneyRow } from '@/lib/sharedBoard'

// ─────────────────────────────────────────────────────────────────────────────
// ראש דף חלוקות החגים: שעון עצר עד סגירת הרישום, ומחוני כסף ופילוח לפי
// קהילות. הסינון עצמו ב-FilterBar, והמחוונים מקבלים את השורות אחריו.
// ⚠️ השעון הוא תצוגה בלבד — הרישום נסגר רק במתג של החלוקה במסך הניהול.
// ─────────────────────────────────────────────────────────────────────────────

const cur = (n: number) => `${Math.round(n || 0).toLocaleString('he-IL')} ₪`
const num = (n: number) => Math.round(n || 0).toLocaleString('he-IL')
const pad = (n: number) => String(n).padStart(2, '0')
const vars = (o: Record<string, string>) => o as CSSProperties

const APPROVED_C = '#0f766e'
const PENDING_C = '#b08d3f'

export function Countdown({ closesAt }: { closesAt: string | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!closesAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [closesAt])
  const p = countdownParts(closesAt, now)
  if (!p || !closesAt) return null
  const when = new Date(closesAt).toLocaleString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

  if (p.done) {
    return (
      <section className={`${m.cd} ${m.closed} ${s.mb}`} aria-live="polite">
        <div>
          <span className={m.tag}>הרישום נסגר</span>
          <p>מועד הסגירה היה {when}</p>
        </div>
      </section>
    )
  }
  const units: [number, string][] = [[p.days, 'ימים'], [p.hours, 'שעות'], [p.minutes, 'דקות'], [p.seconds, 'שניות']]
  return (
    <section className={`${m.cd} ${s.mb}`} aria-label="זמן עד סגירת הרישום">
      <div>
        <h2>עד סגירת הרישום</h2>
        <p>נסגר ב{when}</p>
      </div>
      <div className={m.units} role="timer">
        {units.map(([v, l]) => (
          <div key={l} className={m.u}><b>{l === 'ימים' ? v : pad(v)}</b><span>{l}</span></div>
        ))}
      </div>
    </section>
  )
}

/** מחוני הכסף. `rows` כבר מסוננות בדף; לחיצה על קהילה מוסיפה אותה לסינון. */
export default function MoneyBoard({ rows, perFamily, picked = [], onPick }: {
  rows: MoneyRow[]; perFamily?: number | null; picked?: string[]; onPick?: (community: string) => void
}) {
  const sum = useMemo(() => moneySummary(rows, perFamily), [rows, perFamily])
  const comms = useMemo(() => moneyByCommunity(rows, perFamily), [rows, perFamily])
  const maxComm = Math.max(0, ...comms.map(c => c.value))
  const apPct = pctOf(sum.approved, sum.total)
  const pePct = pctOf(sum.pending, sum.total)

  return (
    <>
      <div className={`${s.g} ${s.k2} ${s.mb}`}>
        <div className={`${s.kpi} ${s.s3}`}>
          <span className={s.lb}>סך הכול לחלוקה</span>
          <b>{cur(sum.total)}</b>
          <span className={s.ft}>ל-<strong>{num(sum.families)}</strong> משפחות</span>
        </div>
        <div className={`${s.kpi} ${s.s3}`}>
          <span className={s.lb}>ממוצע למשפחה</span>
          <b>{cur(sum.avg)}</b>
          <span className={s.ft}>{perFamily ? <>סכום קבוע: <strong>{cur(perFamily)}</strong></> : 'בלי סכום קבוע'}</span>
        </div>
        <div className={`${s.kpi} ${s.s3}`}>
          <span className={s.lb}>מאושר</span>
          <b>{cur(sum.approved)}</b>
          <span className={s.ft}><strong>{Math.round(apPct)}%</strong> מהסכום</span>
          <span className={m.split}><i style={{ width: `${apPct}%`, background: APPROVED_C }} /></span>
        </div>
        <div className={`${s.kpi} ${s.s3}`}>
          <span className={s.lb}>ממתין לאישור</span>
          <b>{cur(sum.pending)}</b>
          <span className={s.ft}><strong>{Math.round(pePct)}%</strong> מהסכום</span>
          <span className={m.split}><i style={{ width: `${pePct}%`, background: PENDING_C }} /></span>
        </div>
      </div>

      <div className={`${s.g} ${s.mb}`}>
        <section className={`${s.pn} ${s.s8}`}>
          <div className={s.ph}><h3>כסף לפי קהילה</h3><span className={s.hint}>{num(comms.length)} קהילות</span></div>
          <div className={s.bd}>
            {comms.length ? (
              <div className={m.cmList}>
                {comms.map(c => {
                  const body = (
                    <>
                      <span className={m.l} title={c.label}>{c.label}</span>
                      <span className={m.t}><i style={vars({ '--w': `${pctOf(c.value, maxComm)}%` })} /></span>
                      <b>{cur(c.value)}<small>{num(c.count)} משפחות</small></b>
                    </>
                  )
                  const on = picked.includes(c.label)
                  return onPick ? (
                    <button key={c.label} type="button" aria-pressed={on} className={`${m.cm} ${m.pick} ${on ? m.on : ''}`}
                      style={{ width: '100%', textAlign: 'start' }} onClick={() => onPick(c.label)}>{body}</button>
                  ) : <div key={c.label} className={m.cm}>{body}</div>
                })}
              </div>
            ) : <p className={s.hint}>אין משפחות שמתאימות לסינון</p>}
          </div>
        </section>
        <section className={`${s.pn} ${s.s4}`}>
          <div className={s.ph}><h3>סטטוס הכסף</h3></div>
          <div className={`${s.bd} ${s.dg}`}>
            <div className={s.donut} style={{ background: conicOf([{ pct: apPct, color: APPROVED_C }, { pct: pePct, color: PENDING_C }]) }} />
            <div className={s.leg} style={{ width: '100%' }}>
              <div><i style={{ background: APPROVED_C }} /><span>מאושר</span><b>{cur(sum.approved)}</b></div>
              <div><i style={{ background: PENDING_C }} /><span>ממתין</span><b>{cur(sum.pending)}</b></div>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
