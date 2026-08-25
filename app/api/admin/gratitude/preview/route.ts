import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, forbidden, getServiceClient } from '@/lib/apiAuth'
import { mailFor, DEPARTMENTS, type DepartmentKey } from '@/lib/departments'
import { loadGratitudeLetter, donorEmailHtml, DONOR_EMAIL_SUBJECT } from '../[id]/shared'

// ─────────────────────────────────────────────────────────────────────────────
// תצוגה מקדימה של המייל לנדיב — בדיוק ה-HTML שיישלח.
//
// 🔴 עד כה השליחה הייתה עיוורת: המזכירה לחצה "שלח" בלי לראות מה הנדיב
// יקבל. מייל לנדיב הוא פנייה חיצונית שאי אפשר לבטל אחריה.
//
// ⚠️ ה-HTML נבנה מאותה donorEmailHtml שהשליחה עצמה משתמשת בה — אחרת
// התצוגה המקדימה הופכת למסמך נפרד שנסחף, וזו בדיוק הבטחה שקרית.
//
// 🔒 צוות בלבד.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return forbidden('התצוגה המקדימה שמורה לצוות')

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let payload: { id?: string; from?: string }
  try { payload = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const id = (payload.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'לא נבחרה ברכה' }, { status: 400 })

  const row = await loadGratitudeLetter(db, id)
  if (!row) return NextResponse.json({ error: 'הברכה לא נמצאה' }, { status: 404 })

  // ⚠️ אותה נפילה-לאחור כמו בשליחה: מפתח לא מוכר → maternity.
  const fromKey = (payload.from && payload.from in DEPARTMENTS)
    ? (payload.from as DepartmentKey) : 'maternity'
  const { fromEmail, fromName } = mailFor(fromKey)

  return NextResponse.json({
    subject: DONOR_EMAIL_SUBJECT,
    html: donorEmailHtml(row),
    fromEmail,
    fromName,
    // ⚠️ נאמר במפורש שהשובר מצורף: הוא אינו נראה ב-HTML, והמזכירה
    // עלולה לחשוב שהמייל יוצא בלעדיו.
    attachmentNote: 'שובר הברכה מצורף כקובץ PDF',
  }, { headers: { 'Cache-Control': 'no-store' } })
}
