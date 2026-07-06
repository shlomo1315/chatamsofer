import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { deliverMail, type MailAttachment } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { loanApprovedEmail, birthApprovedEmail, type RequestApprovedBeneficiary } from '@/lib/emailTemplates'
import { loadMaternityCardOnApproval } from '@/lib/maternityCards'
import { buildMaternityVouchers } from '@/lib/maternityVoucher'
import { recoveryDaysOf } from '@/lib/maternity'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// נקרא כאשר המזכיר מאשר בקשת הלוואה/לידה:
// 1. שולח לנרשם מייל מעוצב "בקשתך אושרה" עם הפרטים שלו ופרטי הבקשה.
// 2. אם המשפחה טרם אושרה — הופך אותה אוטומטית ל"מאושר" (לבקשות הבאות).
//    אין מייל נפרד על "אישור כצאצא" — רק על אישור הבקשה.
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  let body: { type?: string; id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const { type, id } = body
  if (!id || (type !== 'loan' && type !== 'maternity')) {
    return NextResponse.json({ error: 'פרמטרים חסרים' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const benSelect = 'id, full_name, family_name, id_number, spouse_id_number, spouse_name, marital_status, phone, phone2, spouse_phone, address, city, children_count, email, eligibility_status'
  const table = type === 'loan' ? 'loans' : 'maternity_aids'
  const reqSelect = type === 'loan'
    ? `amount, approved_amount, installments, monthly_payment, purpose, beneficiary:beneficiaries(${benSelect})`
    : `baby_name, baby_gender, birth_date, recovery_home, birth_type, is_twins, recovery_eligibility_days, card_center_id, voucher_serial, beneficiary:beneficiaries(${benSelect})`

  const { data: req, error } = await admin.from(table).select(reqSelect).eq('id', id).maybeSingle()
  if (error || !req) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })

  const ben = (req as unknown as Record<string, unknown>).beneficiary as (RequestApprovedBeneficiary & { id?: string; email?: string | null; eligibility_status?: string }) | null
  if (!ben?.id) return NextResponse.json({ error: 'נתמך לא נמצא' }, { status: 404 })

  // ── אישור לידה: איתור המוקד שנבחר + בדיקת מלאי + מספר סידורי ──
  const birth = req as unknown as { birth_date?: string; recovery_home?: string; birth_type?: string; is_twins?: boolean; recovery_eligibility_days?: number | null; card_center_id?: string | null; voucher_serial?: string | null }
  let center: { name: string; city?: string | null; address?: string | null; pickup_days?: string | null; pickup_hours?: string | null } | null = null
  let stockAvailable = false
  let serial = birth.voucher_serial ?? null
  if (type === 'maternity') {
    if (birth.card_center_id) {
      const { data: ctr } = await admin
        .from('card_centers')
        .select('id, name, city, address, pickup_days, pickup_hours, stock')
        .eq('id', birth.card_center_id)
        .maybeSingle()
      if (ctr) {
        center = { name: ctr.name, city: ctr.city, address: ctr.address, pickup_days: ctr.pickup_days, pickup_hours: ctr.pickup_hours }
        stockAvailable = (ctr.stock ?? 0) > 0
      }
    }
    // מספר סידורי: תאריך הלידה DDMMYYYY + נקודה + 4 ספרות אחרונות של ת.ז היולדת (האשה)
    // (למשל 22062026.4488)
    if (!serial) {
      const bd = birth.birth_date ? new Date(birth.birth_date) : null
      const ds = bd && !isNaN(bd.getTime())
        ? `${String(bd.getDate()).padStart(2, '0')}${String(bd.getMonth() + 1).padStart(2, '0')}${bd.getFullYear()}`
        : '00000000'
      const motherId = (ben as { spouse_id_number?: string | null; id_number?: string | null }).spouse_id_number
        || (ben as { id_number?: string | null }).id_number
      const idLast4 = String(motherId ?? '').replace(/\D/g, '').slice(-4).padStart(4, '0')
      serial = `${ds}.${idLast4}`
    }
  }

  // ── עדכונים מהירים ב-DB (חובה לפני התגובה — כדי שהמסך יתעדכן מיד) ──
  // עדכון הלידה: מספר סידורי + סטטוס שובר; אם יש מלאי — מונה "ממתינים לאיסוף" +1
  if (type === 'maternity') {
    await admin.from('maternity_aids').update({
      voucher_serial: serial,
      card_voucher_status: stockAvailable ? 'issued' : 'awaiting_stock',
    }).eq('id', id).then(undefined, () => {})
    if (stockAvailable && birth.card_center_id) {
      // שריון מיידי של כרטיס: מורידים כרטיס אחד מהמלאי של המוקד כבר בעת אישור הלידה
      // (המשפחה תבוא לאסוף אותו — הכרטיס כבר "תפוס" עבורה), ומעלים מונה ממתינים לאיסוף.
      // החיבור בטלפון לא יוריד שוב מהמלאי כדי למנוע הורדה כפולה.
      await admin.rpc('decrement_card_center_stock', { p_center_id: birth.card_center_id }).then(undefined, () => {})
      await admin.rpc('bump_center_pending_pickups', { p_center_id: birth.card_center_id, p_delta: 1 }).then(undefined, () => {})
    }
  }

  // הפיכה אוטומטית ל"מאושר" אם טרם אושר — ללא מייל נפרד
  let promoted = false
  if (ben.eligibility_status !== 'approved') {
    const { error: upErr } = await admin
      .from('beneficiaries')
      .update({ eligibility_status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', ben.id)
    if (!upErr) promoted = true
    else console.error('[request-approved] promote failed:', upErr.message)
  }

  // ── תופעות לוואי איטיות ברקע (מייל+שוברים, והטענת נדרים) — לא חוסמות את התגובה.
  // ב-Railway השרת נשאר חי, כך שהעבודה ברקע מסתיימת גם לאחר שהתגובה נשלחה.
  void (async () => {
    // 1. מייל אישור הבקשה (+ שוברים ללידה)
    if (ben.email) {
      try {
        // מספרי הטלפון המעודכנים של המשפחה — להפעלת הכרטיס (המערכת מזהה לפי מספרים אלו בלבד)
        const benPhones = [(ben as { phone?: string | null }).phone, (ben as { spouse_phone?: string | null }).spouse_phone, (ben as { phone2?: string | null }).phone2]
        const mail = type === 'loan'
          ? loanApprovedEmail(ben, req as unknown as { amount?: number; approved_amount?: number | null; installments?: number; monthly_payment?: number; purpose?: string })
          : birthApprovedEmail(ben, req as unknown as { baby_name?: string; baby_gender?: string; birth_date?: string; recovery_home?: string }, { center, stockAvailable, serial, phones: benPhones })

        // אישור לידה (רגילה, לא שקטה) → שובר הבראה תמיד; שובר כרטיס רק אם יש מלאי במוקד שנבחר
        let attachments: MailAttachment[] | undefined
        if (type === 'maternity' && (birth.birth_type ?? 'live') !== 'silent') {
          try {
            const motherName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || (ben.full_name ?? '')
            const b = ben as RequestApprovedBeneficiary & { id_number?: string | null; spouse_id_number?: string | null; address?: string | null; city?: string | null; phone?: string | null; spouse_phone?: string | null }
            // ת"ז היולדת = האשה (spouse), עם נפילה-לאחור לרשומה הראשית
            const motherId = b.spouse_id_number || b.id_number
            attachments = await buildMaternityVouchers({
              motherName, motherId, address: b.address, city: b.city, phone: b.phone, spousePhone: b.spouse_phone,
              birthDate: birth.birth_date, recoveryHome: birth.recovery_home,
              recoveryDays: recoveryDaysOf({ recovery_eligibility_days: birth.recovery_eligibility_days, is_twins: birth.is_twins }),
              serial,
              centers: center ? [center] : [],
            }, { includeCard: stockAvailable })
          } catch (e) { console.error('[request-approved] voucher build failed:', e) }
        }

        await deliverMail(ben.email, mail.subject, mail.html, attachments, mailFor(type === 'loan' ? 'gemach' : 'maternity'))
      } catch (e) { console.error('[request-approved] mail failed:', e) }
    }

    // 2. אישור לידה → הטענת 600 ₪ אוטומטית בנדרים (איתור/הקמת המשפחה לפי ת.ז)
    if (type === 'maternity') {
      try { await loadMaternityCardOnApproval(admin, id) }
      catch (e) { console.error('[request-approved] maternity nedarim load failed:', e) }
    }
  })()

  return NextResponse.json({ ok: true, promoted })
}
