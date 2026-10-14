import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { issueEmail, loadIssue } from '@/lib/gilyonotSender'

// תצוגה מקדימה של המייל בדיוק כפי שיישלח, עם שם לדוגמה. מוצג ב-iframe במסך הגיליון.
export const dynamic = 'force-dynamic'

const SAMPLE = '00000000-0000-0000-0000-000000000000'

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('gilyonot', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })
  // בלי פיקסל: צפייה בתצוגה המקדימה לא נספרת כפתיחה
  const { html } = issueEmail(issue, { name: 'ישראל ישראלי', deliveryToken: SAMPLE, subscriberToken: SAMPLE })
  return new NextResponse(html.replace(/<img[^>]*\/api\/gilyonot\/o\/[^>]*>/, ''), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN' },
  })
}
