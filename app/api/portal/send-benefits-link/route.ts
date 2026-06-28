import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
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
// דורש סשן פורטל תקף — מותר רק למוטב שאותר בסשן הנוכחי.
export async function POST(request: NextRequest) {
  let body: { beneficiary_id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const beneficiaryId = body.beneficiary_id
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId || sessionId !== beneficiaryId) {
    return NextResponse.json({ error: 'נדרש אימות מחדש — נא לבצע כניסה מחדש לפורטל' }, { status: 401 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await admin
    .from('beneficiaries')
    .select('full_name, family_name, email')
    .eq('id', beneficiaryId)
    .maybeSingle()
  if (!ben) return NextResponse.json({ error: 'מוטב לא נמצא' }, { status: 404 })
  if (!ben.email) {
    return NextResponse.json({ error: 'אין כתובת מייל מעודכנת במערכת על שמך. אנא פנה למשרד לעדכון פרטים.' }, { status: 400 })
  }

  const name = [ben.family_name, ben.full_name].filter(Boolean).join(' ')
  const mail = benefitsLinkEmail(name)
  const result = await deliverMail(ben.email, mail.subject, mail.html, undefined, mailFor('igud'))
  if (!result.ok) return NextResponse.json({ error: 'שליחת המייל נכשלה. נסה שוב מאוחר יותר.' }, { status: 500 })

  return NextResponse.json({ ok: true, email: maskEmail(ben.email) }, { headers: { 'Cache-Control': 'no-store' } })
}
