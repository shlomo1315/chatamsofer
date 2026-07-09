import { NextResponse, type NextRequest } from 'next/server'
import { google } from 'googleapis'
import { saveLegacyRefreshToken } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()
  const code = request.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '')
  const oauth = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET, `${base}/api/auth/gmail-legacy/callback`)
  const { tokens } = await oauth.getToken(code)
  if (!tokens.refresh_token) {
    return new NextResponse(`<html><body dir="rtl" style="font-family:sans-serif;padding:40px"><h2>שגיאה</h2><p>לא התקבל refresh token. נסה שוב וודא שלחצת "Allow".</p><a href="/api/auth/gmail-legacy">נסה שוב</a></body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }
  await saveLegacyRefreshToken(tokens.refresh_token)
  return NextResponse.redirect(`${base}/admin/settings`)
}
