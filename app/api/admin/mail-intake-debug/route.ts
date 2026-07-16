import { NextResponse } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { isRequestSubject } from '@/lib/emailRequestIntake'
import { detectReqType } from '@/lib/emailRequestForms'

// ─────────────────────────────────────────────────────────────────────────────
// אבחון קליטת בקשות במייל.
//
// מבדיל בין הכשלים האפשריים, שכולם נראים זהים מבחוץ ("לא קיבלתי מענה"):
//   1. המייל לא הגיע ל-webhook       -> לא יופיע ב-inbound
//   2. הגיע, הנושא לא זוהה כבקשה     -> יופיע עם reqType: null
//   3. זוהה — ואז השאלה היא למה לא נשלח מענה
//
// fixVersion מאמת שהקוד החדש חי בפרודקשן (ולא נתקע דפלוי ישן).
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requirePermission('reports', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: rows } = await db
    .from('app_settings')
    .select('key, value, updated_at')
    .in('key', ['mail_intake_debug', 'mail_auth_failure'])

  const pick = (k: string) => (rows ?? []).find(r => r.key === k)
  const parse = (v: unknown) => {
    if (v == null) return null
    try { return JSON.parse(String(v)) } catch { return String(v) }
  }

  const dbg = pick('mail_intake_debug')
  const lastInbound = parse(dbg?.value)

  // כשל אימות = הכשל השקט. Resend מקבל 401, מפסיק לנסות, והדואר נעלם
  // בלי שום סימן. אם השדה הזה עדכני יותר מ-lastInboundAt — זו הבעיה.
  const authRow = pick('mail_auth_failure')
  const lastAuthFailure = parse(authRow?.value)

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: mails, error } = await db
    .from('inbound_emails')
    .select('id, subject, from_email, to_email, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const inbound = (mails ?? []).map(m => {
    const subject = String(m.subject ?? '')
    const reqType = detectReqType(subject)
    return {
      at: m.created_at,
      from: m.from_email,
      to: m.to_email,
      subject,
      reqType,
      isRequest: isRequestSubject(subject),
    }
  })

  // ההקשר שהוולידציה עובדת מולו. אם אחת הרשימות ריקה בפרודקשן,
  // כל בקשת לידה תיפסל ("בית החלמה לא ברשימה" / "מספר מוקד לא תקין").
  const { data: rh } = await db.from('recovery_homes').select('name, availability').order('name')
  const { data: cc } = await db.from('card_centers').select('name, city').eq('is_active', true).order('name')

  return NextResponse.json({
    fixVersion: 'webhook-auth-fallback@2026-07-13',
    now: new Date().toISOString(),
    // ⚠️ אם lastAuthFailureAt חדש יותר מ-lastInboundAt — ה-webhook נדחה
    // ו-Resend הפסיק למסור. הסיבה המדויקת ב-lastAuthFailure.reason
    lastAuthFailureAt: authRow?.updated_at ?? null,
    lastAuthFailure,
    lastInboundAt: dbg?.updated_at ?? null,
    lastInbound,
    requestsSeen: inbound.filter(m => m.isRequest).length,
    inbound,
    validationContext: {
      recoveryHomes: (rh ?? []).map(r => r.name),
      cardCenters: (cc ?? []).map(c => c.name),
    },
  })
}
