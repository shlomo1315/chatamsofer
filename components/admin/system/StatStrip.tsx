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
}

// שורת מונים מסננת אחידה לכל מחלקות האדמין (v4). לחיצה על הפעיל מבטלת סינון.
export default function StatStrip<K extends string>({ items, active, onSelect }: StatStripProps<K>) {
  const cols = items.length > 5 ? 'lg:grid-cols-6' : items.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 ${cols} gap-2.5`}>
      {items.map(it => {
        const Icon = it.icon
        const isActive = active === it.key
        return (
          <button key={it.key} type="button" title={it.label} onClick={() => onSelect(it.key)}
            className={`flex flex-col gap-1 rounded-[12px] border bg-paper px-4 py-3.5 text-right transition-colors ${
              isActive ? 'border-navy ring-1 ring-navy' : 'border-line hover:border-line-strong'}`}>
            <span className="flex items-center gap-2 text-sm font-medium text-ink-soft">
              {Icon && <Icon size={15} className={isActive ? 'text-gold' : 'text-ink-faint'} />}
              <span className="truncate">{it.label}</span>
            </span>
            <span className="text-[30px] font-extrabold text-navy tabular-nums leading-tight">{it.count.toLocaleString('he-IL')}</span>
          </button>
        )
      })}
    </div>
  )
}
