'use client'
import { useMemo, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import s from '../board.module.css'
import m from './money.module.css'
import {
  channelShares, cityOf, communityOf, EMPTY_FILTER, isFiltered, kidsBucketOf, KIDS_BUCKETS, toggleIn, WEEKDAYS,
  type MoneyFilter, type MoneyRow,
} from '@/lib/sharedBoard'

// ─────────────────────────────────────────────────────────────────────────────
// סינון מתקדם לכל דף חלוקות החגים. הסינון חי בדף, וכל המספרים, הגרפים,
// הטבלה והפילוחים מחושבים על השורות שעברו אותו. לחיצה על עמודה או פרוסה
// בגרפים מוסיפה כאן סינון, והוא מופיע כתגית שאפשר להסיר.
// ─────────────────────────────────────────────────────────────────────────────

const num = (n: number) => Math.round(n || 0).toLocaleString('he-IL')
export const hh = (h: number) => `${String(h).padStart(2, '0')}:00`
const STATUS_OPTS: [string, string][] = [['', 'הכול'], ['approved', 'אושרו'], ['pending', 'ממתינים'], ['rejected', 'נדחו']]
const STATUS_LABEL: Record<string, string> = { approved: 'אושרו', pending: 'ממתינים', rejected: 'נדחו' }

/** השעות מ-from עד to כולל, גם מעבר לחצות (22 עד 2). */
const hourRange = (from: number, to: number) => {
  const out: number[] = []
  for (let h = from; ; h = (h + 1) % 24) { out.push(h); if (h === to || out.length === 24) break }
  return out
}

/** תיאור קצר של שעות נבחרות: טווח רציף או רשימה. */
export function hoursLabel(hours: number[]) {
  if (hours.length === 1) return `${hh(hours[0])}–${hh((hours[0] + 1) % 24)}`
  const range = hourRange(hours[0], hours[hours.length - 1])
  if (range.length === hours.length && range.every((h, i) => h === hours[i])) return `${hh(hours[0])}–${hh((hours[hours.length - 1] + 1) % 24)}`
  return hours.map(hh).join(', ')
}

const countBy = (rows: MoneyRow[], key: (r: MoneyRow) => string) => {
  const c = new Map<string, number>()
  for (const r of rows) { const k = key(r); if (k) c.set(k, (c.get(k) ?? 0) + 1) }
  return [...c.entries()].sort((a, b) => b[1] - a[1])
}

function Chips({ label, items, on, toggle }: {
  label: string; items: [string, number | null][]; on: string[]; toggle: (v: string) => void
}) {
  return (
    <div className={m.grp}>
      <span className={m.gl}>{label}</span>
      <div className={m.chips} role="group" aria-label={label}>
        {items.map(([v, n]) => {
          const sel = on.includes(v)
          return (
            <button key={v} type="button" aria-pressed={sel} className={`${m.chip} ${sel ? m.chipOn : ''}`} onClick={() => toggle(v)}>
              <bdi>{v}</bdi>{n != null && <em>{num(n)}</em>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function FilterBar({ rows, shown, filter: f, setFilter, perFamily }: {
  rows: MoneyRow[]; shown: number; filter: MoneyFilter; setFilter: (f: MoneyFilter) => void; perFamily?: number | null
}) {
  const [open, setOpen] = useState(true)
  const set = (p: Partial<MoneyFilter>) => setFilter({ ...f, ...p })

  const comms = useMemo(() => countBy(rows, communityOf), [rows])
  const cities = useMemo(() => countBy(rows, cityOf), [rows])
  const kids = useMemo(() => {
    const c = countBy(rows, r => kidsBucketOf(r.beneficiary?.children_count) ?? '')
    return KIDS_BUCKETS.map(k => [k, c.find(x => x[0] === k)?.[1] ?? 0] as [string, number])
  }, [rows])
  const channels = useMemo(() => channelShares(rows).filter(c => c.count > 0), [rows])
  const noCity = cities.length === 0
  const noKids = kids.every(k => k[1] === 0)
  const noAmount = !perFamily && !rows.some(r => Number(r.amount ?? 0) > 0)

  // תגיות הסינון הפעיל, כל אחת עם מה שמסיר אותה
  const tags: [string, Partial<MoneyFilter>][] = [
    ...f.communities.map(c => [`קהילה: ${c}`, { communities: f.communities.filter(x => x !== c) }] as [string, Partial<MoneyFilter>]),
    ...f.cities.map(c => [`עיר: ${c}`, { cities: f.cities.filter(x => x !== c) }] as [string, Partial<MoneyFilter>]),
    ...f.kids.map(k => [`ילדים: ${k}`, { kids: f.kids.filter(x => x !== k) }] as [string, Partial<MoneyFilter>]),
    ...f.weekdays.map(d => [`יום ${WEEKDAYS[d]}`, { weekdays: f.weekdays.filter(x => x !== d) }] as [string, Partial<MoneyFilter>]),
  ]
  if (f.hours.length) tags.push([`שעות: ${hoursLabel(f.hours)}`, { hours: [] }])
  if (f.status) tags.push([`סטטוס: ${STATUS_LABEL[f.status] ?? f.status}`, { status: '' }])
  if (f.channel) tags.push([`ערוץ: ${channels.find(c => c.key === f.channel)?.label ?? f.channel}`, { channel: '' }])
  if (f.from || f.to) tags.push([`תאריכים: ${f.from || '…'} עד ${f.to || '…'}`, { from: '', to: '' }])
  if (f.minAmount != null || f.maxAmount != null) tags.push([`סכום: ${f.minAmount ?? 0}–${f.maxAmount ?? '∞'} ₪`, { minAmount: null, maxAmount: null }])

  const amountInput = (v: string) => (v === '' ? null : Math.max(0, Number(v) || 0))
  const hourSel = (which: 'from' | 'to', v: string) => {
    if (v === '') return set({ hours: [] })
    const h = Number(v)
    const from = which === 'from' ? h : f.hours[0] ?? 0
    const to = which === 'to' ? h : f.hours[f.hours.length - 1] ?? 23
    set({ hours: hourRange(from, to) })
  }

  return (
    <section className={`${s.pn} ${s.mb} ${m.fb}`} aria-label="סינון מתקדם">
      <div className={m.fh}>
        <button type="button" className={m.ft} aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span>סינון מתקדם</span>
          <em>{open ? 'הסתרה' : 'הצגה'}</em>
        </button>
        <span className={m.cnt}>מוצגים <strong>{num(shown)}</strong> מתוך {num(rows.length)} נרשמים</span>
        {isFiltered(f) && <button type="button" className={m.reset} onClick={() => setFilter(EMPTY_FILTER)}>נקה הכול</button>}
      </div>

      {tags.length > 0 && (
        <div className={m.tags}>
          {tags.map(([label, patch]) => (
            <button key={label} type="button" className={m.tg} onClick={() => set(patch)} aria-label={`הסרת ${label}`}>
              {label}<X size={13} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className={`${s.bd} ${m.fl}`}>
          <Chips label="קהילה" items={comms} on={f.communities} toggle={v => set({ communities: toggleIn(f.communities, v) })} />
          {!noCity && <Chips label="עיר" items={cities} on={f.cities} toggle={v => set({ cities: toggleIn(f.cities, v) })} />}
          <div className={m.two}>
            {!noKids && <Chips label="מספר ילדים" items={kids} on={f.kids} toggle={v => set({ kids: toggleIn(f.kids, v) })} />}
            <Chips label="יום בשבוע" items={WEEKDAYS.map(d => [d, null])} on={f.weekdays.map(d => WEEKDAYS[d])}
              toggle={v => set({ weekdays: toggleIn(f.weekdays, WEEKDAYS.indexOf(v)) })} />
          </div>
          <div className={m.row}>
            <div className={m.fld}>
              <span>סטטוס אישור</span>
              <div className={s.seg} role="group" aria-label="סטטוס אישור">
                {STATUS_OPTS.map(([k, l]) => (
                  <button key={k} type="button" className={f.status === k ? s.on : undefined} onClick={() => set({ status: k })}>{l}</button>
                ))}
              </div>
            </div>
            <label className={m.fld}>
              <span>ערוץ רישום</span>
              <select value={f.channel} onChange={e => set({ channel: e.target.value })}>
                <option value="">כל הערוצים</option>
                {channels.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <label className={m.fld}>
              <span>מתאריך</span>
              <input type="date" value={f.from} max={f.to || undefined} onChange={e => set({ from: e.target.value })} />
            </label>
            <label className={m.fld}>
              <span>עד תאריך</span>
              <input type="date" value={f.to} min={f.from || undefined} onChange={e => set({ to: e.target.value })} />
            </label>
            <label className={m.fld}>
              <span>משעה</span>
              <select value={f.hours.length ? f.hours[0] : ''} onChange={e => hourSel('from', e.target.value)}>
                <option value="">כל היום</option>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
              </select>
            </label>
            <label className={m.fld}>
              <span>עד שעה</span>
              <select value={f.hours.length ? f.hours[f.hours.length - 1] : ''} onChange={e => hourSel('to', e.target.value)}>
                <option value="">כל היום</option>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh((h + 1) % 24)}</option>)}
              </select>
            </label>
            {!noAmount && (
              <>
                <label className={m.fld}>
                  <span>סכום מ-₪</span>
                  <input type="number" inputMode="numeric" min={0} value={f.minAmount ?? ''} onChange={e => set({ minAmount: amountInput(e.target.value) })} />
                </label>
                <label className={m.fld}>
                  <span>עד ₪</span>
                  <input type="number" inputMode="numeric" min={0} value={f.maxAmount ?? ''} onChange={e => set({ maxAmount: amountInput(e.target.value) })} />
                </label>
              </>
            )}
          </div>
          {(noCity || noKids || noAmount) && (
            <p className={m.meta}>
              {[noCity && 'אין נתוני עיר', noKids && 'אין נתוני מספר ילדים', noAmount && 'לחלוקה לא הוגדר סכום, ולכן אין סינון לפי סכום']
                .filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
