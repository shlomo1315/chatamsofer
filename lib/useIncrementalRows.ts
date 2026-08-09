'use client'
import { useState, useEffect, useRef, useMemo } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// גלילה אינסופית לטבלאות ארוכות.
//
// הבעיה שזה פותר: מסכי הרשימה רינדרו את *כל* השורות ל-DOM בבת אחת. בחלוקת חג
// עם אלפי נרשמים זה עשרות אלפי תאים — הדפדפן נתקע בבנייה, בפריסה ובכל render
// חוזר (סינון/מיון/הקלדה בחיפוש). המשתמש ממילא רואה רק את המסך הראשון.
//
// הפתרון: מרנדרים מנה ראשונה, ומוסיפים עוד בכל פעם שהמשתמש מגיע לתחתית —
// דרך IntersectionObserver על אלמנט זקיף (sentinel) בסוף הרשימה. אין כאן
// שאילתות נוספות: כל הנתונים כבר בזיכרון, רק הרינדור מדורג.
//
// שימוש:
//   const { rows, sentinelRef, hasMore, shown, total } = useIncrementalRows(filtered)
//   {rows.map(...)}
//   {hasMore && <tr ref={sentinelRef}>…</tr>}
//
// ⚠️ המונה מתאפס כשהרשימה עצמה משתנה (סינון/חיפוש/מיון), אחרת מעבר לסינון
// אחר היה משאיר את החלון פתוח על מספר שורות שרירותי מהרשימה הקודמת.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_INITIAL = 100
const DEFAULT_STEP = 100

export function useIncrementalRows<T>(
  all: T[],
  opts?: { initial?: number; step?: number },
) {
  const initial = opts?.initial ?? DEFAULT_INITIAL
  const step = opts?.step ?? DEFAULT_STEP

  const [limit, setLimit] = useState(initial)
  const sentinelRef = useRef<HTMLElement | null>(null)

  // איפוס בכל שינוי של הרשימה (סינון/מיון/חיפוש) — ראו ההערה למעלה.
  // התלות היא באורך *ובזהות המערך*, שכן סינון מחזיר מערך חדש.
  useEffect(() => { setLimit(initial) }, [all, initial])

  const total = all.length
  const hasMore = limit < total

  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return

    // rootMargin — מתחילים לטעון עוד קצת לפני שהזקיף באמת נראה, כדי
    // שהגלילה תרגיש רציפה ולא "מקרטעת" בכל מנה.
    const io = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) setLimit(l => l + step) },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, step, limit])

  const rows = useMemo(() => (hasMore ? all.slice(0, limit) : all), [all, limit, hasMore])

  return { rows, sentinelRef, hasMore, shown: rows.length, total }
}
