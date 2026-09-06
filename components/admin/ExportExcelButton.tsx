'use client'
import { FileSpreadsheet } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { ADV_KEYS } from '@/lib/listParams'

// כפתור ייצוא לאקסל — קישור ישיר ל-API שמחזיר קובץ .xlsx מעוצב (RTL, כותרת
// קפואה, סכומים כמספרים). ⚠️ בעבר זה היה CSV; ראו lib/xlsx למה זה השתנה.
//
// ⚠️ הפילטרים הפעילים במסך נגררים לייצוא. עד כה הקישור היה קבוע, ולכן מי
// שסינן (למשל "ממתינים בלבד") וייצא — קיבל קובץ עם *כל* הרשומות בלי שום
// סימן לכך. הפילטרים יושבים ב-query string של הדף, ומועברים כמות שהם.
// ⚠️ ללא 'special': דף החריגים הוא נתיב נפרד (/admin/special-approvals) ואין
// בו כפתור ייצוא, כך שהערך לעולם אינו מופיע בכתובת. הצד השרתי עדיין תומך בו,
// כדי שהוספת כפתור שם בעתיד תעבוד בלי שינוי נוסף.
// 🔴 כל מפתח סינון שהמסך מכיר חייב להופיע כאן, אחרת הקובץ שיורד רחב מהמסך
// והמשתמש אינו יודע. זה בדיוק הבאג שכבר קרה פעם (833 במסך מול 62 באקסל):
// המפתחות היו משוכפלים, נוסף סינון, ורק צד אחד עודכן.
// ⚠️ 'f' = סינון העמודות (עיר/סטטוס/מקור), ו-ADV_KEYS = הסינון המתקדם
// (גיל, קהילה, ילדים, תאריך הרשמה, מין, עץ דורות).
const FILTER_KEYS = ['status', 'marital', 'q', 'email', 'f', ...ADV_KEYS] as const

export default function ExportExcelButton({ type, label = 'ייצוא לאקסל' }: { type: string; label?: string }) {
  const sp = useSearchParams()
  const params = new URLSearchParams({ type })
  for (const k of FILTER_KEYS) {
    const v = sp?.get(k)
    if (v && v !== 'all') params.set(k, v)
  }
  // ⚠️ page/size לא נגררים בכוונה: הייצוא הוא של *כל* התוצאות המסוננות,
  // לא של העמוד שמוצג. גרירתם הייתה מגבילה את הקובץ ל-50 שורות.
  const filtered = [...FILTER_KEYS].some(k => { const v = sp?.get(k); return v && v !== 'all' })

  return (
    <a
      href={`/api/admin/export?${params.toString()}`}
      title={filtered ? 'הייצוא כולל את הסינון הפעיל במסך' : 'ייצוא כל הרשומות'}
      className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
    >
      <FileSpreadsheet size={16} /> {label}{filtered ? ' (מסונן)' : ''}
    </a>
  )
}
