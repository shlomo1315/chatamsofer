import { NextResponse } from 'next/server'
import { getSendAuthUrl } from '@/lib/gmail'
import { newOAuthNonce, setOAuthNonce } from '@/lib/oauthState'
import { requireAdmin, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// חיבור חשבון השליחה הייעודי (למשל code@) — החשבון שממנו יוצאים קודי האימות.
//
// ⚠️ זהו חיבור *נפרד* מהתיבה הראשית. פתיחת משתמש חדש ב-Workspace אינה מקנה
// למערכת שום גישה אליו: היא מתחברת ל-Gmail עם אסימון שמור, והאסימון שייך
// לחשבון שאושר בעבר. בלי המסלול הזה המערכת תמשיך לשלוח מהתיבה הראשית ורק
// *תבקש* להציג כתובת אחרת — בקשה שגוגל מכבד רק אם הכתובת רשומה שם כאליאס.
export async function GET() {
  // 🔴 מנהל בלבד (ביקורת אבטחה 05.10): חיבור חשבון Google קובע לאן הולך
  // הגיבוי הלילי של כל המסד ומאיזו תיבה יוצא דואר הארגון.
  const staff = await requireAdmin()
  if (!staff) return unauthorized()

  // 🔴 nonce ב-state + בעוגייה — הגנת CSRF (lib/oauthState).
  const nonce = newOAuthNonce()
  const url = new URL(getSendAuthUrl())
  url.searchParams.set('state', nonce)
  const res = NextResponse.redirect(url.toString())
  setOAuthNonce(res, 'send', nonce)
  return res
}
