import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { isValidEmail } from '@/lib/emailVerification'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { emailVerifyRequestEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'

export const dynamic = 'force-dynamic'

// עדכון מהיר של כתובת המייל מתוך הכרטסת.
//
// ⚠️ מותר **רק** כשהכתובת טרם אומתה. כתובת מאומתת היא כתובת שהמשפחה
// הוכיחה בעלות עליה בקוד; החלפתה בלחיצה אחת מהכרטסת עוקפת את האימות
// ומאפשרת להסיט את הדואר של המשפחה לכתובת אחרת. שינוי כזה עובר בטופס
// העריכה המלא, שמתועד ככל עריכת כרטסת.
//
// ⚠️ אין middleware — כל נתיב מגן על עצמו.
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden('אין הרשאה לערוך כתובת מייל')

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'חסר מזהה משפחה' }, { status: 400 })

  const body = await request.json().catch(() => null) as { email?: string } | null
  const email = (body?.email ?? '').trim()
  if (!email) return NextResponse.json({ error: 'יש להזין כתובת מייל' }, { status: 400 })
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'כתובת המייל אינה תקינה' }, { status: 400 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: before, error: readErr } = await admin
    .from('beneficiaries')
    .select('email, email_verified_at')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!before) return NextResponse.json({ error: 'המשפחה לא נמצאה' }, { status: 404 })

  const row = before as { email?: string | null; email_verified_at?: string | null }

  // 🔒 הבדיקה בשרת ולא רק בממשק — הכפתור מוסתר בלקוח, אך בקשה ישירה
  // הייתה עוקפת אותו.
  if (row.email_verified_at) {
    return NextResponse.json(
      { error: 'הכתובת כבר אומתה — לשינוי יש להשתמש בטופס העריכה המלא' },
      { status: 409 },
    )
  }

  if ((row.email ?? '').trim().toLowerCase() === email.toLowerCase()) {
    return NextResponse.json({ ok: true, email, unchanged: true })
  }

  // email_verified_at נשאר null — הכתובת החדשה טרם אומתה אף היא.
  const { error } = await admin.from('beneficiaries').update({ email }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(admin, {
    userId: staff.userId,
    action: 'beneficiary.email_updated',
    entityType: 'beneficiary',
    entityId: id,
    details: { before: row.email ?? null, after: email },
  })

  return NextResponse.json({ ok: true, email })
}

// שליחת בקשת אימות למשפחה אחת מתוך הכרטסת.
//
// ⚠️ נתיב נפרד מ-/api/admin/email-verification (שהוא מנהל-בלבד, כי הרשימה
// שם חושפת שמות וכתובות של *כל* המשפחות). כאן מדובר במשפחה שהמזכיר כבר
// צופה בכרטסת שלה, ולכן הרשאת עריכה מספיקה.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  void request
  await ensureEmailTexts()
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden('אין הרשאה לשלוח בקשת אימות')

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'חסר מזהה משפחה' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error: readErr } = await admin
    .from('beneficiaries')
    .select('email, email_verified_at, family_name, full_name')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'המשפחה לא נמצאה' }, { status: 404 })

  const row = data as {
    email?: string | null; email_verified_at?: string | null
    family_name?: string | null; full_name?: string | null
  }

  if (row.email_verified_at) {
    return NextResponse.json({ error: 'הכתובת כבר אומתה' }, { status: 409 })
  }
  const email = (row.email ?? '').trim()
  if (!email) return NextResponse.json({ error: 'למשפחה אין כתובת מייל' }, { status: 400 })
  // ⚠️ כתובת פגומה נחסמת לפני השליחה: היא נכשלת בוודאות, צורכת ממכסת
  // השליחה, ומסמנת "נשלחה בקשה" על מי שלא קיבל דבר.
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'כתובת המייל פגומה — יש לתקן אותה תחילה' }, { status: 400 })
  }

  const name = [row.family_name, row.full_name].filter(Boolean).join(' ').trim()
  const mail = emailVerifyRequestEmail(name)
  const res = await deliverMail(email, mail.subject, mail.html, undefined, mailFor('igud'))
  if (!res.ok) {
    return NextResponse.json({ error: res.error || 'השליחה נכשלה', sent: 0 }, { status: 502 })
  }

  // ⚠️ מסומן רק אחרי שליחה מוצלחת — סימון מוקדם מסתיר משפחה שלא קיבלה כלום.
  await admin.from('beneficiaries')
    .update({ email_verify_requested_at: new Date().toISOString() })
    .eq('id', id)
    .then(undefined, () => {})

  await logActivity(admin, {
    userId: staff.userId,
    action: 'email_verification_request_sent',
    entityType: 'beneficiary',
    entityId: id,
    details: { email },
  })

  return NextResponse.json({ ok: true, sent: 1 })
}
