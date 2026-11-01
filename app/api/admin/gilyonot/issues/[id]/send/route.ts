import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { loadIssue, startIssueSend } from '@/lib/gilyonotSender'

// שליחה לכל הרשימה: מקפיא את הנרשמים הפעילים, וה-worker (instrumentation.ts) שולח
// במנות בדקות הקרובות. לחיצה כפולה לא שולחת פעמיים (רק טיוטה עוברת לשליחה).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY לא מוגדר בשרת' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as { listIds?: unknown }
  const listIds = Array.isArray(body.listIds) ? body.listIds.filter((x): x is string => typeof x === 'string').slice(0, 100) : undefined
  const res = await startIssueSend(db, issue.id, listIds)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 409 })
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_issue_send', entityType: 'gilyonot_issue', entityId: issue.id, details: { title: issue.title, total: res.total, lists: listIds?.length ?? 0 } })
  return NextResponse.json({ ok: true, total: res.total })
}
