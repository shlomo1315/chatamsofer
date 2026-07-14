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

const ACCENTS: Record<string, { active: string; idle: string }> = {
  indigo:  { active: 'bg-indigo-600 text-white border-indigo-600',   idle: 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100' },
  emerald: { active: 'bg-emerald-600 text-white border-emerald-600', idle: 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100' },
  violet:  { active: 'bg-violet-600 text-white border-violet-600',   idle: 'bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100' },
  amber:   { active: 'bg-amber-500 text-white border-amber-500',     idle: 'bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100' },
  sky:     { active: 'bg-sky-600 text-white border-sky-600',         idle: 'bg-sky-50 text-sky-700 border-sky-100 hover:bg-sky-100' },
  rose:    { active: 'bg-rose-600 text-white border-rose-600',       idle: 'bg-rose-50 text-rose-700 border-rose-100 hover:bg-rose-100' },
}

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
      {/* flex-wrap — הטאבים עוברים לשורה הבאה כשאין מקום.
          קודם הייתה כאן גלילה אופקית עם פס גלילה מוסתר, ואז הטאב האחרון
          פשוט נראה חתוך בקצה בלי שום רמז שאפשר לגלול אליו.
          py-1/-my-1 נותנים מקום ל-ring של הפוקוס. */}
      <div className="-mx-1 -my-1 flex flex-wrap gap-2 px-1 py-1">
        {tabs.map(t => {
          const a = ACCENTS[t.accent ?? 'indigo']
          const isActive = t.key === active
          return (
            <button key={t.key} onClick={() => select(t.key)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors ${isActive ? a.active : a.idle}`}>
              {t.icon}{t.label}
            </button>
          )
        })}
      </div>
      <div>{current?.content}</div>
    </div>
  )
}
