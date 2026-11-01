'use client'
import { useState, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export interface TabDef {
  key: string
  label: string
  icon?: ReactNode
  accent?: 'indigo' | 'emerald' | 'violet' | 'amber' | 'sky' | 'rose'
  content: ReactNode
}

// לשוניות v4: צבע אחד לכולן (נייבי פעיל, בז' לא פעיל). שדה accent נשמר לתאימות בלבד.
const TAB = { active: 'bg-navy text-white border-navy', idle: 'bg-paper text-ink-soft border-line hover:bg-sand hover:text-navy' }

export default function Tabs({ tabs, param = 'tab' }: { tabs: TabDef[]; param?: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // הלשונית הפעילה נשמרת ב-URL (?tab=) כדי שחזרה אחורה תחזיר לאותה לשונית
  const fromUrl = searchParams.get(param)
  const [active, setActive] = useState(tabs.find(t => t.key === fromUrl)?.key ?? tabs[0]?.key)
  const current = tabs.find(t => t.key === active) ?? tabs[0]

  const select = (key: string) => {
    setActive(key)
    // עדכון ה-URL בלי ניווט/רענון שרת (מיידי) — אחרת כל החלפת לשונית מרעננת את הדף.
    const sp = new URLSearchParams(searchParams.toString())
    sp.set(param, key)
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `${pathname}?${sp.toString()}`)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* שורה אחת. הדף רחב מספיק (max-w-screen-2xl) כדי להכיל את כל הטאבים —
          הבעיה הקודמת הייתה max-w-5xl על הדף עצמו, שחנק אותם.
          flex-wrap נשאר כרשת ביטחון למסך צר, במקום גלילה עם פס מוסתר שגרמה
          לטאב האחרון להיראות חתוך בלי שום רמז.
          py-1/-my-1 נותנים מקום ל-ring של הפוקוס. */}
      <div className="-mx-1 -my-1 flex flex-wrap gap-2 px-1 py-1">
        {tabs.map(t => {
          const a = TAB
          const isActive = t.key === active
          return (
            <button key={t.key} onClick={() => select(t.key)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-[9px] text-sm font-semibold border transition-colors ${isActive ? a.active : a.idle}`}>
              {t.icon}{t.label}
            </button>
          )
        })}
      </div>
      <div>{current?.content}</div>
    </div>
  )
}
