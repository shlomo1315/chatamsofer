import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// אישור / דחייה של בקשות לחלוקת חגים, וניקוי שיוך כרטיס.
//
// ⚠️ האישור הוא מה שפותח את שיוך הכרטיס בשלוחה הטלפונית ובממשק: משפחה שאינה
// מאושרת נחסמת שם (lib/holidayCards → cardEligibility). לכן דחייה של משפחה
// שכבר שייכה כרטיס אינה מסירה את הכרטיס — היא רק חוסמת שיוך נוסף; הסרת כרטיס
// היא פעולה נפרדת ומכוונת, כדי שלא נבטל בשוגג כרטיס פעיל שכבר בשימוש.
// ─────────────────────────────────────────────────────────────────────────────

type Status = 'pending' | 'approved' | 'rejected'
const STATUSES: Status[] = ['pending', 'approved', 'rejected']

interface Body {
  ids?: string[]
  approval_status?: string
  rejected_reason?: string
  /** ניקוי מספר הכרטיס מהשורה — כדי לאפשר שיוך מחדש אחרי טעות הקלדה */
  clear_card?: boolean
}

export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('distributions', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const ids = (body.ids ?? []).map(String).filter(Boolean)
  if (!ids.length) return NextResponse.json({ error: 'לא נבחרו רשומות' }, { status: 400 })

  // ניקוי כרטיס — פעולה נפרדת, לא מעורבת באישור
  if (body.clear_card) {
    const { error } = await db.from('distribution_recipients')
      .update({ card_number: null, card_linked_at: null, card_link_error: null, card_linked_phone: null })
      .in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logActivity(db, {
      userId: staff.userId, action: 'distribution_card_cleared', entityType: 'distribution_recipient',
      entityId: ids[0], details: { count: ids.length },
    }).catch(() => {})
    return NextResponse.json({ ok: true, updated: ids.length })
  }

  const status = String(body.approval_status ?? '') as Status
  if (!STATUSES.includes(status)) return NextResponse.json({ error: 'מצב אישור לא תקין' }, { status: 400 })

  const patch: Record<string, unknown> = {
    approval_status: status,
    // ⚠️ approved_at מתאפס בחזרה ל-pending: תאריך אישור שנשאר על שורה שאינה
    // מאושרת היה מציג לצוות "אושר ב..." על בקשה פתוחה.
    approved_at: status === 'approved' ? new Date().toISOString() : null,
    approved_by: status === 'approved' ? staff.userId : null,
    rejected_reason: status === 'rejected' ? (String(body.rejected_reason ?? '').trim() || null) : null,
  }

  const { error } = await db.from('distribution_recipients').update(patch).in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, {
    userId: staff.userId, action: 'distribution_recipients_approval', entityType: 'distribution_recipient',
    entityId: ids[0], details: { count: ids.length, approval_status: status },
  }).catch(() => {})

  return NextResponse.json({ ok: true, updated: ids.length })
}
