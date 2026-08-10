import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { emailVerifyRequestEmail } from '@/lib/emailTemplates'
import { listUnverified, verificationStats, isValidEmail } from '@/lib/emailVerification'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// ניהול אימות כתובות המייל.
//
// GET  — המספרים המדויקים + הרשימה המלאה של מי שטרם אימת, עם סימון כתובות פגומות.
// POST — שליחת בקשה לאמת. גוף: { ids: string[] } או { all: true }.
//
// מנהל בלבד: הרשימה כוללת שמות וכתובות מייל של משפחות.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { rows, error } = await listUnverified(admin)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const stats = await verificationStats(admin, rows)
  return NextResponse.json({ stats, families: rows }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { ids?: unknown; all?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { rows, error } = await listUnverified(admin)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const wanted = Array.isArray(body.ids) ? new Set(body.ids.map(String)) : null
  // ⚠️ כתובת פגומה מסוננת תמיד, גם ב"שלח לכולם": שליחה אליה נכשלת בוודאות,
  // צורכת ממכסת השליחה היומית, ומסמנת "נשלחה בקשה" על מי שלא קיבל דבר.
  const targets = rows.filter(r => isValidEmail(r.email) && (!wanted || wanted.has(r.id)))

  if (!targets.length) {
    return NextResponse.json({ sent: 0, failed: 0, skipped: rows.length, summary: 'לא נמצאו כתובות תקינות לשליחה.' })
  }

  const from = mailFor('igud')
  const now = new Date().toISOString()
  let sent = 0
  const failures: { email: string; error: string }[] = []

  // ⚠️ סדרתי ולא במקביל: שליחה מקבילה לאלפי כתובות חוטפת חסימת קצב מהספק,
  // ואז חלק מהמשפחות מסומנות כ"נשלח" בלי שההודעה יצאה.
  for (const target of targets) {
    const mail = emailVerifyRequestEmail(target.name)
    const res = await deliverMail(target.email, mail.subject, mail.html, undefined, from)
    if (!res.ok) {
      failures.push({ email: target.email, error: res.error || 'השליחה נכשלה' })
      continue
    }
    sent++
    // ⚠️ מסומן רק אחרי שליחה מוצלחת. סימון מוקדם היה מסתיר ממך משפחות שלא
    // קיבלו כלום, והן היו נשארות בלי בקשה לנצח.
    await admin.from('beneficiaries')
      .update({ email_verify_requested_at: now })
      .eq('id', target.id)
      .then(undefined, () => {})
  }

  await logActivity(admin, {
    userId: staff.userId,
    action: 'email_verification_requests_sent',
    entityType: 'beneficiary',
    details: { sent, failed: failures.length, requested: targets.length },
  }).catch(() => {})

  console.log(`[email-verification] נשלחו ${sent} בקשות אימות · ${failures.length} כשלים`)
  return NextResponse.json({
    sent,
    failed: failures.length,
    skipped: rows.length - targets.length,
    failures: failures.slice(0, 20),
    summary: `נשלחו ${sent} בקשות` +
      (failures.length ? ` · ${failures.length} נכשלו` : '') +
      (rows.length - targets.length ? ` · ${rows.length - targets.length} דולגו (כתובת פגומה)` : ''),
  })
}
