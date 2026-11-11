import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { loadIssue, checkScheduleReady } from '@/lib/gilyonotSender'
import { parseScheduleAt } from '@/lib/gilyonotSchedule'

// תזמון שליחה: POST קובע או משנה זמן (טיוטה או מתוזמן), DELETE מבטל וחוזר לטיוטה.
// בזמן שנקבע ה-worker (instrumentation.ts) מתחיל את השליחה, לא בשבת ובחג.
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })
  if (issue.status !== 'draft' && issue.status !== 'scheduled') return NextResponse.json({ error: 'הגיליון כבר נשלח או בשליחה' }, { status: 409 })
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY לא מוגדר בשרת' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as { at?: unknown; listIds?: unknown }
  const when = parseScheduleAt(body.at)
  if (!when.ok) return NextResponse.json({ error: when.error }, { status: 400 })
  const listIds = Array.isArray(body.listIds) ? body.listIds.filter((x): x is string => typeof x === 'string').slice(0, 100) : []

  const ready = await checkScheduleReady(db, issue.id)
  if (!ready.ok) return NextResponse.json({ error: ready.error }, { status: 409 })

  const { data: updated, error } = await db.from('gilyonot_issues')
    .update({ status: 'scheduled', scheduled_at: when.at.toISOString(), scheduled_list_ids: listIds, schedule_error: null, updated_at: new Date().toISOString() })
    .eq('id', issue.id).in('status', ['draft', 'scheduled']).select('id').maybeSingle()
  if (error || !updated) return NextResponse.json({ error: 'התזמון נכשל' }, { status: 500 })
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_issue_schedule', entityType: 'gilyonot_issue', entityId: issue.id, details: { title: issue.title, at: when.at.toISOString(), lists: listIds.length } })
  return NextResponse.json({ ok: true, scheduled_at: when.at.toISOString() })
}

export async function DELETE(_r: Request, { params }: Ctx) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })
  const { data: updated } = await db.from('gilyonot_issues')
    .update({ status: 'draft', scheduled_at: null, scheduled_list_ids: null, schedule_error: null, updated_at: new Date().toISOString() })
    .eq('id', issue.id).eq('status', 'scheduled').select('id').maybeSingle()
  if (!updated) return NextResponse.json({ error: 'הגיליון אינו מתוזמן (ייתכן שכבר יצא לשליחה)' }, { status: 409 })
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_issue_unschedule', entityType: 'gilyonot_issue', entityId: issue.id, details: { title: issue.title } })
  return NextResponse.json({ ok: true })
}
