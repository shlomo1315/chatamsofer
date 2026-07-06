import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { defaultRecoveryDays } from '@/lib/maternity'
import { sendRecoveryVoucherUpdate } from '@/lib/sendRecoveryVoucher'

export const dynamic = 'force-dynamic'

// עדכון ידני של ימי הזכאות של היולדת בבית ההחלמה.
//   days = מספר הימים החדש (0–60). המזכירות יכולה להוסיף/להפחית ימים מעבר לברירת המחדל
//   (רגילה=2 · תאומים=4). הערך מוצג בתוכנה (עמודת הלידות) ובפורטל בתי ההחלמה.
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  let body: { aidId?: string; days?: number | string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { aidId } = body
  if (!aidId) return NextResponse.json({ error: 'חסר מזהה תיק' }, { status: 400 })

  const days = Number(body.days)
  if (!Number.isInteger(days) || days < 0 || days > 60) {
    return NextResponse.json({ error: 'מספר ימים לא תקין (0–60)' }, { status: 400 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, is_twins, recovery_eligibility_days')
    .eq('id', aidId)
    .maybeSingle()
  if (!aid) return NextResponse.json({ error: 'התיק לא נמצא' }, { status: 404 })

  const previous = aid.recovery_eligibility_days ?? defaultRecoveryDays(aid.is_twins)

  const { error } = await admin
    .from('maternity_aids')
    .update({ recovery_eligibility_days: days, updated_at: new Date().toISOString() })
    .eq('id', aidId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // רישום בלוג הפעילות (כשל ברישום לא חוסם את הפעולה)
  try {
    await admin.from('activity_log').insert({
      user_id: staff.userId,
      action: 'maternity_recovery_days_updated',
      entity_type: 'maternity_aid',
      entity_id: aidId,
      details: { from: previous, to: days },
    })
  } catch { /* ignore */ }

  // עדכון ימי הזכאות → שליחה מחדש של שובר ההבראה המעודכן במייל (רק אם השתנה
  // ורק ללידה מאושרת). רץ ברקע כדי לא לעכב את התגובה למזכיר.
  const daysChanged = previous !== days
  if (daysChanged) {
    void sendRecoveryVoucherUpdate(admin, aidId).catch(e => console.error('[recovery-days] voucher resend failed:', e))
  }

  return NextResponse.json({ ok: true, recovery_eligibility_days: days, voucherResent: daysChanged })
}
