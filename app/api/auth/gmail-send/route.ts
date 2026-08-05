import { NextResponse } from 'next/server'
import { getSendAuthUrl } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// חיבור חשבון השליחה הייעודי (למשל code@) — החשבון שממנו יוצאים קודי האימות.
//
// ⚠️ זהו חיבור *נפרד* מהתיבה הראשית. פתיחת משתמש חדש ב-Workspace אינה מקנה
// למערכת שום גישה אליו: היא מתחברת ל-Gmail עם אסימון שמור, והאסימון שייך
// לחשבון שאושר בעבר. בלי המסלול הזה המערכת תמשיך לשלוח מהתיבה הראשית ורק
// *תבקש* להציג כתובת אחרת — בקשה שגוגל מכבד רק אם הכתובת רשומה שם כאליאס.
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  return NextResponse.redirect(getSendAuthUrl())
}
