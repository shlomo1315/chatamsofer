import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { publishIssue, unpublishIssue } from '@/lib/gilyonotArchive'

// פרסום וביטול פרסום של גיליון בארכיון הציבורי. רק מנהל עם הרשאת עריכה.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { id } = await params
  const b = await req.json().catch(() => ({})) as { publish?: unknown; topic?: unknown; date?: unknown }
  const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null
  const res = b.publish === false
    ? await unpublishIssue(db, id)
    : await publishIssue(db, id, { topic: typeof b.topic === 'string' ? b.topic : null, date })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 409 })
  await logActivity(db, { userId: staff.userId, action: b.publish === false ? 'gilyonot_archive_unpublish' : 'gilyonot_archive_publish', entityType: 'gilyonot_issue', entityId: id, details: {} })
  return NextResponse.json({ ok: true })
}
