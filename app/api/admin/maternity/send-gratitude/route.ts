import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'
import { sendScheduled } from '@/lib/scheduledMailSenders'

// שליחה ידנית של בקשת מכתב ברכה / משוב בית החלמה — בלי להמתין לתזמון.
// שימושי כשרוצים לשלוח מיד, או לשלוח שוב למי שלא ענה.
export const dynamic = 'force-dynamic'

type Kind = 'gratitude_letter' | 'gratitude_reminder' | 'recovery_survey'
const VALID: Kind[] = ['gratitude_letter', 'gratitude_reminder', 'recovery_survey']

export async function POST(request: NextRequest) {
  const ctx = await requirePermission('maternity', 'edit')
  if (ctx instanceof NextResponse) return ctx

  let payload: { aidId?: string; kind?: string }
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { aidId } = payload
  const kind = payload.kind as Kind

  if (!aidId) return NextResponse.json({ error: 'חסר מזהה לידה' }, { status: 400 })
  if (!VALID.includes(kind)) return NextResponse.json({ error: 'סוג מייל לא תקין' }, { status: 400 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // כתובת המייל של היולדת
  const { data: aid } = await db
    .from('maternity_aids')
    .select('id, beneficiary:beneficiaries(email)')
    .eq('id', aidId)
    .maybeSingle()

  if (!aid) return NextResponse.json({ error: 'הלידה לא נמצאה' }, { status: 404 })

  const ben = (Array.isArray(aid.beneficiary) ? aid.beneficiary[0] : aid.beneficiary) as
    { email?: string | null } | null
  const email = (ben?.email ?? '').trim()

  if (!email) {
    return NextResponse.json({ error: 'למוטבת אין כתובת מייל רשומה' }, { status: 400 })
  }

  // sendScheduled מבצע את כל הבדיקות (לידה מאושרת, לא שקטה, הגיעה לבית החלמה)
  // ומחזיר 'cancelled' עם סיבה אם המייל אינו רלוונטי.
  const result = await sendScheduled(db, {
    id: 'manual',
    kind,
    entity_table: 'maternity_aids',
    entity_id: aidId,
    to_email: email,
    attempts: 0,
    payload: {},
  })

  if (result.outcome === 'sent') {
    // מסמנים את המייל המתוזמן כנשלח, כדי שלא יישלח שוב אוטומטית
    await db.from('scheduled_emails').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
      .eq('kind', kind)
      .eq('entity_table', 'maternity_aids')
      .eq('entity_id', aidId)
      .eq('status', 'pending')

    return NextResponse.json({ ok: true, email })
  }

  if (result.outcome === 'cancelled') {
    return NextResponse.json({ error: result.reason ?? 'המייל אינו רלוונטי ללידה זו' }, { status: 400 })
  }

  return NextResponse.json({ error: result.reason ?? 'שליחה נכשלה' }, { status: 500 })
}
