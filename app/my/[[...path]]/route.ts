import { NextResponse, type NextRequest } from 'next/server'
import { verifyMagicToken } from '@/lib/portalMagicLink'
import { screenFromPath } from '@/lib/portalScreens'
import { setPortalSession } from '@/lib/portalSession'

export const dynamic = 'force-dynamic'

// נתיבי האזור האישי (/my/...). הקישור מהמייל נושא אסימון חתום (?t=): אם תקף נפתח סשן
// והמשתמש מגיע ישר למסך; אחרת הוא מועבר לכניסה הרגילה וחוזר לאותו מסך אחריה.
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const screen = screenFromPath(url.pathname, url.searchParams.get('type'))
  const target = new URL('/', url.origin)
  target.searchParams.set('go', screen)

  const token = url.searchParams.get('t')
  if (token) {
    const res = verifyMagicToken(token)
    if (res.ok) {
      const response = NextResponse.redirect(target)
      setPortalSession(response, res.beneficiaryId)
      response.headers.set('Cache-Control', 'no-store')
      response.headers.set('Referrer-Policy', 'no-referrer')
      return response
    }
    target.searchParams.set('link', res.reason)
  }
  const response = NextResponse.redirect(target)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
