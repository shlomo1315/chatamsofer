'use client'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import s from '../board.module.css'
import m from './money.module.css'
import {
  channelShares, conicOf, countdownParts, EMPTY_FILTER, filterMoneyRows, moneyByCommunity, moneySummary, pctOf,
  type MoneyFilter, type MoneyRow,
} from '@/lib/sharedBoard'

// ─────────────────────────────────────────────────────────────────────────────
// ראש דף חלוקות החגים: שעון עצר עד סגירת הרישום, סינון מתקדם, ומחוני כסף
// ופילוח לפי קהילות. כל המחוונים מחושבים על השורות אחרי הסינון.
// ⚠️ השעון הוא תצוגה בלבד — הרישום נסגר רק במתג של החלוקה במסך הניהול.
// ─────────────────────────────────────────────────────────────────────────────

const cur = (n: number) => `${Math.round(n || 0).toLocaleString('he-IL')} ₪`
const num = (n: number) => Math.round(n || 0).toLocaleString('he-IL')
const pad = (n: number) => String(n).padStart(2, '0')
const vars = (o: Record<string, string>) => o as CSSProperties

const STATUS_OPTS: [string, string][] = [['', 'הכול'], ['approved', 'אושרו'], ['pending', 'ממתינים'], ['rejected', 'נדחו']]
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

export default function MoneyBoard({ rows, perFamily }: { rows: MoneyRow[]; perFamily?: number | null }) {
  const [f, setF] = useState<MoneyFilter>(EMPTY_FILTER)
  const set = (p: Partial<MoneyFilter>) => setF(x => ({ ...x, ...p }))
  const active = JSON.stringify(f) !== JSON.stringify(EMPTY_FILTER)

  const allComms = useMemo(() => moneyByCommunity(rows, perFamily), [rows, perFamily])
  const channels = useMemo(() => channelShares(rows).filter(c => c.count > 0), [rows])
  const shown = useMemo(() => filterMoneyRows(rows, f, perFamily), [rows, f, perFamily])
  const sum = useMemo(() => moneySummary(shown, perFamily), [shown, perFamily])
  const comms = useMemo(() => moneyByCommunity(shown, perFamily), [shown, perFamily])
  const maxComm = Math.max(0, ...comms.map(c => c.value))
  const apPct = pctOf(sum.approved, sum.total)
  const pePct = pctOf(sum.pending, sum.total)

  const toggleComm = (c: string) =>
    set({ communities: f.communities.includes(c) ? f.communities.filter(x => x !== c) : [...f.communities, c] })
  const amountInput = (v: string) => (v === '' ? null : Math.max(0, Number(v) || 0))

  return (
    <>
      <section className={`${s.pn} ${s.mb}`}>
        <div className={s.ph}>
          <h3>סינון מתקדם</h3>
          {active && <button type="button" className={m.reset} onClick={() => setF(EMPTY_FILTER)}>ניקוי הסינון</button>}
        </div>
        <div className={`${s.bd} ${m.fl}`}>
          <div className={m.chips} role="group" aria-label="קהילות">
            {allComms.map(c => {
              const on = f.communities.includes(c.label)
              return (
                <button key={c.label} type="button" aria-pressed={on} className={`${m.chip} ${on ? m.chipOn : ''}`} onClick={() => toggleComm(c.label)}>
                  {c.label}<em>{num(c.count)}</em>
                </button>
              )
            })}
          </div>
          <div className={m.row}>
            <div className={m.fld}>
              <span>סטטוס</span>
              <div className={s.seg} role="group" aria-label="סטטוס אישור">
                {STATUS_OPTS.map(([k, l]) => (
                  <button key={k} type="button" className={f.status === k ? s.on : undefined} onClick={() => set({ status: k })}>{l}</button>
                ))}
              </div>
            </div>
            <label className={m.fld}>
              <span>ערוץ</span>
              <select value={f.channel} onChange={e => set({ channel: e.target.value })}>
                <option value="">כל הערוצים</option>
                {channels.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <label className={m.fld}>
              <span>נרשמו מתאריך</span>
              <input type="date" value={f.from} max={f.to || undefined} onChange={e => set({ from: e.target.value })} />
            </label>
            <label className={m.fld}>
              <span>עד תאריך</span>
              <input type="date" value={f.to} min={f.from || undefined} onChange={e => set({ to: e.target.value })} />
            </label>
            <label className={m.fld}>
              <span>סכום מ-₪</span>
              <input type="number" inputMode="numeric" min={0} value={f.minAmount ?? ''} onChange={e => set({ minAmount: amountInput(e.target.value) })} />
            </label>
            <label className={m.fld}>
              <span>עד ₪</span>
              <input type="number" inputMode="numeric" min={0} value={f.maxAmount ?? ''} onChange={e => set({ maxAmount: amountInput(e.target.value) })} />
            </label>
          </div>
          <div className={m.meta}>
            <span>מוצגות <strong>{num(shown.length)}</strong> מתוך {num(rows.length)} משפחות</span>
            {!perFamily && <span>לחלוקה לא הוגדר סכום קבוע למשפחה, ולכן נספר רק סכום שנקבע לנרשם</span>}
          </div>
        </div>
      </section>

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
                {comms.map(c => (
                  <div key={c.label} className={m.cm}>
                    <span className={m.l} title={c.label}>{c.label}</span>
                    <span className={m.t}><i style={vars({ '--w': `${pctOf(c.value, maxComm)}%` })} /></span>
                    <b>{cur(c.value)}<small>{num(c.count)} משפחות</small></b>
                  </div>
                ))}
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
