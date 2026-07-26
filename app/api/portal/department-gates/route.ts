import { NextResponse } from 'next/server'
import { getDepartmentGates } from '@/lib/departmentGates'

export const dynamic = 'force-dynamic'

// מצב הפתיחה/סגירה של המחלקות — לטופס הציבורי, כדי להסתיר/להשבית כפתורי
// בקשה של מחלקות סגורות. מידע לא רגיש (אילו אגפים מקבלים בקשות) — אין auth.
export async function GET() {
  const gates = await getDepartmentGates()
  return NextResponse.json({ gates }, { headers: { 'Cache-Control': 'no-store' } })
}
