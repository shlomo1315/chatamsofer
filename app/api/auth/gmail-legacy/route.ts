import { NextResponse, type NextRequest } from 'next/server'
import { getLegacyAuthUrl } from '@/lib/gmail'
import { newOAuthNonce, setOAuthNonce } from '@/lib/oauthState'
import { requireAdmin, unauthorized } from '@/lib/apiAuth'
import { DEPARTMENTS } from '@/lib/departments'

export const dynamic = 'force-dynamic'

// חיבור תיבת Gmail לסנכרון ארכיון.
// חובה לציין לאיזו מחלקה התיבה שייכת — היא נישאת ב-state של OAuth וחוזרת
// ב-callback, כך שכל מייל שנקלט מהתיבה יסומן במחלקה הנכונה.
export async function GET(request: NextRequest) {
  // 🔴 מנהל בלבד (ביקורת אבטחה 05.10): חיבור חשבון Google קובע לאן הולך
  // הגיבוי הלילי של כל המסד ומאיזו תיבה יוצא דואר הארגון.
  const staff = await requireAdmin()
  if (!staff) return unauthorized()

  const department = request.nextUrl.searchParams.get('department') ?? ''
  const label = (request.nextUrl.searchParams.get('label') ?? '').slice(0, 60)
  // תווית התיבה — קיימת (labelId) או חדשה (labelName + color)
  const labelId = (request.nextUrl.searchParams.get('labelId') ?? '').slice(0, 60)
  const labelName = (request.nextUrl.searchParams.get('labelName') ?? '').slice(0, 60)
  const color = (request.nextUrl.searchParams.get('color') ?? '').slice(0, 20)

  const base = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, '')

  // ללא מחלקה תקינה — מפנים למסך הבחירה
  if (!department || !(department in DEPARTMENTS)) {
    return NextResponse.redirect(`${base}/admin/settings/connect-mailbox`)
  }

  const url = new URL(getLegacyAuthUrl())
  // ה-state חייב להיות מחרוזת בטוחה ל-URL. JSON גולמי (עם { " : ) שובר את
  // Google ומחזיר 500 — לכן מקודדים ב-base64url.
  // 🔴 n = nonce שנבדק מול עוגייה בחזרה — הגנת CSRF (lib/oauthState).
  const n = newOAuthNonce()
  const state = Buffer.from(JSON.stringify({ department, label, labelId, labelName, color, n })).toString('base64url')
  url.searchParams.set('state', state)
  const res = NextResponse.redirect(url.toString())
  setOAuthNonce(res, 'legacy', n)
  return res
}
