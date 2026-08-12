import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { newInviteToken, normalizeExpiry, inviteExpiry, MAX_INVITE_DAYS } from '@/lib/distributionInvites'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// ניהול קישורי רישום לחלוקת חגים.
//
// 🔴 הקישור פותח את הרישום לחלוקה אחת, בערוץ הפורטל בלבד, בתוך חלון זמן
// שהמנהל מגדיר. הוא אינו נוגע במתג המחלקה ואינו משנה registration_open —
// ולכן שליחתו אינה פותחת את השלוחה הטלפונית, נדרים או המייל.
//
// ⚠️ הקישור משותף: אותו קישור נשלח לכל מי שצריך, וכל משפחה נרשמת דרכו
// כעצמה (אחרי התחברות לפורטל). הזמן הוא ההגבלה היחידה עליו.
//
// GET    — הקישורים של חלוקה, לתצוגה במסך.
// POST   — יצירת קישור עם מועד תפוגה.
// PATCH  — ביטול קישור לפני תפוגתו, או שינוי מועד התפוגה.
// ─────────────────────────────────────────────────────────────────────────────

/** בסיס הכתובת הציבורית — אותו מקור שממנו נבנים קישורי המייל. */
const PORTAL_BASE = (
  process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il'
).replace(/\/$/, '')

/** הכתובת שנשלחת למשפחות. action=holiday הוא מה שהפורטל כבר יודע לקרוא. */
export function inviteUrl(token: string): string {
  return `${PORTAL_BASE}/?action=holiday&invite=${token}`
}

export async function GET(request: NextRequest) {
  const staff = await requirePermission('distributions', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const distributionId = request.nextUrl.searchParams.get('distribution_id')
  if (!distributionId) return NextResponse.json({ error: 'חסר מזהה חלוקה' }, { status: 400 })

  const { data, error } = await db.from('distribution_invites')
    .select('token, distribution_id, expires_at, starts_at, revoked_at, label, used_count, created_at')
    .eq('distribution_id', distributionId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'שליפת הקישורים נכשלה' }, { status: 500 })

  const now = Date.now()
  const invites = (data ?? []).map((r) => {
    const row = r as { token: string; expires_at: string; starts_at: string | null; revoked_at: string | null }
    const exp = new Date(row.expires_at).getTime()
    const start = row.starts_at ? new Date(row.starts_at).getTime() : null
    // הסטטוס מחושב כאן ולא נשמר: שורה עם "פעיל" שמורה הייתה מתיישנת בשקט
    // ברגע שהתפוגה עוברת, ומראה במסך מצב שאינו נכון.
    const status = row.revoked_at ? 'revoked'
      : Number.isNaN(exp) || exp <= now ? 'expired'
      : start && start > now ? 'scheduled'
      : 'active'
    return { ...row, status, url: inviteUrl(row.token) }
  })
  return NextResponse.json({ invites }, { headers: { 'Cache-Control': 'no-store' } })
}

interface CreateBody {
  distribution_id?: string
  /** מועד תפוגה מדויק (ISO). גובר על days. */
  expires_at?: string
  /** לחלופין — מספר ימים מעכשיו. */
  days?: number
  /** פתיחה מושהית (ISO), אופציונלי. */
  starts_at?: string | null
  label?: string
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('distributions', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: CreateBody
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const distributionId = String(body.distribution_id ?? '')
  if (!distributionId) return NextResponse.json({ error: 'חסר מזהה חלוקה' }, { status: 400 })

  const { data: dist } = await db.from('distributions').select('id, name').eq('id', distributionId).maybeSingle()
  if (!dist) return NextResponse.json({ error: 'החלוקה לא נמצאה' }, { status: 404 })

  const now = new Date()

  // ⚠️ תפוגה חובה. אין מסלול שיוצר קישור בלי מועד סיום — קישור נצחי הוא חור
  // קבוע במתג הסגירה, וכזה שאיש לא זוכר שקיים.
  let expiresAt: string
  if (body.expires_at) {
    const norm = normalizeExpiry(String(body.expires_at), now)
    if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 })
    expiresAt = norm.iso
  } else if (body.days != null) {
    expiresAt = inviteExpiry(now, Number(body.days))
  } else {
    return NextResponse.json({ error: 'חובה להגדיר מועד תפוגה לקישור' }, { status: 400 })
  }

  // פתיחה מושהית — חייבת להיות לפני התפוגה, אחרת הקישור לא יהיה תקף לרגע.
  let startsAt: string | null = null
  if (body.starts_at) {
    const s = new Date(String(body.starts_at))
    if (Number.isNaN(s.getTime())) return NextResponse.json({ error: 'מועד פתיחה לא תקין' }, { status: 400 })
    if (s.getTime() >= new Date(expiresAt).getTime()) {
      return NextResponse.json({ error: 'מועד הפתיחה חייב להיות לפני מועד התפוגה' }, { status: 400 })
    }
    startsAt = s.toISOString()
  }

  const token = newInviteToken()
  const { error } = await db.from('distribution_invites').insert({
    token,
    distribution_id: distributionId,
    expires_at: expiresAt,
    starts_at: startsAt,
    label: String(body.label ?? '').trim() || null,
    created_by: staff.userId ?? null,
  })
  if (error) {
    console.error('[invites] יצירה נכשלה:', error.message)
    return NextResponse.json({ error: 'יצירת הקישור נכשלה' }, { status: 500 })
  }

  await logActivity(db, {
    action: 'distribution_invite_created',
    entityType: 'distributions',
    entityId: distributionId,
    details: { token, expiresAt, startsAt, label: body.label ?? null },
  }).catch(() => {})

  return NextResponse.json({
    ok: true,
    token,
    url: inviteUrl(token),
    expires_at: expiresAt,
    starts_at: startsAt,
    maxDays: MAX_INVITE_DAYS,
  })
}

interface PatchBody {
  token?: string
  /** ביטול מיידי. */
  revoke?: boolean
  /** הארכה או קיצור של מועד התפוגה. */
  expires_at?: string
}

export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('distributions', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: PatchBody
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const token = String(body.token ?? '')
  if (!token) return NextResponse.json({ error: 'חסר מזהה קישור' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.revoke) {
    patch.revoked_at = new Date().toISOString()
    patch.revoked_by = staff.userId ?? null
  }
  if (body.expires_at) {
    const norm = normalizeExpiry(String(body.expires_at), new Date())
    if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 })
    patch.expires_at = norm.iso
    // ⚠️ הארכה *אינה* מבטלת ביטול קודם. קישור שבוטל בכוונה — כי נשלח בטעות
    // או לרשימה הלא נכונה — היה קם לתחייה בלחיצה על "הארך", וזו בדיוק
    // הטעות שאין ממנה דרך חזרה. לביטול הביטול נדרשת פעולה מפורשת.
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })

  const { error } = await db.from('distribution_invites').update(patch).eq('token', token)
  if (error) return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 })

  await logActivity(db, {
    action: body.revoke ? 'distribution_invite_revoked' : 'distribution_invite_updated',
    entityType: 'distributions',
    details: { token, ...patch },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
