import { NextResponse, type NextRequest } from 'next/server'
import { google } from 'googleapis'
import { getSendOAuthClient, saveSendAccount } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

function page(title: string, body: string, ok = false) {
  return new NextResponse(
    `<html><body dir="rtl" style="font-family:system-ui,sans-serif;padding:40px;max-width:520px;margin:0 auto">
       <h2 style="color:${ok ? '#059669' : '#dc2626'}">${title}</h2>
       <p style="line-height:1.7;color:#334155">${body}</p>
       <a href="/admin/settings" style="color:#4f46e5">חזרה להגדרות</a>
     </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const code = request.nextUrl.searchParams.get('code')
  if (!code) return page('שגיאה', 'לא התקבל קוד הרשאה מ-Google. נסו שוב.')

  const oauth = getSendOAuthClient()
  const { tokens } = await oauth.getToken(code)

  // ⚠️ בלי refresh_token אין חיבור קבוע — האסימון הרגיל פג תוך שעה והשליחה
  // הייתה נשברת בשקט. Google מחזיר אותו רק ב-consent מפורש, ולכן נכשלים כאן
  // במפורש במקום לשמור חיבור שיפסיק לעבוד.
  if (!tokens.refresh_token) {
    return page('לא התקבלה הרשאה קבועה', 'נסו שוב, וודאו שלחצתם "Allow" במסך של Google.')
  }

  // הכתובת שחוברה בפועל — נשלפת מ-Google ולא מנוחשת, כדי שמסך ההגדרות יציג
  // את מה שבאמת מחובר. אם חוברה התיבה הלא נכונה, זה המקום שבו זה יתגלה.
  let email = ''
  try {
    oauth.setCredentials(tokens)
    const gmail = google.gmail({ version: 'v1', auth: oauth })
    const profile = await gmail.users.getProfile({ userId: 'me' })
    email = (profile.data.emailAddress ?? '').toLowerCase().trim()
  } catch (e) {
    console.error('[gmail-send/callback] getProfile failed:', e)
  }

  await saveSendAccount(tokens.refresh_token, email)
  console.log(`[gmail-send] חשבון שליחה חובר: ${email || '(כתובת לא ידועה)'}`)

  return page(
    'החשבון חובר בהצלחה',
    `קודי האימות ייצאו מעתה מהחשבון <strong dir="ltr">${email || 'שחובר'}</strong>, עם מכסת השליחה היומית שלו.`,
    true,
  )
}
