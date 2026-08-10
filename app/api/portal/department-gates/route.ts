import { NextResponse, type NextRequest } from 'next/server'
import { getDepartmentGates, getDepartmentPreviewCode, previewGates } from '@/lib/departmentGates'

export const dynamic = 'force-dynamic'

// מצב הפתיחה/סגירה של המחלקות — לטופס הציבורי, כדי להסתיר/להשבית כפתורי
// בקשה של מחלקות סגורות. מידע לא רגיש (אילו אגפים מקבלים בקשות) — אין auth.
//
// ⚠️ ?preview=<code> — בדיקה מאחורי הקלעים. עם קוד תקין המחלקות מוחזרות
// כפתוחות, כדי שאפשר יהיה לעבור על הזרימה של מחלקה סגורה לפני הפתיחה
// לציבור. הקוד נבדק גם בשרת בכל נתיב בקשה בנפרד (isDepartmentAccessible),
// ולכן החזרה כאן אינה "פותחת" דבר בפועל — היא רק מציגה את הטפסים.
//
// ⚠️ &only=<מחלקה> — מצמצם את התצוגה המוקדמת למחלקה אחת: היא היחידה שתוחזר
// כפתוחה, וכל השאר סגורות. בלי זה קישור הבדיקה של הגמ"ח פתח *את כל* המחלקות
// והבודק ראה גם יולדות וסיוע רפואי — רעש שאינו קשור למה שהוא בא לבדוק.
// הקישור בכל לשונית הגדרות מצמצם את עצמו למחלקה שלה.
export async function GET(request: NextRequest) {
  const preview = request.nextUrl.searchParams.get('preview')
  const only = request.nextUrl.searchParams.get('only')
  if (preview) {
    const expected = await getDepartmentPreviewCode()
    // השוואה באורך קבוע — לא לדלוף את הקוד דרך זמן התגובה
    if (expected && preview.length === expected.length) {
      let diff = 0
      for (let i = 0; i < expected.length; i++) diff |= preview.charCodeAt(i) ^ expected.charCodeAt(i)
      if (diff === 0) {
        return NextResponse.json(
          { gates: previewGates(only), preview: true },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      }
    }
  }
  const gates = await getDepartmentGates()
  return NextResponse.json({ gates }, { headers: { 'Cache-Control': 'no-store' } })
}
