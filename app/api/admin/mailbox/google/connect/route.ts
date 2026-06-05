import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { getAuthedAdmin } from '@/lib/admin-auth'
import { buildAuthUrl, isGoogleOAuthConfigured } from '@/lib/google'

export const dynamic = 'force-dynamic'

// פתיחת תהליך ההרשאה מול Google (מנהל בלבד)
export async function GET(request: NextRequest) {
  const auth = await getAuthedAdmin()
  if (!auth.ok) return NextResponse.redirect(new URL('/login', request.url))
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(new URL('/admin/mailbox?google=notconfigured', request.url))
  }

  const redirectUri = new URL('/api/admin/mailbox/google/callback', request.url).toString()
  const state = randomBytes(16).toString('hex')
  const res = NextResponse.redirect(buildAuthUrl(redirectUri, state))
  res.cookies.set('g_oauth_state', state, {
    httpOnly: true,
    secure: new URL(request.url).protocol === 'https:',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
