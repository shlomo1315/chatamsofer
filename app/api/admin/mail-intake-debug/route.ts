import { NextResponse } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'
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
  if (ctx instanceof NextResponse) return ctx

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // המייל האחרון שה-webhook ראה — נכתב בכל קליטה, גם כשלא זוהה כבקשה
  const { data: dbg } = await db
    .from('app_settings')
    .select('value, updated_at')
    .eq('key', 'mail_intake_debug')
    .maybeSingle()

  let lastInbound: unknown = null
  if (dbg?.value) {
    try { lastInbound = JSON.parse(String(dbg.value)) } catch { lastInbound = String(dbg.value) }
  }

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
    fixVersion: 'route-requests-to-igud@2026-07-13',
    now: new Date().toISOString(),
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
