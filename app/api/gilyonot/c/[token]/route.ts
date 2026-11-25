import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { verifyGilyonClick } from '@/lib/gilyonotTracking'
import { machineReason } from '@/lib/newsletter/tracking'

// קישור מעקב במייל הגיליון: רושם קליק למשלוח ומפנה ליעד.
// מפנה רק כשהחתימה תואמת לטוקן ולכתובת, כדי שזו לא תהיה הפניה פתוחה לכל אתר.
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')

function target(request: Request, token: string): string | null {
  const q = new URL(request.url).searchParams
  const url = q.get('u') ?? ''
  if (!UUID_RE.test(token) || !/^https?:\/\//i.test(url)) return null
  return verifyGilyonClick(token, url, q.get('s') ?? '') ? url : null
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const url = target(request, token)
  if (!url) return NextResponse.redirect(SITE, 302)
  const db = getServiceClient()
  // סורקי אבטחה ובוטים מפנים בלי שנספר קליק
  if (db && !machineReason({ ua: request.headers.get('user-agent'), method: request.method, kind: 'click' })) {
    const { error } = await db.rpc('gilyonot_track_click', { p_token: token, p_url: url })
    if (error) console.error('[gilyonot] רישום קליק נכשל:', error.message)
  }
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } })
}

// סורקי אבטחה בודקים את הקישור ב-HEAD. מפנים בלי לרשום קליק.
export async function HEAD(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const url = target(request, (await params).token)
  return NextResponse.redirect(url ?? SITE, 302)
}
