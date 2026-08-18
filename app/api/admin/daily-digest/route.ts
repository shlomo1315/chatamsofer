import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, forbidden, getServiceClient } from '@/lib/apiAuth'
import { buildDigestData, renderDigestHtml } from '@/lib/dailyDigest'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// ─────────────────────────────────────────────────────────────────────────────
// הגדרות הסיכום היומי + שליחה ידנית.
//
// ⚠️ requireStaff(['admin']) ולא הרשאת מחלקה: הסיכום חוצה את כל המחלקות
// ומרכז נתונים מכולן, ולכן מי שרשאי להגדיר אותו הוא מנהל בלבד.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'daily_digest'

export interface DigestSettings {
  enabled: boolean
  emails: string[]
}

const DEFAULTS: DigestSettings = { enabled: false, emails: [] }

export async function loadDigestSettings(db: ReturnType<typeof getServiceClient>): Promise<DigestSettings> {
  if (!db) return DEFAULTS
  const { data } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()
  // 🔴 העמודה `value` היא text ולא jsonb (ראו 20260630_loans_portal).
  // כל שאר המערכת שומרת בה JSON.stringify — כאן נשמר אובייקט גולמי,
  // Postgres אחסן "[object Object]", וכל קריאה חזרה לברירות המחדל.
  // הכישלון היה שקט לגמרי: ה-upsert הצליח והמסך הראה "נשמר".
  //
  // ⚠️ מתקבלים שני הפורמטים — ההגדרות שנשמרו לפני התיקון נשארו
  // כמחרוזת פגומה, ורשומה כזו לא אמורה להפיל את הטעינה.
  let v: Partial<DigestSettings> = {}
  const rawValue = data?.value
  if (rawValue && typeof rawValue === 'object') {
    v = rawValue as Partial<DigestSettings>
  } else if (typeof rawValue === 'string' && rawValue.trim().startsWith('{')) {
    try { v = JSON.parse(rawValue) as Partial<DigestSettings> } catch { v = {} }
  }
  return {
    enabled: v.enabled === true,
    emails: Array.isArray(v.emails) ? v.emails.filter(e => typeof e === 'string' && e.includes('@')) : [],
  }
}

export async function GET() {
  const staff = await requireStaff(['admin'])
  if (!staff) return forbidden()
  const db = getServiceClient()
  return NextResponse.json(await loadDigestSettings(db))
}

export async function PUT(request: NextRequest) {
  const staff = await requireStaff(['admin'])
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Partial<DigestSettings>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  // ⚠️ הכתובות מנורמלות ומסוננות בשרת ולא רק בטופס: המסלול פתוח לכל
  // מנהל, וכתובת פגומה הייתה מפילה את ה-cron בלילה בלי שאיש יידע.
  const emails = [...new Set(
    (Array.isArray(body.emails) ? body.emails : [])
      .map(e => String(e).trim().toLowerCase())
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  )]

  const value: DigestSettings = { enabled: body.enabled === true, emails }

  const { error } = await db.from('app_settings')
    .upsert({ key: KEY, value: JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, {
    userId: staff.userId, action: 'daily_digest_settings_updated', entityType: 'settings',
    entityId: KEY, details: { enabled: value.enabled, recipients: emails.length },
  }).catch(() => {})

  return NextResponse.json({ ok: true, ...value })
}

/** שליחה ידנית — "שלח עכשיו" מהמסך. */
export async function POST(request: NextRequest) {
  const staff = await requireStaff(['admin'])
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { to?: string } = {}
  try { body = await request.json() } catch { /* גוף ריק מותר */ }

  const settings = await loadDigestSettings(db)
  // ⚠️ "שלח אליי לבדיקה" גובר על הרשימה — כדי לבדוק בלי להטריד את כולם.
  const targets = body.to?.trim()
    ? [body.to.trim().toLowerCase()]
    : settings.emails

  if (!targets.length) {
    return NextResponse.json({ error: 'לא הוגדרו נמענים לסיכום' }, { status: 400 })
  }

  const data = await buildDigestData(db)
  const html = renderDigestHtml(data)
  const subject = `סיכום יומי · ${data.dateLabel}${data.totalPending > 0 ? ` · ${data.totalPending} ממתינים` : ''}`

  // ⚠️ נשלח לכל נמען בנפרד ולא ב-to משותף: הרשימה היא פנימית, ושליחה
  // אחת הייתה חושפת את כתובות המנהלים זה לזה.
  const results = await Promise.all(targets.map(to =>
    deliverMail(to, subject, html, undefined, mailFor('main'))
      .then(r => ({ to, ok: r.ok, error: r.error }))
      .catch(e => ({ to, ok: false, error: e instanceof Error ? e.message : 'שגיאה' })),
  ))

  const sent = results.filter(r => r.ok).length
  await logActivity(db, {
    userId: staff.userId, action: 'daily_digest_sent_manually', entityType: 'settings',
    entityId: KEY, details: { sent, failed: results.length - sent },
  }).catch(() => {})

  return NextResponse.json({ ok: sent > 0, sent, failed: results.filter(r => !r.ok) })
}
