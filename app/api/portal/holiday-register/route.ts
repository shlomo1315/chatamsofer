import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { getServiceClient } from '@/lib/apiAuth'
import { getOpenDistribution, registerToOpenDistribution } from '@/lib/holidayDistributions'
import { holidayRegisteredEmail, holidayAlreadyRegisteredEmail } from '@/lib/emailTemplates'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// רישום לחלוקת חגים מהממשק הדיגיטלי.
//
// ⚠️ הזיהוי הוא של הפורטל עצמו (ת"ז + קוד חד-פעמי): הרישום מקשר משפחה *קיימת*
// במאגר הצאצאים לחלוקה, ולא יוצר משפחה חדשה. לכן אין כאן קליטת פרטים כלל.
//
// GET — האם יש חלוקה פתוחה, והאם המשפחה הזו כבר רשומה (לתצוגת הכפתור).
// POST — רישום. רישום כפול מוחזר כהצלחה עם already=true, כדי שהמשתמש יקבל
// "אתם כבר רשומים" ולא הודעת שגיאה.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const beneficiaryId = new URL(request.url).searchParams.get('beneficiary_id')
  const sessionId = getPortalBeneficiaryId(request)
  const dist = await getOpenDistribution()
  if (!dist) return NextResponse.json({ open: false }, { headers: { 'Cache-Control': 'no-store' } })

  let registered = false
  let registeredAt: string | null = null
  if (beneficiaryId && sessionId === beneficiaryId) {
    const db = getServiceClient()
    if (db) {
      const { data } = await db.from('distribution_recipients')
        .select('id, registered_at').eq('distribution_id', dist.id).eq('beneficiary_id', beneficiaryId).maybeSingle()
      registered = !!data
      registeredAt = (data as { registered_at?: string | null } | null)?.registered_at ?? null
    }
  }
  return NextResponse.json(
    { open: true, distribution: { id: dist.id, name: dist.name, year: dist.year }, registered, registeredAt },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  let body: { beneficiary_id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const beneficiaryId = String(body.beneficiary_id ?? '')
  if (!beneficiaryId) return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })

  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId || sessionId !== beneficiaryId) {
    return NextResponse.json({ error: 'נדרש אימות מחדש' }, { status: 401 })
  }

  const result = await registerToOpenDistribution(beneficiaryId, 'portal')
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'הרישום נכשל' }, { status: 400 })

  const db = getServiceClient()
  // פרטי המשפחה — לשם ולמייל
  let name = ''
  let email: string | null = null
  if (db) {
    const { data: ben } = await db.from('beneficiaries')
      .select('email, full_name, family_name, spouse_name').eq('id', beneficiaryId).maybeSingle()
    const b = ben as { email?: string | null; full_name?: string | null; family_name?: string | null; spouse_name?: string | null } | null
    email = b?.email ?? null
    name = [b?.family_name, b?.full_name || b?.spouse_name].filter(Boolean).join(' ') || String(b?.full_name ?? '')
  }

  // ── כבר רשום: מייל "כבר נקלט" עם תאריך הרישום המקורי, בלי ליצור שורה נוספת ──
  if (!result.created) {
    if (email) {
      const payload = holidayAlreadyRegisteredEmail(name, { distribution: result.distribution?.name, registeredAt: result.registeredAt })
      try { await deliverMail(email, payload.subject, payload.html, undefined, mailFor('igud')) } catch { /* best-effort */ }
    }
    return NextResponse.json({
      ok: true, already: true,
      distribution: result.distribution?.name ?? null,
      registeredAt: result.registeredAt ?? null,
    })
  }

  // ── רישום חדש: אישור במייל ──
  // best-effort: הרישום כבר נשמר, וכשל בשליחה לא יבטל אותו. מתועד על השורה
  // (notified_at / notify_error) כדי שבמסך הניהול יהיה אפשר לראות למי לא יצא.
  let mailed = false
  let mailError: string | null = null
  if (db) {
    if (email) {
      const payload = holidayRegisteredEmail(name, { distribution: result.distribution?.name })
      try {
        const res = await deliverMail(email, payload.subject, payload.html, undefined, mailFor('igud'))
        mailed = res.ok
        if (!res.ok) mailError = res.error ?? 'שליחת המייל נכשלה'
      } catch (e) { mailError = e instanceof Error ? e.message : String(e) }
    } else {
      mailError = 'למשפחה אין כתובת מייל במערכת'
    }
    await db.from('distribution_recipients')
      .update({ notified_at: mailed ? new Date().toISOString() : null, notify_error: mailError })
      .eq('distribution_id', result.distribution!.id)
      .eq('beneficiary_id', beneficiaryId)
  }

  return NextResponse.json({
    ok: true, already: false, mailed,
    distribution: result.distribution?.name ?? null,
    registeredAt: result.registeredAt ?? null,
  })
}
