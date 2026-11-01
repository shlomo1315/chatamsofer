'use client'

import { Search } from 'lucide-react'
import type { ReactNode } from 'react'

// שורת חיפוש ומסננים אחידה לכל מחלקה. מסננים נוספים (בחירות, מיון) מועברים כ-children.
export function SearchBar({
  value,
  onChange,
  placeholder = 'חיפוש...',
  children,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper p-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-line-strong bg-white py-2 pr-9 pl-3 text-sm text-ink outline-none focus:border-gold"
        />
      </div>
      {children}
    </div>
  )
}
