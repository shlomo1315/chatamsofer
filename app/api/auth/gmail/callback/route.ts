import { NextResponse, type NextRequest } from 'next/server'
import { google } from 'googleapis'
import { getOAuthClient, saveRefreshToken } from '@/lib/gmail'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { DRIVE_TOKEN_KEY, DRIVE_ACCOUNT_KEY } from '@/lib/googleDrive'

export const dynamic = 'force-dynamic'

// הכתובת של החשבון שאושר — כדי שיהיה כתוב בהגדרות לאיזה חשבון הגיבוי הולך.
// best-effort: אם הקריאה נכשלת, החיבור עצמו תקף ורק השם לא יוצג.
async function accountEmail(refreshToken: string): Promise<string | null> {
  try {
    const oauth = getOAuthClient()
    oauth.setCredentials({ refresh_token: refreshToken })
    const { data } = await google.oauth2({ version: 'v2', auth: oauth }).userinfo.get()
    return data.email ?? null
  } catch { return null }
}

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const code = request.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  // state נקבע אצלנו בלבד (ראו lib/gmail#getAuthUrl); כל ערך אחר = חשבון דואר.
  const forBackup = request.nextUrl.searchParams.get('state') === 'backup'

  const oauth = getOAuthClient()
  const { tokens } = await oauth.getToken(code)

  if (!tokens.refresh_token) {
    return new NextResponse(`
      <html><body dir="rtl" style="font-family:sans-serif;padding:40px">
        <h2>שגיאה</h2>
        <p>לא התקבל refresh token. נסה שוב ו<strong>ודא שלחצת "Allow"</strong> בכל המסכים.</p>
        <a href="/api/auth/gmail${forBackup ? '?target=backup' : ''}">נסה שוב</a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  if (forBackup) {
    // ⚠️ נשמר תחת מפתח נפרד ואינו דורס את אסימון הדואר: חיבור חשבון גיבוי
    // אחר לא אמור להחליף את החשבון ששולח ומקבל את כל הדואר של האיגוד.
    const admin = getServiceClient()
    if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    const email = await accountEmail(tokens.refresh_token)
    await admin.from('app_settings').upsert([
      { key: DRIVE_TOKEN_KEY, value: tokens.refresh_token, updated_at: new Date().toISOString() },
      { key: DRIVE_ACCOUNT_KEY, value: email ?? '', updated_at: new Date().toISOString() },
    ], { onConflict: 'key' })
    console.log(`[drive] חשבון הגיבוי חובר${email ? ` · ${email}` : ''}`)
  } else {
    await saveRefreshToken(tokens.refresh_token)
  }

  // ההפניה הסופית נבנית לפי הכתובת הציבורית (מאחורי פרוקסי request.url מצביע לכתובת פנימית
  // כמו localhost:8080 — מה שגרם ל-ERR_CONNECTION_REFUSED).
  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '')
  return NextResponse.redirect(`${base}/admin/settings`)
}
