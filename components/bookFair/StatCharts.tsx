'use client'
import { fmtAgorot } from '@/lib/bookFairPricing'

// ─────────────────────────────────────────────────────────────────────────────
// רכיבי גרפים קלים ליריד — משותפים ללשונית "דוכן היריד" וללוח המנהל.
//
// ⚠️ CSS ולא ספריית גרפים: אותו מראה בדיוק כמו במוקאפ שאושר, בלי
// משקל של ספרייה, ועובד ברוחב טלפון בלי גלילה לרוחב (כלל הלינט).
// ─────────────────────────────────────────────────────────────────────────────

export const CH_COLORS = { web: '#1E3A8A', phone: '#E09F3E', fair: '#2A9D8F' } as const

export function Card({ title, subtitle, children, className = '' }: {
  title?: string; subtitle?: string; children: React.ReactNode; className?: string
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-[#E6E1D6] bg-white p-5 sm:p-6 ${className}`}>
      {title && <h2 className="text-xl font-bold text-[#14213D]">{title}</h2>}
      {subtitle && <p className="mt-0.5 text-sm text-[#5B6475]">{subtitle}</p>}
      <div className={title || subtitle ? 'mt-4' : ''}>{children}</div>
    </section>
  )
}

export function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-[#E6E1D6] bg-white px-5 py-4">
      <span className="text-sm font-semibold text-[#5B6475]">{label}</span>
      <span className="break-words text-3xl font-extrabold tabular-nums tracking-tight text-[#14213D] sm:text-4xl">{value}</span>
      {sub && <span className="text-[13px] text-[#5B6475]">{sub}</span>}
    </div>
  )
}

/** רשימת פסים אופקיים: שם · פס · ערך. */
export function BarList({ rows, color = '#14213D', money = true, empty = 'אין נתונים' }: {
  rows: { label: string; value: number; extra?: string }[]
  color?: string; money?: boolean; empty?: string
}) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-[#5B6475]">{empty}</p>
  const max = Math.max(...rows.map(r => r.value), 1)
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <li key={r.label + i} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-3">
          <span className="break-words text-[15px] font-semibold text-[#14213D]">{r.label}</span>
          <span className="h-3 overflow-hidden rounded-full bg-[#F0ECE3]">
            <span className="block h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: i === 0 ? color : `${color}CC` }} />
          </span>
          <span className="whitespace-nowrap text-sm tabular-nums" dir="ltr">
            <b className="text-[15px] text-[#14213D]">{money ? fmtAgorot(r.value) : r.value.toLocaleString('en-US')}</b>
            {r.extra && <span className="text-[#5B6475]"> · {r.extra}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** הזמנות לפי שעה ביום (0–23). */
export function HourBars({ hours }: { hours: number[] }) {
  const max = Math.max(...hours, 1)
  const peak = hours.indexOf(Math.max(...hours))
  return (
    <div dir="ltr">
      <div className="flex h-40 items-end gap-[3px] border-b border-[#E6E1D6]">
        {hours.map((n, h) => (
          <div key={h} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            {n > 0 && <span className="text-[10px] font-bold text-[#5B6475]">{n}</span>}
            <span
              className="w-full rounded-t"
              style={{ height: n ? `${Math.max((n / max) * 82, 3)}%` : '2px', background: n && h === peak ? '#B8862B' : n ? '#14213D' : '#E6E1D6' }}
              title={`${String(h).padStart(2, '0')}:00 — ${n}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {hours.map((_, h) => (
          <span key={h} className="flex-1 text-center text-[10px] text-[#5B6475]">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>
        ))}
      </div>
    </div>
  )
}

/** פס מפוצל לשני חלקים או יותר, עם מקרא. */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string; sub?: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div>
      <div className="flex h-4 gap-[3px] overflow-hidden rounded-full bg-[#F0ECE3]">
        {total > 0 && parts.filter(p => p.value > 0).map(p => (
          <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {parts.map(p => (
          <li key={p.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="font-semibold text-[#14213D]">{p.label}</span>
            <span className="tabular-nums text-[#5B6475]">
              {total ? Math.round((p.value / total) * 100) : 0}%{p.sub ? ` · ${p.sub}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** כפתורי בחירה (pills). */
export function Pills<T extends string>({ value, options, onChange, dark = false }: {
  value: T; options: { id: T; label: string; color?: string }[]; onChange: (v: T) => void; dark?: boolean
}) {
  return (
    <div className={`flex flex-wrap gap-0.5 rounded-xl p-1 ${dark ? 'bg-white/10' : 'bg-[#141210]/5'}`}>
      {options.map(o => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={on}
            className={`flex min-h-[40px] items-center gap-2 rounded-[9px] px-3.5 text-sm font-semibold transition ${
              on ? (dark ? 'bg-[#F4F1EA] text-[#14213D]' : 'bg-white text-[#14213D] shadow-sm')
                 : (dark ? 'text-[#E4E8F0] hover:bg-white/10' : 'text-[#5B6475] hover:bg-white/60')}`}
          >
            {o.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
