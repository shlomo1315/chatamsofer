import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { issueEmail, loadIssue, type IssueRow } from '@/lib/gilyonotSender'

// תצוגה מקדימה של המייל בדיוק כפי שיישלח. מוצג ב-iframe במסך הגיליון.
export const dynamic = 'force-dynamic'

const SAMPLE = '00000000-0000-0000-0000-000000000000'

type Ctx = { params: Promise<{ id: string }> }

function render(issue: Pick<IssueRow, 'title' | 'parasha' | 'intro' | 'body_html' | 'design'>) {
  // בלי פיקסל: צפייה בתצוגה המקדימה לא נספרת כפתיחה
  const { html } = issueEmail(issue, { deliveryToken: SAMPLE, subscriberToken: SAMPLE })
  return new NextResponse(html.replace(/<img[^>]*\/api\/gilyonot\/o\/[^>]*>/, ''), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN' },
  })
}

export async function GET(_r: Request, { params }: Ctx) {
  const staff = await requirePermission('gilyonot', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })
  return render(issue)
}

// תצוגה חיה מהעורך, לפני שמירה: אותו בנאי ואותו ניקוי כמו במייל שנשלח.
export async function POST(request: Request, { params }: Ctx) {
  const staff = await requirePermission('gilyonot', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  return render({
    ...issue,
    body_html: typeof body.body_html === 'string' ? body.body_html : issue.body_html,
    design: body.design !== undefined ? body.design : issue.design,
  })
}
