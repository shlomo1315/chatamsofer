import { NextResponse, type NextRequest } from 'next/server'
import { getOAuthClient, saveRefreshToken } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const code = request.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const oauth = getOAuthClient()
  const { tokens } = await oauth.getToken(code)

  if (!tokens.refresh_token) {
    return new NextResponse(`
      <html><body dir="rtl" style="font-family:sans-serif;padding:40px">
        <h2>שגיאה</h2>
        <p>לא התקבל refresh token. נסה שוב ו<strong>ודא שלחצת "Allow"</strong> בכל המסכים.</p>
        <a href="/api/auth/gmail">נסה שוב</a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  await saveRefreshToken(tokens.refresh_token)
  // ההפניה הסופית נבנית לפי הכתובת הציבורית (מאחורי פרוקסי request.url מצביע לכתובת פנימית
  // כמו localhost:8080 — מה שגרם ל-ERR_CONNECTION_REFUSED).
  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '')
  return NextResponse.redirect(`${base}/admin/settings`)
}
