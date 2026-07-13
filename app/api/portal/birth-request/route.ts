import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { deliverMail, urlToAttachment } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { requestReceivedEmail } from '@/lib/emailTemplates'
import { signedDocUrl } from '@/lib/docUrl'
import { validateIsraeliId } from '@/lib/validation'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { notifyRejectedRequest } from '@/lib/rejectedRequestMail'
import { defaultRecoveryDays, type BabyEntry } from '@/lib/maternity'
import { rateLimit } from '@/lib/rateLimit'
import { MATERNITY_WINDOW_DAYS } from '@/lib/emailRequestForms'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const { beneficiary_id, birth_date, baby_name, baby_gender, recovery_home, notes, baby_id_number, baby_id_type, birth_certificate_url, birth_type, card_center_id, is_twins, babies } = body

  if (!beneficiary_id || !birth_date) {
    return NextResponse.json({ error: 'שדות חובה חסרים' }, { status: 400 })
  }

  // ── חלון הזכאות: 6 שבועות (42 יום) מהלידה ──
  // בורר התאריכים בטופס כבר מגביל, אבל אסור להסתמך על הלקוח: בקשה שנשלחת
  // ישירות ל-API עוקפת אותו לגמרי. זה אותו כלל שנאכף בהגשה במייל.
  const bd = new Date(String(birth_date))
  if (isNaN(bd.getTime())) {
    return NextResponse.json({ error: 'תאריך לידה אינו תקין' }, { status: 400 })
  }
  bd.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const deadline = new Date(bd.getTime() + MATERNITY_WINDOW_DAYS * 86400000)
  const fmt = (d: Date) => d.toLocaleDateString('he-IL')

  if (today > deadline) {
    return NextResponse.json({
      error: `עברו יותר מ-6 שבועות מתאריך הלידה (${fmt(bd)}) — חלון ההגשה הסתיים ב-${fmt(deadline)}. אם קיימות נסיבות מיוחדות, אנא פנו למשרד.`,
    }, { status: 400 })
  }
  if (bd.getTime() > today.getTime()) {
    return NextResponse.json({ error: 'תאריך הלידה הוא בעתיד — נא לבדוק את התאריך שהוזן' }, { status: 400 })
  }

  // אימות סשן הפורטל — הגשת בקשה רק עבור המוטב שאותר בסשן הנוכחי
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId || sessionId !== String(beneficiary_id)) {
    return NextResponse.json({ error: 'נדרש אימות מחדש — נא לבצע כניסה מחדש לפורטל' }, { status: 401 })
  }

  // הגבלת קצב per-מוטב — בולמת הצפת בקשות (spam / double-submit)
  if (!rateLimit(`birth-request:${sessionId}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'הגשת יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 })
  }

  // לידה שקטה: ללא פרטי ילד (שם/ת.ז/מין) — רק מסמך אישור
  const isSilent = birth_type === 'silent'
  const twins = !isSilent && is_twins === true

  // בונים את רשימת התינוקות — בלידת תאומים מגיע מערך babies (שני תינוקות),
  // אחרת נופלים לשדות התינוק הבודד (תאימות לאחור עם לקוחות ישנים).
  type RawBaby = { name?: unknown; gender?: unknown; id_type?: unknown; id_number?: unknown }
  const rawBabies: RawBaby[] = Array.isArray(babies) && babies.length
    ? (babies as RawBaby[])
    : [{ name: baby_name, gender: baby_gender, id_type: baby_id_type, id_number: baby_id_number }]

  // נרמול + אימות כל תינוק (מדולג כליל בלידה שקטה)
  const normBabies: BabyEntry[] = []
  if (!isSilent) {
    const active = rawBabies.slice(0, twins ? 2 : 1)
    if (twins && active.length < 2) {
      return NextResponse.json({ error: 'בלידת תאומים יש להזין את פרטי שני התינוקות' }, { status: 400 })
    }
    for (const b of active) {
      const idRaw = b.id_number ? String(b.id_number).trim() : ''
      const isPass = b.id_type === 'passport'
      const gender = b.gender === 'male' || b.gender === 'female' ? b.gender : null
      if (!idRaw) return NextResponse.json({ error: 'יש להזין תעודת זהות או דרכון של הנולד/ת' }, { status: 400 })
      if (!isPass && !validateIsraeliId(idRaw)) {
        return NextResponse.json({ error: 'תעודת הזהות של הנולד/ת אינה תקינה' }, { status: 400 })
      }
      const idNorm = isPass ? idRaw : idRaw.replace(/\D/g, '').padStart(9, '0')
      normBabies.push({ name: b.name ? String(b.name).trim() : null, gender, id_type: isPass ? 'passport' : 'id', id_number: idNorm })
    }
    // תאומים — חובה שתי תעודות זהות שונות
    if (twins && normBabies[0].id_number === normBabies[1].id_number) {
      return NextResponse.json({ error: 'שני התאומים חייבים להיות עם תעודות זהות שונות' }, { status: 400 })
    }
  }
  const primary = normBabies[0]

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, eligibility_status, rejection_reason, email, full_name, family_name, id_number, phone, address, city, marital_status, spouse_name, spouse_id_number, children_count')
    .eq('id', String(beneficiary_id))
    .maybeSingle()

  if (!ben) return NextResponse.json({ error: 'נרשם לא נמצא' }, { status: 404 })
  if (ben.eligibility_status === 'rejected') {
    notifyRejectedRequest(ben)
    return NextResponse.json({ error: 'הגשת בקשה אינה זמינה עבור חשבון זה' }, { status: 403 })
  }

  // מניעת כפילויות — בודקים כל אחת מתעודות הזהות של הנולדים (בלידה שקטה אין ת.ז)
  for (const b of normBabies) {
    const idNorm = b.id_number as string
    const [byBen, bySpouse, byChild, byMaternity] = await Promise.all([
      admin.from('beneficiaries').select('id').eq('id_number', idNorm).limit(1),
      admin.from('beneficiaries').select('id').eq('spouse_id_number', idNorm).limit(1),
      admin.from('beneficiaries').select('id').contains('children', [{ id_number: idNorm }]).limit(1),
      admin.from('maternity_aids').select('id').eq('baby_id_number', idNorm).limit(1),
    ])
    if ((byBen.data?.length || bySpouse.data?.length || byChild.data?.length || byMaternity.data?.length)) {
      return NextResponse.json({ error: `הילד/ה כבר רשום/ה במערכת — תעודת זהות ${idNorm} כבר קיימת. לא ניתן להגיש בקשה כפולה.` }, { status: 409 })
    }
  }

  const { error } = await admin.from('maternity_aids').insert({
    beneficiary_id: String(beneficiary_id),
    birth_date: String(birth_date),
    baby_name: (!isSilent && primary?.name) ? primary.name : null,
    baby_gender: (!isSilent && primary?.gender) ? primary.gender : null,
    baby_id_number: primary?.id_number ?? null,
    baby_id_type: primary ? primary.id_type : null,
    is_twins: twins,
    babies: (!isSilent && normBabies.length) ? normBabies : null,
    recovery_eligibility_days: defaultRecoveryDays(twins),
    birth_certificate_url: birth_certificate_url ? String(birth_certificate_url) : null,
    recovery_home: recovery_home ? String(recovery_home).trim() : null,
    card_center_id: (!isSilent && card_center_id) ? String(card_center_id) : null,
    notes: notes ? String(notes).trim() : null,
    birth_type: isSilent ? 'silent' : 'live',
    status: 'pending',
  })

  if (error) {
    return NextResponse.json({ error: 'שגיאה בשמירת הבקשה. אנא נסה שוב.' }, { status: 500 })
  }

  // אישור קבלה לצאצא (לא חוסם את הבקשה אם המייל נכשל) — כולל פרטי המבקש, פרטי הלידה והמסמך
  if (ben.email) {
    const benEmail = ben.email
    const genderLbl = (g?: string | null) => g === 'male' ? 'בן' : g === 'female' ? 'בת' : ''
    const certUrl = birth_certificate_url ? String(birth_certificate_url) : ''
    // שורות פרטי התינוקות למייל — בתאומים מפורטות לכל תינוק בנפרד
    const babyRows: [string, string][] = twins
      ? normBabies.flatMap((b, i): [string, string][] => [
          [`תינוק ${i + 1} — שם`, b.name || '(יושלם בהמשך)'],
          [`תינוק ${i + 1} — מין`, genderLbl(b.gender)],
          [`תינוק ${i + 1} — ${b.id_type === 'passport' ? 'דרכון' : 'ת.ז'}`, b.id_number ?? ''],
        ])
      : [
          [primary?.gender === 'female' ? 'שם הנולדת' : 'שם הנולד', primary?.name || ''],
          ['מין', genderLbl(primary?.gender)],
          [primary?.id_type === 'passport' ? 'דרכון הנולד/ת' : 'ת.ז הנולד/ת', primary?.id_number ?? ''],
        ]
    void (async () => {
      const mail = requestReceivedEmail({
        type: 'birth', firstTime: ben.eligibility_status !== 'approved', beneficiary: ben,
        requestRows: isSilent
          ? [
              ['סוג בקשה', 'לאחר לידה שקטה'],
              ['תאריך לידה', String(birth_date)],
              ['בית החלמה', recovery_home ? String(recovery_home).trim() : ''],
            ]
          : [
              ...(twins ? [['סוג לידה', 'תאומים'] as [string, string]] : []),
              ...babyRows,
              ['תאריך לידה', String(birth_date)],
              ['בית החלמה', recovery_home ? String(recovery_home).trim() : ''],
            ],
        documents: [{ name: 'אישור לידה', url: certUrl ? await signedDocUrl(admin, certUrl) : undefined }],
      })
      const att = certUrl ? await urlToAttachment(certUrl, 'אישור-לידה') : null
      await deliverMail(benEmail, mail.subject, mail.html, att ? [att] : undefined, mailFor('igud'))
    })().catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
