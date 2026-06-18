'use client'

export type SortMode = 'alpha' | 'newest' | 'oldest'

const OPTS: { key: SortMode; label: string }[] = [
  { key: 'alpha',  label: 'א-ב' },
  { key: 'newest', label: 'חדש ביותר' },
  { key: 'oldest', label: 'ישן ביותר' },
]

export function applySortMode<T>(
  arr: T[],
  mode: SortMode,
  getName: (item: T) => string,
  getDate: (item: T) => string | undefined | null,
): T[] {
  return [...arr].sort((a, b) => {
    if (mode === 'alpha') {
      return getName(a).localeCompare(getName(b), 'he', { sensitivity: 'base' })
    }
    const da = getDate(a) ? new Date(getDate(a)!).getTime() : 0
    const db = getDate(b) ? new Date(getDate(b)!).getTime() : 0
    return mode === 'newest' ? db - da : da - db
  })
}

export default function SortButtons({ value, onChange }: {
  value: SortMode
  onChange: (v: SortMode) => void
}) {
  return (
    <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 flex-shrink-0">
      {OPTS.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            value === o.key
              ? 'bg-white text-slate-800 shadow-sm shadow-slate-200'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
