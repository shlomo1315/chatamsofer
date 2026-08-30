import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { buildNameFixMail } from '@/lib/nameFixMail'
import { babiesOf, type AidNameFields } from '@/lib/babyNames'

export const dynamic = 'force-dynamic'

// שליחת קישור ייחודי למייל היולדת לתיקון / השלמת שם התינוק.
// נשלח כשסומן "עדיין אין שם", או כשהוזן שם לא-תקין ורוצים שהיולדת תתקן במיידי.
// הקישור נושא טוקן HMAC חתום (kind='n', תקף 7 ימים) — היולדת מזינה שם והוא נקלט אוטומטית.
export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()

  let body: { aidId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const { aidId } = body
  if (!aidId) return NextResponse.json({ error: 'חסר מזהה תיק' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, baby_name, baby_name_pending, babies, beneficiary:beneficiaries(email, full_name, family_name, spouse_name)')
    .eq('id', aidId)
    .maybeSingle()
  if (!aid) return NextResponse.json({ error: 'התיק לא נמצא' }, { status: 404 })

  const ben = aid.beneficiary as { email?: string | null; full_name?: string | null; family_name?: string | null; spouse_name?: string | null } | null
  if (!ben?.email) return NextResponse.json({ error: 'אין כתובת מייל ליולדת' }, { status: 400 })

  const motherName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || (ben.full_name ?? '')

  // ⚠️ נוסח משותף עם התזכורת השבועית (lib/nameFixMail): נוסח משוכפל היה
  // מתפצל בתיקון הראשון, והמשפחה הייתה מקבלת בתזכורת מייל אחר מזה שראתה
  // בפעם הראשונה. בתאומים הנוסח מדבר ברבים ומסביר על הזיהוי לפי ת"ז.
  const { subject, html } = buildNameFixMail({
    aidId,
    motherName,
    babyCount: babiesOf(aid as AidNameFields).length,
  })

  try {
    await deliverMail(ben.email, subject, html, [], mailFor('maternity'))
  } catch (e) {
    return NextResponse.json({ error: `שליחת המייל נכשלה: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }

  // שליחת קישור תיקון שם מסמנת שהתיק ממתין להשלמת/תיקון השם — כך הוא עובר בממשק
  // מ"ממתין לאישור" ל"ממתין לתיקונים", ויחזור אוטומטית כשהשם ייקלט (baby_name_pending=false).
  await admin.from('maternity_aids').update({ baby_name_pending: true, updated_at: new Date().toISOString() }).eq('id', aidId).then(undefined, () => {})

  // תיעוד בלוג
  try {
    await admin.from('activity_log').insert({
      user_id: staff.userId, action: 'maternity_name_fix_link_sent',
      entity_type: 'maternity_aid', entity_id: aidId, details: { email: ben.email },
    })
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, sentTo: ben.email })
}
