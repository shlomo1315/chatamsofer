import { NextResponse, type NextRequest } from 'next/server'
import { google } from 'googleapis'
import { getSendOAuthClient, addSendAccount } from '@/lib/gmail'
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
  //
  // ⚠️ דרך getTokenInfo (הרשאת userinfo.email) ולא דרך gmail.users.getProfile:
  // getProfile דורש הרשאת *קריאה* בתיבה, וחשבון שליחה אינו אמור לקבל אותה.
  // עם gmail.send בלבד הקריאה נכשלת, והחיבור נפל כאן ב"לא ניתן לזהות".
  let email = ''
  try {
    oauth.setCredentials(tokens)
    if (tokens.access_token) {
      const info = await oauth.getTokenInfo(tokens.access_token)
      email = (info.email ?? '').toLowerCase().trim()
    }
    // גיבוי — אם getTokenInfo לא החזיר כתובת, ננסה את נקודת ה-userinfo.
    if (!email) {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth })
      const me = await oauth2.userinfo.get()
      email = (me.data.email ?? '').toLowerCase().trim()
    }
  } catch (e) {
    console.error('[gmail-send/callback] זיהוי החשבון נכשל:', e)
  }

  // ⚠️ בלי כתובת אין דרך לנהל מונה יומי נפרד לחשבון, וכל המאגר היה מתערבב
  // למונה אחד. עדיף להיכשל כאן מאשר לספור שגוי ולמצות מכסות בלי לדעת.
  if (!email) {
    return page('לא ניתן לזהות את החשבון', 'Google לא החזיר את כתובת החשבון. נסו לחבר שוב.')
  }

  await addSendAccount(email, tokens.refresh_token)
  console.log(`[gmail-send] חשבון שליחה נוסף למאגר: ${email}`)

  return page(
    'החשבון חובר בהצלחה',
    `<strong dir="ltr">${email}</strong> נוסף למאגר חשבונות השליחה, עם מכסה יומית משלו.
     כשמכסת חשבון אחד נגמרת, השליחה עוברת אוטומטית לחשבון הבא ברשימה.`,
    true,
  )
}
