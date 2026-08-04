import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { notifyHolidayApproved } from '@/lib/holidayNotify'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// שליחת הודעת אישור למשפחות שאושרו לחלוקה — מייל וצינתוק.
//
// ⚠️ רק מי שמצב האישור שלו 'approved' מקבל הודעה (נאכף ב-notifyHolidayApproved).
// ⚠️ ids ריק + distributionId = כל המאושרים שטרם קיבלו הודעה בחלוקה זו. זו
// הפעולה שהצוות עושה בפועל ("שלח לכל מי שאושר"), ובלעדיה היו מסמנים 400 שורות ביד.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const staff = await requirePermission('distributions', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { ids?: string[]; distributionId?: string; email?: boolean; phone?: boolean; force?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  let ids = (body.ids ?? []).map(String).filter(Boolean)

  if (!ids.length) {
    const distId = String(body.distributionId ?? '').trim()
    if (!distId) return NextResponse.json({ error: 'לא נבחרו רשומות' }, { status: 400 })
    let q = db.from('distribution_recipients').select('id')
      .eq('distribution_id', distId).eq('approval_status', 'approved')
    if (!body.force) q = q.is('notified_at', null)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    ids = (data ?? []).map(r => String(r.id))
    if (!ids.length) return NextResponse.json({ ok: true, sent: 0, skipped: 0, failed: 0, results: [], empty: true })
  }

  const summary = await notifyHolidayApproved(ids, {
    email: body.email !== false,
    phone: body.phone !== false,
    force: body.force === true,
  })

  await logActivity(db, {
    userId: staff.userId, action: 'distribution_approval_notified', entityType: 'distribution_recipient',
    entityId: ids[0], details: { count: ids.length, sent: summary.sent, failed: summary.failed, skipped: summary.skipped },
  }).catch(() => {})

  return NextResponse.json({ ok: true, ...summary })
}
