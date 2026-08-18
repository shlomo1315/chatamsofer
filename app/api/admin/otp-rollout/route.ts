import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, forbidden, getServiceClient } from '@/lib/apiAuth'
import { clearOtpRolloutCache } from '@/lib/resendRollout'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// אחוז קודי האימות שיוצאים דרך Resend + מדדי המסירה שמאפשרים להחליט.
//
// ⚠️ admin בלבד: זו הגדרה שיכולה להשבית את הכניסה לפורטל לכל המשתמשים
// אם תוגדר שגוי.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'resend_otp_rollout'

export async function GET() {
  const staff = await requireStaff(['admin'])
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()
  const percent = Math.max(0, Math.min(100, Math.round(Number((data?.value as { percent?: number })?.percent) || 0)))

  // ── מדדי 14 הימים האחרונים ──
  // ⚠️ המספרים האלה הם מה שמצדיק (או שולל) העלאת האחוז. בלעדיהם ההחלטה
  // היא ניחוש, וזו בדיוק ההחלטה שאסור לנחש בה.
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const { data: rows } = await db
    .from('sent_emails')
    .select('sent_at, resend_id')
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(20_000)

  const byDay = new Map<string, { total: number; resend: number }>()
  for (const r of rows ?? []) {
    const day = String(r.sent_at ?? '').slice(0, 10)
    if (!day) continue
    const cur = byDay.get(day) ?? { total: 0, resend: 0 }
    cur.total++
    if (r.resend_id) cur.resend++
    byDay.set(day, cur)
  }
  const days = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, v]) => ({ day, total: v.total, resend: v.resend }))

  // ⚠️ ממוצע 7 ימים ולא היום האחרון: נפח יומי בודד תנודתי מדי מכדי
  // להסיק ממנו על מוכנות החימום.
  const last7 = days.slice(0, 7)
  const avgResend = last7.length
    ? Math.round(last7.reduce((s, d) => s + d.resend, 0) / last7.length)
    : 0

  return NextResponse.json({ percent, days, avgResend })
}

export async function PUT(request: NextRequest) {
  const staff = await requireStaff(['admin'])
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { percent?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const percent = Math.max(0, Math.min(100, Math.round(Number(body.percent) || 0)))

  const { error } = await db.from('app_settings')
    .upsert({ key: KEY, value: { percent }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ⚠️ ניקוי המטמון מיד: בלעדיו השינוי נכנס לתוקף רק בעוד דקה, והמנהל
  // שמנסה לחזור לאחור בזמן תקלה ממתין בלי לדעת למה.
  clearOtpRolloutCache()

  await logActivity(db, {
    userId: staff.userId, action: 'otp_rollout_changed', entityType: 'settings',
    entityId: KEY, details: { percent },
  }).catch(() => {})

  return NextResponse.json({ ok: true, percent })
}
