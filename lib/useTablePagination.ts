'use client'
import { useState, useMemo } from 'react'
import { PAGE_SIZES, DEFAULT_PAGE_SIZE } from '@/lib/listParams'
import { rowsKeyOf } from '@/lib/rowsKey'

// ─────────────────────────────────────────────────────────────────────────────
// דפדוף אחיד לכל טבלאות המערכת.
//
// הדפוס (זהה למסך הצאצאים): 50 שורות בברירת מחדל, בורר גודל עמוד עד 200,
// וחיפוש שסורק את *כל* הרשימה ולא רק את העמוד המוצג.
//
// ⚠️ החיפוש חייב לרוץ על הרשימה המלאה לפני החיתוך לעמוד. חיתוך-ואז-סינון
// היה מחפש בתוך 50 שורות בלבד, והמשתמש היה מקבל "לא נמצא" על רשומה שקיימת.
// לכן הסדר כאן קבוע: סינון → מיון → חיתוך לעמוד.
//
// ⚠️ העמוד מתאפס בכל שינוי של הרשימה (חיפוש/סינון/מיון). בלי זה מי שעמד
// בעמוד 7 והקליד חיפוש היה רואה מסך ריק — כי לתוצאה החדשה אין עמוד 7.
//
// שימוש:
//   const p = useTablePagination(filteredRows)
//   {p.rows.map(...)}
//   <Pagination page={p.page} size={p.size} total={p.total}
//               onPage={p.setPage} onSize={p.setSize} />
// ─────────────────────────────────────────────────────────────────────────────

export { PAGE_SIZES, DEFAULT_PAGE_SIZE }

export function useTablePagination<T>(all: T[], opts?: { initialSize?: number }) {
  const initialSize = opts?.initialSize ?? DEFAULT_PAGE_SIZE
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(initialSize)

  const total = all.length
  const totalPages = Math.max(1, Math.ceil(total / size))

  // ⚠️ איפוס לעמוד 1 כשהרשימה משתנה — דפוס "state שנגזר מ-props": שומרים
  // את הרשימה הקודמת ב-state ומשווים בזמן הרינדור.
  // useEffect שקורא setPage היה מרנדר פעמיים בכל חיפוש (ורשימה חדשה נוצרת
  // בכל הקלדה) — בדיוק העומס שהדפדוף בא לפתור.
  // 🔴 ההשוואה על *תוכן* הרשימה ולא על זהות המערך — ראו lib/useIncrementalRows.
  //
  // ⚠️ קורא שמעביר מערך נגזר שנבנה מחדש בכל רינדור (למשל useTableColumns עם
  // `filter` inline) היה מכשיל את ההשוואה תמיד: setPrevAll רץ בכל רינדור,
  // וכל setState בזמן רינדור מזמן רינדור נוסף — לולאה אינסופית ו-React #301.
  // בדיוק כך נפל מסך החלוקה. מפתח-תוכן מחסן את ה-hook מכל קורא כזה.
  const key = rowsKeyOf(all)
  const [prevKey, setPrevKey] = useState(key)
  if (prevKey !== key) {
    setPrevKey(key)
    if (page !== 1) setPage(1)
  }

  // ⚠️ שינוי גודל העמוד גם הוא מאפס: מי שעמד בעמוד 5 של 20 ועבר ל-200
  // היה נופל אל מעבר לסוף הרשימה.
  const changeSize = (s: number) => { setSize(s); setPage(1) }

  // חגורת ביטחון: אם העמוד הנוכחי גדול ממספר העמודים (למשל אחרי מחיקת
  // שורות), נצמדים לעמוד האחרון במקום להציג ריק.
  const safePage = Math.min(page, totalPages)

  const rows = useMemo(() => {
    const from = (safePage - 1) * size
    return all.slice(from, from + size)
  }, [all, safePage, size])

  return {
    rows,
    page: safePage,
    size,
    total,
    totalPages,
    setPage,
    setSize: changeSize,
    /** טווח השורות המוצג — לתצוגת "מציג X–Y מתוך Z". */
    from: total === 0 ? 0 : (safePage - 1) * size + 1,
    to: Math.min(safePage * size, total),
  }
}
