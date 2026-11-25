'use client'
import type { ComponentType } from 'react'

export interface StatItem<K extends string = string> {
  key: K
  label: string
  count: number
  icon?: ComponentType<{ size?: number; className?: string }>
}

interface StatStripProps<K extends string> {
  items: StatItem<K>[]
  active: K
  onSelect: (key: K) => void
  /**
   * הסך שממנו מחושב האחוז. כשניתן — כל קובייה מציגה אחוז ופס יחסי דק
   * (חוץ מהקובייה שהיא הסך עצמו). בלעדיו המראה הקודם נשמר.
   */
  total?: number
}

const pct = (count: number, total: number) => {
  const p = (count / total) * 100
  return p > 0 && p < 10 ? p.toFixed(1) : String(Math.round(p))
}

// שורת מונים מסננת אחידה לכל מחלקות האדמין (v4). לחיצה על הפעיל מבטלת סינון.
export default function StatStrip<K extends string>({ items, active, onSelect, total }: StatStripProps<K>) {
  const cols = items.length > 6 ? 'lg:grid-cols-7' : items.length > 5 ? 'lg:grid-cols-6' : items.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
  const withShare = !!total && total > 0
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 ${cols} gap-2.5`}>
      {items.map((it, idx) => {
        const Icon = it.icon
        const isActive = active === it.key
        const isTotal = withShare && it.count === total && idx === 0
        // ⚠️ מונה שאינו תת-קבוצה של הסך (גדול ממנו) — בלי אחוז, הוא היה מטעה.
        const share = withShare && !isTotal && it.count <= total! ? (it.count / total!) * 100 : null
        return (
          <button key={it.key} type="button" title={it.label} onClick={() => onSelect(it.key)}
            className={`flex flex-col gap-1 rounded-[12px] border bg-paper px-4 py-3.5 text-right transition-colors ${
              withShare && idx === 0 && items.length % 2 === 1 ? 'col-span-2 sm:col-span-1' : ''} ${
              isActive ? 'border-navy ring-1 ring-navy' : 'border-line hover:border-line-strong'}`}>
            <span className="flex items-center gap-2 text-sm font-medium text-ink-soft">
              {Icon && <Icon size={15} className={isActive ? 'text-gold' : 'text-ink-faint'} />}
              <span className="truncate">{it.label}</span>
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-[30px] font-extrabold text-navy tabular-nums leading-tight">{it.count.toLocaleString('he-IL')}</span>
              {share !== null && <span className="text-xs font-medium text-ink-faint tabular-nums">{pct(it.count, total!)}%</span>}
            </span>
            {withShare && (
              <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-line" aria-hidden>
                <span className={`block h-full rounded-full ${isActive ? 'bg-gold' : 'bg-navy/25'}`}
                  style={{ width: `${share ?? 100}%` }} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
