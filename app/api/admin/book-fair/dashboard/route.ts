import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import {
  DASH_CONFIG_KEY, DASH_LAST_LOGIN_KEY, DASH_MIN_PASSWORD, parseDashConfig, hashDashPassword, type DashConfig,
} from '@/lib/bookFairDashboard'

// הגדרות לוח המנהל של היריד: סיסמה, הפעלה, ניתוק כל המחוברים.
//
// 🔴 GET לעולם לא מחזיר את הגיבוב — רק "מוגדרת / לא".

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function readCfg(db: NonNullable<ReturnType<typeof getServiceClient>>): Promise<DashConfig> {
  const { data } = await db.from('app_settings').select('value').eq('key', DASH_CONFIG_KEY).maybeSingle()
  return parseDashConfig(data?.value ?? null)
}

export async function GET() {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const c = await readCfg(db)
  const { data: last } = await db.from('app_settings').select('value').eq('key', DASH_LAST_LOGIN_KEY).maybeSingle()
  return NextResponse.json({
    configured: !!c.password_hash, enabled: c.enabled,
    updatedAt: c.updated_at, lastLoginAt: last?.value ? String(last.value) : null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: { action?: string; password?: string; enabled?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const c = await readCfg(db)
  const now = new Date().toISOString()
  let next: DashConfig

  if (body.action === 'password') {
    const pw = String(body.password ?? '').trim()
    if (pw.length < DASH_MIN_PASSWORD) {
      return NextResponse.json({ error: `הסיסמה חייבת להיות באורך ${DASH_MIN_PASSWORD} תווים לפחות` }, { status: 400 })
    }
    const hash = hashDashPassword(pw)
    if (!hash) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })
    // 🔴 סיסמה חדשה = גרסה חדשה: מי שהתחבר עם הסיסמה הקודמת מנותק.
    // ⚠️ הגדרה ראשונה גם מפעילה — אחרת "שמרתי סיסמה והקישור לא עובד".
    next = { ...c, password_hash: hash, version: c.version + 1, updated_at: now, enabled: c.password_hash ? c.enabled : true }
  } else if (body.action === 'enable') {
    if (body.enabled === true && !c.password_hash) {
      return NextResponse.json({ error: 'הגדירו סיסמה לפני ההפעלה' }, { status: 400 })
    }
    next = { ...c, enabled: body.enabled === true }
  } else if (body.action === 'revoke') {
    next = { ...c, version: c.version + 1 }
  } else {
    return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
  }

  // 🔴 JSON.stringify — app_settings.value היא text.
  const { error } = await db.from('app_settings').upsert(
    { key: DASH_CONFIG_KEY, value: JSON.stringify(next), updated_at: now },
    { onConflict: 'key' },
  )
  if (error) {
    console.error('[book-fair/dashboard] save failed:', error.message)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'app_settings', entityId: DASH_CONFIG_KEY,
    // ⚠️ לעולם לא הסיסמה או הגיבוב ביומן.
    details: { action: body.action, enabled: next.enabled },
  })

  return NextResponse.json({ ok: true, configured: !!next.password_hash, enabled: next.enabled, updatedAt: next.updated_at })
}
