import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { lineageOrderFixEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

// שליחת קישור אישי לתיקון סדר הדורות — מהכרטסת של הצאצא.
//
// ⚠️ בשונה מ-/api/admin/lineage/share, ההזמנה כאן משויכת לצאצא (beneficiary_id)
// ולא רק לצומת בעץ. זה מה שמאפשר לדף הציבורי להציג לנמען את הפרטים של עצמו,
// ולקשר את ההצעות שיגיעו חזרה לכרטסת שלו. mode='order' מגביל את הדף לתיקון
// סדר הדורות בלבד — בלי אישור/דחייה/שינוי שם של צמתים אחרים בענף.
export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  let body: { beneficiaryId?: string; email?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const beneficiaryId = (body.beneficiaryId ?? '').trim()
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה צאצא' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const { data: ben } = await admin.from('beneficiaries')
    .select('id, full_name, family_name, spouse_name, email, lineage_node_id')
    .eq('id', beneficiaryId).maybeSingle()
  if (!ben) return NextResponse.json({ error: 'הצאצא לא נמצא' }, { status: 404 })

  // כתובת המייל: מה שנשלח בבקשה גובר (המנהל עשוי לתקן), אחרת זו שבכרטסת.
  const email = (body.email ?? '').trim() || (ben.email ?? '').trim()
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'לצאצא אין כתובת מייל תקינה — יש להזין אחת' }, { status: 400 })
  }

  // ⚠️ הענף שהנמען יראה מתחיל מהאב האחרון המשויך לו. הצאצא עצמו אינו צומת
  // בעץ (העץ הוא של האבות), ולכן lineage_node_id מצביע על האב — וזה בדיוק
  // השורש הנכון: משם ומעלה נבנית שרשרת הדורות שהוא מתבקש לאמת.
  if (!ben.lineage_node_id) {
    return NextResponse.json(
      { error: 'לצאצא אין שיוך לעץ הדורות — יש לשייך אותו לצומת לפני שליחת הקישור' },
      { status: 400 },
    )
  }

  const token = randomBytes(16).toString('base64url')
  const recipientName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || 'משפחה יקרה'

  // ⚠️ 7 ימים ולא 30 (ברירת המחדל של הטבלה) — וזה נאכף כאן בפועל ולא רק
  // נכתב במייל. קישור אישי שנשאר פתוח חודש הוא חשיפה מיותרת.
  const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString()

  const { error } = await admin.from('lineage_share_invites').insert({
    token,
    root_node_id: ben.lineage_node_id,
    beneficiary_id: ben.id,
    mode: 'order',
    expires_at: expiresAt,
    recipient_name: recipientName,
    recipient_email: email,
    created_by: staff.userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
  const link = `${base}/lineage-review/${token}`

  const mail = lineageOrderFixEmail({ recipientName, link })
  try {
    // ⚠️ מחלקת איגוד הצאצאים ולא יולדות: זו פנייה על סדר היוחסין, והתשובות
    // צריכות להגיע לתיבה שמטפלת בזה. (נתיב השיתוף הישן שולח ל-maternity.)
    await deliverMail(email, mail.subject, mail.html, [], { ...mailFor('igud'), transactional: true })
  } catch (e) {
    // ההזמנה כבר נוצרה — מחזירים הצלחה חלקית עם הקישור, כדי שהמנהל יוכל
    // להעתיק ולשלוח ידנית במקום לאבד את הטוקן.
    return NextResponse.json({ ok: true, link, mailError: e instanceof Error ? e.message : String(e) })
  }

  await admin.from('beneficiaries')
    .update({ lineage_link_sent_at: new Date().toISOString() }).eq('id', ben.id)

  await logActivity(admin, {
    userId: staff.userId, action: 'lineage_order_link_sent',
    entityType: 'beneficiary', entityId: ben.id,
    details: { email, rootNodeId: ben.lineage_node_id },
  })

  return NextResponse.json({ ok: true, sentTo: email, link })
}
