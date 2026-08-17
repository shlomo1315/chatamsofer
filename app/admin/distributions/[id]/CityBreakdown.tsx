'use client'
import { useState } from 'react'
import { MapPin, ChevronDown } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// פילוח הנרשמים לפי עיר — מהגבוה לנמוך.
//
// ⚠️ עדין במכוון (דרישה מפורשת: "משהו מאוד מאוד עדין וטוב, שלא יתפוס את כל
// העין"). לכן: פסים אופקיים דקים בגוון אחד, בלי צבעוניות מרובה, בלי צירים
// ובלי רשת. הגרף הוא רמז לפרופורציה — המספר עצמו הוא המידע.
//
// ⚠️ פסים אופקיים ולא עמודות: שמות ערים בעברית ארוכים, ובעמודות הם היו
// נחתכים או מסתובבים באלכסון.
//
// ⚠️ ברירת המחדל 8 ערים ולא הכל: ברישום מאסיבי יש עשרות ערים, ורשימה מלאה
// הייתה דוחקת את הטבלה הרחק מטה — בדיוק ההפך מ"לא לתפוס את העין".
// ─────────────────────────────────────────────────────────────────────────────

const TOP_N = 8

export default function CityBreakdown({
  cities, selected, onSelect,
}: {
  /** [שם, כמות] ממוין יורד. */
  cities: [string, number][]
  selected: string
  onSelect: (city: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (!cities.length) return null

  const shown = expanded ? cities : cities.slice(0, TOP_N)
  // ⚠️ הסקאלה יחסית לגדולה ביותר ולא לסך הכל: רוב הערים קטנות, ופס באחוז
  // מהסך היה קו בלתי נראה לכולן.
  const max = cities[0][1] || 1
  const total = cities.reduce((s, [, n]) => s + n, 0)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-slate-500">
          <MapPin size={13} />
          <span className="text-[11px] font-bold">פילוח לפי עיר</span>
        </div>
        <span className="text-[11px] text-slate-400 tabular-nums">
          {cities.length} ערים
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {shown.map(([name, n]) => {
          const pct = (n / max) * 100
          const share = total ? Math.round((n / total) * 100) : 0
          const isOn = selected === name
          return (
            // ⚠️ כל שורה היא גם פילטר: לראות שעיר בולטת ולא יכולת ללחוץ עליה
            // הוא בדיוק התסכול שהגרף אמור לפתור.
            <button
              key={name}
              type="button"
              onClick={() => onSelect(isOn ? 'all' : name)}
              title={`${name} · ${n} נרשמים (${share}%)`}
              className={`group grid grid-cols-[minmax(70px,110px)_1fr_auto] items-center gap-2 rounded-lg px-1.5 py-1 text-right transition-colors ${
                isOn ? 'bg-indigo-50' : 'hover:bg-slate-50'
              }`}
            >
              <span className={`truncate text-[11px] ${isOn ? 'font-bold text-indigo-700' : 'text-slate-600'}`}>
                {name}
              </span>
              {/* המסילה עצמה — דקה מאוד, בלי מסגרת */}
              <span className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <span
                  className={`block h-full rounded-full transition-all ${
                    isOn ? 'bg-indigo-500' : 'bg-indigo-200 group-hover:bg-indigo-300'
                  }`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </span>
              <span className={`tabular-nums text-[11px] ${isOn ? 'font-bold text-indigo-700' : 'text-slate-500'}`}>
                {n.toLocaleString('he-IL')}
              </span>
            </button>
          )
        })}
      </div>

      {cities.length > TOP_N && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-400 hover:text-indigo-600 transition-colors"
        >
          <ChevronDown size={12} className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
          {expanded ? 'הצגה מצומצמת' : `עוד ${cities.length - TOP_N} ערים`}
        </button>
      )}
    </div>
  )
}
