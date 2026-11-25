import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { loadBenForLink, sendLineageFixLink } from '@/lib/lineageInquiry'

export const dynamic = 'force-dynamic'

// שליחת קישור אישי לתיקון סדר הדורות — מהכרטסת של הצאצא.
//
// ⚠️ בשונה מ-/api/admin/lineage/share, ההזמנה כאן משויכת לצאצא (beneficiary_id)
// ולא רק לצומת בעץ. זה מה שמאפשר לדף הציבורי להציג לנמען את הפרטים של עצמו,
// ולקשר את ההצעות שיגיעו חזרה לכרטסת שלו. mode='order' מגביל את הדף לתיקון
// סדר הדורות בלבד. הלוגיקה עצמה ב-lib/lineageInquiry (משותפת לשליחה האוטומטית).
export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  let body: { beneficiaryId?: string; email?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const beneficiaryId = (body.beneficiaryId ?? '').trim()
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה צאצא' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const ben = await loadBenForLink(admin, beneficiaryId)
  if (!ben) return NextResponse.json({ error: 'הצאצא לא נמצא' }, { status: 404 })

  // כתובת המייל: מה שנשלח בבקשה גובר (המנהל עשוי לתקן), אחרת זו שבכרטסת.
  const res = await sendLineageFixLink(admin, ben, { email: body.email, userId: staff.userId })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
  if (res.mailError) return NextResponse.json({ ok: true, link: res.link, mailError: res.mailError })
  return NextResponse.json({ ok: true, sentTo: res.sentTo, link: res.link })
}
