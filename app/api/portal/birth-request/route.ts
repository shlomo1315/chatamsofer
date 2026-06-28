import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { deliverMail, urlToAttachment } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { requestReceivedEmail } from '@/lib/emailTemplates'
import { signedDocUrl } from '@/lib/docUrl'
import { validateIsraeliId } from '@/lib/validation'
import { getPortalBeneficiaryId } from '@/lib/portalSession'

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

  const { beneficiary_id, birth_date, baby_name, baby_gender, recovery_home, notes, baby_id_number, baby_id_type, birth_certificate_url, birth_type } = body

  if (!beneficiary_id || !birth_date) {
    return NextResponse.json({ error: 'שדות חובה חסרים' }, { status: 400 })
  }

  // אימות סשן הפורטל — הגשת בקשה רק עבור המוטב שאותר בסשן הנוכחי
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId || sessionId !== String(beneficiary_id)) {
    return NextResponse.json({ error: 'נדרש אימות מחדש — נא לבצע כניסה מחדש לפורטל' }, { status: 401 })
  }

  // לידה שקטה: ללא פרטי ילד (שם/ת.ז/מין) — רק מסמך אישור
  const isSilent = birth_type === 'silent'
  const babyId = baby_id_number ? String(baby_id_number).trim() : ''
  const isPassport = baby_id_type === 'passport'
  if (!isSilent) {
    if (!babyId) return NextResponse.json({ error: 'יש להזין תעודת זהות או דרכון של הנולד/ת' }, { status: 400 })
    if (!isPassport && !validateIsraeliId(babyId)) {
      return NextResponse.json({ error: 'תעודת הזהות של הנולד/ת אינה תקינה' }, { status: 400 })
    }
  }
  const babyIdNorm = babyId ? (isPassport ? babyId : babyId.replace(/\D/g, '').padStart(9, '0')) : null

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, eligibility_status, email, full_name, family_name, id_number, phone, address, city, marital_status, spouse_name, spouse_id_number, children_count')
    .eq('id', String(beneficiary_id))
    .maybeSingle()

  if (!ben) return NextResponse.json({ error: 'נרשם לא נמצא' }, { status: 404 })
  if (ben.eligibility_status === 'rejected') {
    return NextResponse.json({ error: 'הגשת בקשה אינה זמינה עבור חשבון זה' }, { status: 403 })
  }

  // מניעת כפילויות — רק כשיש ת.ז של נולד (לא בלידה שקטה)
  if (babyIdNorm) {
    const [byBen, bySpouse, byChild, byMaternity] = await Promise.all([
      admin.from('beneficiaries').select('id').eq('id_number', babyIdNorm).limit(1),
      admin.from('beneficiaries').select('id').eq('spouse_id_number', babyIdNorm).limit(1),
      admin.from('beneficiaries').select('id').contains('children', [{ id_number: babyIdNorm }]).limit(1),
      admin.from('maternity_aids').select('id').eq('baby_id_number', babyIdNorm).limit(1),
    ])
    if ((byBen.data?.length || bySpouse.data?.length || byChild.data?.length || byMaternity.data?.length)) {
      return NextResponse.json({ error: 'הילד/ה כבר רשום/ה במערכת — תעודת זהות זו כבר קיימת. לא ניתן להגיש בקשה כפולה.' }, { status: 409 })
    }
  }

  const { error } = await admin.from('maternity_aids').insert({
    beneficiary_id: String(beneficiary_id),
    birth_date: String(birth_date),
    baby_name: (!isSilent && baby_name) ? String(baby_name).trim() : null,
    baby_gender: (!isSilent && baby_gender) ? baby_gender : null,
    baby_id_number: babyIdNorm,
    baby_id_type: babyIdNorm ? (isPassport ? 'passport' : 'id') : null,
    birth_certificate_url: birth_certificate_url ? String(birth_certificate_url) : null,
    recovery_home: recovery_home ? String(recovery_home).trim() : null,
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
    const genderLabel = baby_gender === 'male' ? 'בן' : baby_gender === 'female' ? 'בת' : ''
    const certUrl = birth_certificate_url ? String(birth_certificate_url) : ''
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
              [baby_gender === 'female' ? 'שם הנולדת' : 'שם הנולד', baby_name ? String(baby_name).trim() : ''],
              ['מין', genderLabel],
              ['תאריך לידה', String(birth_date)],
              [isPassport ? 'דרכון הנולד/ת' : 'ת.ז הנולד/ת', babyIdNorm ?? ''],
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
