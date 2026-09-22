import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

// מתג פתיחה/סגירה של יריד הספרים.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.
//
// 🔴 app_settings.value היא עמודת **text**, לא jsonb. שמירת ערך שאינו
// מחרוזת עוברת בלי שגיאה ומאחסנת "[object Object]" — הכישלון שקט לחלוטין:
// ה-upsert מצליח, ה-API מחזיר ok, והמסך מציג "נשמר", אבל הקריאה הבאה
// מחזירה ברירת מחדל. לכן נשמרת כאן המחרוזת 'true'/'false' בלבד.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const KEY = 'book_fair_open'

/**
 * קריאת המתג.
 * ⚠️ ברירת המחדל היא *סגור*: מפתח חסר פירושו שאיש לא פתח את היריד עדיין,
 * ופתיחה מכללא הייתה חושפת קטלוג שטרם הוכן.
 */
export async function GET() {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { data } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()
  return NextResponse.json({ open: String(data?.value ?? '') === 'true' })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 }) }

  if (typeof body.open !== 'boolean') {
    return NextResponse.json({ error: 'ערך המתג חייב להיות בוליאני' }, { status: 400 })
  }
  const open = body.open

  // 🔴 מחרוזת מפורשת ולא בוליאני: העמודה text, וערך שאינו מחרוזת אובד בשקט.
  const { error } = await db
    .from('app_settings')
    .upsert({ key: KEY, value: open ? 'true' : 'false' }, { onConflict: 'key' })

  if (error) {
    console.error('[book-fair/settings] upsert failed:', error)
    return NextResponse.json({ error: 'שמירת המתג נכשלה' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId,
    action: open ? 'book_fair_open' : 'book_fair_close',
    entityType: 'app_settings',
    entityId: KEY,
    details: { open },
  })

  return NextResponse.json({ ok: true, open })
}
