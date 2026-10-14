import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { normalizeEmail } from '@/lib/gilyonot'
import { loadIssue, sendGilyonTest } from '@/lib/gilyonotSender'

// מייל ניסיון לכתובת אחת, לפני השליחה לכל הרשימה.
export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })
  const body = await request.json().catch(() => ({})) as { email?: unknown }
  const to = normalizeEmail(body.email) ?? normalizeEmail(staff.email)
  if (!to) return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  const res = await sendGilyonTest(db, issue, to)
  if (!res.ok) return NextResponse.json({ error: res.error ?? 'השליחה נכשלה' }, { status: 502 })
  return NextResponse.json({ ok: true, to })
}
