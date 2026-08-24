import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { buildCardVoucherOnly, buildRecoveryVoucherOnly } from '@/lib/maternityVoucher'
import { recoveryDaysOf } from '@/lib/maternity'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { shell } from '@/lib/emailTemplates'
import { voucherLabel, type VoucherKind } from '@/lib/maternityVoucherPrompt'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// שליחת שוברים ליולדת לפי בחירה מפורשת של המזכיר.
//
// 🔴 קיים כי השליחה הייתה שקטה ולא עקבית: בית החלמה שהשתנה בכרטסת שלח
// שובר, אותו שינוי מהעריכה לא שלח כלום, ושינוי בחירת ההטבות לא שלח דבר
// בשום מסלול. יולדת שהוסיפה כרטיס מזון או בית החלמה נשארה בלי השובר.
// עכשיו המסך שואל, והנתיב הזה מבצע — כך שהשליחה תמיד מודעת.
//
// ⚠️ אין middleware — הנתיב מגן על עצמו.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden('אין הרשאה לשלוח שוברים')

  const body = await request.json().catch(() => null) as
    | { aidId?: string; kinds?: VoucherKind[] } | null
  const aidId = body?.aidId
  const kinds = Array.isArray(body?.kinds)
    ? body!.kinds.filter((k): k is VoucherKind => k === 'card' || k === 'recovery')
    : []
  if (!aidId) return NextResponse.json({ error: 'חסר מזהה תיק' }, { status: 400 })
  if (!kinds.length) return NextResponse.json({ error: 'לא נבחר שובר לשליחה' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ טיפוס מפורש: ה-select עם join מפורק לשתי מחרוזות, וה-SDK אינו
  // גוזר ממנו את צורת השורה.
  interface AidRow {
    id: string; status?: string | null; birth_type?: string | null
    birth_date?: string | null; recovery_home?: string | null
    is_twins?: boolean | null; recovery_eligibility_days?: number | null
    voucher_serial?: string | null; beneficiary?: unknown
  }
  const { data: aidRaw } = await admin
    .from('maternity_aids')
    .select('id, status, birth_type, birth_date, recovery_home, is_twins, recovery_eligibility_days, voucher_serial, ' +
      'beneficiary:beneficiaries(email, full_name, family_name, spouse_name, spouse_id_number, id_number, address, city, phone, spouse_phone)')
    .eq('id', aidId)
    .maybeSingle()

  const aid = aidRaw as AidRow | null
  if (!aid) return NextResponse.json({ error: 'התיק לא נמצא' }, { status: 404 })
  // ⚠️ שובר ליולדת שהבקשה שלה טרם אושרה הוא הבטחה שלא ניתנה.
  if (aid.status !== 'active') {
    return NextResponse.json({ error: 'הלידה טרם אושרה — לא נשלח שובר' }, { status: 409 })
  }
  if ((aid.birth_type ?? 'live') === 'silent') {
    return NextResponse.json({ error: 'לידה שקטה — לא נשלחים שוברים' }, { status: 409 })
  }

  const ben = aid.beneficiary as {
    email?: string | null; full_name?: string | null; family_name?: string | null
    spouse_name?: string | null; spouse_id_number?: string | null; id_number?: string | null
    address?: string | null; city?: string | null; phone?: string | null; spouse_phone?: string | null
  } | null
  if (!ben?.email) return NextResponse.json({ error: 'למשפחה אין כתובת מייל' }, { status: 400 })

  const motherName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || (ben.full_name ?? '')
  const days = recoveryDaysOf({ recovery_eligibility_days: aid.recovery_eligibility_days, is_twins: aid.is_twins })
  const input = {
    motherName,
    motherId: ben.spouse_id_number || ben.id_number,
    address: ben.address, city: ben.city, phone: ben.phone, spousePhone: ben.spouse_phone,
    birthDate: aid.birth_date, recoveryHome: aid.recovery_home,
    recoveryDays: days, serial: aid.voucher_serial,
  }

  // ⚠️ שני השוברים בהודעה אחת ולא בשתי הודעות — היולדת מקבלת מייל אחד
  // עם כל מה שהתעדכן, ולא שניים שנראים כמו כפילות.
  const attachments = [
    ...(kinds.includes('card') ? await buildCardVoucherOnly(input) : []),
    ...(kinds.includes('recovery') ? await buildRecoveryVoucherOnly(input) : []),
  ]

  const names = kinds.map(voucherLabel)
  const listHtml = names.map(n => `<li style="margin:4px 0;">${n}</li>`).join('')
  const body_ = `
    <p style="margin:0 0 14px;color:#0f172a;font-size:18px;font-weight:800;">שלום ${motherName},</p>
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">
      פרטי הזכאות שלכם עודכנו. מצורפים השוברים המעודכנים:
    </p>
    <ul style="margin:0 0 16px;padding-inline-start:20px;color:#334155;font-size:15px;">${listHtml}</ul>
    ${kinds.includes('recovery') ? `
    <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:14px 16px;margin:0 0 16px;">
      <p style="margin:0;color:#3730a3;font-size:15px;font-weight:700;">ימי זכאות בבית ההחלמה: ${days} ימים</p>
      ${aid.recovery_home ? `<p style="margin:6px 0 0;color:#4338ca;font-size:13px;">בית החלמה: ${aid.recovery_home}</p>` : ''}
    </div>` : ''}
    <p style="margin:0;color:#64748b;font-size:13px;">נא להציג את השוברים המעודכנים בעת ההגעה. לבירורים ניתן לפנות למזכירות היכל החתם סופר.</p>
  `
  const html = shell({
    preheader: `שוברים מעודכנים — ${names.join(' · ')}`,
    accent: '#4f46e5', title: 'שוברים מעודכנים', subtitle: 'אגף עזר ליולדות · היכל החתם סופר', body: body_,
  })

  const res = await deliverMail(ben.email, 'שוברים מעודכנים ליולדת — היכל החתם סופר', html, attachments, mailFor('maternity'))
  if (!res.ok) {
    return NextResponse.json({ error: res.error || 'השליחה נכשלה' }, { status: 502 })
  }

  await logActivity(admin, {
    userId: staff.userId,
    action: 'maternity_vouchers_sent',
    entityType: 'maternity_aid',
    entityId: aidId,
    details: { kinds, email: ben.email },
  })

  return NextResponse.json({ ok: true, sent: kinds })
}
