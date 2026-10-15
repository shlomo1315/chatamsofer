import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { cleanCity, cleanNote, cleanText } from '@/lib/gilyonotDistributors'
import { sendDistributorBroadcast } from '@/lib/gilyonotDistributorServer'

// הודעה במייל לכל המפיצים הפעילים, או למפיצי עיר אחת.
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export const runtime = 'nodejs'

// POST { subject, body, city? }
export async function POST(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const b = await request.json().catch(() => null) as Record<string, unknown> | null
  const subject = cleanText(b?.subject, 150)
  const text = cleanNote(b?.body, 5000)
  const city = String(b?.city ?? '').trim() ? cleanCity(b?.city) : null
  if (!subject || !text) return NextResponse.json({ error: 'נא למלא נושא ותוכן' }, { status: 400 })

  const res = await sendDistributorBroadcast(db, { subject, body: text, city, createdBy: staff.userId })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_distributor_broadcast', entityType: 'gilyonot_distributor', details: { subject, city, sent: res.sent, failed: res.failed, skipped: res.skipped } })
  return NextResponse.json(res)
}
