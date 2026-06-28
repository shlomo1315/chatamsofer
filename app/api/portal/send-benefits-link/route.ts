import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { normalizeId } from '@/lib/portalBeneficiary'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { benefitsLinkEmail } from '@/lib/emailTemplates'
import { maskEmail } from '@/lib/phone'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// שולח למוטב (לכתובת הרשומה) מייל מהאיגוד עם רשימת ההטבות וקישורי הגשת בקשות.
// שני מסלולי זיהוי:
//   • לפי ת"ז (idType+id) — לפני כניסה, נשלח רק לכתובת הרשומה (כמו איפוס סיסמה).
//   • לפי סשן פורטל (beneficiary_id) — אחרי כניסה.
export async function POST(request: NextRequest) {
  let body: { beneficiary_id?: string; idType?: 'id' | 'passport'; id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let ben: { full_name: string | null; family_name: string | null; email: string | null } | null = null

  const idNumber = normalizeId(body.idType, body.id)
  if (idNumber && idNumber.length >= 5) {
    // מסלול ת"ז (ללא סשן) — הגבלת קצב למניעת ספאם, נשלח רק לכתובת הרשומה
    if (!rateLimit(`benefits-link:${clientIp(request)}`, 8, 15 * 60 * 1000) ||
        !rateLimit(`benefits-link-id:${idNumber}`, 4, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'כבר נשלח לאחרונה. נסה שוב בעוד מספר דקות.' }, { status: 429 })
    }
    const { data } = await admin
      .from('beneficiaries')
      .select('full_name, family_name, email')
      .eq('id_number', idNumber)
      .maybeSingle()
    ben = data
  } else if (body.beneficiary_id) {
    // מסלול סשן — מותר רק למוטב שאותר בסשן הנוכחי
    const sessionId = getPortalBeneficiaryId(request)
    if (!sessionId || sessionId !== body.beneficiary_id) {
      return NextResponse.json({ error: 'נדרש אימות מחדש — נא לבצע כניסה מחדש לפורטל' }, { status: 401 })
    }
    const { data } = await admin
      .from('beneficiaries')
      .select('full_name, family_name, email')
      .eq('id', body.beneficiary_id)
      .maybeSingle()
    ben = data
  } else {
    return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })
  }

  // לא חושפים אם הת"ז קיימת — מחזירים הצלחה גנרית גם אם אין מוטב/מייל
  if (!ben || !ben.email) {
    return NextResponse.json({ ok: true, sent: false }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const name = [ben.family_name, ben.full_name].filter(Boolean).join(' ')
  const mail = benefitsLinkEmail(name)
  const result = await deliverMail(ben.email, mail.subject, mail.html, undefined, mailFor('igud'))
  if (!result.ok) {
    console.error('[send-benefits-link] deliverMail failed:', result.error)
    return NextResponse.json({ error: 'שליחת המייל נכשלה. נסה שוב מאוחר יותר.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sent: true, email: maskEmail(ben.email) }, { headers: { 'Cache-Control': 'no-store' } })
}
