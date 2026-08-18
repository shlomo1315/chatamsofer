'use client'
import { ArrowRight } from 'lucide-react'

// כותרת מחלקה + יציאה לדף הראשי. משותפת לשלוש המחלקות, כדי שהיציאה תהיה
// באותו מקום בכל אחת ולא "תזוז" בין מסכים.
export function DeptHeader({ title, subtitle, ink, onBack }: {
  title: string; subtitle: string; ink: string; onBack: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-2xl font-extrabold text-[#3a3630]">{title}</h2>
        <p className="text-[12px] text-[#8a7a56] mt-0.5">{subtitle}</p>
      </div>
      {/* ⚠️ החץ פונה ימינה — כיוון החזרה בעברית. */}
      <button type="button" onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[#e8dfc9] bg-white px-4 py-2.5 text-[12px] font-bold text-[#6b5d3e] transition hover:border-[#d9b95c] hover:text-[#8a6a24]">
        <ArrowRight size={14} /> חזרה לדף הראשי
      </button>
      <span className="h-0.5 w-full rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${ink}33, transparent)` }} />
    </div>
  )
}

/** קוביית מספר. ⚠️ tone נושא משמעות ולא סתם צבע — ראה שימושים. */
export function Stat({ label, value, sub, ink = '#3a3630', tint = '#faf7ef' }: {
  label: string; value: string; sub?: string; ink?: string; tint?: string
}) {
  return (
    <div className="rounded-2xl border border-[#eee6d3] bg-white px-4 py-3.5">
      <p className="text-[11px] font-bold text-[#a08a5a]">{label}</p>
      <p className="mt-1 text-2xl font-extrabold leading-none ltr-num" style={{ color: ink }}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-[#8a7a56]">{sub}</p>}
      <span className="sr-only">{tint}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// גרף פסים אופקי.
//
// ⚠️ אופקי ולא עמודות: התוויות בעברית ארוכות, ובעמודות הן נחתכות או
// מסתובבות באלכסון.
//
// ⚠️ הסקאלה יחסית לגדול ביותר ולא לסך הכל — רוב הערכים קטנים, ופס באחוז
// מהסך היה קו בלתי נראה לכולם.
//
// ⚠️ בלי ספריית גרפים: שלוש שורות CSS עושות את אותה עבודה, בלי 100KB
// באנדל ובלי סגנון שמתנגש בעיצוב הדף.
// ─────────────────────────────────────────────────────────────────────────────
export function BarList({ items, ink, fmt, empty = 'אין נתונים', max: maxItems = 12 }: {
  items: { label: string; value: number; sub?: string }[]
  ink: string
  fmt?: (n: number) => string
  empty?: string
  max?: number
}) {
  if (!items.length) return <p className="py-8 text-center text-sm text-[#a08a5a]">{empty}</p>
  const shown = items.slice(0, maxItems)
  const max = Math.max(...shown.map(i => i.value), 1)
  const f = fmt ?? ((n: number) => n.toLocaleString('he-IL'))

  return (
    <div className="flex flex-col gap-1.5">
      {shown.map(i => (
        <div key={i.label} className="grid grid-cols-[minmax(90px,150px)_1fr_auto] items-center gap-3">
          <span className="truncate text-[12px] text-[#6b5d3e]" title={i.label}>{i.label}</span>
          <span className="h-2 w-full overflow-hidden rounded-full bg-[#f4efe2]">
            <span className="block h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max((i.value / max) * 100, 2)}%`, background: ink }} />
          </span>
          <span className="text-right">
            <span className="block text-[12px] font-bold text-[#3a3630] ltr-num">{f(i.value)}</span>
            {i.sub && <span className="block text-[10px] text-[#a08a5a] ltr-num">{i.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

/** כרטיס-מקטע עם כותרת. */
export function Section({ title, hint, children }: {
  title: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[#e8dfc9] bg-white overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#f0e9d8] px-5 py-3">
        <h3 className="text-[13px] font-extrabold text-[#3a3630]">{title}</h3>
        {hint && <span className="text-[11px] text-[#a08a5a]">{hint}</span>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}
