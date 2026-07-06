import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { verifyVerifyToken, normalizeVerifyValue } from '@/lib/verifyToken'
import { normalizePhone } from '@/lib/phone'
import { validateIsraeliId } from '@/lib/validation'

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

  const { beneficiary_id, phone, phone2, spouse_phone, address, city, email, marital_status,
    email_verify_token, phone_verify_token, phone_tokens, children, children_count } = body
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
    .select('id, eligibility_status, phone, email, verified_phones')
    .eq('id', String(beneficiary_id))
    .maybeSingle()
  if (!ben) return NextResponse.json({ error: 'נרשם לא נמצא' }, { status: 404 })
  if (ben.eligibility_status === 'rejected') {
    return NextResponse.json({ error: 'עדכון פרטים אינו זמין עבור חשבון זה' }, { status: 403 })
  }

  // עדכון השדות המותרים בלבד
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  // שינוי מייל/טלפון ראשי דורש אסימון אימות תקף לערך החדש (אם אכן השתנה).
  if (email !== undefined) {
    const newEmail = email ? String(email).toLowerCase().trim() : ''
    const changed = normalizeVerifyValue('email', newEmail) !== normalizeVerifyValue('email', String(ben.email ?? ''))
    if (changed && newEmail && !verifyVerifyToken(email_verify_token as string | undefined, 'email', newEmail)) {
      return NextResponse.json({ error: 'יש לאמת את כתובת המייל החדשה בקוד שנשלח אליה.' }, { status: 400 })
    }
    update.email = newEmail || null
  }
  if (phone !== undefined) {
    const newPhone = phone ? String(phone).trim() : ''
    const changed = normalizeVerifyValue('phone', newPhone) !== normalizeVerifyValue('phone', String(ben.phone ?? ''))
    if (changed && newPhone && !verifyVerifyToken(phone_verify_token as string | undefined, 'phone', newPhone)) {
      return NextResponse.json({ error: 'יש לאמת את מספר הטלפון החדש בקוד שיוקרא בשיחה.' }, { status: 400 })
    }
    update.phone = newPhone || null
  }
  if (phone2 !== undefined) update.phone2 = phone2 ? String(phone2).trim() : null
  if (spouse_phone !== undefined) update.spouse_phone = spouse_phone ? String(spouse_phone).trim() : null
  if (address !== undefined) update.address = address ? String(address).trim() : null
  if (city !== undefined) update.city = city ? String(city).trim() : null
  if (marital_status !== undefined) update.marital_status = marital_status ? String(marital_status) : null

  // איחוד טלפונים שאומתו כעת אל רשימת המספרים המאומתים (מאפשר קבלת קוד בעתיד)
  const existingVerified = Array.isArray((ben as { verified_phones?: string[] }).verified_phones)
    ? ((ben as { verified_phones: string[] }).verified_phones)
    : []
  const verifiedSet = new Set(existingVerified.map(p => normalizePhone(p)).filter(Boolean))
  const rawTokens = Array.isArray(phone_tokens) ? (phone_tokens as { value?: unknown; token?: unknown }[]) : []
  for (const t of rawTokens) {
    const val = t?.value ? String(t.value).trim() : ''
    const tok = t?.token ? String(t.token) : ''
    if (val && tok && verifyVerifyToken(tok, 'phone', val)) verifiedSet.add(normalizePhone(val))
  }
  if (verifiedSet.size !== existingVerified.length || existingVerified.some(p => !verifiedSet.has(normalizePhone(p)))) {
    update.verified_phones = [...verifiedSet]
  }

  // עדכון רשימת הילדים — כולל אימות ת"ז ובדיקת כפילות מול המערכת (למעט המשפחה הנוכחית)
  if (children !== undefined) {
    if (!Array.isArray(children)) {
      return NextResponse.json({ error: 'רשימת הילדים אינה תקינה' }, { status: 400 })
    }
    const seen = new Set<string>()
    for (const c of children as { name?: string; id_number?: string }[]) {
      const name = (c?.name ?? '').trim()
      const cid = (c?.id_number ?? '').replace(/\D/g, '')
      const childLabel = name || 'הילד/ה'
      if (!name || !cid) {
        return NextResponse.json({ error: `יש להזין שם ותעודת זהות עבור ${childLabel}` }, { status: 400 })
      }
      if (!validateIsraeliId(cid)) {
        return NextResponse.json({ error: `תעודת הזהות של ${childLabel} אינה תקינה` }, { status: 400 })
      }
      if (seen.has(cid)) {
        return NextResponse.json({ error: `תעודת הזהות של ${childLabel} מופיעה פעמיים ברשימת הילדים.` }, { status: 400 })
      }
      seen.add(cid)
      // כבר קיים במערכת על רשומה אחרת (כמוטב, כבן/בת זוג, או כילד) — לא כולל המשפחה הנוכחית
      const { data: asBen } = await admin.from('beneficiaries').select('id')
        .or(`id_number.eq.${cid},spouse_id_number.eq.${cid}`).neq('id', String(beneficiary_id)).limit(1)
      const { data: asChild } = await admin.from('beneficiaries').select('id')
        .contains('children', [{ id_number: cid }]).neq('id', String(beneficiary_id)).limit(1)
      if (asBen?.length || asChild?.length) {
        return NextResponse.json({ error: `תעודת הזהות של ${childLabel} כבר קיימת במערכת. לא ניתן לרשום אותה פעם נוספת.` }, { status: 400 })
      }
    }
    update.children = children.length > 0 ? children : null
    update.children_count = typeof children_count === 'number' ? children_count : children.length
  }

  const { error } = await admin.from('beneficiaries').update(update).eq('id', String(beneficiary_id))
  if (error) return NextResponse.json({ error: `שגיאה בעדכון: ${error.message}` }, { status: 500 })

  return NextResponse.json({ ok: true })
}
