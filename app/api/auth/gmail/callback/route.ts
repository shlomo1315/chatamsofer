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
  return NextResponse.redirect(new URL('/admin/mail', request.url))
}
