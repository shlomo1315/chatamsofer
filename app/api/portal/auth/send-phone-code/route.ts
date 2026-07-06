import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { generateCode, hashCode } from '@/lib/portalPassword'
import { normalizeId, resolveBeneficiaryByEnteredId } from '@/lib/portalBeneficiary'
import { normalizePhone, maskPhone } from '@/lib/phone'
import { placeCodeCall, yemotCallConfigured } from '@/lib/yemotCall'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// סדר קבוע — כדי שהאינדקס יהיה יציב בין שלב הרשימה לשלב השליחה
const PHONE_FIELDS = ['phone', 'phone2', 'spouse_phone'] as const

// כניסה לפורטל באמצעות קוד טלפוני (צינתוק ימות).
//   שלב 1: { idType, id }                 → מחזיר רשימת מספרים ממוסכים לבחירה
//   שלב 2: { idType, id, phoneIndex }     → מצלצל למספר הנבחר ומקריא קוד חד-פעמי
export async function POST(request: NextRequest) {
  if (!rateLimit(`portal-phonecode:${clientIp(request)}`, 8, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב בעוד מספר דקות.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const idNumber = normalizeId(body.idType, body.id)
  if (!idNumber || idNumber.length < 5) {
    return NextResponse.json({ error: 'מספר תעודת זהות לא תקין' }, { status: 400 })
  }

  if (!yemotCallConfigured()) {
    return NextResponse.json({ error: 'כניסה טלפונית אינה זמינה כרגע. אנא היכנס עם סיסמה.' }, { status: 503 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const data = await resolveBeneficiaryByEnteredId<{ id: string; phone: string | null; phone2: string | null; spouse_phone: string | null; verified_phones: string[] | null }>(
    admin, idNumber, 'id, phone, phone2, spouse_phone, verified_phones',
  )

  // רק מספרים שאומתו יכולים לקבל קוד. תאימות לאחור: אם אין רשימת מאומתים (חשבון ותיק) —
  // מאפשרים את כל המספרים הקיימים כמו קודם, כדי לא לנעל משתמשים שנרשמו לפני השינוי.
  const verifiedSet = new Set(
    (data?.verified_phones ?? []).map((p) => normalizePhone(p)).filter((p) => p.length >= 9),
  )
  const available = data
    ? PHONE_FIELDS
        .map((f) => normalizePhone((data as Record<string, string | null>)[f] as string | null))
        .filter((p) => p.length >= 9)
        .filter((p) => verifiedSet.size === 0 || verifiedSet.has(p))
    : []

  // ── שלב 1: החזרת רשימת מספרים ממוסכים (לא חושפים אם הת"ז קיימת) ──
  if (body.phoneIndex === undefined || body.phoneIndex === null) {
    return NextResponse.json({
      ok: true,
      phones: available.map((p, i) => ({ index: i, hint: maskPhone(p) })),
    })
  }

  // ── שלב 2: שליחת קוד בשיחה למספר הנבחר ──
  const idx = Number(body.phoneIndex)
  const phone = Number.isInteger(idx) && idx >= 0 && idx < available.length ? available[idx] : null
  if (!data || !phone) {
    return NextResponse.json({ error: 'בחירת מספר לא תקינה. נסה שוב.' }, { status: 400 })
  }

  // הגבלת קצב לפי ת"ז ולפי מספר היעד — שמתקשר אחד לא יטריד מספר
  if (!rateLimit(`portal-phonecode-id:${idNumber}`, 3, 15 * 60 * 1000) ||
      !rateLimit(`portal-phonecode-num:${phone}`, 3, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'כבר נשלח קוד לאחרונה. נסה שוב בעוד מספר דקות.' }, { status: 429 })
  }

  const code = generateCode()
  const codeHash = await hashCode(code)
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  // hash — לאימות מה שיוקלד בפורטל; plain — כדי ששלוחת ה-OTP תוכל להקריא בשיחה.
  const { error: upErr } = await admin
    .from('beneficiaries')
    .update({
      portal_phone_code_hash: codeHash,
      portal_phone_code_plain: code,
      portal_phone_code_expires: expires,
      portal_phone_code_attempts: 0,
    })
    .eq('id', data.id)
  if (upErr) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const call = await placeCodeCall(phone, code)
  if (!call.ok) {
    console.error('[send-phone-code] placeCodeCall failed:', call.error)
    // ניקוי הקוד אם השיחה לא יצאה
    await admin
      .from('beneficiaries')
      .update({ portal_phone_code_hash: null, portal_phone_code_plain: null, portal_phone_code_expires: null })
      .eq('id', data.id)
    return NextResponse.json(
      { error: 'השיחה נכשלה. נסה שוב או היכנס עם סיסמה.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, sent: true, phoneHint: maskPhone(phone) })
}
