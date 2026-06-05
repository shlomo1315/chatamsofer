import { NextResponse, type NextRequest } from 'next/server'
import { getAuthedAdmin } from '@/lib/admin-auth'
import { exchangeCode } from '@/lib/google'

export const dynamic = 'force-dynamic'

// חזרה מ-Google: אימות state, החלפת הקוד בטוקנים ושמירה
export async function GET(request: NextRequest) {
  const auth = await getAuthedAdmin()
  if (!auth.ok) return NextResponse.redirect(new URL('/login', request.url))

  const url = new URL(request.url)
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/mailbox?${q}`, request.url))

  const error = url.searchParams.get('error')
  if (error) return back(`google=error&msg=${encodeURIComponent(error)}`)

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = request.cookies.get('g_oauth_state')?.value
  if (!code || !state || !cookieState || state !== cookieState) {
    return back('google=error&msg=state')
  }

  try {
    const redirectUri = new URL('/api/admin/mailbox/google/callback', request.url).toString()
    const { email } = await exchangeCode(code, redirectUri, auth.user.id)
    const res = back(`google=connected&email=${encodeURIComponent(email)}`)
    res.cookies.delete('g_oauth_state')
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    return back(`google=error&msg=${encodeURIComponent(msg)}`)
  }
}
