import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { sendRecoveryVoucherUpdate } from '@/lib/sendRecoveryVoucher'

export const dynamic = 'force-dynamic'

// החלפת בית ההחלמה המשויך ליולדת — ישירות מהכרטסת, בלי טופס העריכה המלא.
//   aidId = מזהה התיק · home = שם בית ההחלמה החדש (או null לניקוי).
// אם בית ההחלמה השתנה והלידה כבר מאושרת — נשלח שובר הבראה מעודכן ליולדת
// (בשובר מופיע שם בית ההחלמה), בדיוק כמו בעדכון ימי הזכאות.
export async function POST(request: NextRequest) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()

  let body: { aidId?: string; home?: string | null }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { aidId } = body
  if (!aidId) return NextResponse.json({ error: 'חסר מזהה תיק' }, { status: 400 })

  const home = typeof body.home === 'string' ? body.home.trim() : null
  if (home != null && home.length > 120) {
    return NextResponse.json({ error: 'שם בית החלמה ארוך מדי' }, { status: 400 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, recovery_home')
    .eq('id', aidId)
    .maybeSingle()
  if (!aid) return NextResponse.json({ error: 'התיק לא נמצא' }, { status: 404 })

  const previous = aid.recovery_home ?? null
  const next = home || null

  const { error } = await admin
    .from('maternity_aids')
    .update({ recovery_home: next, updated_at: new Date().toISOString() })
    .eq('id', aidId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // רישום בלוג הפעילות (כשל ברישום לא חוסם את הפעולה)
  try {
    await admin.from('activity_log').insert({
      user_id: staff.userId,
      action: 'maternity_recovery_home_updated',
      entity_type: 'maternity_aid',
      entity_id: aidId,
      details: { from: previous, to: next },
    })
  } catch { /* ignore */ }

  // בית ההחלמה השתנה → שליחה מחדש של שובר ההבראה המעודכן (רק ללידה מאושרת עם מייל).
  // רץ ברקע כדי לא לעכב את התגובה למזכיר.
  const changed = previous !== next
  if (changed) {
    void sendRecoveryVoucherUpdate(admin, aidId).catch(e => console.error('[recovery-home] voucher resend failed:', e))
  }

  return NextResponse.json({ ok: true, recovery_home: next, voucherResent: changed })
}
