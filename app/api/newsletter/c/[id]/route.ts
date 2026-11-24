import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { recordNewsletterEvent } from '@/lib/newsletter/trackEvent'
import { verifyClick } from '@/lib/newsletter/tracking'

// קישור מעקב של מייל ניוזלטר: רושם קליק ומפנה ליעד.
// מפנה רק כשהחתימה תואמת לנמען ולכתובת, כדי שזו לא תהיה הפניה פתוחה לכל אתר.
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')

function target(request: Request, id: string): string | null {
  const q = new URL(request.url).searchParams
  const url = q.get('u') ?? ''
  if (!UUID_RE.test(id) || !/^https?:\/\//i.test(url)) return null
  return verifyClick(id, url, q.get('s') ?? '') ? url : null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = target(request, id)
  if (!url) return NextResponse.redirect(SITE, 302)
  const db = getServiceClient()
  if (db) {
    try {
      await recordNewsletterEvent(db, { recipientId: id, kind: 'click', link: url, ua: request.headers.get('user-agent'), method: request.method, source: 'own' })
    } catch (e) { console.error('[newsletter] רישום קליק נכשל:', e) }
  }
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } })
}

// סורקי אבטחה בודקים את הקישור ב-HEAD. מפנים בלי לרשום קליק.
export async function HEAD(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = target(request, (await params).id)
  return NextResponse.redirect(url ?? SITE, 302)
}
