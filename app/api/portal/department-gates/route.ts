import { NextResponse, type NextRequest } from 'next/server'
import { getDepartmentGates, getDepartmentPreviewCode, GATED_DEPARTMENTS } from '@/lib/departmentGates'

export const dynamic = 'force-dynamic'

// מצב הפתיחה/סגירה של המחלקות — לטופס הציבורי, כדי להסתיר/להשבית כפתורי
// בקשה של מחלקות סגורות. מידע לא רגיש (אילו אגפים מקבלים בקשות) — אין auth.
//
// ⚠️ ?preview=<code> — בדיקה מאחורי הקלעים. עם קוד תקין כל המחלקות מוחזרות
// כפתוחות, כדי שאפשר יהיה לעבור על הזרימה של מחלקה סגורה לפני הפתיחה
// לציבור. הקוד נבדק גם בשרת בכל נתיב בקשה בנפרד (isDepartmentAccessible),
// ולכן החזרה כאן אינה "פותחת" דבר בפועל — היא רק מציגה את הטפסים.
export async function GET(request: NextRequest) {
  const preview = request.nextUrl.searchParams.get('preview')
  if (preview) {
    const expected = await getDepartmentPreviewCode()
    // השוואה באורך קבוע — לא לדלוף את הקוד דרך זמן התגובה
    if (expected && preview.length === expected.length) {
      let diff = 0
      for (let i = 0; i < expected.length; i++) diff |= preview.charCodeAt(i) ^ expected.charCodeAt(i)
      if (diff === 0) {
        const all = Object.fromEntries(GATED_DEPARTMENTS.map(d => [d, true]))
        return NextResponse.json({ gates: all, preview: true }, { headers: { 'Cache-Control': 'no-store' } })
      }
    }
  }
  const gates = await getDepartmentGates()
  return NextResponse.json({ gates }, { headers: { 'Cache-Control': 'no-store' } })
}
