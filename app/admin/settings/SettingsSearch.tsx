'use client'
import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// חיפוש חופשי על מסך ההגדרות.
//
// 🔴 למה זה קיים: המסך מחזיק 36 מקטעים. כדי למצוא הגדרה אחת המנהל היה
// סורק את כל הכותרות בעין ומנחש באיזו קבוצה היא יושבת — "תזכורת כרטיס
// מזון" או "התראת מלאי"? "אימות מייל" או "חשבון שליחה"? הקיבוץ לקבוצות
// עוזר, אבל רק למי שכבר יודע לאן ללכת.
//
// ⚠️ סינון על ה-DOM ולא ניהול רשימה ב-state: המקטעים הם Server Components
// עם תוכן כבד (טבלאות, טפסים, שאילתות). הפיכתם לרשימת נתונים בצד הלקוח
// הייתה דורשת לשכפל כל כותרת גם כמחרוזת — מקור אמת שני שמתיישן בשקט
// ברגע שמישהו משנה כותרת. כאן הכותרת נקראת מה-DOM עצמו, ולכן תמיד נכונה.
//
// ⚠️ data-settings-group / data-settings-item הם החוזה מול הדף. שינוי
// בשמות האלה שובר את החיפוש בלי שום שגיאה — לכן הם מרוכזים כאן.
// ─────────────────────────────────────────────────────────────────────────────

/** נרמול לחיפוש עברי: גרשיים, מקפים ורווחים כפולים לא אמורים למנוע התאמה. */
function norm(s: string): string {
  return s
    .replace(/["'׳״׳״]/g, '')
    .replace(/[-–—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export default function SettingsSearch() {
  const [q, setQ] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const needle = norm(q)
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('[data-settings-item]')
    )
    const groups = Array.from(
      document.querySelectorAll<HTMLElement>('[data-settings-group]')
    )

    if (!needle) {
      // ⚠️ הסרת המאפיין ולא השמת '' — [hidden] נשאר פעיל גם על מחרוזת ריקה.
      for (const el of [...items, ...groups]) el.hidden = false
      setCount(null)
      return
    }

    let hits = 0
    for (const el of items) {
      // הכותרת היא הטקסט של הכפתור הראשון במקטע; נופלים לטקסט המלא אם השתנה המבנה.
      const title = el.querySelector('button')?.textContent ?? el.textContent ?? ''
      const match = norm(title).includes(needle)
      el.hidden = !match
      if (match) hits++
    }
    // קבוצה שכל פריטיה הוסתרו — גם הכותרת שלה יורדת, אחרת נשארת כותרת ריקה.
    for (const g of groups) {
      const visible = Array.from(
        g.querySelectorAll<HTMLElement>('[data-settings-item]')
      ).some(el => !el.hidden)
      g.hidden = !visible
    }
    setCount(hits)
  }, [q])

  // ניקוי בעת עזיבה: אחרת מקטעים מוסתרים "נתקעים" אם הרכיב יורד מהמסך.
  useEffect(() => () => {
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>('[data-settings-item],[data-settings-group]')
    )) el.hidden = false
  }, [])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="חיפוש הגדרה — למשל: מייל, גיבוי, כרטיס, טלפון"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-9 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        {q && (
          <button
            type="button"
            onClick={() => { setQ(''); inputRef.current?.focus() }}
            aria-label="ניקוי החיפוש"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {count !== null && (
        <p className="pr-1 text-[12px] font-medium text-slate-500">
          {count === 0
            ? 'לא נמצאה הגדרה מתאימה'
            : `${count} הגדרות מתאימות`}
        </p>
      )}
    </div>
  )
}
