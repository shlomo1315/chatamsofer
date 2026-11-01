'use client'

import { Search } from 'lucide-react'
import type { ReactNode } from 'react'

// שדה חיפוש אחיד. בשורת כלים של ListTable משתמשים בו ישירות (inline),
// ובמסכים בלי טבלה עוטפים אותו בכרטיס (card) עם מסננים נוספים כ-children.
export function SearchBar({
  value,
  onChange,
  placeholder = 'חיפוש חופשי…',
  children,
  card = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  children?: ReactNode
  card?: boolean
}) {
  const field = (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line-strong bg-white py-2 pr-9 pl-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-gold"
      />
    </div>
  )
  if (!card) return <>{field}{children}</>
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper p-3">
      {field}
      {children}
    </div>
  )
}
