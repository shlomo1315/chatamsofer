import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// עדכון פרטים אישיים ע"י הנרשם (רק משפחה מאושרת). מותר לעדכן: טלפון, כתובת, עיר, מייל, מצב משפחתי.
// אסור לשנות שם או תעודת זהות (בעל/אישה) — שדות אלו אינם מתקבלים כלל.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { beneficiary_id, phone, phone2, address, city, email, marital_status } = body
  if (!beneficiary_id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  // אימות סשן הפורטל — מותר לעדכן רק את הרשומה של המוטב שאותר בסשן הנוכחי
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId || sessionId !== String(beneficiary_id)) {
    return NextResponse.json({ error: 'נדרש אימות מחדש — נא לבצע כניסה מחדש לפורטל' }, { status: 401 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, eligibility_status')
    .eq('id', String(beneficiary_id))
    .maybeSingle()
  if (!ben) return NextResponse.json({ error: 'נרשם לא נמצא' }, { status: 404 })
  if (ben.eligibility_status !== 'approved') {
    return NextResponse.json({ error: 'עדכון פרטים זמין רק לאחר אישור החשבון' }, { status: 403 })
  }

  // עדכון השדות המותרים בלבד
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (phone !== undefined) update.phone = phone ? String(phone).trim() : null
  if (phone2 !== undefined) update.phone2 = phone2 ? String(phone2).trim() : null
  if (address !== undefined) update.address = address ? String(address).trim() : null
  if (city !== undefined) update.city = city ? String(city).trim() : null
  if (email !== undefined) update.email = email ? String(email).toLowerCase().trim() : null
  if (marital_status !== undefined) update.marital_status = marital_status ? String(marital_status) : null

  const { error } = await admin.from('beneficiaries').update(update).eq('id', String(beneficiary_id))
  if (error) return NextResponse.json({ error: `שגיאה בעדכון: ${error.message}` }, { status: 500 })

  return NextResponse.json({ ok: true })
}
